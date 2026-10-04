"""Allowlisted, deterministic computations on claims extracted from two uploaded papers.

The unit of analysis is the papers' extracted text evidence — not a scientific dataset. Bootstrap
resampling and section-exclusion sensitivity quantify how robust the detected disagreement is to
which claim sentences were extracted. All numbers are computed; nothing is generated.
"""

from collections.abc import Callable
from time import perf_counter

import numpy as np

from backend.papers import is_comparable, rank_pairs

METHODS = {"claim_alignment_audit", "condition_scan"}
DISAGREEMENT_KINDS = {"opposed", "tension"}


def _best_disagreement(claims_a: list[dict], claims_b: list[dict], focus: list[str] | None) -> dict | None:
    for pair in rank_pairs(claims_a, claims_b, limit=50, focus=focus):
        if pair["kind"] in DISAGREEMENT_KINDS and is_comparable(pair):
            return pair
    return None


def compute_papers(
    analysis: dict,
    method: str,
    seed: int,
    draws: int,
    progress: Callable[[str], None] = lambda _: None,
) -> dict:
    if method not in METHODS:
        raise ValueError("Experiment tool is not allowlisted")
    started = perf_counter()
    rng = np.random.default_rng(seed)
    claims_a, claims_b = analysis["claims_a"], analysis["claims_b"]
    focus = analysis.get("focus_terms")
    progress("Re-ranking aligned claim pairs")
    pairs = rank_pairs(claims_a, claims_b, limit=50, focus=focus)
    comparable = [p for p in pairs if is_comparable(p)]
    kinds = [p["kind"] for p in comparable]
    top = _best_disagreement(claims_a, claims_b, focus)
    if top is None:
        # A semantic disagreement may have no directional keyword/term-overlap match.
        # Audit that failure honestly (rate can be zero), without overruling the model.
        if analysis.get('engine', '').startswith('Model-backed') and analysis.get('best_pair'):
            top = analysis['best_pair']
        else:
            raise ValueError("No defensible disagreement pair exists in this analysis")
    claim_a, claim_b = claims_a[top["a"]], claims_b[top["b"]]

    progress("Bootstrapping claim extraction")
    similarities, found = [], 0
    for _ in range(draws):
        resample_a = [claims_a[i] for i in rng.integers(0, len(claims_a), len(claims_a))]
        resample_b = [claims_b[i] for i in rng.integers(0, len(claims_b), len(claims_b))]
        best = _best_disagreement(resample_a, resample_b, focus)
        if best is not None:
            found += 1
            similarities.append(best["similarity"])
        else:
            similarities.append(0.0)
    ci = [float(v) for v in np.quantile(similarities, [0.025, 0.975])]
    disagreement_rate = found / draws

    progress("Section-exclusion sensitivity")
    sections = sorted({claim_a["section"], claim_b["section"]} | {"abstract", "results", "discussion"})
    sensitivity = []
    for section in sections:
        kept_a = [c for c in claims_a if c["section"] != section]
        kept_b = [c for c in claims_b if c["section"] != section]
        best = _best_disagreement(kept_a, kept_b, focus) if kept_a and kept_b else None
        sensitivity.append(
            {
                "excluded_section": section,
                "holds": best is not None,
                "similarity": best["similarity"] if best else 0.0,
                "kind": best["kind"] if best else "none",
            }
        )
    robust = disagreement_rate >= 0.8 and ci[0] >= 0.15 and all(s["holds"] for s in sensitivity)

    progress("Measuring evidence quality")
    stats_coverage = {
        "a": round(sum(bool(c["stats"]) for c in claims_a) / len(claims_a), 3),
        "b": round(sum(bool(c["stats"]) for c in claims_b) / len(claims_b), 3),
    }
    papers_meta = analysis["papers"]
    sample_sizes = {"a": papers_meta[0].get("sample_size"), "b": papers_meta[1].get("sample_size")}
    return {
        "method": method,
        "unit": "extracted claims from two uploaded papers (text evidence, not a shared dataset)",
        "n_claims": {"a": len(claims_a), "b": len(claims_b)},
        "top_pair": {
            "quote_a": claim_a["text"],
            "quote_b": claim_b["text"],
            "location_a": f"p. {claim_a['page']} · {claim_a['section']}",
            "location_b": f"p. {claim_b['page']} · {claim_b['section']}",
            "section_a": claim_a["section"],
            "section_b": claim_b["section"],
            "directions": [claim_a["direction"], claim_b["direction"]],
            "similarity": top["similarity"],
            "kind": top["kind"],
            "shared_terms": top["shared_terms"],
        },
        "similarity_ci95": ci,
        "disagreement_rate": round(disagreement_rate, 3),
        "opposed_pairs": kinds.count("opposed"),
        "tension_pairs": kinds.count("tension"),
        "aligned_pairs": kinds.count("aligned"),
        "comparable_pairs": len(comparable),
        "section_sensitivity": sensitivity,
        "stats_coverage": stats_coverage,
        "sample_sizes": sample_sizes,
        "condition_differences": analysis["condition_differences"],
        "robust_disagreement": bool(robust),
        "relationship": analysis["relationship"],
        "topic": analysis.get("topic"),
        "bootstrap_samples": draws,
        "seed": seed,
        "compute_seconds": perf_counter() - started,
        "null": "The detected disagreement is an artifact of which sentences were extracted.",
        "alternative": "The disagreement persists across claim resampling and section exclusion.",
        "assumptions": [
            "Claims are the sentences matched by the deterministic extraction rules.",
            "Term-overlap similarity is a proxy for semantic comparability, not a guarantee.",
            "Bootstrap treats extracted claims as exchangeable within each paper.",
        ],
        "limitations": [
            "Text-evidence analysis only; no shared primary dataset was re-analysed.",
            "Extraction rules can miss claims phrased without directional language.",
            "Robustness here means stability of the extraction, not truth of either paper.",
        ],
    }
