"""
Silent-test for the AIDA video pipeline.

Purpose:
  - Warm the `aida-video-models` Modal Volume by downloading LTX-2.3 weights
    (or the 13B fallback) so the FIRST production call from Next.js is fast.
  - Verify the full pipeline path (GPT → fal keyframes → LTX render → mux)
    WITHOUT spending ElevenLabs credits.

Run from project root:
  $env:PYTHONIOENCODING="utf-8"; chcp 65001 | Out-Null
  py -m modal run dev/test/test_video_silent_electronics.py::main

Output:
  dev/test/test_silent_electronics.mp4
  + a video_jobs row in Supabase (you can watch progress text update live)
"""
import sys
import uuid
from pathlib import Path

# Make modal_app importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Re-use the production app — same image, same volume, same secrets
from modal_app.worker import app, generate  # noqa


@app.local_entrypoint()
def silent_test(
    prompt: str = (
        "Explain how a simple electronics circuit works to a kid aged 11-13: "
        "how a battery pushes electrons through wires to light a bulb. "
        "NCERT Class 8-9 Physics level. Fun, encouraging, factually accurate."
    ),
    target_seconds: int = 15,
):
    job_id = str(uuid.uuid4())
    print(f"[silent-test] job_id={job_id}")
    print(f"[silent-test] prompt={prompt[:80]}…")
    print(f"[silent-test] target={target_seconds}s · skip_audio=True")
    print(f"[silent-test] (track live progress: SELECT * FROM video_jobs WHERE id='{job_id}';)")

    result = generate.remote(job_id, prompt, target_seconds, True, True)

    if "error" in result:
        print(f"[silent-test] ERROR: {result['error']}")
        return

    out_path = Path(__file__).parent / "test_silent_electronics.mp4"
    if result.get("video_bytes"):
        out_path.write_bytes(result["video_bytes"])
        print(f"\n[silent-test] OK · saved {len(result['video_bytes'])//1024} KB → {out_path}")
    else:
        print(f"\n[silent-test] ERROR: no video bytes returned")

    print(f"  model used    : {result['model_used']}")
    print(f"  shots         : {result['shot_count']}")
    print(f"  duration      : {result['duration_seconds']:.1f}s")
    print(f"  per-shot time : {[round(t, 1) for t in result['shot_inference_seconds']]}")
    print(f"  total render  : {sum(result['shot_inference_seconds']):.1f}s")
