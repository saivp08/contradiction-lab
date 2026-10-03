"""Generate official Omnigent YAML specs with role-specific function tools."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLES = [
    ("LiteratureAgent", "literature", "Retrieve cited source claims from the curated reference catalog; disclose that this is offline retrieval."),
    ("ContradictionAgent", "contradiction", "Assess comparability and distinguish aggregation reversal from independent-study disagreement."),
    ("HypothesisAgent", "hypothesis", "Generate three testable explanations within the reference rubric: H1 species composition, H2 sampling variability, H3 sex/year effects. Supply your own statements, scientific rationales, predictions and falsification criteria as hypotheses_json. Each object needs hypothesis_id, statement, rationale, supporting_evidence (EV1/EV2), conflicting_evidence, predictions (string list), falsification_condition, uncertainty, agent_generated (true), support_score (50). Do not claim a novel discovery."),
    ("ExperimentPlanner", "planner", "Compare allowlisted experiments by disclosed heuristic scores and stop for human approval."),
    ("ExperimentRunner", "runner", "Execute only the already approved scientific tool; never fabricate numerical results."),
    ("AnalysisAgent", "analysis", "Inspect the actual metrics passed from the runner. Interpret confidence intervals and uncertainty; update support using the transparent scoring rubric."),
    ("DecisionAgent", "decision", "Use actual result-dependent support updates to select the next experiment; explain what evidence changed the plan."),
    ("SafetyAgent", "safety", "Audit citations, lineage, approval and computational provenance. Do not claim causation or clinical implications."),
]
for phase, roles in [("prepare", ROLES[:4]), ("execute", ROLES[4:])]:
    config = {"name": "ContradictionLab_" + phase, "executor": {"harness": "openai-agents", "model": "${OMNIGENT_MODEL}", "auth": {"type": "api_key", "api_key": "${OPENAI_API_KEY}"}}, "async": False, "skills": "none", "prompt": "You orchestrate the scientific workflow. Call each specialist exactly once in this order: " + ", ".join(r[0] for r in roles) + ". Each specialist MUST call its scientific function tool. Pass the returned structured record to the next specialist. Stop on any error. Never bypass approval. Output only a concise status; no private chain of thought.", "tools": {}}
    for role, function, responsibility in roles:
        config["tools"][role] = {"type": "agent", "description": responsibility, "executor": config["executor"], "async": False, "prompt": responsibility + " Call your function tool with a brief observable scientific rationale (not hidden reasoning). Return its actual structured output. Do not invent facts or execute other tools.", "tools": {"scientific_step": {"type": "function", "callable": "backend.omnigent_tools." + function, "description": responsibility, "parameters": {"type": "object", "properties": {"rationale": {"type": "string", "description": "Concise evidence-grounded rationale, 10–1500 characters"}}, "required": ["rationale"], "additionalProperties": False}}}}
        if function == "hypothesis":
            parameters = config["tools"][role]["tools"]["scientific_step"]["parameters"]
            parameters["properties"]["hypotheses_json"] = {"type": "string", "description": "JSON array of three Hypothesis contracts in order H1, H2, H3"}
            parameters["required"].append("hypotheses_json")
    # JSON is a strict subset of YAML and avoids ambiguous YAML scalars.
    (ROOT / "omnigent_config" / f"{phase}.yaml").write_text(json.dumps(config, indent=2))

if __name__ == "__main__":
    print("Generated two Omnigent phase graphs with eight specialist agents.")
