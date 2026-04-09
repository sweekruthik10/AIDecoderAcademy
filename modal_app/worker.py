"""
AIDA Video Generation Worker — production async pipeline.

Pipeline:
  1. POST /submit         → spawn render_video.spawn() → return job_id (Modal call_id)
                            Next.js stores call_id on video_jobs row.
  2. render_video()       → status writes to Supabase video_jobs at each phase:
                            planning → narrating → keyframing → rendering(step n/N)
                            → muxing → uploading → done
  3. GET /status?job_id=  → returns current row state (also queryable directly via Supabase)

Model:
  Primary  : ltx-2.3-22b-distilled-1.1 via github.com/Lightricks/LTX-2 (ICLoraPipeline)
  Fallback : LTX 13B 0.9.7 distilled via diffusers (proven path)

Audio:
  ElevenLabs narration per shot (kept — better voices than LTX-2.3's built-in audio for kids).
  LTX-2.3's audio generation is bypassed for now; we mux ElevenLabs MP3 over the visual.

Storage:
  Final MP4 → Supabase Storage `creations-media` bucket → public URL written to video_jobs.video_url.
"""
import modal

app = modal.App("aida-video-worker")

# ----------------------------------------------------------------------------
# Image — LTX-2 from GitHub, uv-installed, with flash-attn for Hopper GPUs
# ----------------------------------------------------------------------------

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "build-essential", "curl", "python3-openimageio")
    # uv (package manager LTX-2 uses)
    .run_commands(
        "curl -LsSf https://astral.sh/uv/install.sh | sh",
        "ln -sf /root/.local/bin/uv /usr/local/bin/uv || true",
    )
    # Base scientific stack — LTX-2 sub-packages will resolve on top
    .pip_install(
        "torch==2.5.1", "torchvision==0.20.1", "torchaudio==2.5.1",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        # LTX-2 ltx-core requires: torch~=2.7 (we run 2.5, may need bump later),
        # torchaudio, einops, numpy, transformers>=4.52, safetensors, accelerate,
        # scipy>=1.14. ltx-pipelines also wants: av, tqdm, pillow, openimageio.
        # Pin transformers to 4.52.x — newer versions refactored SiglipVisionModel
        # which LTX-2 calls into as `vision_model.<attr>`.
        "transformers>=4.52,<4.53", "accelerate", "diffusers",
        "sentencepiece", "safetensors", "huggingface_hub", "hf_transfer",
        "pillow", "requests", "imageio[ffmpeg]", "ftfy",
        "openai", "elevenlabs", "fal-client", "supabase",
        "ninja", "packaging", "wheel",
        "fastapi[standard]",
        # LTX-2 specific deps (torchaudio installed alongside torch from cu121 index above)
        "einops", "scipy>=1.14", "av", "tqdm",
    )
    .run_commands(
        # flash-attn for H100/Hopper speedup
        "pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.5cxx11abiFALSE-cp311-cp311-linux_x86_64.whl",
        # Clone LTX-2 and install its packages via uv (with --no-deps to avoid stomping torch)
        "git clone --depth 1 https://github.com/Lightricks/LTX-2.git /opt/ltx2",
        # Lightricks didn't open-source the `multigpu/` subpackage that blocks.py imports.
        # Stub it: alias DelegatingBuilder to SingleGPUModelBuilder.
        "mkdir -p /opt/ltx2/packages/ltx-pipelines/src/ltx_pipelines/multigpu",
        "touch /opt/ltx2/packages/ltx-pipelines/src/ltx_pipelines/multigpu/__init__.py",
        "printf '%s\\n' 'from ltx_core.loader.single_gpu_model_builder import SingleGPUModelBuilder as DelegatingBuilder' > /opt/ltx2/packages/ltx-pipelines/src/ltx_pipelines/multigpu/delegating_builder.py",
        "cd /opt/ltx2 && uv pip install --system --no-deps -e packages/ltx-core -e packages/ltx-pipelines || echo '[image-build] LTX-2 uv install failed; will fall back at runtime'",
    )
    # Re-pin torch+torchvision LAST — pip resolution earlier may have swapped
    # the cu121 wheel for a CPU one (which kills `torchvision::nms`).
    .run_commands(
        "pip install --force-reinstall --no-deps "
        "--index-url https://download.pytorch.org/whl/cu121 "
        "torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "HF_HUB_DOWNLOAD_TIMEOUT": "300",
        # apt's python3-openimageio installs into /usr/lib/python3/dist-packages
        "PYTHONPATH": "/opt/ltx2/packages/ltx-core/src:/opt/ltx2/packages/ltx-pipelines/src:/usr/lib/python3/dist-packages",
        # Reduce CUDA fragmentation — critical for big-model + big-activation workloads.
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
)

models_volume = modal.Volume.from_name("aida-video-models", create_if_missing=True)
secrets = [modal.Secret.from_name("aida-secrets")]

# LTX 13B 0.9.8 dev — best diffusers-supported LTX model.
# Fits H100 80GB easily, no Gemma required, ~60-90s per 20s video.
LTX_REPO       = "Lightricks/LTX-Video"
LTX_CKPT_FILE  = "ltxv-13b-0.9.8-dev.safetensors"   # full dev, 30 steps, CFG=3.0
LTX_CACHE_DIR  = "/models/ltx-video"
LTX_CKPT_PATH  = f"{LTX_CACHE_DIR}/{LTX_CKPT_FILE}"
LTX_STEPS      = 30
LTX_CFG        = 3.0

FPS = 24
# LTX 0.9.x requires height/width divisible by 32. 704×480 = 22×32 × 15×32.
RESOLUTION = (704, 480)

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def ltx_frames_for_seconds(seconds: float) -> int:
    """LTX requires frame count = 8k+1 in range [25, 257]."""
    target = max(25, min(257, round(seconds * FPS)))
    return ((target - 1 + 4) // 8) * 8 + 1


def supabase_client():
    import os
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def update_status(job_id: str, **fields):
    """Write progress to video_jobs row. Idempotent."""
    if not job_id:
        return
    try:
        sb = supabase_client()
        sb.table("video_jobs").update(fields).eq("id", job_id).execute()
        print(f"[status] {job_id[:8]} → {fields}")
    except Exception as e:
        print(f"[status] WARN failed to update {job_id[:8]}: {e}")


# ----------------------------------------------------------------------------
# Phase 1 — plan (GPT script + ElevenLabs TTS + fal keyframes)
# ----------------------------------------------------------------------------

@app.function(
    image=image, secrets=secrets,
    cpu=4, memory=8192, timeout=600,
)
def plan_video(job_id: str, user_prompt: str, target_duration_seconds: int = 20, skip_audio: bool = False) -> dict:
    import io, json, os, subprocess, time
    import requests
    import openai
    import fal_client

    update_status(job_id, status="planning", status_detail="Writing your story…")

    openai_client = openai.OpenAI()
    num_shots = max(2, min(10, round(target_duration_seconds / 4)))

    system_prompt = (
        "You are a master educational video script writer for AI Decoder Academy (kids 11-16). "
        "Each shot teaches ONE clear beat. Build a narrative arc HOOK -> EXPLAIN -> EXAMPLE -> CONCLUSION. "
        "Active voice, present tense, 11-16 words per shot for ~4s TTS. "
        "Visual prompt must DEPICT the dialogue, not be tangential. "
        "Motion = ONE clear 4-second beat. "
        "KID-SAFE: no realistic human faces, scary content, branded characters, weapons. "
        "Output ONLY valid JSON, no markdown fences."
    )
    user_message = f"""
Create a narrated educational video script:
USER REQUEST: {user_prompt!r}
TARGET DURATION: ~{target_duration_seconds}s split into {num_shots} shots of ~4s each.

JSON shape exactly:
{{
  "title": "short engaging title (4-8 words)",
  "mood": "one or two words",
  "learning_objective": "what student understands by end",
  "shots": [
    {{
      "teaching_beat": "what THIS shot teaches",
      "dialogue": "11-16 words narrator speaks",
      "visual": "detailed keyframe prompt: subject + setting + lighting + camera + style. Pixar-style 3D illustration, vibrant, kid-friendly, no human faces.",
      "motion": "ONE clear 4s motion beat"
    }}
  ]
}}
""".strip()

    completion = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": system_prompt},
                  {"role": "user",   "content": user_message}],
        response_format={"type": "json_object"},
        temperature=0.8,
    )
    shot_plan = json.loads(completion.choices[0].message.content)
    total = len(shot_plan["shots"])

    update_status(
        job_id,
        status="narrating",
        status_detail=("Skipping narration (silent test)…" if skip_audio
                       else f"Recording narration… (0/{total})"),
        total_steps=total, current_step=0,
        title=shot_plan.get("title", "Untitled"),
    )

    shot_audio_bytes_list, shot_audio_durations = [], []

    if skip_audio:
        # Fixed 4s per shot, no audio bytes
        for _ in shot_plan["shots"]:
            shot_audio_bytes_list.append(None)
            shot_audio_durations.append(4.0)
    else:
        from elevenlabs import ElevenLabs
        from elevenlabs.types import VoiceSettings
        voice_id = "21m00Tcm4TlvDq8ikWAM"  # Rachel — warm, clear
        el = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
        for i, shot in enumerate(shot_plan["shots"]):
            audio_iter = el.text_to_speech.convert(
                voice_id=voice_id, text=shot["dialogue"],
                model_id="eleven_turbo_v2_5",
                output_format="mp3_44100_128",
                voice_settings=VoiceSettings(stability=0.5, similarity_boost=0.75,
                                             style=0.3, use_speaker_boost=True),
            )
            audio_bytes = b"".join(audio_iter)
            shot_audio_bytes_list.append(audio_bytes)
            tmp = f"/tmp/audio_{i:02d}.mp3"
            with open(tmp, "wb") as f:
                f.write(audio_bytes)
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", tmp],
                capture_output=True, text=True,
            )
            shot_audio_durations.append(float(probe.stdout.strip()))
            update_status(
                job_id, status="narrating",
                status_detail=f"Recording narration… ({i+1}/{total})",
                current_step=i + 1,
            )

    update_status(
        job_id, status="keyframing",
        status_detail=f"Painting keyframes… (0/{total})",
        current_step=0,
    )

    # fal keyframes per shot
    STYLE_SUFFIX = (
        ", cinematic Pixar-style 3D animation, soft volumetric lighting, "
        "vibrant colors, clear focused subject, kid-friendly educational illustration, "
        "no human faces, no text overlays, no watermarks"
    )
    shot_keyframes = []
    for i, shot in enumerate(shot_plan["shots"]):
        result = fal_client.subscribe(
            "fal-ai/flux-pro/v1.1",
            arguments={
                "prompt": shot["visual"] + STYLE_SUFFIX,
                "image_size": {"width": RESOLUTION[0], "height": RESOLUTION[1]},
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
            },
        )
        resp = requests.get(result["images"][0]["url"], timeout=60)
        resp.raise_for_status()
        shot_keyframes.append(resp.content)
        update_status(
            job_id, status="keyframing",
            status_detail=f"Painting keyframes… ({i+1}/{total})",
            current_step=i + 1,
        )

    shots_for_render = []
    for i, (shot, aud_dur, kf) in enumerate(zip(
        shot_plan["shots"], shot_audio_durations, shot_keyframes
    )):
        shots_for_render.append({
            "visual": shot["visual"],
            "motion": shot["motion"],
            "dialogue": shot["dialogue"],
            "teaching_beat": shot.get("teaching_beat", ""),
            "audio_seconds": aud_dur,
            "num_frames": ltx_frames_for_seconds(aud_dur),
            "keyframe_bytes": kf,
            "audio_bytes": shot_audio_bytes_list[i],
        })

    return {
        "title": shot_plan.get("title", "Untitled"),
        "mood": shot_plan.get("mood", "neutral"),
        "learning_objective": shot_plan.get("learning_objective", ""),
        "shots": shots_for_render,
        "total_audio_duration": sum(shot_audio_durations),
    }


# ----------------------------------------------------------------------------
# Phase 2 — render LTX-2.3 (with diffusers 13B fallback) + ffmpeg mux + upload
# ----------------------------------------------------------------------------

@app.function(
    image=image, secrets=secrets,
    gpu="H100", volumes={"/models": models_volume},
    timeout=3600, memory=65536, cpu=8,
)
def render_video(
    job_id: str, plan: dict,
    skip_audio: bool = False,
    skip_supabase: bool = False,
    use_ltx_audio: bool = False,
) -> dict:
    import io, os, subprocess, time, gc, uuid
    from pathlib import Path
    import torch
    from PIL import Image
    from huggingface_hub import hf_hub_download, snapshot_download

    # -----------------------------------------------------------------------
    # LTX 13B 0.9.8 dev via diffusers — proven path, fits H100 cleanly.
    # 30 inference steps, CFG=3.0, ~3-5s per shot on H100.
    # -----------------------------------------------------------------------
    update_status(job_id, status="rendering",
                  status_detail="Downloading LTX 13B 0.9.8 dev weights (~28 GB, first run only)…")

    Path(LTX_CACHE_DIR).mkdir(parents=True, exist_ok=True)
    if not Path(LTX_CKPT_PATH).exists():
        print(f"[render] downloading {LTX_CKPT_FILE}…")
        hf_hub_download(repo_id=LTX_REPO, filename=LTX_CKPT_FILE, local_dir=LTX_CACHE_DIR)
        models_volume.commit()

    update_status(job_id, status="rendering",
                  status_detail="Loading LTX 13B 0.9.8 dev into GPU memory…")

    from diffusers import LTXImageToVideoPipeline
    from transformers import T5EncoderModel, AutoTokenizer

    text_encoder = T5EncoderModel.from_pretrained(
        LTX_REPO, subfolder="text_encoder", torch_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(LTX_REPO, subfolder="tokenizer")
    pipe = LTXImageToVideoPipeline.from_single_file(
        LTX_CKPT_PATH, text_encoder=text_encoder, tokenizer=tokenizer,
        torch_dtype=torch.bfloat16,
    )
    pipe.to("cuda")
    used_model = "ltx-13b-0.9.8-dev"
    print(f"[render] LTX 13B 0.9.8 dev loaded · VRAM {torch.cuda.memory_allocated()//(1024**2)} MB")

    from diffusers.utils import export_to_video as _export_to_video

    def inference_fn(keyframe_img, motion_prompt, num_frames, shot_index=0):
        frames = pipe(
            image=keyframe_img,
            prompt=motion_prompt,
            negative_prompt="blurry, low quality, distorted, watermark, text, static, no motion, cartoon emoji creatures, realistic human faces",
            height=RESOLUTION[1], width=RESOLUTION[0],
            num_frames=num_frames,
            num_inference_steps=LTX_STEPS,
            guidance_scale=LTX_CFG,
        ).frames[0]
        clip_out = f"/tmp/_ltx_clip_{shot_index:02d}.mp4"
        _export_to_video(frames, clip_out, fps=FPS)
        return clip_out

    # -----------------------------------------------------------------------
    # Render each shot, write per-shot progress
    # -----------------------------------------------------------------------
    from diffusers.utils import export_to_video

    shots = plan["shots"]
    total = len(shots)
    clip_paths, audio_paths, shot_timings = [], [], []

    for i, shot in enumerate(shots):
        update_status(
            job_id, status="rendering",
            status_detail=f"Rendering scene {i+1}/{total}…",
            current_step=i, total_steps=total,
            model_used=used_model,
        )

        if shot.get("audio_bytes"):
            audio_path = f"/tmp/audio_{i:02d}.mp3"
            with open(audio_path, "wb") as f:
                f.write(shot["audio_bytes"])
            audio_paths.append(audio_path)

        keyframe = Image.open(io.BytesIO(shot["keyframe_bytes"])).convert("RGB")
        if keyframe.size != RESOLUTION:
            keyframe = keyframe.resize(RESOLUTION, Image.LANCZOS)

        motion_prompt = (
            f"{shot['motion']}. Scene: {shot['visual']}. "
            f"Smooth cinematic motion, no jitter, maintain subject identity."
        )
        t0 = time.time()
        clip_path = inference_fn(keyframe, motion_prompt, shot["num_frames"], shot_index=i)
        elapsed = time.time() - t0
        shot_timings.append(elapsed)
        print(f"[render] shot {i+1}/{total} · {shot['num_frames']}f · {elapsed:.1f}s · {clip_path}")
        clip_paths.append(clip_path)

    update_status(job_id, status="muxing",
                  status_detail="Stitching scenes together…",
                  current_step=total, total_steps=total)

    # -----------------------------------------------------------------------
    # ffmpeg concat clips + mux audio
    # -----------------------------------------------------------------------
    concat_list = "/tmp/concat.txt"
    with open(concat_list, "w") as f:
        for p in clip_paths:
            f.write(f"file '{p}'\n")
    visual_only = "/tmp/visual.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                    "-i", concat_list, "-c", "copy", visual_only], check=True)

    final_path = "/tmp/final.mp4"
    if audio_paths:
        audio_concat = "/tmp/audio_concat.txt"
        with open(audio_concat, "w") as f:
            for p in audio_paths:
                f.write(f"file '{p}'\n")
        audio_combined = "/tmp/audio.mp3"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                        "-i", audio_concat, "-c", "copy", audio_combined], check=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error",
                        "-i", visual_only, "-i", audio_combined,
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", final_path],
                       check=True)
    else:
        # Silent test — just rename visual_only as final
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", visual_only,
                        "-c:v", "copy", final_path], check=True)

    with open(final_path, "rb") as f:
        video_bytes = f.read()

    public_url = None
    if not skip_supabase:
        # -----------------------------------------------------------------------
        # Upload to Supabase creations-media bucket
        # -----------------------------------------------------------------------
        update_status(job_id, status="uploading", status_detail="Finalizing your video…")
        sb = supabase_client()
        storage_path = f"videos/{job_id}.mp4"
        try:
            sb.storage.from_("creations-media").upload(
                path=storage_path, file=video_bytes,
                file_options={"content-type": "video/mp4", "upsert": "true"},
            )
        except Exception as e:
            # Some supabase-py versions need different upload signature; retry
            print(f"[upload] retrying after: {e}")
            sb.storage.from_("creations-media").upload(storage_path, video_bytes)
        public_url = sb.storage.from_("creations-media").get_public_url(storage_path)
    else:
        print(f"[render] skip_supabase=True → returning {len(video_bytes)//1024} KB MP4 bytes")

    # Compute actual duration
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", final_path],
        capture_output=True, text=True,
    )
    final_duration = float(probe.stdout.strip())

    from datetime import datetime, timezone
    update_status(
        job_id, status="done",
        status_detail="Ready to watch!",
        video_url=public_url,
        duration_seconds=final_duration,
        shot_count=total,
        model_used=used_model,
        completed_at=datetime.now(timezone.utc).isoformat(),
    )

    return {
        "job_id": job_id,
        "video_url": public_url,
        "video_bytes": video_bytes if skip_supabase else None,
        "model_used": used_model,
        "shot_count": total,
        "duration_seconds": final_duration,
        "shot_inference_seconds": shot_timings,
    }


# ----------------------------------------------------------------------------
# Orchestrator — chains plan → render under a single job_id
# ----------------------------------------------------------------------------

@app.function(image=image, secrets=secrets, timeout=4000, cpu=2, memory=4096)
def generate(
    job_id: str, user_prompt: str, target_seconds: int = 20,
    skip_audio: bool = False, skip_supabase: bool = False,
    use_ltx_audio: bool = False,
) -> dict:
    """Single entry point. Updates status throughout. Returns final result."""
    try:
        plan = plan_video.remote(job_id, user_prompt, target_seconds, skip_audio)
        result = render_video.remote(job_id, plan, skip_audio, skip_supabase, use_ltx_audio)
        return result
    except Exception as e:
        import traceback
        err = f"{type(e).__name__}: {str(e)[:500]}"
        print(f"[generate] FAILED: {err}\n{traceback.format_exc()}")
        update_status(job_id, status="failed", error=err)
        return {"error": err, "job_id": job_id}


# ----------------------------------------------------------------------------
# HTTP endpoint — Next.js calls this to start a job
# ----------------------------------------------------------------------------

@app.function(image=image, secrets=secrets, timeout=60)
@modal.fastapi_endpoint(method="POST")
def submit(payload: dict) -> dict:
    """
    Async submit — fires render, returns call_id immediately.
    POST { auth_token, job_id, prompt, target_seconds? }
    Returns { call_id: str, job_id: str, status: "queued" }
    """
    import os, hmac
    auth = payload.get("auth_token")
    expected = os.environ.get("MODAL_WORKER_SHARED_SECRET")
    if not expected or not auth or not hmac.compare_digest(auth, expected):
        return {"error": "unauthorized"}

    job_id = payload.get("job_id")
    prompt = payload.get("prompt")
    target = int(payload.get("target_seconds", 20))
    if not job_id or not prompt:
        return {"error": "job_id and prompt required"}

    call = generate.spawn(job_id, prompt, target)
    return {"call_id": call.object_id, "job_id": job_id, "status": "queued"}


@app.function(image=image, secrets=secrets, timeout=30)
@modal.fastapi_endpoint(method="POST")
def status(payload: dict) -> dict:
    """
    Poll a previously-spawned generate() call. Returns running/done/failed
    without any DB. Designed for Vercel-free polling (each call <10s).
    POST { auth_token, call_id }
    """
    import os, hmac
    auth = payload.get("auth_token")
    expected = os.environ.get("MODAL_WORKER_SHARED_SECRET")
    if not expected or not auth or not hmac.compare_digest(auth, expected):
        return {"error": "unauthorized"}

    call_id = payload.get("call_id")
    if not call_id:
        return {"error": "call_id required"}

    try:
        fc = modal.FunctionCall.from_id(call_id)
        # timeout=0 → non-blocking; raises modal.exception.OutputExpiredError /
        # TimeoutError when not yet done.
        result = fc.get(timeout=0)
        if isinstance(result, dict) and result.get("error"):
            return {"status": "failed", "error": result["error"]}
        return {
            "status":           "done",
            "video_url":        result.get("video_url"),
            "title":            result.get("title"),
            "duration_seconds": result.get("duration_seconds"),
            "shot_count":       result.get("shot_count"),
            "model_used":       result.get("model_used"),
        }
    except modal.exception.OutputExpiredError:
        return {"status": "failed", "error": "Job result expired or was cancelled."}
    except TimeoutError:
        return {"status": "running"}
    except Exception as e:
        # Treat anything else as "still running" for transient resolve errors;
        # the client will retry on next poll.
        return {"status": "running", "transient_error": f"{type(e).__name__}: {str(e)[:200]}"}


@app.function(image=image, secrets=secrets, timeout=900)
@modal.fastapi_endpoint(method="POST")
def render(payload: dict) -> dict:
    """
    SYNCHRONOUS render — blocks until video is ready (or fails).
    No DB required; client just shows a fake loading sequence in UI.
    POST { auth_token, prompt, target_seconds? }
    Returns { video_url, title, duration_seconds, shot_count, model_used }
    """
    import os, hmac, uuid
    auth = payload.get("auth_token")
    expected = os.environ.get("MODAL_WORKER_SHARED_SECRET")
    if not expected or not auth or not hmac.compare_digest(auth, expected):
        return {"error": "unauthorized"}

    prompt = payload.get("prompt")
    target = int(payload.get("target_seconds", 20))
    if not prompt:
        return {"error": "prompt required"}

    job_id = str(uuid.uuid4())
    # skip_audio=False (ElevenLabs ON), skip_supabase=False (upload to bucket so
    # the Next.js client gets a public video_url), use_ltx_audio=False (not
    # applicable for 13B). status updates will warn-log if table missing — that's
    # fine, the function still returns the URL.
    result = generate.remote(job_id, prompt, target, False, False, False)
    return result


# ----------------------------------------------------------------------------
# Local CLI for testing
# ----------------------------------------------------------------------------

@app.local_entrypoint()
def main(prompt: str = "Explain how electrons power a lightbulb", target_seconds: int = 15):
    import uuid
    job_id = str(uuid.uuid4())
    print(f"[local] job_id={job_id} prompt={prompt!r} target={target_seconds}s")
    result = generate.remote(job_id, prompt, target_seconds)
    print(f"[local] result: {result}")
