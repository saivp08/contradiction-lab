import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


@contextmanager
def connection():
    path = Path(os.getenv("LAB_DB", str(ROOT / "artifacts" / "lab.sqlite3")))
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=30)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("CREATE TABLE IF NOT EXISTS investigations (id TEXT PRIMARY KEY, body TEXT NOT NULL)")
    try:
        yield con
        con.commit()
    finally:
        con.close()


def save(record: dict) -> None:
    record["updated_at"] = now()
    with connection() as con:
        con.execute(
            "INSERT OR REPLACE INTO investigations VALUES (?, ?)", (record["id"], json.dumps(record, allow_nan=False))
        )


def get(identifier: str) -> dict:
    with connection() as con:
        row = con.execute("SELECT body FROM investigations WHERE id = ?", (identifier,)).fetchone()
    if row is None:
        raise KeyError(identifier)
    return json.loads(row[0])


def list_records() -> list[dict]:
    with connection() as con:
        rows = con.execute("SELECT body FROM investigations ORDER BY rowid DESC LIMIT 100").fetchall()
    records = (json.loads(row[0]) for row in rows)
    return [summary(record) for record in records if record.get("source", {}).get("kind") == "papers"]


def summary(record: dict) -> dict:
    """Listing row: identity, progress and the key numbers, without chart data."""
    row = {k: record[k] for k in ("id", "objective", "mode", "status", "created_at", "stage")}
    row["label"] = record.get("label")
    row["updated_at"] = record.get("updated_at")
    results = {v["kind"]: v["data"] for v in record["objects"].values() if v["kind"] == "result"}
    if "result" in results and "disagreement_rate" in results["result"]:
        result = results["result"]
        row["paper_result"] = {
            "disagreement_rate": result["disagreement_rate"],
            "similarity_ci95": result["similarity_ci95"],
            "robust_disagreement": result["robust_disagreement"],
        }
    verdicts = {}
    for critique in by_kind(record, "critique"):
        for challenge in critique["data"]["challenges"]:
            verdicts[challenge["challenge_id"]] = challenge["verdict"]
    if verdicts:
        row["challenges"] = {v: list(verdicts.values()).count(v) for v in sorted(set(verdicts.values()))}
    if record.get("source", {}).get("kind") == "papers":
        row["papers"] = {
            "titles": [p["meta"]["title"][:90] for p in record["source"]["papers"]],
            "relationship": record["source"]["relationship"],
        }
    decisions = by_kind(record, "decision")
    if decisions:
        row["next_decision"] = decisions[0]["data"]["next_decision"]
    return row


ANALYSES = ROOT / "artifacts" / "analyses"


def save_analysis(report: dict) -> str:
    ANALYSES.mkdir(parents=True, exist_ok=True)
    (ANALYSES / f"{report['analysis_id']}.json").write_text(json.dumps(report, allow_nan=False), encoding="utf-8")
    return report["analysis_id"]


def load_analysis(identifier: str) -> dict:
    path = ANALYSES / f"{identifier}.json"
    if not path.exists():
        raise KeyError(identifier)
    return json.loads(path.read_text(encoding="utf-8"))


def add(record: dict, kind: str, data: dict, inputs: list[str]) -> str:
    identifier = uid(kind)
    record["objects"][identifier] = {
        "id": identifier,
        "kind": kind,
        "data": data,
        "input_ids": inputs,
        "created_at": now(),
    }
    return identifier


def event(
    record: dict,
    agent: str,
    action: str,
    inputs: list[str],
    outputs: list[str],
    tool: str,
    elapsed: float = 0,
    status: str = "complete",
) -> None:
    record["events"].append(
        {
            "id": uid("event"),
            "timestamp": now(),
            "agent": agent,
            "action": action,
            "input_ids": inputs,
            "output_ids": outputs,
            "tool": tool,
            "elapsed_seconds": elapsed,
            "status": status,
            "confidence": "bounded by source and method",
            "citations": [
                str(v["data"]["citation"]["url"]) for v in record["objects"].values() if v["kind"] == "evidence"
            ],
            "engine": record["mode"],
        }
    )
    save(record)


def by_kind(record: dict, kind: str) -> list[dict]:
    return [v for v in record["objects"].values() if v["kind"] == kind]


def scientific_digest(record: dict) -> str:
    payload = {k: record[k] for k in ("id", "objective", "mode", "objects", "events", "approval", "metrics")}
    if record.get("source"):
        payload["source"] = record["source"]
    if record.get("omnigent_receipts"):
        payload["omnigent_receipts"] = record["omnigent_receipts"]
    for key in ('agent_executions', 'verified_plan_sha256', 'parent_investigation'):
        if key in record:
            payload[key] = record[key]
    return hashlib.sha256(json.dumps(payload, sort_keys=True, allow_nan=False).encode()).hexdigest()


def verify(record: dict) -> bool:
    return bool(record.get("verified_sha256") and record["verified_sha256"] == scientific_digest(record))
