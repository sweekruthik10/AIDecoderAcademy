"""
Single-scene LTX 13B test — minimal blast radius.

One prompt + one keyframe -> one MP4 + one last-frame PNG.
No GPT, no fal, no TTS, no multi-shot stitching, no audio mux.

Toggle --model distilled|full to A/B at small scale.

Run:
    modal run modal_app/one_scene_test.py::main --image-path "..." --prompt "..." --model distilled

Cost: ~$0.10-0.15 per call.
"""
import modal

app = modal.App("aida-one-scene")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "build-essential")
    .pip_install("torch==2.5.1", "torchvision==0.20.1",
                 index_url="https://download.pytorch.org/whl/cu121")
    .pip_install(
        "diffusers==0.38.0", "transformers", "accelerate",
        "sentencepiece", "safetensors", "huggingface_hub", "hf_transfer",
        "pillow", "imageio[ffmpeg]", "ftfy",
        "ninja", "packaging", "wheel",
    )
    .run_commands(
        "pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.5cxx11abiFALSE-cp311-cp311-linux_x86_64.whl",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HUB_DOWNLOAD_TIMEOUT": "120"})
)

models_volume = modal.Volume.from_name("aida-video-models", create_if_missing=True)

LTX_REPO = "Lightricks/LTX-Video"
DISTILLED_PATH = "/models/ltxv-13b-0.9.7-distilled.safetensors"
FULL_PATH = "/models/ltxv-13b-0.9.8-dev.safetensors"
FPS = 24


@app.function(gpu="H100", image=image, volumes={"/models": models_volume},
              timeout=900, memory=65536)
def render_one(model_choice: str, prompt: str, image_bytes: bytes,
               num_frames: int = 121) -> dict:
    """One shot, one render, return MP4 + last-frame + timings + VRAM."""
    import io, time
    from pathlib import Path
    import numpy as np
    import torch
    from PIL import Image
    from diffusers import LTXImageToVideoPipeline
    from diffusers.utils import export_to_video
    from transformers import T5EncoderModel, AutoTokenizer

    if model_choice == "distilled":
        model_path, steps, cfg = DISTILLED_PATH, 8, 1.0
    elif model_choice == "full":
        model_path, steps, cfg = FULL_PATH, 30, 3.0
    else:
        return {"error": f"unknown model_choice: {model_choice}"}

    if not Path(model_path).exists():
        return {"error": f"weights not at {model_path}"}

    timing = {"start": time.time()}
    t0 = time.time()
    text_encoder = T5EncoderModel.from_pretrained(LTX_REPO, subfolder="text_encoder",
                                                  torch_dtype=torch.bfloat16)
    tokenizer = AutoTokenizer.from_pretrained(LTX_REPO, subfolder="tokenizer")
    timing["t5_load_s"] = time.time() - t0
    print(f"[load] T5 in {timing['t5_load_s']:.1f}s")

    t0 = time.time()
    pipe = LTXImageToVideoPipeline.from_single_file(
        model_path, text_encoder=text_encoder, tokenizer=tokenizer,
        torch_dtype=torch.bfloat16,
    )
    pipe.to("cuda")
    timing["pipeline_load_s"] = time.time() - t0
    vram_after_load_mb = torch.cuda.memory_allocated() // (1024**2)
    print(f"[load] pipeline in {timing['pipeline_load_s']:.1f}s · VRAM after load: {vram_after_load_mb} MB")

    keyframe = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    if keyframe.size != (704, 480):
        keyframe = keyframe.resize((704, 480))

    print(f"[inference] {steps} steps, cfg {cfg}, {num_frames} frames @ {FPS}fps = {num_frames/FPS:.2f}s")
    t0 = time.time()
    frames = pipe(
        image=keyframe, prompt=prompt,
        negative_prompt="blurry, low quality, distorted, deformed, ugly, jpeg artifacts, watermark, text, static, no motion",
        height=480, width=704,
        num_frames=num_frames,
        num_inference_steps=steps,
        guidance_scale=cfg,
    ).frames[0]
    timing["inference_s"] = time.time() - t0
    vram_peak_mb = torch.cuda.max_memory_allocated() // (1024**2)
    print(f"[inference] done in {timing['inference_s']:.1f}s · VRAM peak: {vram_peak_mb} MB")

    t0 = time.time()
    out_path = "/tmp/scene.mp4"
    export_to_video(frames, out_path, fps=FPS)
    with open(out_path, "rb") as f:
        video_bytes = f.read()
    timing["encode_s"] = time.time() - t0

    last_frame = frames[-1]
    if isinstance(last_frame, np.ndarray):
        if last_frame.dtype != np.uint8:
            last_frame = (last_frame * 255).clip(0, 255).astype(np.uint8)
        last_frame = Image.fromarray(last_frame)
    lf_path = "/tmp/last.png"
    last_frame.save(lf_path)
    with open(lf_path, "rb") as f:
        last_frame_bytes = f.read()

    timing["total_s"] = time.time() - timing["start"]

    return {
        "video_bytes": video_bytes,
        "last_frame_bytes": last_frame_bytes,
        "model": model_choice,
        "model_file": Path(model_path).name,
        "steps": steps,
        "guidance_scale": cfg,
        "num_frames": num_frames,
        "fps": FPS,
        "resolution": "704x480",
        "duration_s": round(num_frames / FPS, 2),
        "timing": timing,
        "vram_after_load_mb": vram_after_load_mb,
        "vram_peak_mb": vram_peak_mb,
        "gpu": "H100",
        "gpu_vram_total_gb": 80,
        "video_size_kb": len(video_bytes) // 1024,
        "prompt": prompt,
    }


@app.local_entrypoint()
def main(
    image_path: str,
    prompt: str = "Smooth cinematic motion. Soft volumetric light. Maintain subject identity throughout.",
    model: str = "distilled",
    num_frames: int = 121,
    output: str = "one_scene.mp4",
):
    print(f"[local] image: {image_path}")
    print(f"[local] model: {model}")
    print(f"[local] prompt: {prompt}")
    print(f"[local] frames: {num_frames} (~{num_frames/FPS:.1f}s @ {FPS}fps)\n")

    with open(image_path, "rb") as f:
        image_bytes = f.read()
    print(f"[local] keyframe {len(image_bytes)} bytes loaded\n")

    print("[local] calling Modal H100...")
    result = render_one.remote(model, prompt, image_bytes, num_frames)

    if "error" in result:
        print(f"[ERROR] {result['error']}")
        return

    with open(output, "wb") as f:
        f.write(result["video_bytes"])
    lf_out = output.replace(".mp4", "_lastframe.png")
    with open(lf_out, "wb") as f:
        f.write(result["last_frame_bytes"])

    print(f"\n[OK] MP4 saved: {output} ({result['video_size_kb']} KB)")
    print(f"[OK] Last frame: {lf_out}")
    print()
    print("=== RESULT DETAILS ===")
    print(f"Model:           {result['model']} ({result['model_file']})")
    print(f"GPU:             {result['gpu']} ({result['gpu_vram_total_gb']} GB)")
    print(f"VRAM after load: {result['vram_after_load_mb']} MB "
          f"({result['vram_after_load_mb']/(result['gpu_vram_total_gb']*1024)*100:.0f}%)")
    print(f"VRAM peak:       {result['vram_peak_mb']} MB "
          f"({result['vram_peak_mb']/(result['gpu_vram_total_gb']*1024)*100:.0f}%)")
    print(f"Resolution:      {result['resolution']}")
    print(f"Frames:          {result['num_frames']} @ {result['fps']}fps = {result['duration_s']}s")
    print(f"Steps:           {result['steps']} · cfg {result['guidance_scale']}")
    print()
    print("=== TIMING ===")
    print(f"T5 load:         {result['timing']['t5_load_s']:.1f}s")
    print(f"Pipeline load:   {result['timing']['pipeline_load_s']:.1f}s")
    print(f"Inference:       {result['timing']['inference_s']:.1f}s")
    print(f"MP4 encode:      {result['timing']['encode_s']:.1f}s")
    print(f"Total:           {result['timing']['total_s']:.1f}s")
    print()
    print(f"=== PROMPT ===")
    print(result['prompt'])
