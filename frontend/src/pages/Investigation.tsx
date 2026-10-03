import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Info, Plus, Radio, RotateCcw, X } from 'lucide-react';
import { QuestionChapter } from '../chapters/QuestionChapter';
import { EvidenceChapter } from '../chapters/EvidenceChapter';
import { ContradictionChapter } from '../chapters/ContradictionChapter';
import { HypothesesChapter } from '../chapters/HypothesesChapter';
import { ExperimentChapter } from '../chapters/ExperimentChapter';
import { ResultChapter } from '../chapters/ResultChapter';
import { DecisionChapter } from '../chapters/DecisionChapter';
import { InstrumentPanel } from '../panels/InstrumentPanel';
import { ApprovalDialog, ProvenanceDialog } from '../panels/Dialogs';
import {
  REFERENCE_QUESTION,
  RESTING,
  STAGES,
  api,
  experimentTitle,
  navigate,
  sectionReady,
  statusLabel,
} from '../lib';
import {
  objects,
  type Dataset,
  type Decision,
  type Evidence,
  type Experiment,
  type FollowupDecision,
  type Hypothesis,
  type LabObject,
  type Point,
  type RecordData,
  type Result,
  type Update,
} from '../types';

type Pending = { kind: 'experiment'; experiment: Experiment } | { kind: 'followup' } | null;

/** Keeps the record current while work is in progress: server-sent events, falling back to polling. */
function useLiveRecord(
  record: RecordData | null,
  onRecord: (r: RecordData) => void,
  onError: (m: string) => void,
) {
  const settled = !record || record.display_mode === 'replay' || RESTING.includes(record.status);
  useEffect(() => {
    if (settled || !record) return;
    const id = record.id;
    let timer: number | undefined;
    const receive = (r: RecordData) => {
      onRecord(r);
      if (RESTING.includes(r.status)) {
        source.close();
        window.clearInterval(timer);
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
            .catch((e) => onError(e.message)),
        1000,
      );
    };
    return () => {
      source.close();
      window.clearInterval(timer);
    };
  }, [record?.id, settled]);
}

function StorySection({
  index,
  ready,
  waiting,
  children,
}: {
  index: number;
  ready: boolean;
  waiting: string;
  children: ReactNode;
}) {
  return (
    <div
      className={'story-section ' + (ready ? '' : 'locked')}
      id={`stage-${index}`}
      role="tabpanel"
      aria-label={STAGES[index]}
    >
      {ready ? (
        children
      ) : (
        <div className="locked-section">
          <span className="eyebrow">
            {String(index + 1).padStart(2, '0')} / {STAGES[index].toUpperCase()}
          </span>
          <p>{waiting}</p>
        </div>
      )}
    </div>
  );
}

export function Investigation({
  id,
  replay,
  reference,
  referencePoints,
  dataset,
  onNew,
  onChanged,
}: {
  id: string;
  replay: boolean;
  reference: Evidence[];
  referencePoints: Point[];
  dataset: Dataset | null;
  onNew: () => void;
  onChanged: () => void;
}) {
  const [record, setRecord] = useState<RecordData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [selected, setSelected] = useState<LabObject | null>(null);
  const previousStatus = useRef<string | null>(null);
  const [tab, setTab] = useState(0);
  const show = (i: number) => {
    setTab(i);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    setRecord(null);
    setError('');
    previousStatus.current = null;
    setTab(0);
    window.scrollTo({ top: 0 });
    api<RecordData>(`/investigations/${id}${replay ? '/replay' : ''}`)
      .then(setRecord)
      .catch((e) => setError(e.message));
  }, [id, replay]);

  useLiveRecord(record, setRecord, setError);

  // Guide the reader when the run reaches a point that needs them, or produces a result.
  useEffect(() => {
    if (!record) return;
    const before = previousStatus.current;
    previousStatus.current = record.status;
    // Open the tab that needs the reader: the approval step, or the result once it arrives.
    if (
      record.status === 'awaiting_approval' &&
      before !== record.status &&
      record.display_mode !== 'replay'
    ) {
      show(4);
    }
    if (record.status === 'complete' && (!before || ['running', 'approved'].includes(before))) show(5);
    if (!before || before === record.status) return;
    if (RESTING.includes(record.status)) onChanged();
  }, [record?.status]);

  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setPending(null);
      setSelected(null);
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);

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
  const approve = (experimentId: string) =>
    act(async () => {
      if (!record) return;
      setPending(null);
      setRecord(
        await api<RecordData>(`/investigations/${record.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ experiment_id: experimentId, approved: true }),
        }),
      );
      show(5);
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
      onChanged();
    });

  const isReplay = record?.display_mode === 'replay';
  const live = record?.mode === 'omnigent';
  const stage = record?.stage ?? 0;
  const failed = record && ['failed', 'no_contradiction'].includes(record.status);
  const working = !!record && !isReplay && !RESTING.includes(record.status);
  const evidence = record ? objects<Evidence>(record, 'evidence') : reference;
  const hypotheses = objects<Hypothesis>(record, 'hypothesis');
  const experiments = objects<Experiment>(record, 'experiment').filter((e) => !e.followup);
  const result = objects<Result>(record, 'result')[0];
  const updates = objects<{ updates: Update[] }>(record, 'analysis')[0]?.updates;
  const decision = objects<Decision>(record, 'decision')[0];
  const followupResult = objects<Result>(record, 'followup_result')[0];
  const followup = objects<FollowupDecision>(record, 'followup_decision')[0];
  const ready = (i: number) => !!record && (sectionReady(stage, i) || (i === 5 && stage >= 4));
  const done = (i: number) => !!record && (record.status === 'complete' || sectionReady(stage, i + 1));
  const waiting = failed
    ? 'Not reached: the run stopped earlier.'
    : working
      ? 'Specialists are working on this step…'
      : 'Waiting for earlier steps.';
  const findObject = (kind: string) => {
    const o = Object.values(record?.objects || {}).find((o) => o.kind === kind);
    if (o) setSelected(o);
  };
  const about = isReplay
    ? `A saved, checksum-verified record of a completed run. Nothing is recomputed. Originally run with ${
        live ? 'live AI agents' : 'rule-based specialists'
      }.`
    : live
      ? 'Language-model agents (via Omnigent) choose and sequence the steps. All numbers come from Python code, not the model.'
      : 'Each step is a fixed, deterministic function: no language model is involved. Statistics are computed on the real dataset; the hypotheses and experiment options are pre-registered.';

  return (
    <div className="investigation">
      <header className="run-header">
        <button className="text-button back" onClick={() => navigate({ page: 'home' })}>
          <ArrowLeft size={16} />
          <span className="hide-small">Investigations</span>
        </button>
        <div className="run-title">
          <span className="eyebrow">
            {isReplay ? 'VERIFIED REPLAY' : live ? 'LIVE AI AGENTS' : 'RULE-BASED RUN'}
          </span>
          <h1>{record?.label || (record ? `Investigation ${record.id.slice(-6)}` : 'Loading…')}</h1>
        </div>
        {record && (
          <span className={'status-pill ' + (isReplay ? 'replay' : record.status)}>
            {working && <Radio size={12} />}
            {isReplay ? 'Checksum verified' : statusLabel(record.status)}
          </span>
        )}
        <details className="run-about">
          <summary>
            <Info size={14} />
            <span className="hide-small">About this run</span>
          </summary>
          <p>{about}</p>
        </details>
        <div className="run-actions">
          {record?.status === 'complete' &&
            (isReplay ? (
              <button className="button" onClick={() => navigate({ page: 'run', id, replay: false })}>
                Open live record
              </button>
            ) : (
              <button className="button" onClick={() => navigate({ page: 'run', id, replay: true })}>
                <RotateCcw size={15} />
                <span className="hide-small">Replay verified run</span>
              </button>
            ))}
          <button className="button primary" onClick={onNew}>
            <Plus size={15} />
            <span className="hide-small">New</span>
          </button>
        </div>
      </header>
      {(error || record?.error) && (
        <div className="error" role="alert">
          {error || record?.error}
          {error && (
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          )}
        </div>
      )}
      <div className="split">
        <InstrumentPanel record={record} referencePoints={referencePoints} onSelect={setSelected} />
        <div className="story">
          <nav className="story-nav" role="tablist" aria-label="Investigation stages">
            {STAGES.map((s, i) => (
              <button
                key={s}
                role="tab"
                className={
                  (done(i) ? 'done ' : '') + (i === tab ? 'current ' : '') + (ready(i) ? '' : 'locked')
                }
                aria-selected={i === tab}
                onClick={() => show(i)}
              >
                <i>{done(i) ? <Check size={11} /> : i + 1}</i>
                <span>{s}</span>
                {i === 4 && record?.status === 'awaiting_approval' && !isReplay && (
                  <b className="needs-dot" />
                )}
              </button>
            ))}
          </nav>
          {record && (
            <>
              {
                [
                  <StorySection index={0} ready waiting="">
                    <QuestionChapter question={record.objective || REFERENCE_QUESTION} />
                  </StorySection>,
                  <StorySection index={1} ready={ready(1)} waiting={waiting}>
                    <EvidenceChapter evidence={evidence} />
                  </StorySection>,
                  <StorySection index={2} ready={ready(2)} waiting={waiting}>
                    <ContradictionChapter canTrace={stage >= 2} onTrace={() => findObject('contradiction')} />
                  </StorySection>,
                  <StorySection index={3} ready={ready(3)} waiting={waiting}>
                    <HypothesesChapter
                      hypotheses={hypotheses}
                      updated={!!updates}
                      onShowResult={() => show(5)}
                    />
                  </StorySection>,
                  <StorySection index={4} ready={ready(4)} waiting={waiting}>
                    <ExperimentChapter
                      experiments={experiments}
                      selected={record.selected_experiment}
                      rationale={record.selection_rationale}
                      canApprove={record.status === 'awaiting_approval' && !isReplay}
                      busy={busy}
                      onRequestApproval={(experiment) => setPending({ kind: 'experiment', experiment })}
                    />
                  </StorySection>,
                  <StorySection
                    index={5}
                    ready={ready(5)}
                    waiting={failed ? waiting : 'Unlocks after an experiment is approved and run.'}
                  >
                    <ResultChapter
                      result={result}
                      updates={updates}
                      status={record.status}
                      events={record.events}
                      onInspect={() => findObject('result')}
                    />
                  </StorySection>,
                  <StorySection
                    index={6}
                    ready={ready(6)}
                    waiting={failed ? waiting : 'The next decision is chosen from the actual result.'}
                  >
                    <DecisionChapter
                      decision={decision}
                      followup={followup}
                      followupResult={followupResult}
                      canRunFollowup={record.status === 'complete' && !isReplay}
                      busy={busy}
                      onRunFollowup={() => setPending({ kind: 'followup' })}
                    />
                  </StorySection>,
                ][tab]
              }
              <div className="stage-footer">
                <span>
                  STAGE {tab + 1} OF {STAGES.length}
                </span>
                {tab > 0 && (
                  <button className="text-button" onClick={() => show(tab - 1)}>
                    <ArrowLeft size={16} />
                    {STAGES[tab - 1]}
                  </button>
                )}
                {tab < STAGES.length - 1 && (
                  <button className="button" onClick={() => show(tab + 1)}>
                    {STAGES[tab + 1]}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
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
