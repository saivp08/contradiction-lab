"""Run actual computation and export a portable, clearly labeled local replay."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import store, workflow  # noqa: E402
from backend.models import NewInvestigation  # noqa: E402

if __name__ == "__main__":
    record = workflow.create(NewInvestigation())
    workflow.run_local(record["id"])
    workflow.approve(record["id"], "E1", actor="developer-authorized reproducibility script; not a UI click")
    workflow.run_local(record["id"])
    record = store.get(record["id"])
    assert record["status"] == "complete", record["error"]
    assert store.verify(record)
    (ROOT / "data" / "verified-run.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "id": record["id"],
                "mode": record["mode"],
                "metrics": record["metrics"],
                "verified_sha256": record["verified_sha256"],
            },
            indent=2,
        )
    )
