import importlib.util
import json
from pathlib import Path

import pytest


@pytest.mark.skipif(importlib.util.find_spec("omnigent") is None, reason="Official optional sponsor SDK not installed")
def test_real_omnigent_loader_accepts_both_graphs(monkeypatch):
    from omnigent import load_agent_def

    monkeypatch.setenv("OMNIGENT_MODEL", "gpt-4.1-mini")
    monkeypatch.setenv("OPENAI_API_KEY", "unit-test-parse-only-not-a-real-key")
    # Configuration parsing only. No provider call or mock sponsor execution.
    for phase, specialists in (("prepare", 4), ("execute", 5)):
        path = Path("omnigent_config") / (phase + ".yaml")
        agent = load_agent_def(path)
        assert len(agent.tools) == specialists
        config = json.loads(path.read_text())
        assert "os_env" not in config
        for tool in config["tools"].values():
            assert tool["type"] == "agent"
            assert len(tool["tools"]) == 1
            assert "os_env" not in tool


def test_sponsor_tool_surface_drives_full_loop_with_enforced_approval(monkeypatch):
    """End-to-end over backend.omnigent_tools — the exact callables Omnigent's function tools invoke.

    Verifies the orchestration contract without a model: handoff order, structured state passing,
    the approval gate, the Critic exchange, and sealing. A live credentialed run remains unverified.
    """
    from backend import omnigent_tools as tools
    from backend import science, store, workflow
    from backend.models import NewInvestigation

    record = workflow.create(NewInvestigation(mode="omnigent"))
    monkeypatch.setenv("LAB_ACTIVE_INVESTIGATION", record["id"])

    state = tools.literature("Retrieve the two attributed reference claims from the curated catalog.")
    assert state["next_agent"] == "ContradictionAgent"
    assert all("points" not in o["data"] for o in state["objects"])
    tools.contradiction("Same outcome and variable with opposite directions across aggregation contexts.")
    generated = json.dumps([h.model_dump() for h in science.hypotheses(True)])
    tools.hypothesis("Three testable explanations within the reference rubric.", generated)
    state = tools.planner("Species adjustment scores highest on the disclosed heuristic; stop for approval.")
    assert state["status"] == "sponsor_preparing_approval"

    with pytest.raises(ValueError, match="Invalid handoff|Human approval"):
        tools.runner("Attempting to execute before any human approval.")

    # The adapter surfaces the approval gate after the prepare phase; a human approves out of band.
    stored = store.get(record["id"])
    stored["status"] = "awaiting_approval"
    store.save(stored)
    workflow.approve(record["id"], "E1")

    tools.runner("Execute the single approved allowlisted computation.")
    tools.analysis("Interpret the computed interval, sensitivity and model comparison.")
    state = tools.critic("Attack the result; every challenge is settled by a computed number.")
    assert state["next_agent"] == "DecisionAgent"
    tools.decision("Open sex-confounding challenge drives the follow-up proposal.")
    state = tools.safety("Audit citations, lineage, approval and provenance.")
    assert state["status"] == "sponsor_verifying"

    stored = store.get(record["id"])
    agents = [e["agent"] for e in stored["events"] if e["status"] == "complete" and e["agent"] in workflow.ROLES]
    assert agents == workflow.ROLES
    assert len(stored.get("agent_rationales", [])) == len(workflow.ROLES)
    hypotheses = store.by_kind(stored, "hypothesis")
    assert all(h["data"]["agent_generated"] for h in hypotheses)
    # The adapter seals the record after a clean execute phase.
    stored["status"] = "complete"
    stored["verified_sha256"] = store.scientific_digest(stored)
    store.save(stored)
    assert store.verify(store.get(record["id"]))
