# Responsible AI and human control

- Humans set the objective. The reference scope and fixed dataset are disclosed in the creation dialog.
- The planner stops before computational execution. The API requires a valid, affirmative approval for exactly one proposed experiment; duplicate or out-of-state approvals fail.
- No tool available to sponsor agents can manufacture approval or execute arbitrary generated code.
- The next experimental proposal requires new approval. This release records that proposal rather than automatically performing another cycle.
- Source facts, candidate explanations, numerical results and interpretation are separate object types. Citations link to the primary source and retain retrieval context.
- Local mode uses deterministic reference hypotheses and is visibly distinct from model-backed sponsor execution. Replay is visibly distinct from both.
- Confidence intervals, assumptions and sensitivity checks are shown. Support scores are heuristic, not probabilities. Correlation is not causation; no clinical conclusions are appropriate.
- Safety validation checks citation schemas, approval, object lineage and experiment provenance. This is not a claim of comprehensive automated scientific fact checking. Human review is still necessary, especially for generated text.
- Provider stdout/stderr is not exported; only digests and exit metadata are retained. Agent tools expose concise scientific rationale, not hidden chain-of-thought.
- Keys remain in backend environment variables. No secrets are stored in frontend bundles, research records or checked-in configuration. Provider-side account billing and retention settings remain the operator's responsibility.
- The server binds to loopback by default, restricts cross-origin writes and sets basic browser security headers. There is no authentication or authorization system for multi-user internet hosting. Keep this prototype local.
- Experiment operations are fixed, compute-bounded and reproducible. Data checksum mismatches and unknown tools fail closed. No silent synthetic-data fallback or sponsor fallback exists.
- Discovery activity is measured directly. No unmeasured speedup, novelty or human-hours-saved claim is made.
