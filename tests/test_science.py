import copy

import numpy as np
import pytest
from pydantic import ValidationError

from backend import science, store, workflow
from backend.models import Citation, Evidence, Experiment, Hypothesis, NewInvestigation
from experiments.penguins import compute, load_data


def test_evidence_citation_and_hypothesis_contracts():
    rows = science.retrieve_evidence()
    assert len(rows) == 2
    for row in rows:
        Evidence.model_validate(row.model_dump())
        assert row.citation.identifier == "10.32614/RJ-2022-020"
    bad = rows[0].citation.model_dump()
    bad["url"] = "not-a-url"
    with pytest.raises(ValidationError):
        Citation.model_validate(bad)
    for row in science.hypotheses(False):
        Hypothesis.model_validate(row.model_dump())
        assert not row.agent_generated


def test_comparison_requires_comparable_opposite_directions():
    a, b = science.retrieve_evidence()
    assert science.compare(a, b).contradiction_strength == "contextual reversal"
    assert science.compare(a, a).contradiction_strength == "none"
    b.outcome = "Unrelated outcome"
    assert science.compare(a, b).contradiction_strength == "none"


def test_specification_and_selection():
    proposals = science.proposals(42)
    assert len(proposals) >= 2
    assert max(proposals, key=science.score).experiment_id == "E1"
    invalid = proposals[0].model_dump()
    invalid["method"] = "execute_shell"
    with pytest.raises(ValidationError):
        Experiment.model_validate(invalid)


def test_deterministic_real_experiment():
    frame, manifest = load_data()
    assert manifest["n_raw"] == 344
    assert manifest["n_complete"] == 342
    a, b = [compute(frame, "species_adjustment", 42, 100) for _ in range(2)]
    a.pop("compute_seconds")
    b.pop("compute_seconds")
    assert a == b
    assert a["pooled_slope"] < 0 < a["adjusted_ci95"][0]
    assert all(s["slope"] > 0 for s in a["subgroups"])
    with pytest.raises(ValueError, match="allowlisted"):
        compute(frame, "shell", 42, 100)


def test_next_decision_responds_to_computed_counterfactual_data():
    frame, _ = load_data()
    reference = compute(frame, "species_adjustment", 42, 100)
    first = science.decide(reference, science.evaluate(reference))
    # Synthetic counterfactual only in a unit test: erase within-species signal.
    altered = frame.copy()
    rng = np.random.default_rng(8)
    altered["bill_depth_mm"] = rng.normal(17, 2, len(frame))
    counterfactual = compute(altered, "species_adjustment", 42, 100)
    second = science.decide(counterfactual, science.evaluate(counterfactual))
    assert first["next_decision"] == "Test sex and year effects within species"
    assert second["next_decision"] != first["next_decision"]
    assert science.evaluate(counterfactual) != science.evaluate(reference)
    year_result = compute(frame, "year_sensitivity", 42, 100)
    third = science.decide(year_result, science.evaluate(year_result))
    assert third["next_decision"] != first["next_decision"]


def test_approval_and_handoff_enforced():
    record = workflow.create(NewInvestigation())
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


def test_dataset_tampering_and_missing_data_fail_closed(tmp_path, monkeypatch):
    import experiments.penguins as runner
    replacement = tmp_path / "changed.csv"
    replacement.write_text("species,bill_length_mm,bill_depth_mm,year\nAdelie,1,2,2007\n")
    monkeypatch.setattr(runner, "DATA", replacement)
    with pytest.raises(ValueError, match="checksum"):
        runner.load_data()
    monkeypatch.setattr(runner, "DATA", tmp_path / "missing.csv")
    with pytest.raises(FileNotFoundError):
        runner.load_data()


def test_sponsor_generated_hypotheses_reject_malformed_contract():
    record = workflow.create(NewInvestigation(mode="omnigent"))
    workflow.advance(record["id"], "LiteratureAgent", "Retrieve the attributed reference claims.")
    workflow.advance(record["id"], "ContradictionAgent", "Compare the two aggregation contexts.")
    with pytest.raises(ValueError, match="structured AI-generated"):
        workflow.advance(record["id"], "HypothesisAgent", "Generate falsifiable competing explanations.")
    with pytest.raises(ValidationError):
        workflow.advance(record["id"], "HypothesisAgent", "Generate falsifiable competing explanations.", [{"statement": "Incomplete"}])


def test_alternative_experiment_changes_full_loop_decision():
    record = workflow.create(NewInvestigation())
    workflow.run_local(record["id"])
    workflow.approve(record["id"], "E2")
    workflow.run_local(record["id"])
    record = store.get(record["id"])
    assert record["status"] == "complete"
    result = store.by_kind(record, "result")[0]["data"]
    assert result["group"] == "year"
    decision = store.by_kind(record, "decision")[0]["data"]
    assert decision["next_decision"] != "Test sex and year effects within species"


def test_complete_discovery_loop_and_lineage():
    record = workflow.create(NewInvestigation())
    identifier = record["id"]
    workflow.run_local(identifier)
    workflow.approve(identifier, "E1")
    workflow.run_local(identifier)
    record = store.get(identifier)
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
    assert any(u["updated_support"] != u["prior_support"] for u in decision["changed_belief"])
    assert record["metrics"]["compute_seconds"] > 0
    tampered = copy.deepcopy(record)
    tampered["objects"][result["id"]]["data"]["adjusted_slope"] = 999
    assert not store.verify(tampered)
    result["data"]["provenance"] = {}
    assert "Missing experiment provenance" in science.rigor(record)
