import hashlib
import json
import threading
from datetime import datetime
from time import perf_counter

from backend import paper_science, science, store
from backend.models import AgentAnnotation, Experiment, Hypothesis, NewInvestigation
from experiments.papers_analysis import compute_papers
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
    "CriticAgent",
    "DecisionAgent",
    "SafetyAgent",
]


def lock_for(identifier: str):
    with LOCK_GUARD:
        return LOCKS.setdefault(identifier, threading.RLock())


def create(request: NewInvestigation) -> dict:
    source = None
    objective = request.objective
    parent = None
    if request.parent_investigation:
        parent = store.get(request.parent_investigation)
        if request.mode != 'omnigent' or parent['mode'] != 'omnigent' or parent['status'] != 'complete':
            raise ValueError('Model follow-up planning requires a completed model investigation')
        if request.source_analysis:
            raise ValueError('Follow-up source is inherited from the parent investigation')
        decision = store.by_kind(parent, 'decision')[0]['data']
        objective = f"Follow up: {decision['next_experiment']}. {decision['rationale']}"
        source = parent.get('source')
    if request.source_analysis:
        analysis = store.load_analysis(request.source_analysis)
        if request.mode == 'omnigent' and not analysis.get('source_documents'):
            raise ValueError('Re-analyze the uploaded papers in model mode to provide their full source passages')
        if request.mode == 'local' and (not analysis.get("defensible_contradiction") or "evidence" not in analysis):
            raise ValueError(
                "The paper analysis found no defensible contradiction; an investigation will not be fabricated."
            )
        objective = paper_science.objective(analysis)
        if request.mode == 'omnigent':
            objective = 'Assess whether the uploaded papers disagree, explain any disagreement and propose a bounded test.'
            analysis.update(relationship='Pending model assessment', best_pair=None, pairs=[],
                            defensible_contradiction=False, evidence=[], engine='Model assessment pending')
        source = {
            "kind": "papers",
            "analysis_id": analysis["analysis_id"],
            "engine": analysis["engine"],
            "papers": [
                {
                    **{k: p[k] for k in ("id", "filename", "pages", "meta", "sections")},
                    "sample_size": p.get("sample_size"),
                }
                for p in analysis["papers"]
            ],
            "relationship": analysis["relationship"],
            "analysis": analysis,
            "evidence": analysis.get("evidence", []),
        }
    record = {
        "id": store.uid("lab"),
        "objective": objective,
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
    if source:
        record["source"] = source
        record["scope"] = (
            "Comparison of two user-supplied papers via extracted text evidence; "
            "the computational experiments quantify extraction robustness, not either paper's truth."
        )
    store.add(record, "question", {"objective": objective, "scope": record["scope"]}, [])
    if parent:
        record['parent_investigation'] = parent['id']
        for kind in ('result', 'decision', 'critique'):
            for artifact in store.by_kind(parent, kind):
                store.add(record, 'prior_' + kind, {'parent_investigation': parent['id'],
                          'artifact_id': artifact['id'], 'artifact': artifact['data']}, [])
    store.save(record)
    return record


def advance(identifier: str, role: str, rationale: str = "", candidates: list[dict] | None = None) -> dict:
    if store.get(identifier)['mode'] != 'local':
        raise ValueError('Model agents must submit validated structured artifacts through omnigent_tools')
    return _advance_deterministic(identifier, role, rationale, candidates)


def _advance_deterministic(identifier: str, role: str, rationale: str = "", candidates: list[dict] | None = None) -> dict:
    with lock_for(identifier):
        record = store.get(identifier)
        if record["status"] in {"complete", "failed", "no_contradiction"}:
            raise ValueError("Investigation is terminal")
        expected = ROLES[record["stage"]]
        if role != expected:
            raise ValueError(f"Invalid handoff: expected {expected}, received {role}")
        papers_mode = record.get("source", {}).get("kind") == "papers"
        paper_analysis = record.get("source", {}).get("analysis") if papers_mode else None
        if record["mode"] == "omnigent":
            AgentAnnotation(rationale=rationale)
        started = perf_counter()
        inputs, outputs = [], []
        if role == "LiteratureAgent":
            inputs = [store.by_kind(record, "question")[0]["id"]]
            if papers_mode:
                for row in record["source"]["evidence"]:
                    outputs.append(store.add(record, "evidence", row, inputs))
                papers_meta = record["source"]["papers"]
                action, tool = (
                    f"Parsed {len(papers_meta)} uploaded PDFs "
                    f"({sum(p['pages'] for p in papers_meta)} pages); extracted "
                    f"{len(paper_analysis['claims_a']) + len(paper_analysis['claims_b'])} candidate claims; "
                    "selected the top aligned pair with page-level provenance.",
                    "ingest_papers",
                )
            else:
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
            rows = paper_science.hypotheses(paper_analysis) if papers_mode else science.hypotheses(False)
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
            candidates = (
                paper_science.proposals(paper_analysis, record["seed"])
                if papers_mode
                else science.proposals(record["seed"])
            )
            for row in candidates:
                outputs.append(
                    store.add(record, "experiment", {**row.model_dump(), "planning_score": science.score(row)}, inputs)
                )
            chosen = max(candidates, key=science.score)
            record["selected_experiment"] = chosen.experiment_id
            record["selection_rationale"] = (
                "The robustness audit directly tests whether the detected disagreement survives resampling "
                "and section exclusion; scores are explicit heuristics."
                if papers_mode
                else "Species adjustment directly tests the differing aggregation condition. Weighted learning, discrimination, coverage, feasibility and cost scores favor it over year adjustment; scores are explicit heuristics."
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

            if papers_mode:
                progress("Loading extracted claims")
                result = compute_papers(paper_analysis, spec.method, spec.seed, spec.bootstrap_samples, progress)
                pdf_hashes = "+".join(p["id"] for p in record["source"]["papers"])
                result["provenance"] = {
                    "dataset_sha256": hashlib.sha256(pdf_hashes.encode()).hexdigest(),
                    "dataset": {"papers": record["source"]["papers"], "pdf_sha256": pdf_hashes.split("+")},
                    "code_sha256": paper_code_hash(),
                    "tool": "experiments.papers_analysis.compute_papers",
                    "timestamp": store.now(),
                    "parameters": spec.model_dump(),
                    "runtime": runtime_versions(),
                }
                counts = result["n_claims"]
                action, tool = (
                    f"Computed alignment robustness over {counts['a']} + {counts['b']} extracted claims with "
                    f"{spec.bootstrap_samples} bootstrap resamples and section-exclusion sensitivity.",
                    "experiments.papers_analysis.compute_papers",
                )
            else:
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
                action, tool = (
                    f"Computed real regression and {spec.bootstrap_samples} stratified bootstrap draws on {len(frame)} birds.",
                    "experiments.penguins.compute",
                )
            outputs = [store.add(record, "result", result, [run_id])]
            progress("Saving run artifact")
            record["metrics"]["compute_seconds"] = result["compute_seconds"]
        elif role == "AnalysisAgent":
            result = store.by_kind(record, "result")[0]
            inputs = [result["id"]] + [v["id"] for v in store.by_kind(record, "hypothesis")]
            updates = paper_science.evaluate(result["data"]) if papers_mode else science.evaluate(result["data"])
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
        elif role == "CriticAgent":
            result = store.by_kind(record, "result")[0]
            analysis = store.by_kind(record, "analysis")[0]
            inputs = [result["id"], analysis["id"]]
            challenges = paper_science.critique(result["data"]) if papers_mode else science.critique(result["data"])
            outputs = [store.add(record, "critique", {"challenges": challenges}, inputs)]
            tally = {v: sum(c["verdict"] == v for c in challenges) for v in ("rebutted", "stands", "open")}
            action, tool = (
                f"Raised {len(challenges)} challenges: {tally['rebutted']} rebutted by the data, "
                f"{tally['stands']} standing, {tally['open']} open.",
                "challenge_result",
            )
        elif role == "DecisionAgent":
            result = store.by_kind(record, "result")[0]
            analysis = store.by_kind(record, "analysis")[0]
            critique = store.by_kind(record, "critique")[0]
            inputs = [result["id"], analysis["id"], critique["id"]]
            decision = (
                paper_science.decide(result["data"], analysis["data"]["updates"], critique["data"]["challenges"])
                if papers_mode
                else science.decide(result["data"], analysis["data"]["updates"], critique["data"]["challenges"])
            )
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
                    "agent_handoffs": sum(
                        1 for e in record["events"] if e["agent"] in ROLES and e["status"] == "complete"
                    ),
                    "followup_experiments": 0,
                    **challenge_metrics(record),
                    "baseline": "No manual baseline measured; wall time includes approval wait.",
                }
            )
            record["verified_sha256"] = store.scientific_digest(record)
            store.save(record)
        return record


def challenge_metrics(record: dict) -> dict:
    """Tally of critic challenges by their latest verdict; a follow-up may re-judge a challenge."""
    latest = {
        c["challenge_id"]: c["verdict"]
        for critique in store.by_kind(record, "critique")
        for c in critique["data"]["challenges"]
    }
    verdicts = list(latest.values())
    return {
        "challenges_raised": len(verdicts),
        "challenges_rebutted": verdicts.count("rebutted"),
        "challenges_open": verdicts.count("open"),
        "challenges_partly_conceded": verdicts.count("partly conceded"),
    }


def paper_code_hash() -> str:
    from pathlib import Path as _Path

    return hashlib.sha256(
        (_Path(__file__).resolve().parents[1] / "experiments" / "papers_analysis.py").read_bytes()
    ).hexdigest()


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
        if record['mode'] == 'omnigent':
            from backend.model_agents import plan_digest
            if record.get('verified_plan_sha256') != plan_digest(record):
                raise ValueError('Plan has changed since verification')
        record["approval"] = {
            "experiment_id": experiment_id,
            "approved_at": store.now(),
            "actor": actor,
            "scope": "One allowlisted local computational experiment",
            "plan_sha256": hashlib.sha256(json.dumps(
                store.by_kind(record, 'experiment'), sort_keys=True, allow_nan=False).encode()).hexdigest(),
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
        if record['mode'] == 'omnigent':
            raise ValueError('Model follow-ups require a new planned investigation and approval; this shortcut is deterministic-only')
        if record.get("source", {}).get("kind") == "papers":
            raise ValueError(
                "Follow-up execution needs an executable dataset; a paper comparison records the proposed "
                "next experiment without running it."
            )
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
        challenge = science.resolve_followup_challenge(result)
        challenge_id = store.add(record, "critique", {"challenges": [challenge], "followup": True}, [result_id])
        store.event(
            record,
            "CriticAgent",
            f"Challenge X5 (sex confounding) {challenge['verdict']}: {challenge['evidence']}",
            [result_id],
            [challenge_id],
            "challenge_result",
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
        record["metrics"]["followup_experiments"] = 1
        record["metrics"]["human_approvals"] = record["metrics"].get("human_approvals", 1) + 1
        record["metrics"]["agent_handoffs"] = sum(
            1 for e in record["events"] if e["agent"] in ROLES and e["status"] == "complete"
        )
        record["metrics"].update(challenge_metrics(record))
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
