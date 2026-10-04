import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_api_full_flow_and_replay(client):
    assert client.get("/api/health").status_code == 200
    reference = client.get("/api/reference").json()
    assert reference["dataset"]["n_complete"] == 342 and len(reference["points"]) == 342
    response = client.post("/api/investigations", json={"mode": "local"})
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
    assert client.post(path + "/followup", json={"approved": False}).status_code == 422
    followed = client.post(path + "/followup", json={"approved": True})
    assert followed.status_code == 200
    assert client.get(path + "/replay").json()["replay_verified"]
    assert client.post(path + "/followup", json={"approved": True}).status_code == 409
    listing = client.get("/api/investigations").json()
    assert len(listing) == 1
    assert listing[0]["result"]["pooled_slope"] < 0 < listing[0]["followup"]["adjusted_slope"]
    assert listing[0]["next_decision"]
    assert listing[0]["challenges"] == {"partly conceded": 1, "rebutted": 4}


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
    assert client.post("/api/investigations", json={"mode": "local"}, headers=headers).status_code == 201
    spoofed = {"Origin": "https://evil.example", "X-Forwarded-Host": "lab-123.aws.databricksapps.com"}
    assert client.post("/api/investigations", json={"mode": "local"}, headers=spoofed).status_code == 403
