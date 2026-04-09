"""
Wan 2.1 I2V 14B 480P on Modal A100 — two-phase: download → infer.

Why two-phase: the previous monolithic version hung at "Loading checkpoint shards
1/14" for 30+ min while burning A100 dollars. By splitting download into a CPU
function we only burn CPU time (~$0.05) if HF stalls. Inference function then
loads from the local Volume cache, which can't stall.

Usage from project root:
    modal run modal_app/test_wan_14b_i2v.py::download_model    # ~3-5 min, ~$0.05-0.10
    modal run modal_app/test_wan_14b_i2v.py::main --image-path "C:/Users/USER/Downloads/keyframe_fal_robot.png"

Or chained (the local entrypoint handles it):
    modal run modal_app/test_wan_14b_i2v.py::main --image-path "C:/Users/USER/Downloads/keyframe_fal_robot.png"

Per inference: ~5 min on A100 → ~$0.20-0.30.
"""
import modal

app = modal.App("aida-wan-i2v")

# ---------------------------------------------------------------------------
# Container image
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
        "hf_transfer",          # ← multithreaded HF downloads, 5-10x faster
        "pillow",
        "requests",
        "imageio[ffmpeg]",
        "ftfy",
        # flash-attn build prereqs
        "ninja",
        "packaging",
        "wheel",
    )
    # FlashAttention 2/3: 1.5-2x faster attention on H100/A100.
    # PyTorch SDPA picks it up automatically once installed.
    # Using PREBUILT wheel — debian_slim doesn't have nvcc so source build fails.
    # Wheel matches torch 2.5 + cu12 + py3.11 + cxx11abiFALSE.
    .run_commands(
        "pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.5cxx11abiFALSE-cp311-cp311-linux_x86_64.whl",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "HF_HUB_DOWNLOAD_TIMEOUT": "120",
    })
)

# Persistent Volume for cached weights — survives across deploys
models_volume = modal.Volume.from_name("aida-video-models", create_if_missing=True)

MODEL_DIR = "/models/wan-2.1-i2v-14b-480p"
MODEL_REPO = "Wan-AI/Wan2.1-I2V-14B-480P-Diffusers"


# ---------------------------------------------------------------------------
# Phase 1: download model to Volume — CPU only, cheap
# ---------------------------------------------------------------------------
@app.function(
    image=image,
    volumes={"/models": models_volume},
    timeout=1800,                     # 30 min for first download
    cpu=4,
    memory=8192,
)
def download_model() -> dict:
    """Download Wan 2.1 I2V 14B to Modal Volume. Idempotent."""
    import os
    import time
    from pathlib import Path
    from huggingface_hub import snapshot_download

    if Path(MODEL_DIR).exists() and any(Path(MODEL_DIR).iterdir()):
        size_gb = sum(p.stat().st_size for p in Path(MODEL_DIR).rglob("*") if p.is_file()) // (1024 ** 3)
        print(f"[cached] {MODEL_DIR} already populated ({size_gb} GB)")
        return {"status": "cached", "size_gb": size_gb}

    print(f"[download] {MODEL_REPO} → {MODEL_DIR}")
    print("[download] Using hf_transfer multithreaded — should be 5-10× normal speed")
    t0 = time.time()

    snapshot_download(
        repo_id=MODEL_REPO,
        local_dir=MODEL_DIR,
        max_workers=8,
    )
    models_volume.commit()

    size_gb = sum(p.stat().st_size for p in Path(MODEL_DIR).rglob("*") if p.is_file()) // (1024 ** 3)
    elapsed = time.time() - t0
    print(f"[download] Done in {elapsed:.1f}s ({size_gb} GB)")
    return {"status": "downloaded", "size_gb": size_gb, "elapsed_seconds": elapsed}


# ---------------------------------------------------------------------------
# Phase 2: inference on A100 — loads from Volume cache, no network calls
# ---------------------------------------------------------------------------
@app.function(
    gpu="H100",                       # 80GB VRAM — fits Wan 14B WITHOUT offload (faster)
    image=image,
    volumes={"/models": models_volume},
    timeout=1800,
    memory=65536,                     # 64GB RAM
)
def generate_wan_i2v(
    prompt: str,
    image_bytes: bytes | None = None,
    num_frames: int = 81,
    num_inference_steps: int = 50,
    guidance_scale: float = 5.0,
) -> dict:
    """Wan 2.1 I2V 14B inference. Returns MP4 bytes + timing metadata."""
    import io
    import time
    from pathlib import Path

    import torch
    from PIL import Image
    from diffusers import WanImageToVideoPipeline
    from diffusers.utils import export_to_video

    if not Path(MODEL_DIR).exists():
        return {
            "error": f"Model not cached at {MODEL_DIR}. Run download_model first.",
        }

    print(f"[load] Wan 2.1 I2V 14B from Volume cache: {MODEL_DIR}")
    t0 = time.time()
    pipe = WanImageToVideoPipeline.from_pretrained(
        MODEL_DIR,
        torch_dtype=torch.bfloat16,
    )
    print(f"[load] Pipeline loaded in {time.time()-t0:.1f}s")

    # H100 has 80GB VRAM — skip offload entirely. ~3-4× faster than A100+offload.
    pipe.to("cuda")
    print(f"[mem] fully on cuda. VRAM after load: "
          f"{torch.cuda.memory_allocated() // (1024**2)} MB")

    # Confirm flash-attn is available so PyTorch SDPA picks it up automatically
    try:
        import flash_attn
        print(f"[opt] flash-attn {flash_attn.__version__} available — "
              f"SDPA will route attention through it automatically")
    except ImportError:
        print("[opt] flash-attn NOT available — falling back to vanilla SDPA")

    if image_bytes is not None:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        print(f"[keyframe] loaded: {img.size}")
    else:
        img = Image.new("RGB", (832, 480), (40, 80, 160))
        print("[keyframe] solid blue fallback")
    img = img.resize((832, 480))

    negative_prompt = (
        "blurry, low quality, distorted, deformed, ugly, jpeg artifacts, "
        "watermark, text, static, no motion"
    )

    print(f"\n[prompt] {prompt}")
    print(f"[inference] {num_inference_steps} steps, cfg {guidance_scale}, "
          f"{num_frames} frames @ 832x480")
    t0 = time.time()
    out = pipe(
        image=img,
        prompt=prompt,
        negative_prompt=negative_prompt,
        height=480,
        width=832,
        num_frames=num_frames,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
    ).frames[0]
    inference_seconds = time.time() - t0
    print(f"[inference] Done in {inference_seconds:.1f}s")

    output_path = "/tmp/output.mp4"
    export_to_video(out, output_path, fps=16)
    with open(output_path, "rb") as f:
        video_bytes = f.read()

    vram_peak_mb = torch.cuda.max_memory_allocated() // (1024 ** 2)
    print(f"[done] MP4: {len(video_bytes) // 1024} KB · VRAM peak: {vram_peak_mb} MB")

    return {
        "video_bytes": video_bytes,
        "inference_seconds": inference_seconds,
        "model": "wan-2.1-i2v-14b-480p",
        "gpu": "H100",                       # matches @app.function(gpu="H100")
        "vram_peak_mb": vram_peak_mb,
        "resolution": "832x480",
        "frames": num_frames,
        "fps": 16,
        "duration_seconds": round(num_frames / 16, 2),
        "steps": num_inference_steps,
        "guidance_scale": guidance_scale,
    }


# ---------------------------------------------------------------------------
# Local entrypoint — runs from your laptop, chains download → inference
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main(
    prompt: str = (
        "Cinematic opening shot: slow dramatic camera dolly forward toward a small "
        "friendly white robot standing in a glowing alien forest of bioluminescent "
        "blue and purple flowers. The robot's eyes pulse with soft blue light, then "
        "it turns its head toward the camera and gazes upward as if waking up. "
        "Volumetric god-rays pierce through the trees, magical particles drift "
        "through the air. Music-video aesthetic, dreamlike, awe-inspiring, Pixar-style "
        "lighting, the opening title moment of an AI Academy intro film."
    ),
    image_path: str = None,
    output: str = "modal_wan_intro_optimized.mp4",
    frames: int = 81,
    steps: int = 20,                  # ← 20 steps + flash-attn for max speed
    skip_download: bool = False,
):
    """Download (if needed) + generate video. Saves MP4 locally."""
    if not skip_download:
        print("[local] Phase 1: ensure model is downloaded to Volume...")
        dl_result = download_model.remote()
        print(f"[local] Phase 1 result: {dl_result}")

    image_bytes = None
    if image_path:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
        print(f"[local] keyframe loaded: {image_path} ({len(image_bytes)} bytes)")
    else:
        print("[local] no --image-path; using solid blue fallback")

    print("[local] Phase 2: A100 inference...")
    result = generate_wan_i2v.remote(
        prompt=prompt,
        image_bytes=image_bytes,
        num_frames=frames,
        num_inference_steps=steps,
    )

    if "error" in result:
        print(f"[ERROR] {result['error']}")
        return

    with open(output, "wb") as f:
        f.write(result["video_bytes"])

    print(f"\n[OK] Saved: {output}")
    print(f"     Model:     {result['model']}")
    print(f"     GPU:       {result['gpu']}")
    print(f"     Inference: {result['inference_seconds']:.1f}s")
    print(f"     Output:    {result['frames']} frames @ {result['fps']}fps "
          f"= {result['duration_seconds']}s clip")
    print(f"     VRAM peak: {result['vram_peak_mb']} MB")
