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
    platform_port = os.getenv("DATABRICKS_APP_PORT")
    host = os.getenv("LAB_HOST") or ("0.0.0.0" if platform_port else "127.0.0.1")
    port = int(os.getenv("LAB_PORT") or platform_port or "8000")
    uvicorn.run("backend.main:app", host=host, port=port, proxy_headers=True, forwarded_allow_ips="*")
