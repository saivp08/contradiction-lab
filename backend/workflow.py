import threading
from datetime import datetime
from time import perf_counter

from backend import science, store
from backend.models import AgentAnnotation, Experiment, Hypothesis, NewInvestigation
from experiments.penguins import compute, load_data

LOCKS: dict[str, threading.RLock] = {}
LOCK_GUARD = threading.Lock()
ROLES = [
    "LiteratureAgent",
    "ContradictionAgent",
    "HypothesisAgent",
    "ExperimentPlanner",
    "ExperimentRunner",
    "AnalysisAgent",
    "DecisionAgent",
    "SafetyAgent",
]


def lock_for(identifier: str):
    with LOCK_GUARD:
        return LOCKS.setdefault(identifier, threading.RLock())


def create(request: NewInvestigation) -> dict:
    record = {
        "id": store.uid("lab"),
        "objective": request.objective,
        "label": request.label,
        "reference_question": "Why does the bill length–depth association reverse across aggregation choices?",
        "scope": "Reference investigation only. The dataset, variables and question are fixed; the optional label is for the user.",
        "mode": request.mode,
        "status": "created",
        "stage": 0,
        "seed": request.seed,
        "created_at": store.now(),
        "objects": {},
        "events": [],
        "approval": None,
        "metrics": {},
        "error": None,
    }
    store.add(record, "question", {"objective": request.objective, "scope": record["scope"]}, [])
    store.save(record)
    return record


def advance(identifier: str, role: str, rationale: str = "", candidates: list[dict] | None = None) -> dict:
    with lock_for(identifier):
        record = store.get(identifier)
        if record["status"] in {"complete", "failed", "no_contradiction"}:
            raise ValueError("Investigation is terminal")
        expected = ROLES[record["stage"]]
        if role != expected:
            raise ValueError(f"Invalid handoff: expected {expected}, received {role}")
        if record["mode"] == "omnigent":
            AgentAnnotation(rationale=rationale)
        started = perf_counter()
        inputs, outputs = [], []
        if role == "LiteratureAgent":
            inputs = [store.by_kind(record, "question")[0]["id"]]
            evidence = science.retrieve_evidence()
            for row in evidence:
                outputs.append(store.add(record, "evidence", row.model_dump(mode="json"), inputs))
            action, tool = (
                f"Retrieved {len(evidence)} curated claims from 1 cited article; offline reference catalog.",
                "retrieve_evidence",
            )
        elif role == "ContradictionAgent":
            evidence = store.by_kind(record, "evidence")
            inputs = [e["id"] for e in evidence]
            from backend.models import Evidence

            contradiction = science.compare(*[Evidence.model_validate(e["data"]) for e in evidence[:2]])
            outputs = [store.add(record, "contradiction", contradiction.model_dump(), inputs)]
            action, tool = contradiction.explanation, "compare_claims"
            if contradiction.contradiction_strength == "none":
                record["status"] = "no_contradiction"
        elif role == "HypothesisAgent":
            inputs = [store.by_kind(record, "contradiction")[0]["id"]]
            rows = science.hypotheses(False)
            if record["mode"] == "omnigent":
                if candidates is None:
                    raise ValueError("Omnigent must supply structured AI-generated hypotheses")
                rows = [Hypothesis.model_validate(row) for row in candidates]
                if [h.hypothesis_id for h in rows] != ["H1", "H2", "H3"]:
                    raise ValueError("Reference rubric requires H1 species, H2 sampling, H3 sex/year in order")
                for row in rows:
                    row.agent_generated = True
                    row.support_score = 50
            for row in rows:
                outputs.append(store.add(record, "hypothesis", row.model_dump(), inputs))
            action, tool = (
                "Registered 3 testable candidate explanations with falsification criteria.",
                "propose_hypotheses",
            )
        elif role == "ExperimentPlanner":
            inputs = [v["id"] for v in store.by_kind(record, "hypothesis")]
            candidates = science.proposals(record["seed"])
            for row in candidates:
                outputs.append(
                    store.add(record, "experiment", {**row.model_dump(), "planning_score": science.score(row)}, inputs)
                )
            chosen = max(candidates, key=science.score)
            record["selected_experiment"] = chosen.experiment_id
            record["selection_rationale"] = (
                "Species adjustment directly tests the differing aggregation condition. Weighted learning, discrimination, coverage, feasibility and cost scores favor it over year adjustment; scores are explicit heuristics."
            )
            record["status"] = "awaiting_approval" if record["mode"] == "local" else "sponsor_preparing_approval"
            record["metrics"]["question_to_spec_seconds"] = (
                datetime.fromisoformat(store.now()) - datetime.fromisoformat(record["created_at"])
            ).total_seconds()
            action, tool = (
                "Compared 2 tests; selected " + chosen.experiment_id + ". Waiting for human approval.",
                "rank_experiments",
            )
        elif role == "ExperimentRunner":
            if not record["approval"]:
                raise ValueError("Human approval required")
            proposals = store.by_kind(record, "experiment")
            chosen = next(v for v in proposals if v["data"]["experiment_id"] == record["approval"]["experiment_id"])
            inputs = [chosen["id"]]
            spec = Experiment.model_validate({k: v for k, v in chosen["data"].items() if k != "planning_score"})
            record["status"] = "running"
            run_id = store.add(
                record,
                "run",
                {
                    "specification_id": chosen["id"],
                    "started_at": store.now(),
                    "seed": spec.seed,
                    "approval": record["approval"],
                },
                inputs,
            )

            def progress(message):
                store.event(record, role, message, [run_id], [], "scientific_python", status="running")

            progress("Loading dataset")
            frame, metadata = load_data()
            progress("Validating schema")
            result = compute(frame, spec.method, spec.seed, spec.bootstrap_samples, progress)
            result["provenance"] = {
                "dataset_sha256": metadata["sha256"],
                "dataset": metadata,
                "code_sha256": science.code_hash(),
                "tool": "experiments.penguins.compute",
                "timestamp": store.now(),
                "parameters": spec.model_dump(),
                "runtime": runtime_versions(),
            }
            outputs = [store.add(record, "result", result, [run_id])]
            progress("Saving run artifact")
            record["metrics"]["compute_seconds"] = result["compute_seconds"]
            action, tool = (
                f"Computed real regression and {spec.bootstrap_samples} stratified bootstrap draws on {len(frame)} birds.",
                "experiments.penguins.compute",
            )
        elif role == "AnalysisAgent":
            result = store.by_kind(record, "result")[0]
            inputs = [result["id"]] + [v["id"] for v in store.by_kind(record, "hypothesis")]
            updates = science.evaluate(result["data"])
            outputs = [
                store.add(
                    record,
                    "analysis",
                    {
                        "updates": updates,
                        "score_label": "Heuristic support score, not probability",
                        "model_comparison": result["data"].get("model_comparison"),
                    },
                    inputs,
                )
            ]
            action, tool = (
                "; ".join(f"{u['hypothesis_id']}: {u['result_consistency']}" for u in updates),
                "evaluate_result",
            )
        elif role == "DecisionAgent":
            result = store.by_kind(record, "result")[0]
            analysis = store.by_kind(record, "analysis")[0]
            inputs = [result["id"], analysis["id"]]
            decision = science.decide(result["data"], analysis["data"]["updates"])
            outputs = [store.add(record, "decision", decision, inputs)]
            action, tool = "Research plan updated: " + decision["next_decision"], "choose_next_decision"
            record["metrics"]["result_to_decision_seconds"] = (
                datetime.fromisoformat(store.now()) - datetime.fromisoformat(result["created_at"])
            ).total_seconds()
        else:
            issues = science.rigor(record)
            if issues:
                raise ValueError("Rigor gate: " + "; ".join(issues))
            inputs = [v["id"] for v in store.by_kind(record, "decision")]
            outputs = [
                store.add(
                    record,
                    "safety",
                    {
                        "status": "passed",
                        "checks": [
                            "Citations validated",
                            "Lineage intact",
                            "Human approval recorded",
                            "Dataset and code hashes present",
                        ],
                        "flags": [
                            "No causal or clinical claims permitted",
                            "Known contextual reversal, not independent-study disagreement",
                            "No measured speedup baseline",
                        ],
                    },
                    inputs,
                )
            ]
            action, tool = (
                "Validated provenance, approval and lineage. Research record sealed for replay.",
                "rigor_audit",
            )
            record["status"] = "complete" if record["mode"] == "local" else "sponsor_verifying"
        record["stage"] += 1
        if record["status"] == "created":
            record["status"] = "investigating"
        if rationale:
            record.setdefault("agent_rationales", []).append({"agent": role, "rationale": rationale})
        store.event(record, role, action, inputs, outputs, tool, perf_counter() - started)
        if record["status"] in {"complete", "sponsor_verifying"}:
            record["metrics"].update(
                {
                    "claims_retrieved": len(store.by_kind(record, "evidence")),
                    "unique_sources": 1,
                    "hypotheses_evaluated": len(store.by_kind(record, "hypothesis")),
                    "experiments_compared": len(store.by_kind(record, "experiment")),
                    "total_wall_seconds": (
                        datetime.fromisoformat(store.now()) - datetime.fromisoformat(record["created_at"])
                    ).total_seconds(),
                    "human_approvals": int(record["approval"]["actor"] == "local human operator"),
                    "baseline": "No manual baseline measured; wall time includes approval wait.",
                }
            )
            record["verified_sha256"] = store.scientific_digest(record)
            store.save(record)
        return record


def runtime_versions():
    import platform
    import numpy
    import pandas
    import scipy

    return {
        "python": platform.python_version(),
        "numpy": numpy.__version__,
        "pandas": pandas.__version__,
        "scipy": scipy.__version__,
    }


def approve(identifier: str, experiment_id: str, actor: str = "local human operator") -> dict:
    with lock_for(identifier):
        record = store.get(identifier)
        if record["status"] != "awaiting_approval":
            raise ValueError("Investigation is not awaiting approval")
        valid = [v["data"]["experiment_id"] for v in store.by_kind(record, "experiment")]
        if experiment_id not in valid:
            raise ValueError("Unknown experiment")
        record["approval"] = {
            "experiment_id": experiment_id,
            "approved_at": store.now(),
            "actor": actor,
            "scope": "One allowlisted local computational experiment",
        }
        record["status"] = "approved"
        store.event(
            record,
            "Human" if actor == "local human operator" else "Seed script",
            "Approved " + experiment_id + " (" + actor + ")",
            [],
            [],
            "approval_gate",
        )
        return record


def run_followup(identifier: str, actor: str = "local human operator") -> dict:
    """Run the decision's proposed next experiment under a fresh, separate human approval."""
    with lock_for(identifier):
        record = store.get(identifier)
        if record["status"] != "complete":
            raise ValueError("Follow-up requires a completed investigation")
        if record.get("followup_approval"):
            raise ValueError("Follow-up has already been run")
        decision = store.by_kind(record, "decision")[0]
        if decision["data"]["next_experiment"] != science.FOLLOWUP_EXPERIMENT:
            raise ValueError("The recorded decision did not propose the sex and year follow-up")
        spec = science.followup_proposal(record["seed"])
        experiment_id = store.add(record, "experiment", {**spec.model_dump(), "followup": True}, [decision["id"]])
        record["followup_approval"] = {
            "experiment_id": spec.experiment_id,
            "approved_at": store.now(),
            "actor": actor,
            "scope": "One allowlisted local follow-up experiment",
        }
        store.event(
            record,
            "Human",
            f"Approved follow-up {spec.experiment_id} ({actor})",
            [decision["id"]],
            [experiment_id],
            "approval_gate",
        )
        started = perf_counter()
        frame, metadata = load_data()
        result = compute(frame, spec.method, spec.seed, spec.bootstrap_samples)
        result["provenance"] = {
            "dataset_sha256": metadata["sha256"],
            "dataset": metadata,
            "code_sha256": science.code_hash(),
            "tool": "experiments.penguins.compute",
            "timestamp": store.now(),
            "parameters": spec.model_dump(),
            "runtime": runtime_versions(),
        }
        result_id = store.add(record, "followup_result", result, [experiment_id])
        store.event(
            record,
            "ExperimentRunner",
            f"Computed {spec.title} with {spec.bootstrap_samples} bootstrap draws on {result['n']} birds.",
            [experiment_id],
            [result_id],
            "experiments.penguins.compute",
            perf_counter() - started,
        )
        interpretation = science.interpret_followup(result)
        interpretation_id = store.add(record, "followup_decision", interpretation, [result_id, decision["id"]])
        store.event(
            record,
            "DecisionAgent",
            "Follow-up: " + interpretation["summary"],
            [result_id],
            [interpretation_id],
            "interpret_followup",
        )
        record["metrics"]["followup_compute_seconds"] = result["compute_seconds"]
        record["verified_sha256"] = store.scientific_digest(record)
        store.save(record)
        return record


def fail(identifier: str, error: Exception) -> None:
    with lock_for(identifier):
        record = store.get(identifier)
        record["status"] = "failed"
        # Do not persist provider exceptions that may include credentials/headers.
        record["error"] = (
            str(error)[:500]
            if record["mode"] == "local"
            else "Omnigent execution failed or did not complete the required handoffs. Check model credentials and SDK compatibility; no fallback was run."
        )
        store.save(record)


def run_local(identifier: str):
    try:
        while True:
            record = store.get(identifier)
            if record["status"] in {"awaiting_approval", "complete", "failed", "no_contradiction"}:
                return
            advance(identifier, ROLES[record["stage"]])
    except Exception as error:
        fail(identifier, error)
