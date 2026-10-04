from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app

FIXTURES = Path(__file__).resolve().parents[1] / "data" / "fixtures"


@pytest.fixture
def client():
    return TestClient(app)


def analysis_id(client, a="caffeine-rct-young.pdf", b="caffeine-null-older.pdf", headers=None):
    ids = []
    for name in (a, b):
        with open(FIXTURES / name, "rb") as handle:
            response = client.post("/api/papers", files={"file": (name, handle, "application/pdf")}, headers=headers)
        assert response.status_code == 201
        ids.append(response.json()["id"])
    report = client.post("/api/papers/analyze", json={"paper_a": ids[0], "paper_b": ids[1]}, headers=headers)
    assert report.status_code == 200
    return report.json()["analysis_id"]


def test_api_full_flow_and_replay(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/reference").status_code == 404
    response = client.post("/api/investigations", json={"mode": "local", "source_analysis": analysis_id(client)})
    assert response.status_code == 201
    identifier = response.json()["id"]
    path = "/api/investigations/" + identifier
    assert client.get(path).json()["status"] == "awaiting_approval"
    assert client.get(path + "/replay").status_code == 409
    assert client.post(path + "/approve", json={"approved": False, "experiment_id": "E1"}).status_code == 422
    assert client.post(path + "/approve", json={"approved": True, "experiment_id": "E1"}).status_code == 200
    complete = client.get(path).json()
    assert complete["status"] == "complete"
    assert client.get(path + "/replay").json()["replay_verified"]
    assert client.get(path + "/export").json()["verified_sha256"] == complete["verified_sha256"]
    assert client.post(path + "/approve", json={"approved": True, "experiment_id": "E1"}).status_code == 409
    stream = client.get(path + "/stream")
    assert stream.headers["content-type"].startswith("text/event-stream")
    assert '"status": "complete"' in stream.text
    listing = client.get("/api/investigations").json()
    assert len(listing) == 1
    assert listing[0]["papers"]["relationship"] == "context-dependent disagreement"
    assert listing[0]["paper_result"]["robust_disagreement"]
    assert listing[0]["next_decision"]
    assert listing[0]["challenges"]["open"] >= 1


def test_investigations_require_an_uploaded_paper_analysis(client):
    assert client.post("/api/investigations", json={"mode": "local"}).status_code == 409


def test_api_rejects_missing_credentials_invalid_input_and_cross_origin(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert client.post("/api/investigations", json={"mode": "omnigent"}).status_code == 503
    assert client.post("/api/investigations", json={"seed": -1}).status_code == 422
    assert client.get("/api/investigations/nonexistent").status_code == 404
    assert (
        client.post("/api/investigations", json={}, headers={"Origin": "https://untrusted.example"}).status_code == 403
    )


def test_same_origin_writes_work_behind_a_hosting_proxy(client):
    headers = {"Origin": "https://lab-123.aws.databricksapps.com", "X-Forwarded-Host": "lab-123.aws.databricksapps.com"}
    source = analysis_id(client, headers=headers)
    payload = {"mode": "local", "source_analysis": source}
    assert client.post("/api/investigations", json=payload, headers=headers).status_code == 201
    spoofed = {"Origin": "https://evil.example", "X-Forwarded-Host": "lab-123.aws.databricksapps.com"}
    assert client.post("/api/investigations", json=payload, headers=spoofed).status_code == 403
