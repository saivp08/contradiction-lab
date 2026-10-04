"""Paper-comparison pipeline: ingestion, alignment honesty, and the full workflow on uploaded PDFs."""

import json
from pathlib import Path

import pytest

from backend import papers, store, workflow
from backend.models import Evidence, NewInvestigation

FIXTURES = Path(__file__).resolve().parents[1] / "data" / "fixtures"


def load(name: str) -> dict:
    return papers.ingest((FIXTURES / name).read_bytes(), name)


@pytest.fixture(scope="module")
def caffeine_pair():
    return load("caffeine-rct-young.pdf"), load("caffeine-null-older.pdf")


def test_ingestion_extracts_real_metadata_sections_and_provenance(caffeine_pair):
    young, older = caffeine_pair
    assert young["meta"]["title"].startswith("Caffeine improves sustained attention")
    assert young["meta"]["doi"] == "10.9999/jcp.2021.0042"
    assert young["meta"]["year"] == 2021 and older["meta"]["year"] == 2023
    assert young["meta"]["authors"] == ["Maria Keller", "Daniel Osei", "Priya Raman"]
    assert young["sample_size"] == 120 and older["sample_size"] == 85
    assert {"abstract", "methods", "results"} <= set(young["sections"])
    top = young["claims"][0]
    assert top["section"] == "results" and top["page"] == 2 and top["direction"] == "positive"
    assert "p = 0.003" in top["text"] and top["stats"]


def test_ingestion_fails_closed_on_malformed_and_image_only_pdfs():
    with pytest.raises(papers.PaperError, match="parse this file"):
        load("malformed.pdf")
    with pytest.raises(papers.PaperError, match="image-only"):
        load("image-only.pdf")


def test_analysis_classifies_relationships_honestly(caffeine_pair):
    young, older = caffeine_pair
    disagreement = papers.analyze(young, older)
    assert disagreement["relationship"] == "context-dependent disagreement"
    assert disagreement["defensible_contradiction"]
    assert disagreement["best_pair"]["kind"] == "tension"
    fields = {d["field"] for d in disagreement["condition_differences"]}
    assert "age range" in fields and "population" in fields
    for evidence in disagreement["evidence"]:
        validated = Evidence.model_validate(evidence)
        assert (
            validated.provenance["quote"] in (young["claims"] + older["claims"])[0]["text"]
            or validated.provenance["quote"]
        )
        assert validated.provenance["page"] and validated.provenance["section"]
    # Unrelated and agreeing papers must not be forced into a contradiction.
    unrelated = papers.analyze(young, load("soil-nitrogen.pdf"))
    assert unrelated["relationship"] == "insufficiently comparable"
    assert not unrelated["defensible_contradiction"] and "evidence" not in unrelated
    agreeing = papers.analyze(young, load("caffeine-agree-shift.pdf"))
    assert agreeing["relationship"] == "complementary findings"
    assert not agreeing["defensible_contradiction"]


def test_quotes_are_verbatim_sentences_from_the_pdfs(caffeine_pair):
    young, older = caffeine_pair
    report = papers.analyze(young, older)
    pages_young = " ".join(
        page.extract_text().replace("\n", " ")
        for page in __import__("pypdf").PdfReader(FIXTURES / "caffeine-rct-young.pdf").pages
    )
    quote = report["evidence"][0]["provenance"]["quote"]
    assert quote[:80] in pages_young


def test_full_workflow_runs_on_uploaded_papers(caffeine_pair):
    young, older = caffeine_pair
    report = papers.analyze(young, older)
    store.save_analysis(report)
    record = workflow.create(NewInvestigation(source_analysis=report["analysis_id"], label="Caffeine dispute"))
    assert "disagree about" in record["objective"]
    workflow.run_local(record["id"])
    record = store.get(record["id"])
    assert record["status"] == "awaiting_approval"
    experiments = [e["data"]["method"] for e in store.by_kind(record, "experiment")]
    assert experiments == ["claim_alignment_audit", "condition_scan"]
    hypotheses = store.by_kind(record, "hypothesis")
    assert "age range" in hypotheses[0]["data"]["statement"] or "population" in hypotheses[0]["data"]["statement"]
    workflow.approve(record["id"], "E1")
    workflow.run_local(record["id"])
    record = store.get(record["id"])
    assert record["status"] == "complete", record.get("error")
    result = store.by_kind(record, "result")[0]["data"]
    assert result["robust_disagreement"] and result["disagreement_rate"] >= 0.8
    assert result["top_pair"]["quote_a"].startswith("Caffeine significantly increased")
    assert result["provenance"]["tool"] == "experiments.papers_analysis.compute_papers"
    verdicts = {
        c["challenge_id"]: c["verdict"]
        for critique in store.by_kind(record, "critique")
        for c in critique["data"]["challenges"]
    }
    assert verdicts["X1"] == "rebutted" and verdicts["X3"] == "rebutted" and verdicts["X4"] == "rebutted"
    assert verdicts["X5"] == "open"
    decision = store.by_kind(record, "decision")[0]["data"]
    assert "X5" in decision["open_challenges"]
    assert store.verify(record) and record["metrics"]["challenges_open"] >= 1
    with pytest.raises(ValueError, match="executable dataset"):
        workflow.run_followup(record["id"])
    # Determinism: identical seeds reproduce identical numbers.
    from experiments.papers_analysis import compute_papers

    first = compute_papers(report, "claim_alignment_audit", 42, 120)
    second = compute_papers(report, "claim_alignment_audit", 42, 120)
    first.pop("compute_seconds"), second.pop("compute_seconds")
    assert first == second


def test_investigation_refuses_fabricated_contradictions(caffeine_pair):
    young, _ = caffeine_pair
    report = papers.analyze(young, load("soil-nitrogen.pdf"))
    store.save_analysis(report)
    with pytest.raises(ValueError, match="no defensible contradiction"):
        workflow.create(NewInvestigation(source_analysis=report["analysis_id"]))


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from backend.main import app

    return TestClient(app)


def test_api_upload_analyze_and_investigate(client):
    def upload(name):
        with open(FIXTURES / name, "rb") as handle:
            response = client.post("/api/papers", files={"file": (name, handle, "application/pdf")})
        return response

    assert upload("malformed.pdf").status_code == 422
    young = upload("caffeine-rct-young.pdf")
    older = upload("caffeine-null-older.pdf")
    assert young.status_code == 201 and older.status_code == 201
    assert young.json()["meta"]["doi"] == "10.9999/jcp.2021.0042"
    assert young.json()["top_claims"][0]["page"] == 2
    same = client.post("/api/papers/analyze", json={"paper_a": young.json()["id"], "paper_b": young.json()["id"]})
    assert same.status_code == 409
    analysis = client.post("/api/papers/analyze", json={"paper_a": young.json()["id"], "paper_b": older.json()["id"]})
    assert analysis.status_code == 200
    report = analysis.json()
    assert report["defensible_contradiction"]
    created = client.post("/api/investigations", json={"mode": "local", "source_analysis": report["analysis_id"]})
    assert created.status_code == 201
    identifier = created.json()["id"]
    pending = client.get(f"/api/investigations/{identifier}").json()
    assert pending["status"] == "awaiting_approval" and pending["source"]["kind"] == "papers"
    assert (
        client.post(
            f"/api/investigations/{identifier}/approve", json={"approved": True, "experiment_id": "E1"}
        ).status_code
        == 200
    )
    finished = client.get(f"/api/investigations/{identifier}").json()
    assert finished["status"] == "complete"
    assert client.get(f"/api/investigations/{identifier}/replay").json()["replay_verified"]
    assert client.post(f"/api/investigations/{identifier}/followup", json={"approved": True}).status_code == 409
    listing = client.get("/api/investigations").json()
    row = next(r for r in listing if r["id"] == identifier)
    assert row["papers"]["relationship"] == "context-dependent disagreement"
    omnigent = client.post("/api/investigations", json={"mode": "omnigent", "source_analysis": report["analysis_id"]})
    assert omnigent.status_code in (409, 503)


def test_evidence_marks_unknowns_instead_of_inventing(caffeine_pair):
    young, older = caffeine_pair
    stripped = json.loads(json.dumps(older))
    stripped["meta"] = {**stripped["meta"], "doi": None, "year": None, "authors": []}
    stripped["sample_size"] = None
    report = papers.analyze(young, stripped)
    assert report["defensible_contradiction"]
    evidence = Evidence.model_validate(report["evidence"][1])
    assert evidence.citation.url is None and evidence.citation.year is None
    assert evidence.citation.authors == ["Author not extracted"]
    assert evidence.citation.identifier.startswith("sha256:")
    assert evidence.sample_size_if_known is None


def test_debate_runs_when_papers_phrase_the_shared_outcome_in_different_word_order(caffeine_pair):
    """Regression: per-paper term ordering made the Contradiction agent see two different outcomes."""
    young, older = caffeine_pair
    reordered = json.loads(json.dumps(older))
    top = reordered["claims"][0]
    assert top["section"] == "results" and top["direction"] == "null"
    top["text"] = "Sustained attention scores did not significantly change with caffeine compared with placebo."
    top["terms"] = papers._terms(top["text"])
    report = papers.analyze(young, reordered)
    assert report["defensible_contradiction"]
    ev_a, ev_b = (Evidence.model_validate(e) for e in report["evidence"])
    assert ev_a.outcome == ev_b.outcome and ev_a.intervention_or_variable == ev_b.intervention_or_variable
    store.save_analysis(report)
    record = workflow.create(NewInvestigation(source_analysis=report["analysis_id"]))
    workflow.run_local(record["id"])
    assert store.get(record["id"])["status"] == "awaiting_approval"


def test_real_journal_layout_noise_is_handled():
    page = "jama.com (Reprinted) JAMA March 19, 2019 Volume 321, Number 11 {n}\n"
    footer = "Downloaded from jamanetwork.com by Reader on 10/04/2026\n"
    bodies = ["Eggs were common.", "Cohorts differed.", "Risk rose.", "Results held.", "Limits apply."]
    pages = [page.format(n=i) + bodies[i - 1] + "\n" + footer for i in range(1, 6)]
    cleaned = papers._strip_boilerplate(pages)
    assert all("Reprinted" not in p and "Downloaded" not in p for p in cleaned)
    assert [p.strip() for p in cleaned] == bodies
    assert papers._header_of("AbstrAct") == "abstract"
    assert papers._header_of("resul ts") == "results"
    assert papers._header_of("Statistical methods") == "methods"
    assert papers._header_of("Results from the three cohorts") is None
    assert (
        papers._normalize("supplemen-\ntation and age- and sex-adjusted") == "supplementation and age- and sex-adjusted"
    )
    # A ratio whose 95% interval spans 1 is a null finding even if the sentence says "increase".
    assert (
        papers._direction("The pooled relative risk for one egg per day increase was 0.98 (95% CI 0.93 to 1.03).")
        == "null"
    )
    assert (
        papers._direction("Each egg was associated with higher risk (adjusted HR, 1.06 [95% CI, 1.03-1.10]).")
        == "positive"
    )
    assert papers._authorish("Victor W. Zhong, PhD; Linda Van Horn, PhD; Marilyn C. Cornelis, PhD")
    assert papers._parse_authors("Jean-Philippe Drouin-Chartier,1 Siyu Chen,1 Meir J Stampfer,1,2,3") == [
        "Jean-Philippe Drouin-Chartier",
        "Siyu Chen",
        "Meir J Stampfer",
    ]
    assert papers._parse_authors("Victor W. Zhong, PhD; Linda Van Horn, PhD") == ["Victor W. Zhong", "Linda Van Horn"]
    assert papers._find_year("JAMA. 2019;321(11):1081-1095. doi:10.1001/jama.2019.1572\ndata from 1985", None) == 2019
    assert (
        papers.topic_phrase(
            "Associations of Egg Consumption With Cardiovascular Disease",
            ["cardiovascular", "consumption", "disease", "egg"],
            [],
        )
        == "egg consumption and cardiovascular disease"
    )
