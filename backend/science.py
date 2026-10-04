"""Generic scientific checks shared by every investigation: claim comparison, plan scoring, rigor gate."""

from backend.models import Citation, Contradiction, Evidence, Experiment


def compare(a: Evidence, b: Evidence) -> Contradiction:
    """Generic comparability check over two Evidence records; works for any pair with shared fields."""
    directions = {a.direction_of_effect, b.direction_of_effect}
    opposite = directions == {"positive", "negative"}
    null_markers = ("null result" in str(a.experimental_conditions), "null result" in str(b.experimental_conditions))
    tension = bool(directions & {"positive", "negative"}) and "unknown" in directions and any(null_markers)
    same_outcome = a.outcome == b.outcome and a.intervention_or_variable == b.intervention_or_variable
    same_population = a.population_or_system == b.population_or_system
    if same_outcome and opposite:
        strength = "contextual reversal" if same_population else "unresolved"
    elif same_outcome and tension:
        strength = "unresolved"
    else:
        strength = "none"
    differing = [
        f"{key}: {a.experimental_conditions.get(key, '—')} · {b.experimental_conditions.get(key, '—')}"
        for key in sorted(set(a.experimental_conditions) | set(b.experimental_conditions))
        if a.experimental_conditions.get(key) != b.experimental_conditions.get(key)
    ]
    if not same_population:
        differing.insert(0, f"population: {a.population_or_system} · {b.population_or_system}")

    def describe(e: Evidence) -> str:
        if "null result" in str(e.experimental_conditions):
            return "no significant effect"
        return f"a {e.direction_of_effect} effect"

    if strength == "none":
        conflicting = "No comparable directional conflict found."
    else:
        conflicting = f"For {a.outcome}, source A reports {describe(a)} while source B reports {describe(b)}."
    return Contradiction(
        contradiction_id="C1",
        evidence_a=a.evidence_id,
        evidence_b=b.evidence_id,
        conflicting_claim=conflicting,
        shared_context=(a.population_or_system if same_population else f"Shared outcome: {a.outcome}"),
        differing_conditions=differing or ["No differing conditions extracted"],
        contradiction_strength=strength,
        uncertainty=(
            "Different contexts or estimands can legitimately yield different signs; "
            "a disagreement is a question to investigate, not proof that either source is false."
        ),
        explanation=(
            "An apparent contradiction tied to analysis context within one source."
            if same_population
            else "A context-dependent disagreement: the sources differ in extracted conditions."
        ),
    )



def score(experiment: Experiment) -> float:
    return round(
        0.35 * experiment.expected_information_gain
        + 0.25 * experiment.discrimination
        + 0.2 * experiment.data_availability
        + 0.15 * experiment.feasibility
        - 0.05 * experiment.computational_cost,
        4,
    )



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

