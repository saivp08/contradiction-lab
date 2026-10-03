import asyncio
import importlib.util
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import store, workflow
from backend.models import Approval, NewInvestigation

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
app = FastAPI(title="Contradiction Lab", version="1.0.0")


@app.middleware("http")
async def local_security(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method in {"POST", "PUT", "DELETE", "PATCH"} and origin and origin not in {"http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:5173", "http://127.0.0.1:5173"}:
        return JSONResponse({"detail": "Cross-origin writes are not allowed"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173; object-src 'none'; frame-ancestors 'none'"
    return response


@app.exception_handler(KeyError)
async def missing(request, error):
    return JSONResponse({"detail": "Research record not found"}, status_code=404)


@app.exception_handler(ValueError)
async def invalid(request, error):
    return JSONResponse({"detail": str(error)}, status_code=409)


@app.get("/api/health")
def health():
    installed = importlib.util.find_spec("omnigent") is not None
    configured = bool(os.getenv("OPENAI_API_KEY"))
    return {"status": "ok", "omnigent_installed": installed, "omnigent_configured": configured, "omnigent_ready": installed and configured, "local_mode": "Deterministic scientific tools; no LLM or sponsor orchestration", "reference": "Palmer Penguins: contextual aggregation reversal"}


@app.get("/api/investigations")
def investigations():
    return store.list_records()


def launch(identifier: str):
    record = store.get(identifier)
    if record["mode"] == "local":
        workflow.run_local(identifier)
    else:
        from backend.omnigent_adapter import run
        asyncio.run(run(identifier))


@app.post("/api/investigations", status_code=201)
def new(request: NewInvestigation, background: BackgroundTasks):
    if request.mode == "omnigent" and not health()["omnigent_ready"]:
        raise HTTPException(503, "Omnigent requires the official package and OPENAI_API_KEY. Configure them or explicitly select local development mode.")
    record = workflow.create(request)
    background.add_task(launch, record["id"])
    return record


@app.get("/api/investigations/{identifier}")
def investigation(identifier: str):
    return store.get(identifier)


@app.post("/api/investigations/{identifier}/approve")
def approve(identifier: str, request: Approval, background: BackgroundTasks):
    record = workflow.approve(identifier, request.experiment_id)
    background.add_task(launch, identifier)
    return record


@app.get("/api/investigations/{identifier}/export")
def export(identifier: str):
    return JSONResponse(store.get(identifier), headers={"Content-Disposition": f'attachment; filename="{store.get(identifier)["id"]}.json"'})


@app.get("/api/investigations/{identifier}/replay")
def replay(identifier: str):
    record = store.get(identifier)
    if record["mode"] == "omnigent":
        receipts = record.get("omnigent_receipts", [])
        if {r["phase"] for r in receipts if r["returncode"] == 0} != {"prepare", "execute"}:
            raise HTTPException(409, "Sponsor execution receipts are incomplete; replay is not yet verified")
    if record["status"] != "complete" or not store.verify(record):
        raise HTTPException(409, "Replay rejected: completed record checksum verification failed")
    return {**record, "display_mode": "replay", "replay_verified": True}


@app.get("/api/reference")
def reference():
    from backend.science import retrieve_evidence
    from experiments.penguins import load_data
    _, metadata = load_data()
    return {"dataset": metadata, "evidence": [v.model_dump(mode="json") for v in retrieve_evidence()]}


if (ROOT / "frontend/dist/assets").exists():
    app.mount("/assets", StaticFiles(directory=ROOT / "frontend/dist/assets"), name="assets")


@app.get("/")
def index():
    target = ROOT / "frontend/dist/index.html"
    if target.exists():
        return FileResponse(target)
    return JSONResponse({"message": "Build the frontend: cd frontend && npm install && npm run build", "api_docs": "/docs"})
