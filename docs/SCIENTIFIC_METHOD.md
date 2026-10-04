# Scientific method

## From two papers to a contradiction

1. **Extraction.** Each PDF is split into sections. Claim sentences are kept when they state a direction (increase, decrease, no significant effect, …) and are scored higher when they come from Results or carry statistics. A ratio estimate whose 95% interval crosses 1 is read as a null finding whatever verbs surround it.
2. **Alignment.** Claims from paper A and paper B are paired by shared content terms (overlap coefficient), with extra weight for terms both titles share. A pair is comparable only with at least three shared terms.
3. **Classification.** The strongest comparable pair decides the relationship: *direct contradiction* (opposite directions, high overlap, no extracted condition differences), *context-dependent disagreement* (conflict across differing populations, designs, doses or sample sizes), *complementary findings*, *insufficiently comparable*, or *no meaningful contradiction*. Only the first two start an investigation; the others end with an explanation and no investigation.

In live-agent mode, the Literature and Contradiction agents make these judgements themselves from the full passages, under the same validators; the rule-based analysis is preprocessing only.

## Hypotheses

H1: the extracted condition difference (for example population or age range) explains the disagreement. H2: methodological or measurement differences explain it. H3: sampling variability or selective extraction explains it. All start at a neutral 50/100. These are candidate explanations, not established facts.

## Experiments

Both experiments run on the extracted claims, seeded and bounded (100–2000 resamples):

- **E1 · Claim-alignment robustness audit.** Bootstrap-resamples each paper's claims and re-finds the strongest disagreement each time (disagreement rate, 95% interval of the top pair's similarity), then removes one section at a time to check the disagreement does not depend on a single section.
- **E2 · Condition-difference scan.** Profiles the extracted populations, designs, doses, age ranges and sample sizes of the two papers.

The planner ranks them with `0.35 × learning + 0.25 × discrimination + 0.20 × coverage + 0.15 × feasibility − 0.05 × cost`. Learning and discrimination are declared design assessments, not measured information. The disagreement counts as robust when it is found in at least 80% of resamples, the similarity interval's lower bound is at least 0.15, and it survives every section exclusion.

## Critique

| Challenge | Settled by |
|---|---|
| X1 The disagreement is cherry-picked from one section | Section-exclusion results |
| X2 It leans on abstracts, not reported results | Sections the quoted claims come from |
| X3 The papers are not comparable | Lower bound of the similarity interval |
| X4 Evidence strength can't be weighed without sample sizes | Whether both sample sizes were extracted |
| X5 No shared primary dataset was analysed | Always open: text evidence cannot settle which paper is right |

## Interpretation rubric

| Observed outcome | H1 / H2 / H3 support | Next action |
|---|---|---|
| Robust disagreement with extracted condition differences | 75 / 55 / 25 | Design a comparison holding the differing condition constant |
| Robust disagreement, no extracted differences | 45 / 65 / 30 | Audit methods and measures across the two papers |
| Not robust | 35 / 40 / 70 | Treat the disagreement as unestablished; replicate the extraction |

Scores are a disclosed heuristic, not probabilities. The decision reads the computed numbers; it does not pick a prewritten ending.

## Limits

The experiments measure the stability of the extracted evidence, not the truth of either paper. Extraction can miss claims phrased without directional language. Term overlap is a proxy for comparability, not semantic equivalence. Proposed next experiments are recorded, not executed: they need primary data the papers do not contain.
