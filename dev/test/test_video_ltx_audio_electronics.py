"""
LTX-2.3 native audio test — skip ElevenLabs, let LTX-2.3 generate audio itself.

Run from project root:
  $env:PYTHONIOENCODING="utf-8"; chcp 65001 | Out-Null
  py -m modal run dev/test/test_video_ltx_audio_electronics.py::ltx_audio_test

Output: dev/test/test_ltx_audio_electronics.mp4 (audio = LTX-2.3 generated, not ElevenLabs)
"""
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from modal_app.worker import app, generate  # noqa


@app.local_entrypoint()
def ltx_audio_test(
    prompt: str = (
        "Explain how a simple electronics circuit works to a kid aged 11-13: "
        "how a battery pushes electrons through wires to light a bulb. "
        "Make it sound exciting like a science documentary, with vivid sound effects."
    ),
    target_seconds: int = 15,
):
    job_id = str(uuid.uuid4())
    print(f"[ltx-audio-test] job_id={job_id}")
    print(f"[ltx-audio-test] target={target_seconds}s  · skip_audio=True (no ElevenLabs)")
    print(f"[ltx-audio-test] use_ltx_audio=True  (LTX-2.3 generates audio natively)")

    result = generate.remote(
        job_id, prompt, target_seconds,
        True,   # skip_audio — no ElevenLabs
        True,   # skip_supabase — write locally
        True,   # use_ltx_audio — keep LTX's own audio output
    )

    if "error" in result:
        print(f"[ltx-audio-test] ERROR: {result['error']}")
        return

    out_path = Path(__file__).parent / "test_ltx_audio_electronics.mp4"
    if result.get("video_bytes"):
        out_path.write_bytes(result["video_bytes"])
        print(f"\n[ltx-audio-test] OK · saved {len(result['video_bytes'])//1024} KB → {out_path}")
    else:
        print(f"\n[ltx-audio-test] ERROR: no video bytes returned")

    print(f"  model used    : {result['model_used']}")
    print(f"  shots         : {result['shot_count']}")
    print(f"  duration      : {result['duration_seconds']:.1f}s")
    print(f"  per-shot time : {[round(t, 1) for t in result['shot_inference_seconds']]}")
    print(f"  total render  : {sum(result['shot_inference_seconds']):.1f}s")
