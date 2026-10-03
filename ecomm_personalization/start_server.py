"""Start the HPLPGA API (builds artifacts first if they are missing).

    python start_server.py            # from ecomm_personalization/
"""
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent / "backend"

if not (BACKEND / "artifacts" / "models" / "model.joblib").exists():
    print("Artifacts missing - running the ML pipeline (about 5-40 min, see README)...")
    subprocess.check_call([sys.executable, "-m", "hplpga.pipeline.run"], cwd=BACKEND)

subprocess.call([sys.executable, "-m", "uvicorn", "hplpga.api.main:app", "--host", "0.0.0.0", "--port", "8000"], cwd=BACKEND)
