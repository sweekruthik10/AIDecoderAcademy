"""
Audio-first narrated video pipeline — LTX-Video 13B distilled (bf16) variant.

Same pipeline shape as narrated_video.py (Wan version) but using:
  - Lightricks LTX-Video 13B v0.9.7 distilled at bf16 (not fp8 — fp8 fought us on Day 1)
  - 8 inference steps + guidance_scale=1.0 (distilled, no CFG needed)
  - 24 fps native (Wan was 16 fps)
  - 704×480 native (Wan was 832×480)
  - Frame counts must be 8N+1 (Wan was any multiple of 4)

Expected vs Wan version:
  - ~2-3× faster per shot (8 steps vs 20)
  - Different cinematic style (Lightricks vs Alibaba)
  - Same Phase 1 (OpenAI + ElevenLabs + fal keyframes) — model-agnostic

Run:
    modal run modal_app/narrated_video_ltx.py::main --user-prompt "Explain photosynthesis"

Cost: ~$0.60-1.00 per 20s narrated video. Wall ~5-8 min.
"""
import modal

app = modal.App("aida-narrated-ltx")

# ---------------------------------------------------------------------------
# Image (same heavy GPU image — pip is paid once)
# ---------------------------------------------------------------------------
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
LTX_FILENAME = "ltxv-13b-0.9.7-distilled.safetensors"
LTX_MODEL_PATH = f"/models/{LTX_FILENAME}"
FPS = 24  # LTX native


def ltx_frames_for_seconds(seconds: float) -> int:
    """LTX requires 8N+1 frame count. Snap to nearest valid count for target duration."""
    target = max(25, min(257, round(seconds * FPS)))
    # Snap to 8N+1
    return ((target - 1 + 4) // 8) * 8 + 1


# ---------------------------------------------------------------------------
# Phase 0: Ensure LTX weights are cached in Volume
# ---------------------------------------------------------------------------
@app.function(
    image=image,
    volumes={"/models": models_volume},
    timeout=1800,
    cpu=4,
    memory=8192,
)
def download_ltx() -> dict:
    """Download LTX 13B distilled bf16 to Volume if not already cached."""
    import time
    from pathlib import Path
    from huggingface_hub import hf_hub_download

    if Path(LTX_MODEL_PATH).exists():
        size_gb = Path(LTX_MODEL_PATH).stat().st_size // (1024**3)
        return {"status": "cached", "size_gb": size_gb, "path": LTX_MODEL_PATH}

    print(f"[download] {LTX_REPO}/{LTX_FILENAME} → /models")
    t0 = time.time()
    hf_hub_download(
        repo_id=LTX_REPO,
        filename=LTX_FILENAME,
        local_dir="/models",
    )
    models_volume.commit()
    size_gb = Path(LTX_MODEL_PATH).stat().st_size // (1024**3)
    elapsed = time.time() - t0
    return {"status": "downloaded", "size_gb": size_gb, "elapsed_seconds": elapsed}


# ---------------------------------------------------------------------------
# Phase 1: PLAN on CPU — script, audio, keyframes (model-agnostic)
# ---------------------------------------------------------------------------
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
    """Same shape as narrated_video.plan_video — generates shots + audio + keyframes."""
    import io
    import json
    import os
    import subprocess
    import time
    import requests

    import openai
    import fal_client
    from elevenlabs import ElevenLabs
    from elevenlabs.types import VoiceSettings

    print(f"[plan] user_prompt: {user_prompt!r}")
    print(f"[plan] target_duration: {target_duration_seconds}s")
    print(f"[plan] LTX FPS={FPS} (native)")

    # ----- 1. GPT shot list -----
    print("\n[plan] step 1: GPT shot list...")
    t0 = time.time()
    openai_client = openai.OpenAI()

    num_shots_estimate = max(2, min(8, round(target_duration_seconds / 5)))

    system_prompt = (
        "You write educational/narrative video scripts for AI Decoder Academy, "
        "a creative AI learning platform for kids aged 11-16. Scripts MUST be "
        "child-safe, factually accurate, engaging, friendly. "
        "Output ONLY valid JSON, no markdown fences."
    )

    user_message = f"""
Create a narrated video script for this user request: {user_prompt!r}

Target total duration: ~{target_duration_seconds} seconds. Aim for {num_shots_estimate} shots,
each about 5 seconds of speech (~13-18 words per shot).

Output a JSON object:
{{
  "title": "short title",
  "mood": "one or two words, e.g. 'wonder', 'curious'",
  "shots": [
    {{
      "dialogue": "exactly what narrator speaks (13-18 words)",
      "visual": "rich prompt for keyframe image — scene, lighting, characters, style. Cinematic, kid-safe.",
      "motion": "one motion beat for the 5-second clip",
      "target_seconds": 5
    }}
  ]
}}
""".strip()

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
    print(f"[plan] step 1 done in {time.time()-t0:.1f}s")
    print(f"[plan] title: {shot_plan.get('title')!r} · mood: {shot_plan.get('mood')!r}")
    print(f"[plan] {len(shot_plan['shots'])} shots planned")

    # ----- 2. ElevenLabs TTS -----
    print("\n[plan] step 2: ElevenLabs TTS per shot...")
    t0 = time.time()
    el_client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])

    shot_audio_bytes_list: list[bytes] = []
    shot_audio_durations: list[float] = []

    for i, shot in enumerate(shot_plan["shots"]):
        audio_iter = el_client.text_to_speech.convert(
            voice_id=voice_id,
            text=shot["dialogue"],
            model_id="eleven_turbo_v2_5",
            output_format="mp3_44100_128",
            voice_settings=VoiceSettings(
                stability=0.5,
                similarity_boost=0.75,
                style=0.3,
                use_speaker_boost=True,
            ),
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
        print(f"[plan]   shot {i+1} TTS: {len(audio_bytes)//1024} KB · {duration:.2f}s")

    print(f"[plan] step 2 done in {time.time()-t0:.1f}s")
    print(f"[plan] total narration: {sum(shot_audio_durations):.2f}s")

    # ----- 3. fal flux keyframes -----
    print("\n[plan] step 3: fal flux keyframes per shot...")
    t0 = time.time()

    shot_keyframe_bytes_list: list[bytes] = []
    for i, shot in enumerate(shot_plan["shots"]):
        visual_prompt = shot["visual"] + ", cinematic, dreamlike, photorealistic, children's educational illustration style, age-appropriate"
        result = fal_client.subscribe(
            "fal-ai/flux-pro/v1.1",
            arguments={
                "prompt": visual_prompt,
                "image_size": "landscape_16_9",
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
            },
        )
        image_url = result["images"][0]["url"]
        resp = requests.get(image_url, timeout=60)
        resp.raise_for_status()
        shot_keyframe_bytes_list.append(resp.content)
        print(f"[plan]   shot {i+1} keyframe: {len(resp.content)//1024} KB")

    print(f"[plan] step 3 done in {time.time()-t0:.1f}s")

    # ----- 4. Compose shots with LTX-valid frame counts -----
    shots_for_render = []
    for i, (shot, audio_duration, keyframe_bytes) in enumerate(zip(
        shot_plan["shots"], shot_audio_durations, shot_keyframe_bytes_list
    )):
        num_frames = ltx_frames_for_seconds(audio_duration)
        actual_seconds = num_frames / FPS
        shots_for_render.append({
            "visual": shot["visual"],
            "motion": shot["motion"],
            "dialogue": shot["dialogue"],
            "audio_seconds": audio_duration,
            "video_seconds": actual_seconds,
            "num_frames": num_frames,
            "num_inference_steps": 8,    # LTX distilled
            "guidance_scale": 1.0,        # LTX distilled, no CFG
            "keyframe_bytes": keyframe_bytes,
            "audio_bytes": shot_audio_bytes_list[i],
        })
        print(f"[plan]   shot {i+1}: {audio_duration:.2f}s audio → {num_frames} frames "
              f"({actual_seconds:.2f}s video)")

    return {
        "title": shot_plan.get("title", "untitled"),
        "mood": shot_plan.get("mood", "neutral"),
        "shots": shots_for_render,
        "total_audio_duration": sum(shot_audio_durations),
    }


# ---------------------------------------------------------------------------
# Phase 2: RENDER on H100 — LTX 13B distilled bf16
# ---------------------------------------------------------------------------
@app.function(
    gpu="H100",
    image=image,
    volumes={"/models": models_volume},
    timeout=3600,
    memory=65536,
)
def render_video(plan: dict) -> dict:
    """LTX 13B distilled bf16 inference per shot, ffmpeg concat + audio mux."""
    import io
    import os
    import subprocess
    import time
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
        if isinstance(frame, np.ndarray):
            arr = frame
            if arr.dtype != np.uint8:
                arr = (arr * 255).clip(0, 255).astype(np.uint8)
            return Image.fromarray(arr)
        raise TypeError(f"Cannot convert {type(frame)} to PIL")

    if not Path(LTX_MODEL_PATH).exists():
        return {"error": f"Model not at {LTX_MODEL_PATH}. Run download_ltx first."}

    # ----- Load T5 separately, then LTX from single file -----
    print("[render] loading T5 text encoder + tokenizer from Lightricks/LTX-Video")
    t0 = time.time()
    text_encoder = T5EncoderModel.from_pretrained(
        LTX_REPO,
        subfolder="text_encoder",
        torch_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        LTX_REPO,
        subfolder="tokenizer",
    )
    print(f"[render] T5 loaded in {time.time()-t0:.1f}s")

    print(f"[render] loading LTX 13B distilled bf16 from {LTX_MODEL_PATH}")
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
    clip_paths = []
    audio_paths = []
    shot_timings = []
    last_frames_png = []

    for i, shot in enumerate(shots):
        print(f"\n[render] shot {i+1}/{len(shots)}: {shot['num_frames']} frames "
              f"({shot['video_seconds']:.2f}s @ {FPS}fps)")
        print(f"[render] visual: {shot['visual'][:80]}...")
        print(f"[render] motion: {shot['motion']}")

        # Save audio bytes
        audio_path = f"/tmp/audio_{i:02d}.mp3"
        with open(audio_path, "wb") as f:
            f.write(shot["audio_bytes"])
        audio_paths.append(audio_path)

        # Load + resize keyframe to LTX's native 704×480
        keyframe = Image.open(io.BytesIO(shot["keyframe_bytes"])).convert("RGB").resize((704, 480))

        t0 = time.time()
        wan_prompt = f"{shot['motion']}. {shot['visual']}"
        frames = pipe(
            image=keyframe,
            prompt=wan_prompt,
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

        # Export video at LTX's native 24fps
        clip_path = f"/tmp/clip_{i:02d}.mp4"
        export_to_video(frames, clip_path, fps=FPS)
        clip_paths.append(clip_path)

        last_frame_path = f"/tmp/last_{i:02d}.png"
        to_pil(frames[-1]).save(last_frame_path)
        with open(last_frame_path, "rb") as f:
            last_frames_png.append(f.read())

    # ----- Concat video clips -----
    print("\n[render] concatenating clips...")
    concat_list = "/tmp/concat.txt"
    with open(concat_list, "w") as f:
        for p in clip_paths:
            f.write(f"file '{p}'\n")
    visual_only_path = "/tmp/visual_only.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", concat_list, "-c", "copy", visual_only_path],
        check=True,
    )

    # ----- Concat audio clips -----
    print("[render] concatenating audio...")
    audio_concat = "/tmp/audio_concat.txt"
    with open(audio_concat, "w") as f:
        for p in audio_paths:
            f.write(f"file '{p}'\n")
    audio_combined = "/tmp/audio_combined.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", audio_concat, "-c", "copy", audio_combined],
        check=True,
    )

    # ----- Mux audio onto video -----
    print("[render] muxing audio onto video...")
    final_path = "/tmp/final.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error",
         "-i", visual_only_path,
         "-i", audio_combined,
         "-c:v", "copy",
         "-c:a", "aac",
         "-b:a", "192k",
         "-shortest",
         final_path],
        check=True,
    )

    with open(final_path, "rb") as f:
        video_bytes = f.read()

    return {
        "video_bytes": video_bytes,
        "last_frames_png": last_frames_png,
        "shot_count": len(shots),
        "shot_inference_seconds": shot_timings,
        "total_inference_seconds": sum(shot_timings),
        "model": "ltx-video-13b-0.9.7-distilled",
        "gpu": "H100",
        "fps": FPS,
        "resolution": "704x480",
    }


# ---------------------------------------------------------------------------
# Local entrypoint
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main(
    user_prompt: str = "Explain refraction of light to an 11-13 year old using the bent pencil in water example.",
    target_duration_seconds: int = 20,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
    output: str = "modal_narrated_ltx.mp4",
):
    print(f"[local] user_prompt: {user_prompt}")
    print(f"[local] target: {target_duration_seconds}s\n")

    print("[local] Phase 0: ensure LTX 13B distilled weights cached...")
    dl = download_ltx.remote()
    print(f"[local] Phase 0: {dl}\n")

    print("[local] Phase 1: CPU plan (OpenAI + ElevenLabs + fal)...")
    plan = plan_video.remote(user_prompt, target_duration_seconds, voice_id)
    print(f"[local] Plan: \"{plan['title']}\" ({plan['mood']}) · "
          f"{len(plan['shots'])} shots · {plan['total_audio_duration']:.1f}s narration\n")

    print("[local] Phase 2: H100 render (LTX 13B distilled multi-shot + audio mux)...")
    result = render_video.remote(plan)
    if "error" in result:
        print(f"[ERROR] {result['error']}")
        return

    with open(output, "wb") as f:
        f.write(result["video_bytes"])

    for i, frame_bytes in enumerate(result["last_frames_png"]):
        with open(f"narrated_ltx_shot_{i:02d}_lastframe.png", "wb") as f:
            f.write(frame_bytes)

    print(f"\n[OK] Saved: {output}")
    print(f"     Title: {plan['title']}")
    print(f"     Model: {result['model']} @ {result['resolution']} {result['fps']}fps")
    print(f"     Shots: {result['shot_count']}")
    print(f"     Inference: {result['total_inference_seconds']:.1f}s "
          f"(per-shot: {[round(t, 1) for t in result['shot_inference_seconds']]})")
    print(f"     Last frames saved: narrated_ltx_shot_*_lastframe.png")
