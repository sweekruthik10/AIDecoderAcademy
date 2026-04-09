"""
Modal smoke test: LTX-Video 13B fp8 distilled on A10G.

Mirrors the T4 test scripts but runs in Modal cloud where 24GB VRAM + 32GB RAM
trivially accommodates the model (the same model OOM-killed on g4dn.xlarge).

Run:
    modal deploy modal_app/test_ltx_13b.py
    modal run modal_app/test_ltx_13b.py::main --image-path "C:/Users/USER/Downloads/keyframe_fal_robot.png"

Or with custom prompt:
    modal run modal_app/test_ltx_13b.py::main --prompt "your motion description here" --image-path "..."

First run: ~15-20 min total (image build + model download + cold start + inference).
Subsequent warm runs: ~3-5 min. Cold runs after idle: ~6-10 min.
"""
import modal

app = modal.App("aida-video-test")

# ---------------------------------------------------------------------------
# Container image
# ---------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
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
        "pillow",
        "requests",
        "imageio[ffmpeg]",
    )
)

# Persistent volume — model weights cached across calls/deploys
models_volume = modal.Volume.from_name("aida-video-models", create_if_missing=True)


# ---------------------------------------------------------------------------
# Modal function — runs on A10G in Modal cloud
# ---------------------------------------------------------------------------
@app.function(
    gpu="A100",                       # 40GB VRAM — A10G's 22GB usable wasn't enough for 13B fp8 + T5 even with model offload
    image=image,
    volumes={"/models": models_volume},
    timeout=900,                      # 15 min ceiling per call
    memory=49152,                     # 48GB RAM
)
def generate_video_ltx_13b(prompt: str, image_bytes: bytes | None = None) -> dict:
    """LTX-Video 13B fp8 distilled. Returns MP4 bytes + timing metadata."""
    import io
    import time
    from pathlib import Path

    import torch
    from PIL import Image
    from diffusers import LTXImageToVideoPipeline
    from diffusers.utils import export_to_video
    from transformers import T5EncoderModel, AutoTokenizer
    from huggingface_hub import hf_hub_download

    MODEL_DIR = Path("/models")
    MODEL_FILE = MODEL_DIR / "ltxv-13b-0.9.7-distilled-fp8.safetensors"

    # 1. Download model weights into Volume (one-time across all calls)
    if not MODEL_FILE.exists():
        print(f"[download] LTX 13B fp8 distilled → {MODEL_FILE}")
        t0 = time.time()
        hf_hub_download(
            repo_id="Lightricks/LTX-Video",
            filename="ltxv-13b-0.9.7-distilled-fp8.safetensors",
            local_dir=str(MODEL_DIR),
        )
        models_volume.commit()
        print(f"[download] Done in {time.time()-t0:.1f}s, "
              f"{MODEL_FILE.stat().st_size // (1024**3)} GB cached")
    else:
        print(f"[cached] {MODEL_FILE} ({MODEL_FILE.stat().st_size // (1024**3)} GB)")

    # 2. Load T5 text encoder (cached by HF after first run)
    print("[load] T5 text encoder...")
    t0 = time.time()
    text_encoder = T5EncoderModel.from_pretrained(
        "Lightricks/LTX-Video",
        subfolder="text_encoder",
        torch_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        "Lightricks/LTX-Video",
        subfolder="tokenizer",
    )
    print(f"[load] T5 done in {time.time()-t0:.1f}s")

    # 3. Load LTX 13B fp8 distilled — keep transformer in NATIVE fp8 (no torch_dtype).
    # A10G has only ~22GB usable; upcasting 13B to bf16 (~26GB) → OOMs.
    # We then explicitly cast VAE + already-bf16 text_encoder so dtypes match at inference.
    print("[load] LTX 13B fp8 distilled (native fp8 storage)...")
    t0 = time.time()
    pipe = LTXImageToVideoPipeline.from_single_file(
        str(MODEL_FILE),
        text_encoder=text_encoder,
        tokenizer=tokenizer,
    )
    print(f"[load] Pipeline done in {time.time()-t0:.1f}s")

    # 4. Cast VAE to bf16 so input/bias dtypes match in conv3d forward pass.
    # Transformer stays fp8 (compact); text_encoder already bf16 from earlier load.
    pipe.vae = pipe.vae.to(torch.bfloat16)
    print("[dtype] VAE → bf16 (transformer stays fp8)")

    # 5. Use enable_model_cpu_offload — moves components one at a time in their native dtype.
    # `pipe.to("cuda")` would upcast fp8 transformer to bf16 (13GB → 26GB) and OOM even on A100.
    # Offload keeps non-active components on CPU; active one swaps to GPU briefly.
    pipe.enable_model_cpu_offload()
    print("[mem] enabled model_cpu_offload (preserves native dtypes per-component)")

    # 5. Load or generate keyframe
    if image_bytes is not None:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        print(f"[keyframe] loaded from bytes: {img.size}")
    else:
        img = Image.new("RGB", (704, 480), (40, 80, 160))
        print("[keyframe] no image_bytes provided — using solid blue fallback")
    img = img.resize((704, 480))

    # 6. Inference (distilled: 8 steps, cfg 1.0)
    print(f"\n[prompt] {prompt}")
    print("[inference] 8 distilled steps, cfg 1.0, 49 frames @ 704x480")
    t0 = time.time()
    out = pipe(
        image=img,
        prompt=prompt,
        width=704,
        height=480,
        num_frames=49,
        num_inference_steps=8,
        guidance_scale=1.0,
    ).frames[0]
    inference_seconds = time.time() - t0
    print(f"[inference] Done in {inference_seconds:.1f}s")

    # 7. Encode to MP4
    output_path = "/tmp/output.mp4"
    export_to_video(out, output_path, fps=24)
    with open(output_path, "rb") as f:
        video_bytes = f.read()

    vram_peak_mb = torch.cuda.max_memory_allocated() // (1024 ** 2)
    print(f"[done] MP4 size: {len(video_bytes) // 1024} KB, "
          f"VRAM peak: {vram_peak_mb} MB")

    return {
        "video_bytes": video_bytes,
        "inference_seconds": inference_seconds,
        "model": "ltx-13b-0.9.7-distilled-fp8",
        "gpu": "A10G",
        "vram_peak_mb": vram_peak_mb,
        "resolution": "704x480",
        "frames": 49,
        "fps": 24,
        "steps": 8,
        "guidance_scale": 1.0,
    }


# ---------------------------------------------------------------------------
# Local entrypoint — runs from your laptop, calls Modal cloud, saves MP4 locally
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main(
    prompt: str = (
        "The robot slowly tilts its head and takes a step forward, "
        "gentle camera dolly in, leaves rustling softly, "
        "magical particles drifting through the air, cinematic, dreamlike"
    ),
    image_path: str = None,
    output: str = "modal_output_ltx13b_a10g_fal.mp4",
):
    """Run the smoke test in Modal and save the resulting MP4 locally.

    Args:
        prompt: Motion description fed to LTX 13B.
        image_path: Local path to a keyframe PNG/JPG. Optional — uses solid blue if omitted.
        output: Where to save the resulting MP4 (relative to your local cwd).
    """
    image_bytes = None
    if image_path:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
        print(f"[local] keyframe loaded: {image_path} ({len(image_bytes)} bytes)")
    else:
        print("[local] no --image-path supplied; will use solid blue fallback")

    print("[local] calling Modal function — first run cold-starts a container...")
    result = generate_video_ltx_13b.remote(prompt=prompt, image_bytes=image_bytes)

    with open(output, "wb") as f:
        f.write(result["video_bytes"])

    print(f"\n✅ Saved: {output}")
    print(f"   Model:     {result['model']}")
    print(f"   GPU:       {result['gpu']}")
    print(f"   Inference: {result['inference_seconds']:.1f}s")
    print(f"   VRAM peak: {result['vram_peak_mb']} MB")
    print(f"   Frames:    {result['frames']} @ {result['fps']}fps → {result['frames']/result['fps']:.1f}s clip")
