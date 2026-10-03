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
        raise ValueError(
            "Dataset checksum differs from the approved reference. Restore or explicitly re-version the dataset."
        )
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
    centered = frame[["bill_length_mm", "bill_depth_mm"]] - frame.groupby(group)[
        ["bill_length_mm", "bill_depth_mm"]
    ].transform("mean")
    return slope(centered.bill_length_mm.to_numpy(), centered.bill_depth_mm.to_numpy())


def stratified_bootstrap(groups: list[tuple[np.ndarray, np.ndarray]], rng: np.random.Generator, draws: int) -> list:
    """Within-group slope per resample. Draws indices in the same order as resampling each group in turn."""
    boots = []
    for _ in range(draws):
        sxy = sxx = 0.0
        for gx, gy in groups:
            index = rng.integers(0, len(gx), len(gx))
            cx, cy = gx[index] - gx[index].mean(), gy[index] - gy[index].mean()
            sxy, sxx = sxy + cx @ cy, sxx + cx @ cx
        if sxx < 1e-12:
            raise ValueError("Insufficient predictor variation")
        boots.append(sxy / sxx)
    return boots


def bic(rss: float, n: int, parameters: int) -> float:
    return float(n * np.log(rss / n) + parameters * np.log(n))


def model_comparison(pooled_rss: float, adjusted_rss: float, n: int, groups: int, label: str) -> dict:
    """BIC comparison; the BIC difference approximates 2 × log Bayes factor under unit-information priors."""
    pooled_bic, adjusted_bic = bic(pooled_rss, n, 3), bic(adjusted_rss, n, groups + 2)
    delta = pooled_bic - adjusted_bic
    return {
        "pooled_bic": pooled_bic,
        "adjusted_bic": adjusted_bic,
        "delta_bic": delta,
        "log10_bayes_factor": float(delta / 2 / np.log(10)),
        "favored_model": label if delta > 0 else "pooled",
        "note": "Positive ΔBIC favors the adjusted model. ΔBIC > 10 is conventionally very strong evidence. "
        "BIC approximates the Bayes factor; it is not an exact posterior probability.",
    }


METHODS = {"species_adjustment", "year_sensitivity", "species_sex_year"}


def compute(
    frame: pd.DataFrame, method: str, seed: int, draws: int, progress: Callable[[str], None] = lambda _: None
) -> dict:
    if method not in METHODS:
        raise ValueError("Experiment tool is not allowlisted")
    if method == "species_sex_year":
        return covariate_adjusted(frame, seed, draws, progress)
    started = perf_counter()
    rng = np.random.default_rng(seed)
    x, y = frame.bill_length_mm.to_numpy(), frame.bill_depth_mm.to_numpy()
    progress("Preparing variables")
    group = "species" if method == "species_adjustment" else "year"
    pooled, conditional = slope(x, y), adjusted(frame, group)
    progress("Running analysis")
    groups = [(part.bill_length_mm.to_numpy(), part.bill_depth_mm.to_numpy()) for _, part in frame.groupby(group)]
    centered = frame[["bill_length_mm", "bill_depth_mm"]] - frame.groupby(group)[
        ["bill_length_mm", "bill_depth_mm"]
    ].transform("mean")
    intercepts = frame.groupby(group).bill_depth_mm.transform("mean") - conditional * frame.groupby(
        group
    ).bill_length_mm.transform("mean")
    residual = y - (intercepts.to_numpy() + conditional * x)
    pooled_residual = y - (y.mean() + pooled * (x - x.mean()))
    progress("Computing uncertainty")
    boots = stratified_bootstrap(groups, rng, draws)
    ci = [float(v) for v in np.quantile(boots, [0.025, 0.975])]
    subgroup = [
        {
            "group": str(name),
            "n": len(part),
            "slope": slope(part.bill_length_mm.to_numpy(), part.bill_depth_mm.to_numpy()),
        }
        for name, part in frame.groupby(group)
    ]
    sensitivity = [
        {"excluded_year": int(year), "slope": adjusted(frame[frame.year != year], group)}
        for year in sorted(frame.year.unique())
    ]
    rho = float(spearmanr(centered.bill_length_mm, centered.bill_depth_mm).statistic)
    progress("Generating visualization")
    points = [
        {"x": float(row.bill_length_mm), "y": float(row.bill_depth_mm), "species": row.species, "year": int(row.year)}
        for row in frame.itertuples()
    ]
    return {
        "method": method,
        "group": group,
        "n": len(frame),
        "pooled_slope": pooled,
        "adjusted_slope": conditional,
        "adjusted_ci95": ci,
        "subgroups": subgroup,
        "sensitivity": sensitivity,
        "within_group_spearman": rho,
        "pooled_rmse": float(np.sqrt(np.mean(pooled_residual**2))),
        "adjusted_rmse": float(np.sqrt(np.mean(residual**2))),
        "model_comparison": model_comparison(
            float(pooled_residual @ pooled_residual), float(residual @ residual), len(frame), len(groups), group
        ),
        "reversal": bool(pooled * conditional < 0),
        "robust_reversal": bool(pooled < 0 < ci[0] and all(v["slope"] > 0 for v in sensitivity)),
        "points": points,
        "bootstrap_samples": draws,
        "seed": seed,
        "compute_seconds": perf_counter() - started,
        "null": "The within-group linear slope is zero.",
        "alternative": "The within-group slope is positive despite the negative pooled slope.",
        "assumptions": [
            "Linear common within-group slope; subgroup slopes shown to assess heterogeneity.",
            "Bootstrap treats birds as independent within strata; colony clustering may narrow intervals.",
            "Complete-case analysis; missingness may be informative.",
        ],
        "limitations": [
            "Observational association, not causation.",
            "Exploratory reanalysis of a known reversal, not a new scientific discovery.",
            "Bootstrap intervals are conditional on grouping and do not adjust for selection.",
            "In-sample RMSE is descriptive, not held-out predictive performance.",
        ],
    }


def design(frame: pd.DataFrame) -> np.ndarray:
    dummies = pd.get_dummies(frame[["species", "sex"]].assign(year=frame.year.astype(str)), drop_first=True)
    return np.column_stack([np.ones(len(frame)), frame.bill_length_mm.to_numpy(), dummies.to_numpy(dtype=float)])


def fit(frame: pd.DataFrame) -> tuple[float, float]:
    """Least-squares slope of bill length with species, sex and year indicators; returns (slope, RSS)."""
    matrix, target = design(frame), frame.bill_depth_mm.to_numpy()
    coefficients, *_ = np.linalg.lstsq(matrix, target, rcond=None)
    residual = target - matrix @ coefficients
    return float(coefficients[1]), float(residual @ residual)


def covariate_adjusted(frame: pd.DataFrame, seed: int, draws: int, progress: Callable[[str], None]) -> dict:
    """Follow-up test: does the within-species slope survive adjustment for sex and year?"""
    started = perf_counter()
    rng = np.random.default_rng(seed)
    progress("Preparing variables")
    data = frame.dropna(subset=["sex"]).reset_index(drop=True)
    x, y = data.bill_length_mm.to_numpy(), data.bill_depth_mm.to_numpy()
    pooled = slope(x, y)
    progress("Running analysis")
    species_only = adjusted(data, "species")
    conditional, rss = fit(data)
    pooled_residual = y - (y.mean() + pooled * (x - x.mean()))
    progress("Computing uncertainty")
    strata = [part.index.to_numpy() for _, part in data.groupby("species")]
    boots = []
    for _ in range(draws):
        index = np.concatenate([rows[rng.integers(0, len(rows), len(rows))] for rows in strata])
        boots.append(fit(data.iloc[index])[0])
    ci = [float(v) for v in np.quantile(boots, [0.025, 0.975])]
    subgroup = [
        {
            "group": f"{species} {sex}",
            "n": len(part),
            "slope": slope(part.bill_length_mm.to_numpy(), part.bill_depth_mm.to_numpy()),
        }
        for (species, sex), part in data.groupby(["species", "sex"])
    ]
    sensitivity = [
        {"excluded_year": int(year), "slope": fit(data[data.year != year])[0]} for year in sorted(data.year.unique())
    ]
    parameters = design(data).shape[1]
    progress("Generating visualization")
    points = [
        {"x": float(row.bill_length_mm), "y": float(row.bill_depth_mm), "species": row.species, "year": int(row.year)}
        for row in data.itertuples()
    ]
    comparison = model_comparison(
        float(pooled_residual @ pooled_residual), rss, len(data), parameters - 2, "species + sex + year"
    )
    return {
        "method": "species_sex_year",
        "group": "species + sex + year",
        "n": len(data),
        "pooled_slope": pooled,
        "species_only_slope": species_only,
        "adjusted_slope": conditional,
        "adjusted_ci95": ci,
        "subgroups": subgroup,
        "sensitivity": sensitivity,
        "pooled_rmse": float(np.sqrt(np.mean(pooled_residual**2))),
        "adjusted_rmse": float(np.sqrt(rss / len(data))),
        "model_comparison": comparison,
        "reversal": bool(pooled * conditional < 0),
        "robust_reversal": bool(pooled < 0 < ci[0] and all(v["slope"] > 0 for v in sensitivity)),
        "attenuation": float(1 - conditional / species_only) if species_only else 0.0,
        "points": points,
        "bootstrap_samples": draws,
        "seed": seed,
        "compute_seconds": perf_counter() - started,
        "null": "The bill length slope is zero after adjusting for species, sex and year.",
        "alternative": "A positive slope remains after adjusting for species, sex and year.",
        "assumptions": [
            "Linear model with a common slope and additive species, sex and year indicators.",
            "Bootstrap resamples birds within species; colony clustering may narrow intervals.",
            "Complete cases including recorded sex.",
        ],
        "limitations": [
            "Observational association, not causation.",
            "Follow-up to a known reversal; exploratory, not confirmatory.",
            "Sex and year are measured covariates only; unmeasured differences may remain.",
        ],
    }
