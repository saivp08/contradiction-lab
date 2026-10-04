"""Run the deterministic pipeline on the two sample papers and export a verified replay for first launch."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import papers, store, workflow  # noqa: E402
from backend.models import NewInvestigation  # noqa: E402

FIXTURES = ROOT / "data" / "fixtures"

if __name__ == "__main__":
    pair = [papers.ingest((FIXTURES / name).read_bytes(), name) for name in ("caffeine-rct-young.pdf", "caffeine-null-older.pdf")]
    analysis = papers.analyze(*pair)
    store.save_analysis(analysis)
    record = workflow.create(
        NewInvestigation(mode="local", source_analysis=analysis["analysis_id"], label="Sample: caffeine and attention")
    )
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
