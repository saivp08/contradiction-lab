"""Scientific specialists with explicit, inspectable computations and rationale."""

import hashlib
import json
from pathlib import Path

from backend.models import Citation, Contradiction, Evidence, Experiment, Hypothesis
from experiments.penguins import load_data

ROOT = Path(__file__).resolve().parents[1]


def retrieve_evidence() -> list[Evidence]:
    catalog = json.loads((ROOT / "data" / "evidence.json").read_text(encoding="utf-8"))
    return [Evidence.model_validate(row) for row in catalog]


def compare(a: Evidence, b: Evidence) -> Contradiction:
    opposite = {a.direction_of_effect, b.direction_of_effect} == {"positive", "negative"}
    same_outcome = (
        a.outcome == b.outcome
        and a.intervention_or_variable == b.intervention_or_variable
        and a.population_or_system == b.population_or_system
    )
    conflict = opposite and same_outcome
    return Contradiction(
        contradiction_id="C1",
        evidence_a=a.evidence_id,
        evidence_b=b.evidence_id,
        conflicting_claim="Bill length and depth have opposite association directions across aggregation choices."
        if conflict
        else "No comparable directional conflict found.",
        shared_context="Palmer Archipelago penguin bill measurements, 2007–2009.",
        differing_conditions=["Species pooled versus species separated"],
        contradiction_strength="contextual reversal" if conflict else "none",
        uncertainty="Same dataset, not independent replications. Different estimands can legitimately have different signs.",
        explanation="An apparent contradiction due to analysis context; not evidence that either source is false.",
    )


def hypotheses(ai_generated: bool) -> list[Hypothesis]:
    rows = [
        (
            "H1",
            "Species composition explains the reversal",
            "Pooling species may combine between-species differences with within-species variation.",
            "A species-adjusted slope is positive while the pooled slope is negative.",
            "A nonpositive adjusted slope or an interval spanning zero.",
            50,
        ),
        (
            "H2",
            "Sampling variability explains the reversal",
            "A small or unstable association might change sign under resampling.",
            "The adjusted interval spans zero or the sign changes when a year is omitted.",
            "A positive interval and stable sign across every omitted year.",
            50,
        ),
        (
            "H3",
            "Sex or year differences explain residual association",
            "Species adjustment alone does not account for other measured covariates.",
            "Residual association changes after sex/year adjustment.",
            "Stable adjusted estimates across sex and year controls in a follow-up test.",
            50,
        ),
    ]
    return [
        Hypothesis(
            hypothesis_id=i,
            statement=s,
            rationale=r,
            supporting_evidence=["EV1", "EV2"],
            conflicting_evidence=[],
            predictions=[p],
            falsification_condition=f,
            uncertainty="Candidate explanation, not a causal conclusion. Initial scores are neutral heuristic values.",
            agent_generated=ai_generated,
            support_score=score,
        )
        for i, s, r, p, f, score in rows
    ]


def proposals(seed: int) -> list[Experiment]:
    frame, meta = load_data()
    common = dict(
        hypothesis_targets=["H1", "H2", "H3"],
        required_data="Palmer Penguins / " + meta["sha256"],
        variables=["bill_length_mm", "bill_depth_mm", "species", "year"],
        feasibility=1,
        data_availability=len(frame) / meta["n_raw"],
        computational_cost=0.1,
        limitations=[
            "Exploratory, observational reanalysis; no causal identification.",
            "Heuristic planning scores, not expected bits of information.",
        ],
        seed=seed,
        bootstrap_samples=500,
        success_criterion="Adjusted 95% interval excludes zero with opposite sign to pooled slope; sign survives year exclusions.",
        failure_criterion="Interval includes zero, no reversal, or unstable sensitivity results.",
    )
    return [
        Experiment(
            experiment_id="E1",
            title="Species-adjusted regression",
            scientific_question="Does controlling for species reverse the pooled relationship?",
            method="species_adjustment",
            expected_information_gain=0.9,
            discrimination=0.95,
            **common,
        ),
        Experiment(
            experiment_id="E2",
            title="Year-adjusted sensitivity",
            scientific_question="Does controlling for collection year resolve the disagreement?",
            method="year_sensitivity",
            expected_information_gain=0.6,
            discrimination=0.55,
            **common,
        ),
    ]


FOLLOWUP_EXPERIMENT = "Species + sex + year regression"


def followup_proposal(seed: int) -> Experiment:
    frame, meta = load_data()
    complete = int(frame.sex.notna().sum())
    return Experiment(
        experiment_id="E3",
        title=FOLLOWUP_EXPERIMENT,
        hypothesis_targets=["H3"],
        scientific_question="Does the positive within-species slope survive adjustment for sex and collection year?",
        method="species_sex_year",
        required_data="Palmer Penguins / " + meta["sha256"],
        variables=["bill_length_mm", "bill_depth_mm", "species", "sex", "year"],
        expected_information_gain=0.7,
        feasibility=1,
        data_availability=complete / meta["n_raw"],
        computational_cost=0.15,
        discrimination=0.7,
        limitations=[
            "Exploratory, observational reanalysis; no causal identification.",
            "Drops birds without recorded sex.",
        ],
        seed=seed,
        bootstrap_samples=500,
        success_criterion="Adjusted 95% interval excludes zero; attenuation relative to species-only slope is reported.",
        failure_criterion="Interval includes zero after sex and year adjustment.",
    )


def interpret_followup(result: dict) -> dict:
    low, high = result["adjusted_ci95"]
    persists = low > 0
    attenuation = result["attenuation"]
    if persists and attenuation >= 0.2:
        label, support = "better supported", 75
        summary = (
            f"Sex and year adjustment reduces the within-species slope by {attenuation:.0%}, "
            "but a positive association remains."
        )
        next_step = "Model sex-specific slopes within species"
    elif persists:
        label, support = "weakened", 30
        summary = "The within-species slope is largely unchanged by sex and year adjustment."
        next_step = "Look beyond sex and year: measurement protocol or colony"
    else:
        label, support = "better supported", 85
        summary = "After sex and year adjustment the interval includes zero; these covariates may explain the residual association."
        next_step = "Replicate with an independent sample before attributing the association to sex"
    return {
        "hypothesis_id": "H3",
        "prior_support": 50,
        "updated_support": support,
        "result_consistency": label,
        "summary": summary,
        "evidence": f"Adjusted slope {result['adjusted_slope']:.3f}; 95% CI [{low:.3f}, {high:.3f}]; "
        f"species-only slope {result['species_only_slope']:.3f}.",
        "next_decision": next_step,
        "score_label": "Heuristic support score, not probability",
    }


def score(experiment: Experiment) -> float:
    return round(
        0.35 * experiment.expected_information_gain
        + 0.25 * experiment.discrimination
        + 0.2 * experiment.data_availability
        + 0.15 * experiment.feasibility
        - 0.05 * experiment.computational_cost,
        4,
    )


def evaluate(result: dict) -> list[dict]:
    low, high = result["adjusted_ci95"]
    stable = all(row["slope"] * result["adjusted_slope"] > 0 for row in result["sensitivity"])
    if result["pooled_slope"] < 0 < low and stable and result["group"] == "species":
        scores, labels = [85, 20, 50], ["better supported", "weakened", "unresolved"]
    elif low <= 0 <= high or not stable:
        scores, labels = [40, 70, 50], ["weakened", "remains plausible", "unresolved"]
    else:
        scores, labels = [25, 35, 65], ["weakened", "weak support", "deserves attention"]
    return [
        {
            "hypothesis_id": f"H{i + 1}",
            "prior_support": 50,
            "result_consistency": labels[i],
            "updated_support": scores[i],
            "evidence_for": f"Adjusted slope {result['adjusted_slope']:.3f}; 95% CI [{low:.3f}, {high:.3f}]; stable across year exclusions: {stable}.",
            "evidence_against": "This test does not isolate all correlated variables.",
            "remaining_uncertainty": "Scores follow a disclosed heuristic, are not probabilities, and do not establish causation.",
        }
        for i in range(3)
    ]


def decide(result: dict, updates: list[dict]) -> dict:
    if updates[0]["updated_support"] >= 80:
        next_step = "Test sex and year effects within species"
        search = "Retrieve sex-specific bill morphometry and measurement-protocol evidence."
        reason = "Species adjustment reverses the pooled sign with a positive interval and stable year exclusions; investigate what remains within species."
    elif updates[1]["updated_support"] >= 60:
        next_step = "Prioritize replication and resampling stability"
        search = "Find an independent sample with comparable bill measurements."
        reason = "Uncertainty or year sensitivity prevents a stable conclusion; seek replication before interpreting subgroup mechanisms."
    else:
        next_step = "Reconsider species composition; compare alternative covariates"
        search = "Retrieve measurement-method and sex-stratified evidence."
        reason = "The proposed species explanation did not meet the reversal criterion; examine alternative context variables."
    return {
        "previous_plan": "Compare species composition with sampling variability",
        "new_evidence": {k: result[k] for k in ("adjusted_slope", "adjusted_ci95", "pooled_slope", "reversal")},
        "changed_belief": updates,
        "next_decision": next_step,
        "rationale": reason,
        "next_evidence_search": search,
        "next_experiment": "Species + sex + year regression"
        if updates[0]["updated_support"] >= 80
        else "Independent-sample replication"
        if updates[1]["updated_support"] >= 60
        else "Covariate sensitivity analysis",
        "requires_new_approval": True,
    }


def rigor(record: dict) -> list[str]:
    issues = []
    for obj in record["objects"].values():
        for parent in obj["input_ids"]:
            if parent not in record["objects"]:
                issues.append("Broken lineage: " + parent)
        if obj["kind"] == "evidence":
            Citation.model_validate(obj["data"]["citation"])
        if obj["kind"] == "result":
            provenance = obj["data"].get("provenance", {})
            if not all(provenance.get(key) for key in ("dataset_sha256", "code_sha256", "tool", "timestamp")):
                issues.append("Missing experiment provenance")
    if not record.get("approval"):
        issues.append("Human approval required before execution")
    return issues


def code_hash() -> str:
    return hashlib.sha256((ROOT / "experiments" / "penguins.py").read_bytes()).hexdigest()
