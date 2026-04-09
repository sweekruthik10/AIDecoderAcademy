# Modal Video Worker — `modal_app/`

Modal Cloud apps for AI Decoder Academy's video generation pipeline.

This directory replaces the AWS T4 EC2 worker described in `docs/superpowers/specs/2026-05-16-video-generation-pipeline-design.md`. Same Python code, better hardware, pay-per-call.

## Why Modal (TL;DR)

- T4 (g4dn.xlarge) was capped at LTX 2B quality — 13B fp8 OOM-killed at load every time
- Modal A10G containers have 24GB VRAM + 32GB RAM → 13B fp8 runs cleanly
- $30 free signup credit → ~13 hours of A100 or ~27 hours of A10G testing
- No always-on instance burn ($380/mo idle on T4)
- Scales to N parallel containers for concurrent students
- See `docs/superpowers/research/2026-05-16-video-generation-research-aws-and-modal.md` for full story

## Setup (one-time)

1. **Sign up at https://modal.com** → connect GitHub → claim $30 credit
2. **Install CLI on your laptop:**
   ```powershell
   pip install modal
   ```
3. **Authenticate** — pick one:
   ```powershell
   # Option A: browser flow (easier)
   modal token new

   # Option B: paste credentials directly
   modal token set --token-id ak-... --token-secret as-...
   ```
   This writes to `~/.modal.toml` (or `%USERPROFILE%\.modal.toml` on Windows). Don't commit it.

## Files

| File | Purpose | Status |
|---|---|---|
| `test_ltx_13b.py` | Smoke test: LTX-Video 13B fp8 distilled on A10G | ready to deploy |
| (future) `test_wan_14b_i2v.py` | Wan 2.1 I2V 14B on A100 — the SOTA we couldn't run on T4 | TODO |
| (future) `worker.py` | Production worker: full audio-first pipeline (shot list → I2V → TTS → music → ffmpeg → Supabase) | TODO |

## Running the LTX 13B smoke test

From the **project root** (`AIDecoderAcademy/`):

```powershell
# Optional: deploy first so the function is registered in your Modal account
modal deploy modal_app/test_ltx_13b.py

# Run the smoke test with the fal keyframe we already generated on T4
modal run modal_app/test_ltx_13b.py::main --image-path "C:\Users\USER\Downloads\keyframe_fal_robot.png"
```

That saves `modal_output_ltx13b_a10g_fal.mp4` in your current directory. Open it to compare against the LTX 2B outputs (`ltx2b-v095_solidblue_seqoffload_30s.mp4`, `ltx2b-v095_fal_modeloffload_30s.mp4`).

### What happens on the first run (~15-20 min)

1. **Image build** (~5-10 min) — Modal compiles a Docker image with PyTorch + diffusers + ffmpeg. Cached after first build; subsequent deploys reuse it.
2. **Container cold start** (~10-30s) — Modal allocates an A10G and boots the container.
3. **Model download to Volume** (~3-5 min) — 15.7GB LTX 13B fp8 weights pulled from HuggingFace into the persistent `aida-video-models` Volume. **One-time across all calls forever.**
4. **T5 download to HF cache** (~2-3 min) — also one-time per container disk; gets re-downloaded if container is rebuilt but model weights stay in Volume.
5. **Inference** (~1-3 min) — 8 distilled steps × A10G is much faster than T4.
6. **MP4 download to your laptop** (~1s for 100-500KB).

### Subsequent runs

- **Warm container (within ~5 min of last call):** ~1-3 min total. Inference only.
- **Cold container after idle:** ~5-10 min. Container boot + T5 reload from cache + inference. Model weights still in Volume.

### Custom prompts

```powershell
modal run modal_app/test_ltx_13b.py::main `
  --prompt "A spaceship lifts off slowly, billowing smoke, cinematic" `
  --image-path "C:\path\to\your\keyframe.png" `
  --output "test_spaceship.mp4"
```

(The backtick `` ` `` is PowerShell's line continuation. On one line works too.)

### Solid-blue fallback (no keyframe)

```powershell
modal run modal_app/test_ltx_13b.py::main --prompt "soft blue gradient drifts"
```

If you don't pass `--image-path`, the function uses a solid blue rectangle. Useful for plumbing checks; quality will be poor.

## Monitoring + debugging

- Dashboard: https://modal.com/apps — see all your calls, GPU time, cost, logs
- Tail logs: `modal app logs aida-video-test`
- Shell into a running container: `modal shell aida-video-test::generate_video_ltx_13b`
- Cancel a running call: `modal call cancel <call-id>`
- Spend report: dashboard → Usage tab

## Cost expectations

| GPU | Per-second | Smoke test cost (3 min) | 1000 videos/day |
|---|---|---|---|
| A10G (24GB) | $0.000306 | ~$0.055 | ~$55/day |
| A100 (40GB) | $0.000639 | ~$0.115 | ~$115/day |
| H100 (80GB) | $0.001667 | ~$0.30 | ~$300/day |

A10G is the sweet spot for LTX 13B fp8 / Wan 14B fp8. Bump to A100 only if you go for un-quantized Wan 14B I2V (~26GB weights).

Your $30 credit = ~27 hours of A10G or ~13 hours of A100.

## Switching to a bigger GPU

Edit `test_ltx_13b.py`, change one line:

```python
@app.function(
    gpu="A10G",   # change to "A100" or "H100"
    ...
)
```

Then `modal deploy ...` again. New calls go to the bigger GPU.

## Troubleshooting

### `ModuleNotFoundError` during cold start
The pip pin versions don't resolve cleanly. Edit `test_ltx_13b.py` → relax the version pin (drop `==X.Y.Z`) → `modal deploy` again. Modal rebuilds the image.

### `CUDA out of memory` mid-inference
A10G's 24GB shouldn't OOM with 13B fp8 + `model_cpu_offload`, but if it does:
1. Try `pipe.enable_sequential_cpu_offload()` instead (slower, safer)
2. Or bump to `gpu="A100"` in the decorator

### Image build fails with "could not find a version that satisfies..."
PyTorch CU121 wheel index doesn't have the exact version you pinned for that Python. Drop the version pin on `torch` and `torchvision`:
```python
.pip_install("torch", "torchvision", index_url="https://download.pytorch.org/whl/cu121")
```

### Cold start is too slow for production
Add a `keep_warm` argument to the decorator (keeps N containers always warm at idle cost):
```python
@app.function(
    gpu="A10G",
    keep_warm=1,   # always 1 container warm — eats ~$26/day for A10G
    ...
)
```
For dev/test, don't use this — defeats the pay-per-call advantage.

## What this doesn't do yet (deferred)

- Audio-first pipeline (shot list, TTS, music, ffmpeg compose) — `worker.py` TODO
- Supabase queue integration (`video_jobs` table reads/writes) — TODO
- Vercel API route calling Modal `spawn()` — TODO
- Wan 2.1 I2V 14B comparison test — `test_wan_14b_i2v.py` TODO

All of those come after this smoke test confirms LTX 13B output quality justifies the move.

## Security notes

- Your Modal token is in `~/.modal.toml` (or `%USERPROFILE%\.modal.toml` on Windows). It has full API access to your Modal account. Don't commit it. Don't paste it in chat (rotate at modal.com/settings/tokens if you do).
- For production, add API keys (`FAL_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) as Modal Secrets — create at modal.com → Secrets, then attach to functions via `secrets=[modal.Secret.from_name("aida-secrets")]`.
