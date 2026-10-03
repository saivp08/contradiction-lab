"""Allowlisted, deterministic reanalysis of real observational data."""
import hashlib
import json
from pathlib import Path
from time import perf_counter
from collections.abc import Callable

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "penguins.csv"


def load_data() -> tuple[pd.DataFrame, dict]:
    raw = DATA.read_bytes()
    manifest = json.loads((ROOT / "data" / "manifest.json").read_text())
    digest = hashlib.sha256(raw).hexdigest()
    if digest != manifest["sha256"]:
        raise ValueError("Dataset checksum differs from the approved reference. Restore or explicitly re-version the dataset.")
    frame = pd.read_csv(DATA)
    required = {"species", "bill_length_mm", "bill_depth_mm", "year", "sex"}
    if not required.issubset(frame.columns):
        raise ValueError("Dataset schema mismatch")
    clean = frame.dropna(subset=["species", "bill_length_mm", "bill_depth_mm", "year"]).copy()
    if len(clean) < 30 or clean.species.nunique() < 2:
        raise ValueError("Insufficient evidence: require 30 observations and two species")
    if not np.isfinite(clean[["bill_length_mm", "bill_depth_mm"]].to_numpy()).all():
        raise ValueError("Non-finite measurements")
    return clean, {**manifest, "n_raw": len(frame), "n_complete": len(clean), "n_dropped": len(frame) - len(clean)}


def slope(x: np.ndarray, y: np.ndarray) -> float:
    centered = x - x.mean()
    denominator = centered @ centered
    if denominator < 1e-12:
        raise ValueError("Insufficient predictor variation")
    return float(centered @ (y - y.mean()) / denominator)


def adjusted(frame: pd.DataFrame, group: str = "species") -> float:
    centered = frame[["bill_length_mm", "bill_depth_mm"]] - frame.groupby(group)[["bill_length_mm", "bill_depth_mm"]].transform("mean")
    return slope(centered.bill_length_mm.to_numpy(), centered.bill_depth_mm.to_numpy())


def compute(frame: pd.DataFrame, method: str, seed: int, draws: int, progress: Callable[[str], None] = lambda _: None) -> dict:
    if method not in {"species_adjustment", "year_sensitivity"}:
        raise ValueError("Experiment tool is not allowlisted")
    started = perf_counter()
    rng = np.random.default_rng(seed)
    x, y = frame.bill_length_mm.to_numpy(), frame.bill_depth_mm.to_numpy()
    progress("Preparing variables")
    group = "species" if method == "species_adjustment" else "year"
    pooled, conditional = slope(x, y), adjusted(frame, group)
    progress("Running analysis")
    groups = [part for _, part in frame.groupby(group)]
    centered = frame[["bill_length_mm", "bill_depth_mm"]] - frame.groupby(group)[["bill_length_mm", "bill_depth_mm"]].transform("mean")
    intercepts = frame.groupby(group).bill_depth_mm.transform("mean") - conditional * frame.groupby(group).bill_length_mm.transform("mean")
    residual = y - (intercepts.to_numpy() + conditional * x)
    pooled_residual = y - (y.mean() + pooled * (x - x.mean()))
    progress("Computing uncertainty")
    boots = []
    for _ in range(draws):
        sample = pd.concat([part.iloc[rng.integers(0, len(part), len(part))] for part in groups], ignore_index=True)
        boots.append(adjusted(sample, group))
    ci = [float(v) for v in np.quantile(boots, [.025, .975])]
    subgroup = [{"group": str(name), "n": len(part), "slope": slope(part.bill_length_mm.to_numpy(), part.bill_depth_mm.to_numpy())} for name, part in frame.groupby(group)]
    sensitivity = [{"excluded_year": int(year), "slope": adjusted(frame[frame.year != year], group)} for year in sorted(frame.year.unique())]
    rho = float(spearmanr(centered.bill_length_mm, centered.bill_depth_mm).statistic)
    progress("Generating visualization")
    points = [{"x": float(row.bill_length_mm), "y": float(row.bill_depth_mm), "species": row.species, "year": int(row.year)} for row in frame.itertuples()]
    return {
        "method": method, "group": group, "n": len(frame), "pooled_slope": pooled,
        "adjusted_slope": conditional, "adjusted_ci95": ci, "subgroups": subgroup,
        "sensitivity": sensitivity, "within_group_spearman": rho,
        "pooled_rmse": float(np.sqrt(np.mean(pooled_residual**2))),
        "adjusted_rmse": float(np.sqrt(np.mean(residual**2))),
        "reversal": bool(pooled * conditional < 0),
        "robust_reversal": bool(pooled < 0 < ci[0] and all(v["slope"] > 0 for v in sensitivity)),
        "points": points, "bootstrap_samples": draws, "seed": seed,
        "compute_seconds": perf_counter() - started,
        "null": "The within-group linear slope is zero.",
        "alternative": "The within-group slope is positive despite the negative pooled slope.",
        "assumptions": ["Linear common within-group slope; subgroup slopes shown to assess heterogeneity.", "Bootstrap treats birds as independent within strata; colony clustering may narrow intervals.", "Complete-case analysis; missingness may be informative."],
        "limitations": ["Observational association, not causation.", "Exploratory reanalysis of a known reversal, not a new scientific discovery.", "Bootstrap intervals are conditional on grouping and do not adjust for selection.", "In-sample RMSE is descriptive, not held-out predictive performance."]
    }
