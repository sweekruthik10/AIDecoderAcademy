"""
Audio-first narrated video pipeline.

Implements the design from docs/superpowers/specs/2026-05-16-video-generation-pipeline-design.md
section 7 (Worker pipeline) — the audio-first variant from the Day 1 brainstorm Q10.

Flow:
  user_prompt
    → [CPU function] OpenAI shot list + ElevenLabs TTS + fal flux keyframes per shot
    → [H100 function] Wan 14B I2V per shot, sized to each shot's audio duration
    → ffmpeg concat clips + overlay narration audio
    → final MP4 with embedded audio

Setup (one-time):
    modal secret create aida-secrets OPENAI_API_KEY=sk-... ELEVENLABS_API_KEY=... FAL_KEY=...

Run:
    modal run modal_app/narrated_video.py::main --user-prompt "Explain photosynthesis to a 12-year-old"

Cost: ~$1.30 per 15s narrated video (3 shots × ~$0.37 each + $0.20 API costs).
Wall time: ~10-15 min.
"""
import modal

app = modal.App("aida-narrated-video")

# ---------------------------------------------------------------------------
# Image (same heavy GPU image; CPU function can use it too — pip is paid once)
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
MODEL_DIR = "/models/wan-2.1-i2v-14b-480p"
secrets = [modal.Secret.from_name("aida-secrets")]

FPS = 16  # Wan default


# ---------------------------------------------------------------------------
# Phase 1: PLAN on CPU — script, audio, keyframes
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
    target_duration_seconds: int = 15,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",  # ElevenLabs Rachel — friendly default
) -> dict:
    """Generate shot list + per-shot narration audio + per-shot keyframes."""
    import io
    import json
    import os
    import time
    import requests

    import openai
    import fal_client
    from elevenlabs import ElevenLabs
    from elevenlabs.types import VoiceSettings

    print(f"[plan] user_prompt: {user_prompt!r}")
    print(f"[plan] target_duration: {target_duration_seconds}s")

    # ----- 1. Generate structured shot list via GPT -----
    print("\n[plan] step 1: GPT shot list...")
    t0 = time.time()
    openai_client = openai.OpenAI()

    num_shots_estimate = max(2, min(8, round(target_duration_seconds / 5)))

    system_prompt = (
        "You write educational/narrative video scripts for AI Decoder Academy, "
        "a creative AI learning platform for kids aged 11-16. Your scripts MUST be "
        "child-safe, factually accurate, engaging, and friendly. "
        "Output ONLY valid JSON, no markdown fences. "
        "Avoid prompting for human faces, realistic people, branded characters, "
        "weapons, violence, or anything kid-unsafe."
    )

    user_message = f"""
Create a narrated video script for this user request: {user_prompt!r}

Target total duration: ~{target_duration_seconds} seconds.

Aim for {num_shots_estimate} shots, each about 5 seconds of speech (~13-18 words per shot).

Output a JSON object with exactly this shape:
{{
  "title": "short title for the video",
  "mood": "one or two words describing music mood, e.g. 'wonder', 'curious', 'energetic'",
  "shots": [
    {{
      "dialogue": "exactly what the narrator speaks during this shot (13-18 words)",
      "visual": "rich detailed prompt for generating the keyframe image — describe scene, lighting, characters, style. Cinematic, kid-safe, no humans with faces.",
      "motion": "how the camera or subject moves during the 5-second clip — one motion beat only",
      "target_seconds": 5
    }},
    ...
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
    raw = completion.choices[0].message.content
    shot_plan = json.loads(raw)
    print(f"[plan] step 1 done in {time.time()-t0:.1f}s")
    print(f"[plan] title: {shot_plan.get('title')!r}")
    print(f"[plan] mood: {shot_plan.get('mood')!r}")
    print(f"[plan] {len(shot_plan['shots'])} shots planned")
    for i, s in enumerate(shot_plan["shots"]):
        print(f"[plan]   shot {i+1}: \"{s['dialogue'][:60]}...\"")

    # ----- 2. Generate per-shot TTS via ElevenLabs and measure duration -----
    print("\n[plan] step 2: ElevenLabs TTS per shot...")
    t0 = time.time()
    el_client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])

    shot_audio_bytes_list: list[bytes] = []
    shot_audio_durations: list[float] = []

    for i, shot in enumerate(shot_plan["shots"]):
        dialogue = shot["dialogue"]
        # Stream and collect audio bytes
        audio_iter = el_client.text_to_speech.convert(
            voice_id=voice_id,
            text=dialogue,
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

        # Measure duration with imageio's ffmpeg
        import subprocess
        tmp_path = f"/tmp/shot_audio_{i:02d}.mp3"
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)
        # ffprobe duration
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", tmp_path],
            capture_output=True, text=True,
        )
        duration = float(probe.stdout.strip())
        shot_audio_durations.append(duration)
        print(f"[plan]   shot {i+1} TTS: {len(audio_bytes)//1024} KB · {duration:.2f}s")

    total_audio_duration = sum(shot_audio_durations)
    print(f"[plan] step 2 done in {time.time()-t0:.1f}s")
    print(f"[plan] total narration: {total_audio_duration:.2f}s across {len(shot_audio_bytes_list)} shots")

    # ----- 3. Generate per-shot keyframe via fal flux -----
    print("\n[plan] step 3: fal flux keyframes per shot...")
    t0 = time.time()
    os.environ.setdefault("FAL_KEY", os.environ.get("FAL_KEY", ""))

    shot_keyframe_bytes_list: list[bytes] = []
    for i, shot in enumerate(shot_plan["shots"]):
        visual_prompt = shot["visual"] + ", cinematic, dreamlike, photorealistic, children's educational illustration style, age-appropriate"
        print(f"[plan]   shot {i+1} keyframe: {visual_prompt[:80]}...")

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

    # ----- 4. Compute frames per shot based on audio duration -----
    shots_for_render = []
    for i, (shot, audio_duration, keyframe_bytes) in enumerate(zip(
        shot_plan["shots"], shot_audio_durations, shot_keyframe_bytes_list
    )):
        # Wan natively trained on 81 frames @ 16fps = 5s. Snap to nearest multiple of 4.
        target_frames_raw = int(audio_duration * FPS)
        target_frames = max(33, min(121, round(target_frames_raw / 4) * 4 + 1))
        shots_for_render.append({
            "visual": shot["visual"],
            "motion": shot["motion"],
            "dialogue": shot["dialogue"],
            "target_seconds": audio_duration,
            "num_frames": target_frames,
            "num_inference_steps": 20,
            "keyframe_bytes": keyframe_bytes,
            "audio_bytes": shot_audio_bytes_list[i],
        })

    return {
        "title": shot_plan.get("title", "untitled"),
        "mood": shot_plan.get("mood", "neutral"),
        "shots": shots_for_render,
        "total_audio_duration": total_audio_duration,
    }


# ---------------------------------------------------------------------------
# Phase 2: RENDER on H100 — Wan multi-shot + ffmpeg overlay audio
# ---------------------------------------------------------------------------
@app.function(
    gpu="H100",
    image=image,
    volumes={"/models": models_volume},
    timeout=3600,
    memory=65536,
)
def render_video(plan: dict) -> dict:
    """Generate video shots sized to audio, ffmpeg-concat, overlay narration."""
    import io
    import os
    import subprocess
    import time
    from pathlib import Path

    import numpy as np
    import torch
    from PIL import Image
    from diffusers import WanImageToVideoPipeline
    from diffusers.utils import export_to_video

    def to_pil(frame) -> Image.Image:
        if isinstance(frame, Image.Image):
            return frame
        if isinstance(frame, np.ndarray):
            arr = frame
            if arr.dtype != np.uint8:
                arr = (arr * 255).clip(0, 255).astype(np.uint8)
            return Image.fromarray(arr)
        raise TypeError(f"Cannot convert {type(frame)} to PIL")

    if not Path(MODEL_DIR).exists():
        return {"error": f"Model not at {MODEL_DIR}"}

    # ----- Load model once -----
    print(f"[render] Wan 2.1 I2V 14B loading...")
    t0 = time.time()
    pipe = WanImageToVideoPipeline.from_pretrained(MODEL_DIR, torch_dtype=torch.bfloat16)
    pipe.to("cuda")
    print(f"[render] pipeline ready in {time.time()-t0:.1f}s")

    negative_prompt = (
        "blurry, low quality, distorted, deformed, ugly, jpeg artifacts, "
        "watermark, text, static, no motion, smiling cartoon faces, "
        "emoji creatures, green blobs, mario characters"
    )

    # ----- Generate each shot -----
    shots = plan["shots"]
    clip_paths = []
    audio_paths = []
    shot_timings = []
    last_frames_png = []

    for i, shot in enumerate(shots):
        print(f"\n[render] shot {i+1}/{len(shots)}: {shot['num_frames']} frames ({shot['target_seconds']:.1f}s)")
        print(f"[render] visual: {shot['visual'][:80]}...")
        print(f"[render] motion: {shot['motion']}")

        # Save audio bytes to disk
        audio_path = f"/tmp/audio_{i:02d}.mp3"
        with open(audio_path, "wb") as f:
            f.write(shot["audio_bytes"])
        audio_paths.append(audio_path)

        # Load keyframe
        keyframe = Image.open(io.BytesIO(shot["keyframe_bytes"])).convert("RGB").resize((832, 480))

        t0 = time.time()
        # Wan prompt combines visual + motion (visual already set scene via keyframe, prompt drives motion)
        wan_prompt = f"{shot['motion']}. {shot['visual']}"
        frames = pipe(
            image=keyframe,
            prompt=wan_prompt,
            negative_prompt=negative_prompt,
            height=480,
            width=832,
            num_frames=shot["num_frames"],
            num_inference_steps=shot["num_inference_steps"],
            guidance_scale=5.0,
        ).frames[0]
        elapsed = time.time() - t0
        shot_timings.append(elapsed)
        print(f"[render] shot {i+1} done in {elapsed:.1f}s")

        # Export video
        clip_path = f"/tmp/clip_{i:02d}.mp4"
        export_to_video(frames, clip_path, fps=FPS)
        clip_paths.append(clip_path)

        # Save last frame PNG for debugging
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
        "model": "wan-2.1-i2v-14b-480p",
        "gpu": "H100",
    }


# ---------------------------------------------------------------------------
# Local entrypoint
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main(
    user_prompt: str = "Explain photosynthesis in a fun way that a 12-year-old would love.",
    target_duration_seconds: int = 15,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
    output: str = "modal_narrated.mp4",
):
    print(f"[local] user_prompt: {user_prompt}")
    print(f"[local] target: {target_duration_seconds}s narrated video")
    print(f"[local] voice: {voice_id} (default = Rachel)")
    print()

    print("[local] Phase 1: CPU plan (OpenAI + ElevenLabs + fal)...")
    plan = plan_video.remote(user_prompt, target_duration_seconds, voice_id)
    print(f"[local] Plan: \"{plan['title']}\" ({plan['mood']}) · "
          f"{len(plan['shots'])} shots · {plan['total_audio_duration']:.1f}s narration")
    print()

    print("[local] Phase 2: H100 render (Wan multi-shot + ffmpeg)...")
    result = render_video.remote(plan)
    if "error" in result:
        print(f"[ERROR] {result['error']}")
        return

    with open(output, "wb") as f:
        f.write(result["video_bytes"])

    for i, frame_bytes in enumerate(result["last_frames_png"]):
        with open(f"narrated_shot_{i:02d}_lastframe.png", "wb") as f:
            f.write(frame_bytes)

    print(f"\n[OK] Saved: {output}")
    print(f"     Title: {plan['title']}")
    print(f"     Shots: {result['shot_count']}")
    print(f"     Inference: {result['total_inference_seconds']:.1f}s "
          f"(per-shot: {[round(t, 1) for t in result['shot_inference_seconds']]})")
    print(f"     Last frames saved: narrated_shot_*_lastframe.png")
