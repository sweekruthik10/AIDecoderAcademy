"""
Multi-shot video pipeline — Wan 2.1 I2V 14B on Modal H100.

Generates N clips serially on the same warm container (model loaded once),
uses each clip's last frame as the next clip's keyframe for narrative continuity,
ffmpeg-concats everything into one MP4.

This is the v1 of the "audio-first pipeline" architecture (minus audio) from
docs/superpowers/specs/2026-05-16-video-generation-pipeline-design.md.

Run:
    modal run modal_app/multi_shot_test.py::main --image-path "C:/Users/USER/Downloads/keyframe_fal_robot.png"

Cost estimate: 3 × $0.40 = ~$1.20 + container boot. Wall time ~10-15 min.
"""
import modal

app = modal.App("aida-wan-multishot")

# ---------------------------------------------------------------------------
# Reuse the same image + Volume from test_wan_14b_i2v.py
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


# ---------------------------------------------------------------------------
# Multi-shot generation function
# ---------------------------------------------------------------------------
@app.function(
    gpu="H100",
    image=image,
    volumes={"/models": models_volume},
    timeout=3600,                     # 1 hour for multi-shot
    memory=65536,
)
def generate_multi_shot(
    shots: list[dict],                # [{"prompt": str, "num_frames": 81, "num_inference_steps": 20}, ...]
    initial_image_bytes: bytes,
    keyframe_source: str = "continuation",  # "continuation" or "same"
    fps: int = 16,
) -> dict:
    """Generate multiple shots serially, stitch with ffmpeg."""
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
        """Convert a frame to PIL Image regardless of whether it's PIL or numpy."""
        if isinstance(frame, Image.Image):
            return frame
        if isinstance(frame, np.ndarray):
            arr = frame
            if arr.dtype != np.uint8:
                arr = (arr * 255).clip(0, 255).astype(np.uint8)
            return Image.fromarray(arr)
        raise TypeError(f"Cannot convert {type(frame)} to PIL")

    if not Path(MODEL_DIR).exists():
        return {"error": f"Model not cached at {MODEL_DIR}. Run download_model first."}

    # ----- Load model once -----
    print(f"[load] Wan 2.1 I2V 14B from {MODEL_DIR}")
    t0 = time.time()
    pipe = WanImageToVideoPipeline.from_pretrained(
        MODEL_DIR,
        torch_dtype=torch.bfloat16,
    )
    pipe.to("cuda")
    print(f"[load] Pipeline ready in {time.time()-t0:.1f}s · "
          f"VRAM: {torch.cuda.memory_allocated() // (1024**2)} MB")

    # ----- Initial keyframe -----
    initial_img = Image.open(io.BytesIO(initial_image_bytes)).convert("RGB").resize((832, 480))
    print(f"[keyframe] initial: {initial_img.size}")

    negative_prompt = (
        "blurry, low quality, distorted, deformed, ugly, jpeg artifacts, "
        "watermark, text, static, no motion, smiling cartoon faces, "
        "emoji creatures, green blobs, koopas, mushrooms, mario characters"
    )

    # ----- Generate each shot -----
    current_keyframe = initial_img
    clip_paths = []
    shot_timings = []
    last_frames = []  # save last frame of each shot for inspection

    for i, shot in enumerate(shots):
        print(f"\n[shot {i+1}/{len(shots)}] starting")
        print(f"[shot {i+1}] prompt: {shot['prompt']}")
        print(f"[shot {i+1}] frames={shot.get('num_frames', 81)}, "
              f"steps={shot.get('num_inference_steps', 20)}")

        t0 = time.time()
        frames = pipe(
            image=current_keyframe,
            prompt=shot["prompt"],
            negative_prompt=negative_prompt,
            height=480,
            width=832,
            num_frames=shot.get("num_frames", 81),
            num_inference_steps=shot.get("num_inference_steps", 20),
            guidance_scale=shot.get("guidance_scale", 5.0),
        ).frames[0]
        shot_elapsed = time.time() - t0
        shot_timings.append(shot_elapsed)
        print(f"[shot {i+1}] done in {shot_elapsed:.1f}s")

        # Export this shot's MP4
        clip_path = f"/tmp/shot_{i:02d}.mp4"
        export_to_video(frames, clip_path, fps=fps)
        clip_paths.append(clip_path)
        print(f"[shot {i+1}] saved {clip_path}")

        # Save last frame as PNG for the user to see (also for debugging continuity)
        last_frame = to_pil(frames[-1])
        last_frame_path = f"/tmp/last_frame_{i:02d}.png"
        last_frame.save(last_frame_path)
        with open(last_frame_path, "rb") as f:
            last_frames.append(f.read())

        # Set up keyframe for next shot
        if keyframe_source == "continuation" and i < len(shots) - 1:
            current_keyframe = last_frame
            print(f"[shot {i+1}] → using last frame as keyframe for shot {i+2}")
        # If "same" mode, current_keyframe stays as initial_img

    # ----- ffmpeg concat -----
    print("\n[stitch] concatenating shots with ffmpeg...")
    t0 = time.time()
    concat_list = "/tmp/concat.txt"
    with open(concat_list, "w") as f:
        for p in clip_paths:
            f.write(f"file '{p}'\n")

    final_path = "/tmp/final.mp4"
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list,
            "-c", "copy",
            final_path,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"[stitch] FAILED: {result.stderr}")
        return {"error": f"ffmpeg failed: {result.stderr}"}
    print(f"[stitch] done in {time.time()-t0:.1f}s")

    with open(final_path, "rb") as f:
        video_bytes = f.read()

    total_frames = sum(s.get("num_frames", 81) for s in shots)
    total_seconds = total_frames / fps

    print(f"\n[done] Final MP4: {len(video_bytes) // 1024} KB, "
          f"{total_frames} frames, {total_seconds:.1f}s")
    print(f"[done] Total inference: {sum(shot_timings):.1f}s "
          f"({len(shots)} shots)")

    return {
        "video_bytes": video_bytes,
        "last_frames_png": last_frames,
        "shot_count": len(shots),
        "shot_inference_seconds": shot_timings,
        "total_inference_seconds": sum(shot_timings),
        "total_frames": total_frames,
        "total_duration_seconds": round(total_seconds, 2),
        "fps": fps,
        "model": "wan-2.1-i2v-14b-480p",
        "gpu": "H100",
        "keyframe_source": keyframe_source,
    }


# ---------------------------------------------------------------------------
# Local entrypoint with sensible default shots for "robot space adventure"
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main(
    image_path: str,
    output: str = "modal_multishot_space.mp4",
    keyframe_source: str = "continuation",
    steps: int = 20,
):
    """Generate a 3-shot ~15s robot space adventure narrative."""
    with open(image_path, "rb") as f:
        initial_image_bytes = f.read()
    print(f"[local] initial keyframe loaded: {image_path} ({len(initial_image_bytes)} bytes)")

    # 3 carefully crafted shots — each one motion beat, prompts respect 5s window
    shots = [
        {
            # Shot 1: Setup — robot prepares to leap
            "prompt": (
                "The small white robot slowly tilts its head upward toward the sky, "
                "its glowing blue eyes pulsing brighter. The camera dollies in slowly "
                "from a wide shot. Bioluminescent particles drift gently around it. "
                "Cinematic anticipation, dreamlike soft light."
            ),
            "num_frames": 81,
            "num_inference_steps": steps,
        },
        {
            # Shot 2: Action — robot ascends into cosmic space
            "prompt": (
                "The camera rises rapidly upward following the small white robot as it "
                "soars vertically into the sky. The bioluminescent forest disappears "
                "below as the scene transitions into vast cosmic space filled with stars "
                "and swirling galaxies. Long trails of light follow the robot's ascent. "
                "Epic, awe-inspiring, cinematic upward camera move."
            ),
            "num_frames": 81,
            "num_inference_steps": steps,
        },
        {
            # Shot 3: Resolution — meets other robots in space
            "prompt": (
                "In vast cosmic space surrounded by stars, three additional small white "
                "robots with friendly blue glowing eyes float gracefully into the frame "
                "from different directions. They approach the main robot, hovering "
                "peacefully. Cosmic particles swirl. Dreamlike wonder, friendship, "
                "calm floating motion."
            ),
            "num_frames": 81,
            "num_inference_steps": steps,
        },
    ]

    print(f"\n[local] Generating {len(shots)} shots, {keyframe_source} keyframe mode, {steps} steps each")
    print(f"[local] Expected: ~{len(shots) * 3:.0f}-{len(shots) * 5:.0f} min wall, "
          f"~${len(shots) * 0.4:.2f}-${len(shots) * 0.5:.2f} cost")

    result = generate_multi_shot.remote(
        shots=shots,
        initial_image_bytes=initial_image_bytes,
        keyframe_source=keyframe_source,
    )

    if "error" in result:
        print(f"[ERROR] {result['error']}")
        return

    # Save final MP4
    with open(output, "wb") as f:
        f.write(result["video_bytes"])

    # Save last frame of each shot as PNG for visual inspection
    for i, frame_bytes in enumerate(result["last_frames_png"]):
        frame_path = f"shot_{i:02d}_lastframe.png"
        with open(frame_path, "wb") as f:
            f.write(frame_bytes)

    print(f"\n[OK] Saved: {output}")
    print(f"     {result['shot_count']} shots, {result['total_duration_seconds']}s total")
    print(f"     Inference: {result['total_inference_seconds']:.1f}s "
          f"(per-shot: {[round(t, 1) for t in result['shot_inference_seconds']]})")
    print(f"     Model: {result['model']} on {result['gpu']}")
    print(f"     Keyframe mode: {result['keyframe_source']}")
    print(f"     Last frames saved: shot_*_lastframe.png")
