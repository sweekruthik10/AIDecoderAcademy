"""
Audio-first narrated video pipeline — LTX-Video 13B v0.9.8 DEV (non-distilled) bf16.

Identical to narrated_video_ltx.py except:
  - File: ltxv-13b-0.9.8-dev.safetensors (latest dev/non-distilled, 28.6GB)
  - 30 inference steps (not 8)
  - guidance_scale=3.0 (standard CFG, not 1.0)

Expected vs distilled:
  - ~3-4× slower (30 steps vs 8)
  - Potentially higher quality fidelity
  - Same VRAM footprint (~28GB)

Run:
    modal run modal_app/narrated_video_ltx_full.py::main --user-prompt "Explain photosynthesis"

Cost: ~$0.70-1.00 per 20s video. Wall ~5-8 min.
"""
import modal

app = modal.App("aida-narrated-ltx-full")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "build-essential")
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "diffusers==0.38.0",
        "transformers",
        "accelerate",
        "sentencepiece",
        "safetensors",
        "huggingface_hub",
        "hf_transfer",
        "pillow",
        "requests",
        "imageio[ffmpeg]",
        "ftfy",
        "openai",
        "elevenlabs",
        "fal-client",
        "ninja",
        "packaging",
        "wheel",
    )
    .run_commands(
        "pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.5cxx11abiFALSE-cp311-cp311-linux_x86_64.whl",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "HF_HUB_DOWNLOAD_TIMEOUT": "120",
    })
)

models_volume = modal.Volume.from_name("aida-video-models", create_if_missing=True)
secrets = [modal.Secret.from_name("aida-secrets")]

LTX_REPO = "Lightricks/LTX-Video"
LTX_FILENAME = "ltxv-13b-0.9.8-dev.safetensors"   # FULL (dev = non-distilled), latest 0.9.8
LTX_MODEL_PATH = f"/models/{LTX_FILENAME}"
FPS = 24
DEFAULT_STEPS = 30      # full model needs more steps
DEFAULT_CFG = 3.0        # standard CFG


def ltx_frames_for_seconds(seconds: float) -> int:
    target = max(25, min(257, round(seconds * FPS)))
    return ((target - 1 + 4) // 8) * 8 + 1


@app.function(
    image=image,
    volumes={"/models": models_volume},
    timeout=1800,
    cpu=4,
    memory=8192,
)
def download_ltx_full() -> dict:
    import time
    from pathlib import Path
    from huggingface_hub import hf_hub_download

    if Path(LTX_MODEL_PATH).exists():
        size_gb = Path(LTX_MODEL_PATH).stat().st_size // (1024**3)
        return {"status": "cached", "size_gb": size_gb}

    print(f"[download] {LTX_REPO}/{LTX_FILENAME} → /models")
    t0 = time.time()
    hf_hub_download(
        repo_id=LTX_REPO,
        filename=LTX_FILENAME,
        local_dir="/models",
    )
    models_volume.commit()
    size_gb = Path(LTX_MODEL_PATH).stat().st_size // (1024**3)
    return {"status": "downloaded", "size_gb": size_gb, "elapsed_seconds": time.time()-t0}


@app.function(
    cpu=4,
    memory=8192,
    image=image,
    secrets=secrets,
    timeout=600,
)
def plan_video(
    user_prompt: str,
    target_duration_seconds: int = 20,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
) -> dict:
    import io, json, os, subprocess, time
    import requests
    import openai
    import fal_client
    from elevenlabs import ElevenLabs
    from elevenlabs.types import VoiceSettings

    print(f"[plan] user_prompt: {user_prompt!r}")
    print(f"[plan] target: {target_duration_seconds}s, LTX full, FPS={FPS}")

    openai_client = openai.OpenAI()
    # Allow up to 12 shots for longer narrated videos (30-60s range)
    num_shots_estimate = max(2, min(12, round(target_duration_seconds / 5)))

    system_prompt = (
        "You are a master educational video script writer for AI Decoder Academy, "
        "a creative AI learning platform for kids aged 11-16. You turn vague topics "
        "into engaging, factually accurate, age-appropriate narrated videos that "
        "ACTUALLY TEACH the concept.\n\n"
        "Rules:\n"
        "- Each shot teaches ONE clear teaching beat (build a narrative arc: "
        "HOOK → EXPLANATION → EXAMPLE → CONCLUSION across the shots)\n"
        "- Active voice, present tense, short sentences, conversational tone\n"
        "- 13-18 words per shot for natural ~5s of TTS speech\n"
        "- Visual prompt must DEPICT what's being said (not tangential)\n"
        "- Motion describes ONE beat of camera/subject motion for 5s of video\n"
        "- Use concrete examples kids can visualize, not abstractions\n"
        "- Maintain visual continuity across shots where it serves the lesson "
        "(same setting/character feel)\n"
        "- KID-SAFE: no realistic human faces, no scary content, no branded characters, "
        "no weapons. Animated/illustrated style preferred.\n"
        "Output ONLY valid JSON, no markdown fences."
    )
    user_message = f"""
Create a narrated educational video script for this request:

USER REQUEST: {user_prompt!r}
TARGET TOTAL DURATION: ~{target_duration_seconds}s
NUMBER OF SHOTS: {num_shots_estimate} (each ~5s, narrative arc: HOOK → EXPLAIN → EXAMPLE → CONCLUSION)

Output JSON exactly this shape (no other keys, no markdown):
{{
  "title": "short engaging title",
  "mood": "one or two words for music mood (e.g. 'curious', 'wonder', 'energetic')",
  "learning_objective": "what the student should UNDERSTAND by the end of the video, in one sentence",
  "shots": [
    {{
      "teaching_beat": "what THIS specific shot teaches (e.g. 'introduce the puzzle: a pencil looks broken in water')",
      "dialogue": "exactly what narrator speaks (13-18 words, conversational, kid-friendly)",
      "visual": "detailed keyframe prompt: subject + setting + lighting + camera angle + style. Cinematic Pixar-style 3D illustration, vibrant colors, soft volumetric light, kid-friendly. Describe EXACTLY what's in the frame, no abstract concepts.",
      "motion": "ONE clear 5-second motion beat (e.g. 'camera slowly zooms in on the pencil entering the water surface', 'subject turns head left to right'). Specific, visual, achievable in 5s."
    }}
  ]
}}
""".strip()

    t0 = time.time()
    completion = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        temperature=0.8,
    )
    shot_plan = json.loads(completion.choices[0].message.content)
    print(f"[plan] GPT in {time.time()-t0:.1f}s · "
          f"title={shot_plan.get('title')!r} · {len(shot_plan['shots'])} shots")

    el_client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    shot_audio_bytes_list, shot_audio_durations = [], []
    t0 = time.time()
    for i, shot in enumerate(shot_plan["shots"]):
        audio_iter = el_client.text_to_speech.convert(
            voice_id=voice_id,
            text=shot["dialogue"],
            model_id="eleven_turbo_v2_5",
            output_format="mp3_44100_128",
            voice_settings=VoiceSettings(stability=0.5, similarity_boost=0.75, style=0.3, use_speaker_boost=True),
        )
        audio_bytes = b"".join(audio_iter)
        shot_audio_bytes_list.append(audio_bytes)
        tmp_path = f"/tmp/shot_audio_{i:02d}.mp3"
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", tmp_path],
            capture_output=True, text=True,
        )
        duration = float(probe.stdout.strip())
        shot_audio_durations.append(duration)
        print(f"[plan] shot {i+1} TTS: {duration:.2f}s")
    print(f"[plan] ElevenLabs in {time.time()-t0:.1f}s total")

    t0 = time.time()
    shot_keyframe_bytes_list = []
    # Style consistency suffix appended to every shot's keyframe — same look across shots
    STYLE_SUFFIX = (
        ", cinematic Pixar-style 3D animation, soft volumetric lighting, "
        "vibrant colors, clear focused subject, kid-friendly educational illustration, "
        "photographic detail, high quality, age-appropriate, no text overlays, no watermarks"
    )
    for i, shot in enumerate(shot_plan["shots"]):
        # Request fal at LTX's native 704×480 directly — no crop/stretch downstream
        result = fal_client.subscribe(
            "fal-ai/flux-pro/v1.1",
            arguments={
                "prompt": shot["visual"] + STYLE_SUFFIX,
                "image_size": {"width": 704, "height": 480},
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
            },
        )
        resp = requests.get(result["images"][0]["url"], timeout=60)
        resp.raise_for_status()
        shot_keyframe_bytes_list.append(resp.content)
        print(f"[plan] shot {i+1} keyframe: {len(resp.content)//1024} KB @ 704×480 native")
    print(f"[plan] fal in {time.time()-t0:.1f}s total")

    shots_for_render = []
    for i, (shot, audio_duration, keyframe_bytes) in enumerate(zip(
        shot_plan["shots"], shot_audio_durations, shot_keyframe_bytes_list
    )):
        num_frames = ltx_frames_for_seconds(audio_duration)
        shots_for_render.append({
            "visual": shot["visual"],
            "motion": shot["motion"],
            "dialogue": shot["dialogue"],
            "audio_seconds": audio_duration,
            "video_seconds": num_frames / FPS,
            "num_frames": num_frames,
            "num_inference_steps": DEFAULT_STEPS,
            "guidance_scale": DEFAULT_CFG,
            "keyframe_bytes": keyframe_bytes,
            "audio_bytes": shot_audio_bytes_list[i],
        })

    return {
        "title": shot_plan.get("title", "untitled"),
        "mood": shot_plan.get("mood", "neutral"),
        "learning_objective": shot_plan.get("learning_objective", ""),
        "shots": shots_for_render,
        "total_audio_duration": sum(shot_audio_durations),
    }


@app.function(
    gpu="H100",
    image=image,
    volumes={"/models": models_volume},
    timeout=3600,
    memory=65536,
)
def render_video(plan: dict) -> dict:
    import io, subprocess, time
    from pathlib import Path
    import numpy as np
    import torch
    from PIL import Image
    from diffusers import LTXImageToVideoPipeline
    from diffusers.utils import export_to_video
    from transformers import T5EncoderModel, AutoTokenizer

    def to_pil(frame) -> Image.Image:
        if isinstance(frame, Image.Image):
            return frame
        arr = frame
        if arr.dtype != np.uint8:
            arr = (arr * 255).clip(0, 255).astype(np.uint8)
        return Image.fromarray(arr)

    if not Path(LTX_MODEL_PATH).exists():
        return {"error": f"Model not at {LTX_MODEL_PATH}. Run download_ltx_full first."}

    print(f"[render] loading T5...")
    t0 = time.time()
    text_encoder = T5EncoderModel.from_pretrained(LTX_REPO, subfolder="text_encoder", torch_dtype=torch.bfloat16)
    tokenizer = AutoTokenizer.from_pretrained(LTX_REPO, subfolder="tokenizer")
    print(f"[render] T5 in {time.time()-t0:.1f}s")

    print(f"[render] loading LTX FULL bf16...")
    t0 = time.time()
    pipe = LTXImageToVideoPipeline.from_single_file(
        LTX_MODEL_PATH,
        text_encoder=text_encoder,
        tokenizer=tokenizer,
        torch_dtype=torch.bfloat16,
    )
    pipe.to("cuda")
    print(f"[render] pipeline ready in {time.time()-t0:.1f}s · "
          f"VRAM: {torch.cuda.memory_allocated() // (1024**2)} MB")

    negative_prompt = (
        "blurry, low quality, distorted, deformed, ugly, jpeg artifacts, "
        "watermark, text, static, no motion, cartoon emoji creatures"
    )

    shots = plan["shots"]
    clip_paths, audio_paths, shot_timings, last_frames_png = [], [], [], []

    for i, shot in enumerate(shots):
        print(f"\n[render] shot {i+1}/{len(shots)}: {shot['num_frames']} frames "
              f"({shot['video_seconds']:.2f}s @ {FPS}fps, "
              f"{shot['num_inference_steps']} steps, cfg {shot['guidance_scale']})")

        audio_path = f"/tmp/audio_{i:02d}.mp3"
        with open(audio_path, "wb") as f:
            f.write(shot["audio_bytes"])
        audio_paths.append(audio_path)

        # Keyframe already 704×480 from fal — no resize needed (.resize is idempotent if same dim)
        keyframe = Image.open(io.BytesIO(shot["keyframe_bytes"])).convert("RGB")
        if keyframe.size != (704, 480):
            keyframe = keyframe.resize((704, 480))

        # Motion + visual fusion: motion FIRST (it's what we want to happen),
        # then key visual anchors so the model preserves scene identity
        motion_prompt = (
            f"{shot['motion']}. "
            f"Scene: {shot['visual']}. "
            f"Smooth cinematic motion, no jitter, no warping, "
            f"maintain subject identity, maintain visual style throughout."
        )

        t0 = time.time()
        frames = pipe(
            image=keyframe,
            prompt=motion_prompt,
            negative_prompt=negative_prompt,
            height=480,
            width=704,
            num_frames=shot["num_frames"],
            num_inference_steps=shot["num_inference_steps"],
            guidance_scale=shot["guidance_scale"],
        ).frames[0]
        elapsed = time.time() - t0
        shot_timings.append(elapsed)
        print(f"[render] shot {i+1} done in {elapsed:.1f}s")

        clip_path = f"/tmp/clip_{i:02d}.mp4"
        export_to_video(frames, clip_path, fps=FPS)
        clip_paths.append(clip_path)

        last_frame_path = f"/tmp/last_{i:02d}.png"
        to_pil(frames[-1]).save(last_frame_path)
        with open(last_frame_path, "rb") as f:
            last_frames_png.append(f.read())

    # Concat + mux
    concat_list = "/tmp/concat.txt"
    with open(concat_list, "w") as f:
        for p in clip_paths:
            f.write(f"file '{p}'\n")
    visual_only = "/tmp/visual_only.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                    "-i", concat_list, "-c", "copy", visual_only], check=True)

    audio_concat = "/tmp/audio_concat.txt"
    with open(audio_concat, "w") as f:
        for p in audio_paths:
            f.write(f"file '{p}'\n")
    audio_combined = "/tmp/audio_combined.mp3"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                    "-i", audio_concat, "-c", "copy", audio_combined], check=True)

    final_path = "/tmp/final.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-i", visual_only, "-i", audio_combined,
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", final_path],
                   check=True)

    with open(final_path, "rb") as f:
        video_bytes = f.read()

    return {
        "video_bytes": video_bytes,
        "last_frames_png": last_frames_png,
        "shot_count": len(shots),
        "shot_inference_seconds": shot_timings,
        "total_inference_seconds": sum(shot_timings),
        "model": "ltx-video-13b-0.9.7-full-bf16",
        "gpu": "H100",
        "fps": FPS,
        "resolution": "704x480",
    }


@app.local_entrypoint()
def main(
    user_prompt: str = "Explain refraction of light to an 11-13 year old using the bent pencil in water example.",
    target_duration_seconds: int = 40,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
    output: str = "modal_narrated_ltx_full.mp4",
):
    print(f"[local] user_prompt: {user_prompt}")
    print(f"[local] target: {target_duration_seconds}s · LTX 13B FULL (non-distilled)\n")

    print("[local] Phase 0: ensure LTX FULL weights cached (one-time ~26GB download)...")
    dl = download_ltx_full.remote()
    print(f"[local] Phase 0: {dl}\n")

    print("[local] Phase 1: CPU plan...")
    plan = plan_video.remote(user_prompt, target_duration_seconds, voice_id)
    print(f"[local] Plan: \"{plan['title']}\" · {len(plan['shots'])} shots · "
          f"{plan['total_audio_duration']:.1f}s narration")
    if plan.get('learning_objective'):
        print(f"[local] Learning objective: {plan['learning_objective']}")
    for i, shot in enumerate(plan["shots"]):
        print(f"[local]   shot {i+1}: \"{shot['dialogue'][:80]}...\"")
    print()

    print("[local] Phase 2: H100 render (LTX FULL, 30 steps + cfg 3.0)...")
    result = render_video.remote(plan)
    if "error" in result:
        print(f"[ERROR] {result['error']}")
        return

    with open(output, "wb") as f:
        f.write(result["video_bytes"])
    for i, frame_bytes in enumerate(result["last_frames_png"]):
        with open(f"narrated_ltx_full_shot_{i:02d}_lastframe.png", "wb") as f:
            f.write(frame_bytes)

    print(f"\n[OK] Saved: {output}")
    print(f"     Title: {plan['title']}")
    print(f"     Model: {result['model']} @ {result['resolution']} {result['fps']}fps")
    print(f"     Shots: {result['shot_count']}")
    print(f"     Inference: {result['total_inference_seconds']:.1f}s "
          f"(per-shot: {[round(t, 1) for t in result['shot_inference_seconds']]})")
    print(f"     Last frames saved: narrated_ltx_full_shot_*_lastframe.png")
