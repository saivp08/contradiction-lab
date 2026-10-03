# Two-minute demonstration

Before presenting, start the app and confirm the intended engine. **Use “Omnigent live” only after completing a successful credentialed sponsor run.** Otherwise introduce this as the tested local scientific loop and explain that sponsor execution remains credential-dependent. Keep a completed verified replay available as a clearly labeled alternative.

## 0:00–0:15 — The problem

“Contradiction Lab turns scientific disagreement into the next experiment. Here, penguin bill dimensions seem to tell opposite stories. Pool the species and the relationship is negative. Separate them and it becomes positive.”

Open with the home page, then the investigation page: real measurements on the left, the story on the right. Point to the evidence cards and clickable citation. “These are two analysis contexts from one published article, not fabricated conflicting papers.”

## 0:15–0:35 — Evidence and specialist work

Click **Start a debate** on the home page (or choose Omnigent in **New investigation** if configured). Narrate the Arena as specialists pass the question, claims and hypotheses between seats and the run pauses at your seat. “The workflow retrieves the source claims, checks that they concern comparable variables, and identifies species aggregation as the context difference.”

For local mode say “deterministic scientific specialists”; for a verified live sponsor run say “Omnigent dispatches the specialist agents.”

## 0:35–0:55 — Competing hypotheses

Show the hypothesis arena: species composition, sampling variability, and residual sex/year differences. “Each explanation has a prediction and a condition that would weaken it. These support scores are explicit heuristics, not scientific probabilities.”

## 0:55–1:15 — Experiment selection

Show species-adjusted regression beside year adjustment. “The planner ranks learning value, discrimination, coverage, feasibility and cost. Species adjustment most directly tests the differing context.”

The page switches to the Experiment tab. Click **Approve & run experiment** and review the dataset, seed and resampling count in the confirmation dialog before approving. “A model cannot bypass this gate.”

## 1:15–1:35 — Real computation

Watch the Critic fire five challenges at the result while Analysis answers each with a computed number: four rebutted, one (sex confounding) left open. Then show the real result: negative pooled slope, positive adjusted slope, bootstrap interval and ΔBIC. In the data panel, toggle **Color by species** and point to **Why the sign flips**: 71% of bill-length variation is between species, which outweighs the positive within-species slope. Open sensitivity details. “Python computed this from 342 observed birds. The record includes the data hash, code hash, seed and library versions.”

## 1:35–1:50 — The plan changes

Scroll to **Science moves when the plan changes**. “Species composition receives stronger support, sampling variability is weakened by this test, and other covariates remain unresolved. The next proposal now examines sex and year within species.”

“If the interval crossed zero or the sensitivity checks changed sign, the application would prioritize replication instead. Our tests recompute altered observations to verify that change.”

## 1:50–2:00 — Audit and measurable progress

Optionally run the approved follow-up (sex + year shrinks the slope by 65% but it stays positive). Show the **Research graph** tab and measured activity. “Two claims, three hypotheses, two tests compared, measured computation and decision time. No invented speedup.”

Click **Replay verified run**. “This is the persisted completed computation, checksum-verified and explicitly labeled replay.”

Finish: “The output is not only a summary. It is a tested explanation, an auditable result, and a different next scientific action.”

## Failure handling

If sponsor credentials, provider rate limits or the sponsor runtime fail, show the explicit failure. Do not imply that switching to local mode is still Omnigent. If network access disappears, the bundled reference data and existing verified replay remain available. If the dataset hash fails, restore the original dataset rather than substituting values.
