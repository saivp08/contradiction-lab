"""Build checked-in provenance catalog; never creates scientific measurements."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = "https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv"
manifest = {"name": "Palmer Penguins", "source": source, "license": "CC0-1.0", "license_url": "https://allisonhorst.github.io/palmerpenguins/LICENSE.html", "retrieved_at": "2026-10-03", "sha256": hashlib.sha256((ROOT / "data/penguins.csv").read_bytes()).hexdigest(), "version": "vendored snapshot 2026-10-03 (content-addressed)", "preprocessing": "Drop only rows missing bill length, bill depth, species or year; no imputation."}
(ROOT / "data/manifest.json").write_text(json.dumps(manifest, indent=2))
citation = {"title": "Palmer Archipelago Penguins Data in the palmerpenguins R Package - An Alternative to Anderson's Irises", "authors": ["Allison M. Horst", "Alison Presmanes Hill", "Kristen B. Gorman"], "year": 2022, "identifier": "10.32614/RJ-2022-020", "url": "https://journal.r-project.org/articles/RJ-2022-020/", "location": "Continuous quantitative variables; discussion of bill dimensions and Simpson's paradox", "retrieved_at": "2026-10-03"}
evidence = []
for identifier, direction, claim, aggregation in [("EV1", "negative", "Bill length and depth show a negative association when species are pooled.", "All species pooled"), ("EV2", "positive", "Within species, bill length and depth show positive associations.", "Species separated")]:
    evidence.append({"evidence_id": identifier, "source": "Curated literature extract (one article, two analysis contexts)", "citation": citation, "claim": claim, "direction_of_effect": direction, "population_or_system": "Palmer Archipelago penguins, 2007–2009", "intervention_or_variable": "Bill length (mm)", "outcome": "Bill depth (mm)", "sample_size_if_known": None, "experimental_conditions": {"aggregation": aggregation, "system": "Same observational dataset", "measurement": "Bill morphometry", "period": "2007–2009"}, "methodology": "Published exploratory visual comparison; reproduced with regression in this application.", "limitations": ["Not two independent studies.", "Aggregation changes the estimand; this is an apparent contradiction, not a refutation."], "confidence": "high", "provenance": {"retrieval": "Manually curated from the linked primary article, not live search", "dataset_sha256": manifest["sha256"], "evidence_location": citation["location"]}})
(ROOT / "data/evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
