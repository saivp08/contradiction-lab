import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Beaker,
  Check,
  ChevronRight,
  FlaskConical,
  GitBranch,
  Info,
  Layers3,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  objects,
  type Dataset,
  type Decision,
  type Evidence,
  type Experiment,
  type FollowupDecision,
  type HistoryItem,
  type Hypothesis,
  type LabObject,
  type RecordData,
  type Result,
  type Update,
} from './types';
import { REFERENCE_QUESTION, RESTING, STAGES, api, experimentTitle } from './lib';
import { QuestionChapter } from './chapters/QuestionChapter';
import { EvidenceChapter } from './chapters/EvidenceChapter';
import { ContradictionChapter } from './chapters/ContradictionChapter';
import { HypothesesChapter } from './chapters/HypothesesChapter';
import { ExperimentChapter } from './chapters/ExperimentChapter';
import { ResultChapter } from './chapters/ResultChapter';
import { DecisionChapter } from './chapters/DecisionChapter';
import { AgentPanel } from './panels/AgentPanel';
import { GraphView, Notebook } from './panels/Notebook';
import { ApprovalDialog, NewInvestigationDialog, ProvenanceDialog, WorkspaceDialog } from './panels/Dialogs';

type Pending = { kind: 'experiment'; experiment: Experiment } | { kind: 'followup' } | null;

const VIEWS = [
  { name: 'Overview', label: 'Investigation', icon: Layers3 },
  { name: 'Research graph', label: 'Graph', icon: GitBranch },
  { name: 'Lab notebook', label: 'Notebook', icon: Beaker },
];

/** Traps Tab focus inside the top-most open dialog and locks page scroll while any dialog is open. */
function useDialogFocus(open: boolean, key: unknown) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
      .filter((d) => !d.hasAttribute('inert'))
      .at(-1);
    if (!dialog) return;
    const selector = 'button:not(:disabled),a[href],input,textarea,select,summary,[tabindex="0"]';
    const controls = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.getClientRects().length > 0,
      );
    controls()[0]?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const elements = controls(),
        first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, key]);
}

export default function App() {
  const [record, setRecord] = useState<RecordData | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('local');
  const [tab, setTab] = useState('Overview');
  const [chapter, setChapter] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [selected, setSelected] = useState<LabObject | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [reference, setReference] = useState<Evidence[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);

  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setAgentsOpen(false);
      setSwitcher(false);
      setNewOpen(false);
      setSelected(null);
      setPending(null);
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const dialogOpen = newOpen || !!selected || switcher || agentsOpen || !!pending;
  useDialogFocus(dialogOpen, [newOpen, selected?.id, switcher, agentsOpen, pending?.kind].join());
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [chapter, tab]);

  useEffect(() => {
    api<{ omnigent_ready: boolean }>('/health')
      .then((h) => {
        setReady(h.omnigent_ready);
        if (h.omnigent_ready) setMode('omnigent');
      })
      .catch((e) => setError(e.message));
    api<{ evidence: Evidence[]; dataset: Dataset }>('/reference')
      .then((r) => {
        setReference(r.evidence);
        setDataset(r.dataset);
      })
      .catch((e) => setError(e.message));
    refreshHistory();
  }, []);
  function refreshHistory() {
    api<HistoryItem[]>('/investigations')
      .then(setHistory)
      .catch((e) => setError(e.message));
  }

  // Live updates: server-sent events while work is in progress, falling back to polling if the stream fails.
  const settled = !record || record.display_mode === 'replay' || RESTING.includes(record.status);
  useEffect(() => {
    if (settled || !record) return;
    const id = record.id;
    let timer: number | undefined;
    const receive = (r: RecordData) => {
      setRecord(r);
      if (RESTING.includes(r.status)) {
        source.close();
        window.clearInterval(timer);
        refreshHistory();
      }
    };
    const source = new EventSource(`/api/investigations/${id}/stream`);
    source.onmessage = (e) => receive(JSON.parse(e.data));
    source.onerror = () => {
      source.close();
      if (timer) return;
      timer = window.setInterval(
        () =>
          api<RecordData>('/investigations/' + id)
            .then(receive)
            .catch((e) => setError(e.message)),
        1000,
      );
    };
    return () => {
      source.close();
      window.clearInterval(timer);
    };
  }, [record?.id, settled]);

  async function act(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const start = () =>
    act(async () => {
      const r = await api<RecordData>('/investigations', {
        method: 'POST',
        body: JSON.stringify({ objective: REFERENCE_QUESTION, label: label.trim() || null, mode, seed: 42 }),
      });
      setRecord(r);
      setChapter(1);
      setTab('Overview');
      setNewOpen(false);
      setLabel('');
      refreshHistory();
    });
  const approve = (id: string) =>
    act(async () => {
      if (!record) return;
      setPending(null);
      setChapter(5);
      setRecord(
        await api<RecordData>(`/investigations/${record.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ experiment_id: id, approved: true }),
        }),
      );
    });
  const runFollowup = () =>
    act(async () => {
      if (!record) return;
      setPending(null);
      setRecord(
        await api<RecordData>(`/investigations/${record.id}/followup`, {
          method: 'POST',
          body: JSON.stringify({ approved: true }),
        }),
      );
    });
  async function load(id: string, replay = false) {
    setError('');
    try {
      setRecord(await api<RecordData>(`/investigations/${id}${replay ? '/replay' : ''}`));
      setTab('Overview');
      setChapter(replay ? chapter : 0);
      setSwitcher(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const evidence = record ? objects<Evidence>(record, 'evidence') : reference;
  const hypotheses = objects<Hypothesis>(record, 'hypothesis');
  const experiments = objects<Experiment>(record, 'experiment').filter((e) => !e.followup);
  const result = objects<Result>(record, 'result')[0];
  const updates = objects<{ updates: Update[] }>(record, 'analysis')[0]?.updates;
  const decision = objects<Decision>(record, 'decision')[0];
  const followupResult = objects<Result>(record, 'followup_result')[0];
  const followup = objects<FollowupDecision>(record, 'followup_decision')[0];
  const isReplay = record?.display_mode === 'replay';
  const live = (record?.mode || mode) === 'omnigent';
  const reached = record
    ? record.stage >= 7
      ? 6
      : record.stage >= 5
        ? 5
        : record.stage >= 4
          ? 4
          : record.stage
    : -1;
  const done = (i: number) => !!record && (i < reached || record.status === 'complete');
  const status = isReplay
    ? 'Verified replay'
    : record
      ? 'Investigation ' + record.status.replaceAll('_', ' ')
      : 'Not started';
  const working = !!record && !isReplay && !RESTING.includes(record.status);
  const findObject = (kind: string) => {
    const o = Object.values(record?.objects || {}).find((o) => o.kind === kind);
    if (o) setSelected(o);
  };
  const go = (i: number) => {
    setTab('Overview');
    setChapter(i);
  };

  const runInfo = isReplay
    ? {
        label: 'Verified replay',
        about: `A saved, checksum-verified record of a completed run. Nothing is recomputed. Originally run with ${
          record?.mode === 'omnigent' ? 'live AI agents' : 'rule-based specialists'
        }.`,
      }
    : live
      ? {
          label: 'Live AI agents · real computation',
          about:
            'Language-model agents (via Omnigent) choose and sequence the steps. All numbers come from Python code, not the model.',
        }
      : {
          label: 'Rule-based run · real computation',
          about:
            'Each step is a fixed, deterministic function — no language model is involved. The statistics are computed on the real dataset; the hypotheses and experiment options are pre-registered.',
        };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-icon" href="/" aria-label="Contradiction Lab">
          <FlaskConical size={25} />
        </a>
        <nav className="rail-nav" aria-label="Views">
          {VIEWS.map(({ name, label, icon: Icon }) => (
            <button
              key={name}
              aria-label={name}
              aria-current={tab === name ? 'page' : undefined}
              className={'nav-item ' + (tab === name ? 'active' : '')}
              onClick={() => setTab(name)}
            >
              <Icon size={20} />
              <span aria-hidden="true">{label}</span>
            </button>
          ))}
        </nav>
        <ShieldCheck className="rail-status" size={20} aria-hidden="true" />
      </aside>
      <div className={'main-shell ' + (chapter > 0 || tab !== 'Overview' ? 'focused' : 'opening')}>
        <header className="topbar">
          <a href="/" className="wordmark">
            contradiction<span>lab</span>
          </a>
          <button className="workspace-switch" onClick={() => setSwitcher(true)}>
            <span>
              <span className="hide-small">Scientific </span>workspace
            </span>
            <ChevronRight size={15} />
          </button>
          <button className="text-button" onClick={() => setNewOpen(true)}>
            <Plus size={16} />
            <span className="hide-small">New investigation</span>
          </button>
          <button
            className={'agents-trigger ' + (working ? 'working' : '')}
            onClick={() => setAgentsOpen(!agentsOpen)}
            aria-expanded={agentsOpen}
            aria-label={`Agents: ${record?.events.length || 0} events`}
          >
            <span className="live-dot" />
            <span className="hide-small">Agents</span> <span>{record?.events.length || 0}</span>
          </button>
        </header>
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              INVESTIGATION <span>/</span> PENGUIN MORPHOLOGY
              {record?.label && (
                <>
                  <span>/</span>
                  {record.label.toUpperCase()}
                </>
              )}
            </div>
            <h1>Same evidence. Opposite conclusions.</h1>
            {(chapter > 0 || tab !== 'Overview') && <p>{record?.objective || REFERENCE_QUESTION}</p>}
          </div>
          <div className="intro-actions">
            {record?.status === 'complete' && !isReplay && (
              <button className="button" onClick={() => load(record.id, true)}>
                <RotateCcw size={15} />
                Replay verified run
              </button>
            )}
            <button
              className="button primary"
              onClick={() => (record ? setNewOpen(true) : start())}
              disabled={busy}
            >
              <Play size={15} />
              {busy && !record ? 'Starting…' : 'Run investigation'}
            </button>
          </div>
        </div>
        <div className={'mode-strip ' + (isReplay ? 'replay' : '')}>
          <span>
            <i className="status-dot" />
            {isReplay ? 'REPLAY VERIFIED RUN' : runInfo.label.toUpperCase()}
          </span>
          <details className="run-about">
            <summary>
              <Info size={13} />
              About this run
            </summary>
            <p>{runInfo.about}</p>
          </details>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {record?.error && (
          <div className="error" role="alert">
            {record.error}
          </div>
        )}
        <nav className="progress-rail" aria-label="Investigation stages">
          {STAGES.map((s, i) => (
            <button
              key={s}
              aria-current={chapter === i && tab === 'Overview' ? 'step' : undefined}
              className={(done(i) ? 'done ' : '') + (i === chapter && tab === 'Overview' ? 'current' : '')}
              onClick={() => go(i)}
            >
              <span className="step-number">
                {String(i + 1).padStart(2, '0')}
                {done(i) && <Check size={14} className="step-check" aria-label="completed" />}
              </span>
              <span>{s}</span>
              {i === 4 && record?.status === 'awaiting_approval' && !isReplay && (
                <span className="approval-ready">Needs approval</span>
              )}
            </button>
          ))}
        </nav>
        <main className="content">
          {tab === 'Overview' && (
            <div className={'chapter chapter-' + chapter} key={chapter}>
              {chapter === 0 && (
                <QuestionChapter
                  question={record?.objective || REFERENCE_QUESTION}
                  status={status}
                  busy={busy}
                  started={!!record}
                  onBegin={() => (record ? setChapter(1) : start())}
                />
              )}
              {chapter === 1 && <EvidenceChapter evidence={evidence} onNext={() => setChapter(2)} />}
              {chapter === 2 && (
                <ContradictionChapter
                  result={result}
                  canTrace={!!record && record.stage >= 2}
                  onTrace={() => findObject('contradiction')}
                  onNext={() => setChapter(3)}
                />
              )}
              {chapter === 3 && (
                <HypothesesChapter
                  hypotheses={hypotheses}
                  updated={!!updates}
                  onShowResult={() => setChapter(5)}
                />
              )}
              {chapter === 4 && (
                <ExperimentChapter
                  experiments={experiments}
                  selected={record?.selected_experiment}
                  rationale={record?.selection_rationale}
                  canApprove={record?.status === 'awaiting_approval' && !isReplay}
                  busy={busy}
                  onRequestApproval={(experiment) => setPending({ kind: 'experiment', experiment })}
                />
              )}
              {chapter === 5 && (
                <ResultChapter
                  result={result}
                  updates={updates}
                  status={record?.status}
                  events={record?.events || []}
                  onInspect={() => findObject('result')}
                />
              )}
              {chapter === 6 && (
                <DecisionChapter
                  decision={decision}
                  followup={followup}
                  followupResult={followupResult}
                  canRunFollowup={record?.status === 'complete' && !isReplay}
                  busy={busy}
                  onRunFollowup={() => setPending({ kind: 'followup' })}
                />
              )}
              <div className="chapter-footer">
                <span>CHAPTER {String(chapter + 1).padStart(2, '0')} OF 07</span>
                {chapter > 0 && (
                  <button className="text-button" onClick={() => setChapter(chapter - 1)}>
                    Previous chapter
                  </button>
                )}
                {chapter < 6 && (
                  <button className="text-button" onClick={() => setChapter(chapter + 1)}>
                    {STAGES[chapter + 1]}
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
            </div>
          )}
          {tab === 'Research graph' && <GraphView record={record} onSelect={setSelected} />}
          {tab === 'Lab notebook' && <Notebook record={record} onSelect={setSelected} />}
          <footer>
            Contradiction Lab <span>Evidence → Experiment → Updated decision</span>
            <a href="https://journal.r-project.org/articles/RJ-2022-020/" target="_blank" rel="noreferrer">
              Reference science
            </a>
          </footer>
        </main>
        <AgentPanel
          open={agentsOpen}
          record={record}
          live={live}
          onClose={() => setAgentsOpen(false)}
          onSelect={setSelected}
        />
      </div>
      {switcher && (
        <WorkspaceDialog
          history={history}
          search={search}
          onSearch={setSearch}
          onLoad={(id) => load(id)}
          onNew={() => {
            setSwitcher(false);
            setNewOpen(true);
          }}
          onClose={() => setSwitcher(false)}
        />
      )}
      {newOpen && (
        <NewInvestigationDialog
          label={label}
          onLabel={setLabel}
          mode={mode}
          onMode={setMode}
          ready={ready}
          busy={busy}
          onStart={start}
          onClose={() => setNewOpen(false)}
        />
      )}
      {pending?.kind === 'experiment' && (
        <ApprovalDialog
          title={experimentTitle(pending.experiment)}
          question={pending.experiment.scientific_question}
          details={[
            `Data: ${dataset ? `${dataset.n_complete} of ${dataset.n_raw}` : 'all complete'} penguin records, checksum-verified`,
            `${pending.experiment.bootstrap_samples} bootstrap resamples · seed ${pending.experiment.seed}`,
            'Runs locally on this machine in a few seconds; no network calls',
            'Your approval is recorded in the lab notebook and cannot be undone',
          ]}
          busy={busy}
          onConfirm={() => approve(pending.experiment.experiment_id)}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'followup' && (
        <ApprovalDialog
          title="Species + sex + year regression"
          question="Does the positive within-species slope survive adjustment for sex and collection year?"
          details={[
            'Data: penguin records with recorded sex, checksum-verified',
            `500 bootstrap resamples within species · seed ${record?.seed ?? 42}`,
            'Runs locally on this machine in a few seconds; no network calls',
            'A separate approval from the first experiment; recorded in the lab notebook',
          ]}
          busy={busy}
          onConfirm={runFollowup}
          onClose={() => setPending(null)}
        />
      )}
      {selected && (
        <ProvenanceDialog
          object={selected}
          record={record}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
