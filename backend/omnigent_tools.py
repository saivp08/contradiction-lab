"""Role-scoped Omnigent capabilities. No generic mutation or shell tool is exposed."""
import os
from backend import model_agents


def _context(role):
    return model_agents.context(os.environ['LAB_ACTIVE_INVESTIGATION'], role)


def _submit(role, output_json):
    return model_agents.submit(os.environ['LAB_ACTIVE_INVESTIGATION'], role, output_json)

def literature_context() -> dict:
    return _context("LiteratureAgent")


def literature(output_json: str) -> dict:
    return _submit("LiteratureAgent", output_json)


def contradiction_context() -> dict:
    return _context("ContradictionAgent")


def contradiction(output_json: str) -> dict:
    return _submit("ContradictionAgent", output_json)


def hypothesis_context() -> dict:
    return _context("HypothesisAgent")


def hypothesis(output_json: str) -> dict:
    return _submit("HypothesisAgent", output_json)


def planner_context() -> dict:
    return _context("ExperimentPlanner")


def planner(output_json: str) -> dict:
    return _submit("ExperimentPlanner", output_json)


def runner_context() -> dict:
    return _context("ExperimentRunner")


def runner(output_json: str) -> dict:
    return _submit("ExperimentRunner", output_json)


def analysis_context() -> dict:
    return _context("AnalysisAgent")


def analysis(output_json: str) -> dict:
    return _submit("AnalysisAgent", output_json)


def critic_context() -> dict:
    return _context("CriticAgent")


def critic(output_json: str) -> dict:
    return _submit("CriticAgent", output_json)


def decision_context() -> dict:
    return _context("DecisionAgent")


def decision(output_json: str) -> dict:
    return _submit("DecisionAgent", output_json)


def safety_context() -> dict:
    return _context("SafetyAgent")


def safety(output_json: str) -> dict:
    return _submit("SafetyAgent", output_json)
