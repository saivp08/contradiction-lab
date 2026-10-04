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
    for phase, specialists in (("prepare", 5), ("execute", 5)):
        path = Path("omnigent_config") / (phase + ".yaml")
        agent = load_agent_def(path)
        assert len(agent.tools) == specialists
        config = json.loads(path.read_text())
        assert "os_env" not in config
        for tool in config["tools"].values():
            assert tool["type"] == "agent"
            assert len(tool["tools"]) == 2
            assert "os_env" not in tool

