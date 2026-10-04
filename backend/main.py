import asyncio
import importlib.util
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from backend import store, workflow
from backend.models import Approval, FollowupApproval, NewInvestigation, PaperPair, default_mode

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
app = FastAPI(title="Contradiction Lab", version="1.0.0")


@app.middleware("http")
async def local_security(request: Request, call_next):
    origin = request.headers.get("origin")
    if (
        request.method in {"POST", "PUT", "DELETE", "PATCH"}
        and origin
        and origin
        not in {f"http://localhost:{os.getenv('LAB_PORT', '8000')}",
                f"http://127.0.0.1:{os.getenv('LAB_PORT', '8000')}",
                "http://localhost:5173", "http://127.0.0.1:5173"}
    ):
        return JSONResponse({"detail": "Cross-origin writes are not allowed"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173; object-src 'none'; frame-ancestors 'none'"
    )
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
    return {
        "status": "ok",
        "default_mode": default_mode(),
        "omnigent_installed": installed,
        "omnigent_configured": configured,
        "omnigent_ready": installed and configured,
        "local_mode": "Deterministic scientific tools; no LLM or sponsor orchestration",
        "reference": "Palmer Penguins: contextual aggregation reversal",
    }


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


PAPERS_DIR = ROOT / "artifacts" / "papers"


def _paper_summary(paper: dict) -> dict:
    return {
        **{k: paper[k] for k in ("id", "filename", "pages", "meta", "sample_size", "sections", "warnings")},
        "n_claims": len(paper["claims"]),
        "top_claims": [
            {k: c[k] for k in ("text", "section", "page", "direction", "stats")} for c in paper["claims"][:5]
        ],
        "engine": "rule-based parser (no LLM); exact quotes with page provenance",
    }


@app.post("/api/papers", status_code=201)
async def upload_paper(file: UploadFile):
    from backend import papers

    blob = await file.read()
    try:
        paper = papers.ingest(blob, file.filename or "paper.pdf")
    except papers.PaperError as error:
        raise HTTPException(422, str(error)) from error
    PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    (PAPERS_DIR / f"{paper['id']}.pdf").write_bytes(blob)
    (PAPERS_DIR / f"{paper['id']}.json").write_text(papers.dumps(paper), encoding="utf-8")
    return _paper_summary(paper)


@app.post("/api/papers/analyze")
def analyze_papers(request: PaperPair, background: BackgroundTasks):
    import json as _json

    from backend import papers

    if request.paper_a == request.paper_b:
        raise HTTPException(409, "Upload two different papers; the same PDF was supplied twice.")
    loaded = []
    for identifier in (request.paper_a, request.paper_b):
        path = PAPERS_DIR / f"{identifier}.json"
        if not path.exists():
            raise HTTPException(404, f"Uploaded paper {identifier[:12]}… was not found; upload it again.")
        loaded.append(_json.loads(path.read_text(encoding="utf-8")))
    report = papers.analyze(loaded[0], loaded[1])
    if request.mode == 'omnigent':
        if not health()['omnigent_ready']:
            raise HTTPException(503, 'Model mode requires Omnigent and OPENAI_API_KEY; no fallback was run.')
        # Rule-based output is preprocessing only; model context does not expose its conclusion.
        report['source_documents'] = loaded
        report['analysis_id'] = store.uid('analysis')
        store.save_analysis(report)
        record = workflow.create(NewInvestigation(mode='omnigent', source_analysis=report['analysis_id']))
        record['objective'] = 'Assess whether the uploaded papers disagree, explain any disagreement and propose a bounded test.'
        for paper in loaded:
            store.add(record, 'paper', {k: paper[k] for k in ('id', 'filename', 'meta', 'pages')}, [])
        store.save(record)
        background.add_task(launch, record['id'])
        return record
    store.save_analysis(report)
    return report


@app.post("/api/investigations", status_code=201)
def new(request: NewInvestigation, background: BackgroundTasks):
    if request.mode == "omnigent" and not health()["omnigent_ready"]:
        raise HTTPException(
            503,
            "Omnigent requires the official package and OPENAI_API_KEY. Configure them or explicitly select local development mode.",
        )
    record = workflow.create(request)
    background.add_task(launch, record["id"])
    return record


@app.get("/api/investigations/{identifier}")
def investigation(identifier: str):
    return store.get(identifier)


TERMINAL = {"awaiting_approval", "complete", "failed", "no_contradiction", "blocked"}


@app.get("/api/investigations/{identifier}/stream")
async def stream(identifier: str):
    """Server-sent events: pushes the record whenever it changes, and closes once it reaches a resting state."""
    store.get(identifier)

    async def updates():
        last = None
        for _ in range(3600):
            record = await asyncio.to_thread(store.get, identifier)
            version = (record.get("updated_at"), len(record["events"]), record["status"])
            if version != last:
                last = version
                yield f"data: {json.dumps(record)}\n\n"
            if record["status"] in TERMINAL:
                return
            await asyncio.sleep(0.25)

    return StreamingResponse(updates(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.post("/api/investigations/{identifier}/followup")
def followup(identifier: str, request: FollowupApproval):
    return workflow.run_followup(identifier)


@app.post("/api/investigations/{identifier}/approve")
def approve(identifier: str, request: Approval, background: BackgroundTasks):
    record = workflow.approve(identifier, request.experiment_id)
    background.add_task(launch, identifier)
    return record


@app.get("/api/investigations/{identifier}/export")
def export(identifier: str):
    return JSONResponse(
        store.get(identifier),
        headers={"Content-Disposition": f'attachment; filename="{store.get(identifier)["id"]}.json"'},
    )


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

    frame, metadata = load_data()
    points = [
        {"x": float(row.bill_length_mm), "y": float(row.bill_depth_mm), "species": row.species, "year": int(row.year)}
        for row in frame.itertuples()
    ]
    return {
        "dataset": metadata,
        "evidence": [v.model_dump(mode="json") for v in retrieve_evidence()],
        "points": points,
    }


if (ROOT / "frontend/dist/assets").exists():
    app.mount("/assets", StaticFiles(directory=ROOT / "frontend/dist/assets"), name="assets")


@app.get("/")
def index():
    target = ROOT / "frontend/dist/index.html"
    if target.exists():
        return FileResponse(target)
    return JSONResponse(
        {"message": "Build the frontend: cd frontend && npm install && npm run build", "api_docs": "/docs"}
    )
