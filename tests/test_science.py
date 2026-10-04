"""Workflow guarantees on uploaded-paper investigations: contracts, handoffs, approval, lineage, metrics."""

import copy
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend import paper_science, papers, science, store, workflow
from backend.models import Citation, Evidence, Experiment, Hypothesis, NewInvestigation

FIXTURES = Path(__file__).resolve().parents[1] / "data" / "fixtures"


@pytest.fixture(scope="module")
def analysis():
    pair = [papers.ingest((FIXTURES / n).read_bytes(), n) for n in ("caffeine-rct-young.pdf", "caffeine-null-older.pdf")]
    return papers.analyze(*pair)


def investigation(analysis, mode="local"):
    store.save_analysis(analysis)
    return workflow.create(NewInvestigation(mode=mode, source_analysis=analysis["analysis_id"]))


def completed(analysis, experiment="E1"):
    record = investigation(analysis)
    workflow.run_local(record["id"])
    workflow.approve(record["id"], experiment)
    workflow.run_local(record["id"])
    return store.get(record["id"])


def test_evidence_citation_and_hypothesis_contracts(analysis):
    rows = [Evidence.model_validate(row) for row in analysis["evidence"]]
    assert len(rows) == 2
    assert rows[0].citation.identifier == "10.9999/jcp.2021.0042"
    bad = rows[0].citation.model_dump()
    bad["url"] = "not-a-url"
    with pytest.raises(ValidationError):
        Citation.model_validate(bad)
    for row in paper_science.hypotheses(analysis):
        Hypothesis.model_validate(row.model_dump())
        assert not row.agent_generated


def test_comparison_requires_a_shared_outcome(analysis):
    a, b = (Evidence.model_validate(row) for row in analysis["evidence"])
    assert science.compare(a, b).contradiction_strength == "unresolved"
    assert science.compare(a, a).contradiction_strength == "none"
    b.outcome = "Unrelated outcome"
    assert science.compare(a, b).contradiction_strength == "none"


def test_specification_and_selection(analysis):
    proposals = paper_science.proposals(analysis, 42)
    assert len(proposals) >= 2
    assert max(proposals, key=science.score).experiment_id == "E1"
    invalid = proposals[0].model_dump()
    invalid["method"] = "execute_shell"
    with pytest.raises(ValidationError):
        Experiment.model_validate(invalid)


def test_approval_and_handoff_enforced(analysis):
    record = investigation(analysis)
    with pytest.raises(ValueError, match="Invalid handoff"):
        workflow.advance(record["id"], "ExperimentRunner")
    workflow.run_local(record["id"])
    record = store.get(record["id"])
    assert record["status"] == "awaiting_approval"
    assert "Human approval required before execution" in science.rigor(record)
    with pytest.raises(ValueError, match="Human approval"):
        workflow.advance(record["id"], "ExperimentRunner")
    with pytest.raises(ValueError, match="Unknown experiment"):
        workflow.approve(record["id"], "E9")


def test_model_mode_rejects_legacy_deterministic_handoffs(analysis):
    report = {**analysis, "source_documents": []}
    store.save_analysis(report)
    with pytest.raises(ValueError, match="full source passages"):
        workflow.create(NewInvestigation(mode="omnigent", source_analysis=report["analysis_id"]))


def test_alternative_experiment_runs_the_full_loop(analysis):
    record = completed(analysis, "E2")
    assert record["status"] == "complete", record.get("error")
    assert store.by_kind(record, "result")[0]["data"]["method"] == "condition_scan"


def test_complete_discovery_loop_and_lineage(analysis):
    record = completed(analysis)
    assert record["status"] == "complete", record.get("error")
    assert store.verify(record)
    assert science.rigor(record) == []
    assert len(store.by_kind(record, "hypothesis")) == 3
    assert len(store.by_kind(record, "experiment")) == 2
    result = store.by_kind(record, "result")[0]
    run = record["objects"][result["input_ids"][0]]
    experiment = record["objects"][run["input_ids"][0]]
    hypothesis = record["objects"][experiment["input_ids"][0]]
    contradiction = record["objects"][hypothesis["input_ids"][0]]
    assert record["objects"][contradiction["input_ids"][0]]["kind"] == "evidence"
    decision = store.by_kind(record, "decision")[0]["data"]
    assert decision["previous_plan"] != decision["next_decision"]
    tampered = copy.deepcopy(record)
    tampered["objects"][result["id"]]["data"]["disagreement_rate"] = 0.0
    assert not store.verify(tampered)
    result["data"]["provenance"] = {}
    assert "Missing experiment provenance" in science.rigor(record)


def test_critic_runs_between_analysis_and_decision(analysis):
    record = completed(analysis)
    agents = [e["agent"] for e in record["events"] if e["agent"] in workflow.ROLES and e["status"] == "complete"]
    assert agents[agents.index("AnalysisAgent") + 1] == "CriticAgent"
    critique = store.by_kind(record, "critique")[0]
    decision = store.by_kind(record, "decision")[0]
    assert critique["id"] in decision["input_ids"]
    assert "X5" in decision["data"]["open_challenges"]


def test_discovery_metrics_are_measured_not_invented(analysis):
    metrics = completed(analysis)["metrics"]
    assert metrics["agent_handoffs"] == 9
    assert metrics["unique_sources"] == 2
    assert metrics["challenges_raised"] == 5
    assert metrics["challenges_open"] >= 1
    assert "baseline" in metrics and "No manual baseline" in metrics["baseline"]
