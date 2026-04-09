"""Probe what specifically tries to import ltx_pipelines.multigpu.

Run:
  py -m modal run dev/test/probe_ltx2_imports.py::probe
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from modal_app.worker import app, image as worker_image, secrets, models_volume  # noqa


@app.function(image=worker_image, timeout=300, volumes={"/models": models_volume})
def _probe_remote() -> dict:
    import subprocess, traceback
    out = {}

    # 1. grep for "multigpu" across LTX-2 source tree
    grep = subprocess.run(
        ["grep", "-rn", "multigpu", "/opt/ltx2/"],
        capture_output=True, text=True,
    )
    out["grep_multigpu"] = grep.stdout[:4000]
    out["grep_stderr"]   = grep.stderr[:500]

    # 2. try importing and capture the full chain
    try:
        import ltx_pipelines.ic_lora  # noqa
        out["import_result"] = "OK"
    except Exception:
        out["import_result"] = traceback.format_exc()[-3000:]

    # 3. list ltx_pipelines installed location
    try:
        import ltx_pipelines
        out["ltx_pipelines_path"] = str(ltx_pipelines.__path__)
    except Exception as e:
        out["ltx_pipelines_path"] = f"ERROR: {e}"

    return out


@app.local_entrypoint()
def probe():
    result = _probe_remote.remote()
    print("=" * 70)
    print("GREP for 'multigpu' in /opt/ltx2/:")
    print(result.get("grep_multigpu", "(empty)"))
    print("=" * 70)
    print("ltx_pipelines location:", result.get("ltx_pipelines_path"))
    print("=" * 70)
    print("Import chain:")
    print(result.get("import_result"))
