"""Portable launcher; also recognizes workspace-local dependency installation."""
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
if (root / ".packages").is_dir():
    sys.path.insert(0, str(root / ".packages"))
os.chdir(root)

if __name__ == "__main__":
    import uvicorn
    from dotenv import load_dotenv
    load_dotenv()
    from backend import store
    import json
    seed = root / "data" / "verified-run.json"
    if not store.list_records() and seed.exists():
        record = json.loads(seed.read_text(encoding="utf-8"))
        if store.verify(record):
            store.save(record)
    uvicorn.run("backend.main:app", host=os.getenv("LAB_HOST", "127.0.0.1"), port=int(os.getenv("LAB_PORT", "8000")))
