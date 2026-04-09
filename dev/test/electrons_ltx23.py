"""
Electrons explainer video — LTX-2.3 with auto-fallback to LTX 13B distilled.

Tries CalamitousFelicitousness/LTX-2.3-dev-Diffusers community port first.
If it fails to load (diffusers 0.38 may lack pipeline class), falls back to
the proven LTX 13B distilled path.

Pipeline:
  - GPT-4o-mini -> 6-8 shot script for "how electrons work" (kids 11-16)
  - ElevenLabs TTS per shot (measure duration)
  - fal flux-pro keyframes per shot (Pixar-style)
  - LTX 2.3 (or fallback distilled) renders each shot sized to its audio
  - ffmpeg concat clips + audio mux

Run:
  modal run modal_app/electrons_ltx23.py::main
"""
import modal

app = modal.App("aida-electrons-ltx23")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "build-essential")
    .pip_install("torch==2.5.1", "torchvision==0.20.1",
                 index_url="https://download.pytorch.org/whl/cu121")
    .pip_install(
        # LTX-2.3 needs diffusers from main (>=0.32 has LTXConditionPipeline +
        # LTXLatentUpsamplePipeline with the wider VAE decoder shape).
        # 0.38.0 only knows the LTX 0.9.x VAE → shape mismatch on load.
        "git+https://github.com/huggingface/diffusers.git",
        "transformers", "accelerate",
        "sentencepiece", "safetensors", "huggingface_hub", "hf_transfer",
        "pillow", "requests", "imageio[ffmpeg]", "ftfy",
        "openai", "elevenlabs", "fal-client",
        "ninja", "packaging", "wheel",
    )
    .run_commands(
        "pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.5cxx11abiFALSE-cp311-cp311-linux_x86_64.whl",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HUB_DOWNLOAD_TIMEOUT": "120"})
)

models_volume = modal.Volume.from_name("aida-video-models", create_if_missing=True)
secrets = [modal.Secret.from_name("aida-secrets")]

LTX23_REPO = "CalamitousFelicitousness/LTX-2.3-dev-Diffusers"
LTX23_CACHE = "/models/ltx-2.3-dev-diffusers"
LTX_FALLBACK_REPO = "Lightricks/LTX-Video"
LTX_FALLBACK_PATH = "/models/ltxv-13b-0.9.7-distilled.safetensors"
FPS = 24


def ltx_frames_for_seconds(seconds: float) -> int:
    target = max(25, min(257, round(seconds * FPS)))
    return ((target - 1 + 4) // 8) * 8 + 1


@app.function(cpu=4, memory=8192, image=image, secrets=secrets, timeout=600)
def plan_video(target_duration_seconds: int = 40) -> dict:
    import io, json, os, subprocess, time
    import requests
    import openai
    import fal_client
    from elevenlabs import ElevenLabs
    from elevenlabs.types import VoiceSettings

    user_prompt = (
        "Explain what electrons are and how they work to a kid aged 11-13. "
        "Cover: what they are (tiny particles in atoms), where they live (atom shells/orbitals), "
        "how they move (electricity), why they matter (everyday tech), with the bulb/circuit example. "
        "NCERT Class 8-9 Physics level. Fun, encouraging, factually accurate."
    )
    openai_client = openai.OpenAI()
    num_shots_estimate = max(2, min(10, round(target_duration_seconds / 5)))

    system_prompt = (
        "You are a master educational video script writer for AI Decoder Academy (kids 11-16). "
        "Each shot teaches ONE clear beat. Build a narrative arc HOOK -> EXPLAIN -> EXAMPLE -> CONCLUSION. "
        "Active voice, present tense, 13-18 words per shot for ~5s TTS. "
        "Visual prompt must DEPICT the dialogue, not be tangential. "
        "Motion = ONE clear 5-second beat. "
        "KID-SAFE: no realistic human faces, scary content, branded characters, weapons. "
        "Output ONLY valid JSON, no markdown fences."
    )
    user_message = f"""
Create a narrated educational video script:
USER REQUEST: {user_prompt!r}
TARGET DURATION: ~{target_duration_seconds}s, {num_shots_estimate} shots ~5s each
ARC: HOOK (puzzle) -> EXPLAIN (what electrons are) -> ATOM/ORBITALS -> MOTION/CURRENT -> REAL-WORLD (bulb circuit) -> CONCLUSION

JSON shape exactly:
{{
  "title": "short engaging title",
  "mood": "one or two words",
  "learning_objective": "what student understands by end",
  "shots": [
    {{
      "teaching_beat": "what THIS shot teaches",
      "dialogue": "13-18 words narrator speaks",
      "visual": "detailed keyframe prompt: subject + setting + lighting + camera + style. Pixar-style 3D illustration, vibrant, kid-friendly, no human faces.",
      "motion": "ONE clear 5s motion beat"
    }}
  ]
}}
""".strip()

    t0 = time.time()
    completion = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": system_prompt},
                  {"role": "user", "content": user_message}],
        response_format={"type": "json_object"},
        temperature=0.8,
    )
    shot_plan = json.loads(completion.choices[0].message.content)
    print(f"[plan] GPT {time.time()-t0:.1f}s · title={shot_plan.get('title')!r} · "
          f"{len(shot_plan['shots'])} shots")

    voice_id = "21m00Tcm4TlvDq8ikWAM"
    el = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    shot_audio_bytes_list, shot_audio_durations = [], []
    t0 = time.time()
    for i, shot in enumerate(shot_plan["shots"]):
        audio_iter = el.text_to_speech.convert(
            voice_id=voice_id, text=shot["dialogue"], model_id="eleven_turbo_v2_5",
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
    print(f"[plan] TTS {time.time()-t0:.1f}s · total {sum(shot_audio_durations):.1f}s")

    STYLE_SUFFIX = (
        ", cinematic Pixar-style 3D animation, soft volumetric lighting, "
        "vibrant colors, clear focused subject, kid-friendly educational illustration, "
        "no human faces, no text overlays, no watermarks"
    )
    t0 = time.time()
    shot_keyframes = []
    for i, shot in enumerate(shot_plan["shots"]):
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
        shot_keyframes.append(resp.content)
    print(f"[plan] fal {time.time()-t0:.1f}s")

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
        "title": shot_plan.get("title", "untitled"),
        "mood": shot_plan.get("mood", "neutral"),
        "learning_objective": shot_plan.get("learning_objective", ""),
        "shots": shots_for_render,
        "total_audio_duration": sum(shot_audio_durations),
    }


@app.function(gpu="H100", image=image, volumes={"/models": models_volume},
              timeout=3600, memory=65536)
def render_video(plan: dict) -> dict:
    """Try LTX-2.3 community port first. Fallback to LTX 13B distilled if it fails."""
    import io, subprocess, time, gc
    from pathlib import Path
    import numpy as np
    import torch
    from PIL import Image
    from diffusers.utils import export_to_video
    from huggingface_hub import snapshot_download

    used_model = None
    pipe = None
    inference_kwargs = None

    # --- TRY LTX-2.3 ---
    # Order: LTXConditionPipeline (new I2V class in diffusers main) →
    #        LTXImageToVideoPipeline (legacy class, may now accept 2.3 VAE on main) →
    #        fallback to LTX 13B distilled.
    try:
        print(f"[ltx23] ensuring {LTX23_REPO} downloaded to {LTX23_CACHE}...")
        if not Path(LTX23_CACHE).exists() or not list(Path(LTX23_CACHE).iterdir()):
            snapshot_download(repo_id=LTX23_REPO, local_dir=LTX23_CACHE, max_workers=8)
            models_volume.commit()
        print(f"[ltx23] cached at {LTX23_CACHE}")

        load_errors = []
        attempts = []
        try:
            from diffusers import LTXConditionPipeline
            attempts.append(("LTXConditionPipeline", LTXConditionPipeline))
        except ImportError as e:
            load_errors.append(f"LTXConditionPipeline import: {e}")

        try:
            from diffusers import LTXImageToVideoPipeline
            attempts.append(("LTXImageToVideoPipeline", LTXImageToVideoPipeline))
        except ImportError as e:
            load_errors.append(f"LTXImageToVideoPipeline import: {e}")

        if not attempts:
            raise RuntimeError(f"No LTX pipeline class available: {load_errors}")

        for class_name, PipelineClass in attempts:
            try:
                print(f"[ltx23] attempting {class_name}.from_pretrained...")
                pipe = PipelineClass.from_pretrained(
                    LTX23_CACHE, torch_dtype=torch.bfloat16,
                )
                pipe.to("cuda")
                used_model = f"ltx-2.3-dev-community ({class_name})"
                inference_kwargs = {"num_inference_steps": 20, "guidance_scale": 3.0}
                print(f"[ltx23] LOADED via {class_name} OK")
                break
            except Exception as e:
                load_errors.append(f"{class_name}: {type(e).__name__}: {str(e)[:200]}")
                print(f"[ltx23] {class_name} failed: {type(e).__name__}: {str(e)[:200]}")
                if pipe is not None:
                    del pipe
                    pipe = None
                gc.collect()
                torch.cuda.empty_cache()

        if pipe is None:
            raise RuntimeError("All LTX-2.3 pipeline classes failed: " + " | ".join(load_errors))

    except Exception as e:
        print(f"[ltx23] FAILED — falling back to LTX 13B distilled")
        print(f"[ltx23] error: {type(e).__name__}: {str(e)[:500]}")
        if pipe is not None:
            del pipe
        gc.collect()
        torch.cuda.empty_cache()
        pipe = None

    # --- FALLBACK: LTX 13B distilled ---
    if pipe is None:
        from diffusers import LTXImageToVideoPipeline
        from transformers import T5EncoderModel, AutoTokenizer

        if not Path(LTX_FALLBACK_PATH).exists():
            return {"error": f"Both LTX-2.3 failed AND fallback weights not at {LTX_FALLBACK_PATH}"}

        print(f"[fallback] loading T5...")
        text_encoder = T5EncoderModel.from_pretrained(
            LTX_FALLBACK_REPO, subfolder="text_encoder", torch_dtype=torch.bfloat16,
        )
        tokenizer = AutoTokenizer.from_pretrained(LTX_FALLBACK_REPO, subfolder="tokenizer")
        print(f"[fallback] loading LTX 13B distilled...")
        pipe = LTXImageToVideoPipeline.from_single_file(
            LTX_FALLBACK_PATH, text_encoder=text_encoder, tokenizer=tokenizer,
            torch_dtype=torch.bfloat16,
        )
        pipe.to("cuda")
        used_model = "ltx-13b-0.9.7-distilled (fallback)"
        inference_kwargs = {"num_inference_steps": 8, "guidance_scale": 1.0}
        print(f"[fallback] LOADED OK")

    vram_load = torch.cuda.memory_allocated() // (1024**2)
    print(f"[render] using {used_model} · VRAM after load: {vram_load} MB")

    negative_prompt = (
        "blurry, low quality, distorted, deformed, ugly, jpeg artifacts, "
        "watermark, text, static, no motion, cartoon emoji creatures, "
        "realistic human faces"
    )

    shots = plan["shots"]
    clip_paths, audio_paths, shot_timings = [], [], []

    for i, shot in enumerate(shots):
        audio_path = f"/tmp/audio_{i:02d}.mp3"
        with open(audio_path, "wb") as f:
            f.write(shot["audio_bytes"])
        audio_paths.append(audio_path)

        keyframe = Image.open(io.BytesIO(shot["keyframe_bytes"])).convert("RGB")
        if keyframe.size != (704, 480):
            keyframe = keyframe.resize((704, 480))

        motion_prompt = (
            f"{shot['motion']}. Scene: {shot['visual']}. "
            f"Smooth cinematic motion, no jitter, no warping, "
            f"maintain subject identity throughout."
        )
        print(f"[render] shot {i+1}/{len(shots)}: {shot['num_frames']} frames")
        t0 = time.time()
        frames = pipe(
            image=keyframe, prompt=motion_prompt, negative_prompt=negative_prompt,
            height=480, width=704,
            num_frames=shot["num_frames"],
            **inference_kwargs,
        ).frames[0]
        elapsed = time.time() - t0
        shot_timings.append(elapsed)
        print(f"[render] shot {i+1} done in {elapsed:.1f}s")

        clip_path = f"/tmp/clip_{i:02d}.mp4"
        export_to_video(frames, clip_path, fps=FPS)
        clip_paths.append(clip_path)

    # Concat video
    concat_list = "/tmp/concat.txt"
    with open(concat_list, "w") as f:
        for p in clip_paths:
            f.write(f"file '{p}'\n")
    visual_only = "/tmp/visual.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                    "-i", concat_list, "-c", "copy", visual_only], check=True)

    audio_concat = "/tmp/audio_concat.txt"
    with open(audio_concat, "w") as f:
        for p in audio_paths:
            f.write(f"file '{p}'\n")
    audio_combined = "/tmp/audio.mp3"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                    "-i", audio_concat, "-c", "copy", audio_combined], check=True)

    final_path = "/tmp/final.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-i", visual_only, "-i", audio_combined,
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", final_path],
                   check=True)

    with open(final_path, "rb") as f:
        video_bytes = f.read()

    vram_peak = torch.cuda.max_memory_allocated() // (1024**2)
    return {
        "video_bytes": video_bytes,
        "shot_count": len(shots),
        "shot_inference_seconds": shot_timings,
        "total_inference_seconds": sum(shot_timings),
        "vram_after_load_mb": vram_load,
        "vram_peak_mb": vram_peak,
        "model_used": used_model,
    }


@app.local_entrypoint()
def main(
    target_duration_seconds: int = 40,
    output: str = "modal_electrons.mp4",
    force_replan: bool = False,
):
    """
    Plan is cached to .plan_cache_<duration>.pkl so re-runs of the render
    step (LTX-2.3 debug iteration) reuse the same GPT/ElevenLabs/fal output
    instead of burning API credits on every attempt.

    Pass --force-replan to regenerate the plan from scratch.
    """
    import pickle
    from pathlib import Path

    print(f"[local] target: {target_duration_seconds}s · topic: how electrons work\n")

    cache_path = Path(f".plan_cache_{target_duration_seconds}s.pkl")

    if cache_path.exists() and not force_replan:
        print(f"[local] Phase 1: REUSING cached plan from {cache_path}")
        with open(cache_path, "rb") as f:
            plan = pickle.load(f)
        print(f"[local]   (delete the file or pass --force-replan to regenerate)")
    else:
        print("[local] Phase 1: plan (GPT + ElevenLabs + fal)...")
        plan = plan_video.remote(target_duration_seconds)
        with open(cache_path, "wb") as f:
            pickle.dump(plan, f)
        print(f"[local]   cached to {cache_path} ({cache_path.stat().st_size // 1024} KB)")

    print(f"[local] Title: \"{plan['title']}\"")
    print(f"[local] Learning objective: {plan['learning_objective']}")
    print(f"[local] Shots: {len(plan['shots'])} · narration: {plan['total_audio_duration']:.1f}s\n")
    for i, s in enumerate(plan["shots"]):
        print(f"[local]   shot {i+1}: [{s.get('teaching_beat','')}]")
        print(f"[local]            \"{s['dialogue']}\"")
    print()

    print("[local] Phase 2: render (LTX-2.3 try -> distilled fallback)...")
    result = render_video.remote(plan)
    if "error" in result:
        print(f"[ERROR] {result['error']}")
        return

    with open(output, "wb") as f:
        f.write(result["video_bytes"])

    print(f"\n[OK] Saved: {output}")
    print(f"     Model used: {result['model_used']}")
    print(f"     Shots: {result['shot_count']}")
    print(f"     Inference: {result['total_inference_seconds']:.1f}s")
    print(f"     Per-shot: {[round(t,1) for t in result['shot_inference_seconds']]}")
    print(f"     VRAM after load: {result['vram_after_load_mb']} MB / 80 GB")
    print(f"     VRAM peak: {result['vram_peak_mb']} MB / 80 GB")
