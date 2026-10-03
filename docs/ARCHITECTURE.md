# Architecture

The repository started empty. Installed Python scientific libraries were reusable; there was no application, environment configuration, test suite, API integration, dataset or Omnigent installation. Official Omnigent 0.16.0 was installed and inspected before integration.

## Components

- `frontend/src`: React/TypeScript app with hash routing. `pages/Home.tsx` is the investigation dashboard (key numbers, stage progress, replay links). `pages/Investigation.tsx` is a split view: `panels/InstrumentPanel.tsx` (sticky data panel: key numbers, scatter, slope decomposition; research graph; activity timeline) beside the investigation stages as tabs, one per component in `chapters/`, with approval confirmation dialogs. The page switches to the Experiment tab when approval is needed and to the Result tab when the result arrives. Real-data SVG plots, no frontend provider credentials. Subscribes to a server-sent event stream while work is active (polling fallback); no staged fake event text.
- `backend/main.py`: typed FastAPI routes, background execution, approval endpoint, export/replay, local-origin write guard, static frontend serving.
- `backend/models.py`: strict Pydantic scientific contracts. Reject extra fields, invalid URLs, unbounded bootstrap requests and unknown experiment methods.
- `backend/workflow.py`: validates stage progression, records handoffs and approval, invokes scientific functions, seals completed records. This is the local runner and the permission boundary for sponsor-issued tool calls; it is not advertised as Omnigent.
- `backend/omnigent_adapter.py`: invokes the official CLI without a shell, with explicit phase config and bounded timeout. Live routing is performed by Omnigent's declared sub-agent tools. No fallback on sponsor failure.
- `backend/omnigent_tools.py`: specialist capabilities. No approval tool, arbitrary execution tool, deletion tool or general network tool.
- `experiments/penguins.py`: pure numerical core with limited approved methods.
- `backend/store.py`: SQLite WAL persistence, UUID object identities, event log, JSON export and checksum verification.
- `data`: original real CSV, checksum manifest, curated evidence catalog and completed real local replay.

## State and handoffs

`created → investigating → awaiting_approval → approved → running → complete`

Failures become `failed`; incomparable evidence can end in `no_contradiction`. Each mutation is guarded by a per-investigation lock in the single API process. SQLite serializes writes. Do not deploy multiple API worker processes without replacing those locks with database-level compare-and-swap transitions.

Every scientific object has ID, kind, timestamp, input IDs and structured data. Every event retains agent, action, tool, input/output IDs, timestamp, elapsed time, status and citations. A result points to a run, which points to a proposal, hypotheses, contradiction and source evidence. Interpretation points to actual result IDs. Only concise scientific rationale is displayed; provider output and private reasoning are not surfaced.

The approval request may select the planner recommendation or the alternative. It validates the candidate ID and current state; repeated approvals return conflict. New experiments are not started by a decision object alone.

## Replay

A SHA-256 covers objective, engine, objects, events, approval and metrics. Replay requires `complete` and a matching digest. The checksum detects accidental edits; it is not a digital signature against a malicious party able to rewrite the database. Original engine attribution remains visible. Replay performs no scientific or provider calls.

## Runtime limits

Local single-user design; no distributed infrastructure. Background jobs are in-process. A process termination can leave an interrupted record reconstructable but unfinished; start a new investigation rather than assuming automatic resume. Custom objectives are contextual only; this release supports one dataset and registered scientific question family. Do not claim generic discovery across arbitrary domains.
