# Scientific method

## Evidence versus explanation

The two catalog entries are paraphrased findings from [Horst, Hill and Gorman (2022)](https://journal.r-project.org/articles/RJ-2022-020/), describing pooled versus species-separated bill dimensions. The article is the source of those claims, not the source of our newly computed regression coefficients. The differing estimands create an apparent contradiction; no independent studies are portrayed as disagreeing.

H1: species composition explains the reversal. H2: sampling variability explains it. H3: sex/year effects explain residual association. Local mode uses curated reference candidates; live Omnigent mode generates structured wording, rationale, predictions and falsification conditions within these registered categories. These hypotheses are not established facts.

## Candidate selection

E1 fits species adjustment. E2 fits year adjustment. Both use the same complete cases and the same reproducibility parameters. The planner's heuristic is:

`0.35 × learning + 0.25 × discrimination + 0.20 × coverage + 0.15 × feasibility − 0.05 × cost`.

Learning and discrimination are declared design assessments, not measured information entropy. Coverage is computed from complete cases / all rows. Both tools are feasible on a local CPU. Species adjustment directly addresses the contextual difference in the source claims, so it ranks first. Human selection of E2 is supported and its actual result takes a different decision path.

## Execution

- Variables: bill length X (mm), bill depth Y (mm), grouping species or year.
- Pooled OLS slope: centered cross-product divided by centered X sum of squares.
- Adjusted common slope: demean X and Y within group, then fit the centered slope. Equivalent to OLS with group intercepts and a common X slope.
- Null: conditional linear slope equals zero. Directional alternative: positive conditional slope despite a negative pooled slope.
- Uncertainty: 500 bootstrap replicates, sampled with replacement separately within the specified strata; 2.5th and 97.5th percentiles. Seed 42. The app restricts resampling counts to bounded ranges.
- Assumption checks: individual group slopes, within-group Spearman association, leave-one-year-out adjusted slopes. These are diagnostics, not exhaustive model validation.
- RMSE is in-sample descriptive fit, not test-set generalization performance.
- Charts: actual complete-case points and computed slopes; adjusted confidence interval displayed explicitly.

## Interpretation rubric

All initial support scores are 50/100, a neutral heuristic convention.

| Observed outcome | H1 / H2 / H3 scores | Next action |
|---|---|---|
| Species grouping; negative pooled slope; adjusted CI entirely positive; every year exclusion positive | 85 / 20 / 50 | Study sex/year effects within species |
| CI includes zero or a year exclusion changes the adjusted sign | 40 / 70 / 50 | Prioritize replication and stability |
| Otherwise | 25 / 35 / 65 | Reconsider species and alternative covariates |

These numbers are neither objective probabilities nor mutually exclusive posterior weights. H3 remains untested by the primary model. Positive support for H1 cannot establish a causal mechanism. The decision function reads numerical result data; it does not inspect an experiment name to select a prewritten successful ending. Tests alter the actual observations, recompute the analysis and confirm a changed next action.

## Limits

Same-source exploratory reanalysis; known example rather than new discovery. Selection of this illustrative dataset means inferential intervals are descriptive and conditional on the chosen analysis. Complete-case exclusion may introduce bias. Independence of birds within strata is assumed; colony/year dependence is not fully modeled. Species, island and sex may be associated. Measurement error and nonlinear relationships are not comprehensively evaluated. Follow-up recommendations are proposals, not executed evidence.
