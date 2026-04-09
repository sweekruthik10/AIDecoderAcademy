"""
Full production pipeline smoke test:
  GPT script → ElevenLabs narration per shot → fal flux keyframe per shot
  → LTX 13B 0.9.8 dev render per shot → ffmpeg concat + mux ElevenLabs audio
  → save locally for inspection.

Run from project root:
  $env:PYTHONIOENCODING="utf-8"; chcp 65001 | Out-Null
  py -m modal run dev/test/test_full_pipeline_electronics.py::full_test

Output: dev/test/test_full_pipeline_electronics.mp4
"""
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from modal_app.worker import app, generate  # noqa


@app.local_entrypoint()
def full_test(
    prompt: str = (
        "Explain how a simple electronics circuit works to a kid aged 11-13: "
        "how a battery pushes electrons through wires to light a bulb. "
        "NCERT Class 8-9 Physics level. Fun, encouraging, factually accurate."
    ),
    target_seconds: int = 20,
):
    job_id = str(uuid.uuid4())
    print(f"[full-test] job_id={job_id}")
    print(f"[full-test] prompt={prompt[:80]}…")
    print(f"[full-test] target={target_seconds}s  ·  ElevenLabs ON  ·  fal keyframes")
    print(f"[full-test] model = LTX 13B 0.9.8 dev (diffusers, H100)")

    result = generate.remote(
        job_id, prompt, target_seconds,
        False,  # skip_audio = False  → ElevenLabs narration
        True,   # skip_supabase = True → write locally for this test
        False,  # use_ltx_audio = False → not applicable for 13B
    )

    if "error" in result:
        print(f"[full-test] ERROR: {result['error']}")
        return

    out_path = Path(__file__).parent / "test_full_pipeline_electronics.mp4"
    if result.get("video_bytes"):
        out_path.write_bytes(result["video_bytes"])
        print(f"\n[full-test] OK · saved {len(result['video_bytes'])//1024} KB → {out_path}")
    else:
        print(f"\n[full-test] ERROR: no video bytes returned")
        return

    print(f"  model used    : {result['model_used']}")
    print(f"  shots         : {result['shot_count']}")
    print(f"  duration      : {result['duration_seconds']:.1f}s")
    print(f"  per-shot time : {[round(t, 1) for t in result['shot_inference_seconds']]}")
    print(f"  total render  : {sum(result['shot_inference_seconds']):.1f}s")
