"""Each Omnigent specialist gets exactly one mutation capability, scoped to one run."""
import os
import json

from backend import workflow


def _step(role: str, rationale: str, candidates: list[dict] | None = None) -> dict:
    identifier = os.environ["LAB_ACTIVE_INVESTIGATION"]
    record = workflow.advance(identifier, role, rationale, candidates)
    # Structured shared state, excluding large chart arrays and private reasoning.
    return {"investigation_id": identifier, "status": record["status"], "next_agent": workflow.ROLES[record["stage"]] if record["stage"] < len(workflow.ROLES) else None,
            "objects": [{**v, "data": {k: value for k, value in v["data"].items() if k != "points"}} for v in record["objects"].values()]}


def literature(rationale: str) -> dict:
    return _step("LiteratureAgent", rationale)


def contradiction(rationale: str) -> dict:
    return _step("ContradictionAgent", rationale)


def hypothesis(rationale: str, hypotheses_json: str) -> dict:
    candidates = json.loads(hypotheses_json)
    if not isinstance(candidates, list):
        raise ValueError("Hypotheses must be a JSON array")
    return _step("HypothesisAgent", rationale, candidates)


def planner(rationale: str) -> dict:
    return _step("ExperimentPlanner", rationale)


def runner(rationale: str) -> dict:
    return _step("ExperimentRunner", rationale)


def analysis(rationale: str) -> dict:
    return _step("AnalysisAgent", rationale)


def decision(rationale: str) -> dict:
    return _step("DecisionAgent", rationale)


def safety(rationale: str) -> dict:
    return _step("SafetyAgent", rationale)
