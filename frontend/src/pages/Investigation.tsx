import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Info, Plus, Radio, RotateCcw, X } from 'lucide-react';
import { QuestionChapter } from '../chapters/QuestionChapter';
import { EvidenceChapter } from '../chapters/EvidenceChapter';
import { ContradictionChapter } from '../chapters/ContradictionChapter';
import { HypothesesChapter } from '../chapters/HypothesesChapter';
import { ExperimentChapter } from '../chapters/ExperimentChapter';
import { PapersResultChapter } from '../chapters/ResultChapter';
import { DecisionChapter } from '../chapters/DecisionChapter';
import { InstrumentPanel } from '../panels/InstrumentPanel';
import { Arena } from '../arena/Arena';
import { AGENTS, buildBeats, visibleRecord, type Challenge } from '../arena/beats';
import { usePlayback } from '../arena/usePlayback';
import { ApprovalDialog, ProvenanceDialog } from '../panels/Dialogs';
import {
  freshRuns,
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
  type Contradiction,
  type Decision,
  type Evidence,
  type Experiment,
  type Hypothesis,
  type LabObject,
  type RecordData,
  type PapersResult,
  type Update,
} from '../types';

type Pending = { kind: 'experiment'; experiment: Experiment } | null;

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
  onNew,
  onChanged,
}: {
  id: string;
  replay: boolean;
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

  // The arena plays recorded events back as beats; the rest of the page shows the record as of the current beat.
  const beats = useMemo(() => buildBeats(record), [record]);
  const playback = usePlayback(beats, id + (replay ? ':replay' : ''), freshRuns.has(id) || replay);
  useEffect(() => {
    if (beats.length) freshRuns.delete(id);
  }, [beats.length, id]);
  const view = visibleRecord(record, beats, playback.shown);
  const [follow, setFollow] = useState(true);
  const current = playback.playing ? beats[playback.shown - 1] : undefined;
  useEffect(() => {
    if (!follow || !current?.to) return;
    const stage = AGENTS.find((a) => a.id === current.to)?.stage;
    if (stage !== undefined && current.kind !== 'approval') setTab(stage);
  }, [current?.key, follow]);
  const pick = (i: number) => {
    setFollow(false);
    show(i);
  };

  // Guide the reader when the run reaches a point that needs them, or produces a result.
  useEffect(() => {
    if (!view) return;
    const record = view;
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
  }, [view?.status]);

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
      setFollow(true);
      playback.play();
    });

  const isReplay = record?.display_mode === 'replay';
  const live = view?.mode === 'omnigent';
  const stage = view?.stage ?? 0;
  const failed = view && ['failed', 'no_contradiction', 'blocked'].includes(view.status);
  const working = !!view && !isReplay && !RESTING.includes(view.status);
  const evidence = objects<Evidence>(view, 'evidence');
  const hypotheses = objects<Hypothesis>(view, 'hypothesis');
  const experiments = objects<Experiment>(view, 'experiment');
  const papersResult = objects<PapersResult>(view, 'result')[0];
  const contradiction = objects<Contradiction>(view, 'contradiction')[0];
  const updates = objects<{ updates: Update[] }>(view, 'analysis')[0]?.updates;
  const decision = objects<Decision>(view, 'decision')[0];
  const challenges = new Map<string, Challenge>();
  for (const critique of objects<{ challenges: Challenge[] }>(view, 'critique'))
    for (const c of critique.challenges) challenges.set(c.challenge_id, c);
  const openChallenges = [...challenges.values()].filter((c) => c.verdict === 'open');
  const ready = (i: number) => !!view && (sectionReady(stage, i) || (i === 5 && stage >= 4));
  const done = (i: number) => !!view && (view.status === 'complete' || sectionReady(stage, i + 1));
  const waiting = failed
    ? 'Not reached: the run stopped earlier.'
    : working
      ? 'Specialists are working on this step…'
      : 'Waiting for earlier steps.';
  const waitingForYou = view?.status === 'awaiting_approval' && !isReplay && !playback.playing;
  const findObject = (kind: string) => {
    const o = Object.values(view?.objects || {}).find((o) => o.kind === kind);
    if (o) setSelected(o);
  };
  const about = isReplay
    ? `A saved, checksum-verified record of a completed run. Nothing is recomputed. Originally run with ${
        live ? 'live AI agents' : 'rule-based specialists'
      }.`
    : live
      ? 'Language-model agents read the uploaded papers and author each step; every artifact is validated against the PDFs. All numbers come from Python code, not the model.'
      : 'Each step is a fixed, deterministic function: no language model is involved. Claims are exact sentences parsed from the uploaded PDFs; the experiments quantify how robust the detected disagreement is to the extraction.';

  return (
    <div className="investigation">
      <header className="run-header">
        <button className="text-button back" onClick={() => navigate({ page: 'home' })}>
          <ArrowLeft size={16} />
          <span className="hide-small">Investigations</span>
        </button>
        <div className="run-title">
          <span className="eyebrow">
            {isReplay
              ? 'VERIFIED REPLAY · SEALED RECORD'
              : live
                ? 'LIVE MODEL AGENTS'
                : 'LOCAL DETERMINISTIC RUN · NO LLM'}
          </span>
          <h1>
            {record?.label ||
              (record ? (
                <>
                  Investigation <span className="run-id">{record.id.slice(-6)}</span>
                </>
              ) : (
                'Loading…'
              ))}
          </h1>
        </div>
        {record && (
          <span className={'status-pill ' + (isReplay ? 'replay' : view?.status)}>
            {working && <Radio size={12} />}
            {isReplay ? 'Checksum verified' : statusLabel(view?.status ?? record.status)}
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
      {!!record?.agent_executions?.length && <details className="details agent-trace">
        <summary>Live agent execution trace ({record.agent_executions.length})</summary>
        {record.agent_executions.map(execution => <details key={execution.id} className="panel-block">
          <summary>{execution.role} / {execution.status} / {execution.model}</summary>
          <p>{execution.input_summary} / {new Date(execution.started_at).toLocaleString()}</p>
          <p>Confidence: {execution.confidence ?? 'pending'} / Provider: {execution.provider}</p>
          {execution.error && <p role="alert">{execution.error}</p>}
          <div className="id-links">{[...execution.input_ids, ...(execution.output_ids ?? [])].map(id =>
            <button key={id} onClick={() => setSelected(record.objects[id])}>{id}</button>)}</div>
          <pre>{JSON.stringify(execution.output, null, 2)}</pre>
        </details>)}
      </details>}
      <div className="split">
        <InstrumentPanel
          key={id + (replay ? ':replay' : '')}
          record={view}
          onSelect={setSelected}
          arena={
            <Arena
              record={view}
              beats={beats}
              shown={playback.shown}
              playing={playback.playing}
              speed={playback.speed}
              live={live}
              waitingForYou={waitingForYou}
              onSpeed={playback.setSpeed}
              onReplay={() => {
                setFollow(true);
                playback.replay();
              }}
              onSkip={playback.skip}
              onReview={() => pick(4)}
            />
          }
        />
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
                onClick={() => pick(i)}
              >
                <i>{done(i) ? <Check size={11} /> : i + 1}</i>
                <span>{s}</span>
                {i === 4 && view?.status === 'awaiting_approval' && !isReplay && <b className="needs-dot" />}
              </button>
            ))}
          </nav>
          {view && (
            <>
              {
                [
                  <StorySection index={0} ready waiting="">
                    <QuestionChapter
                      question={view.objective}
                      stamp="User-supplied papers · parsed evidence"
                      chips={(view.source?.papers ?? []).map(
                        (paper, index) =>
                          [
                            'file',
                            `${index === 0 ? 'A' : 'B'} · ${paper.meta.title.slice(0, 44)}${paper.meta.title.length > 44 ? '…' : ''}`,
                          ] as ['file', string],
                      )}
                      scope={view.scope ?? undefined}
                    />
                  </StorySection>,
                  <StorySection index={1} ready={ready(1)} waiting={waiting}>
                    <EvidenceChapter evidence={evidence} />
                  </StorySection>,
                  <StorySection index={2} ready={ready(2)} waiting={waiting}>
                    <ContradictionChapter
                      canTrace={stage >= 2}
                      onTrace={() => findObject('contradiction')}
                      model={live}
                      evidence={evidence}
                      contradiction={contradiction}
                    />
                  </StorySection>,
                  <StorySection index={3} ready={ready(3)} waiting={waiting}>
                    <HypothesesChapter
                      hypotheses={hypotheses}
                      updated={!!updates}
                      onShowResult={() => pick(5)}
                    />
                  </StorySection>,
                  <StorySection index={4} ready={ready(4)} waiting={waiting}>
                    <ExperimentChapter
                      experiments={experiments}
                      selected={view.selected_experiment}
                      rationale={view.selection_rationale}
                      canApprove={view.status === 'awaiting_approval' && !isReplay}
                      busy={busy}
                      onRequestApproval={(experiment) => setPending({ kind: 'experiment', experiment })}
                    />
                  </StorySection>,
                  <StorySection
                    index={5}
                    ready={ready(5)}
                    waiting={failed ? waiting : 'Unlocks after an experiment is approved and run.'}
                  >
                    <PapersResultChapter
                      result={papersResult}
                      updates={updates}
                      status={view.status}
                      events={view.events}
                      openChallenges={openChallenges}
                      nextLabel={decision?.next_experiment ?? 'a follow-up with comparable data'}
                      onInspect={() => findObject('result')}
                      onNextMove={() => pick(6)}
                    />
                  </StorySection>,
                  <StorySection
                    index={6}
                    ready={ready(6)}
                    waiting={failed ? waiting : 'The next decision is chosen from the actual result.'}
                  >
                    <DecisionChapter
                      decision={decision}
                      openChallenge={openChallenges[0]}
                      openChallenges={openChallenges}
                      metrics={view.metrics}
                    />
                    {live && view.status === 'complete' && !isReplay && <button className="button primary" disabled={busy}
                      onClick={() => act(async () => {
                        const next = await api<RecordData>('/investigations', { method: 'POST',
                          body: JSON.stringify({ mode: 'omnigent', parent_investigation: id }) });
                        freshRuns.add(next.id);
                        navigate({ page: 'run', id: next.id, replay: false });
                      })}>Plan next investigation <ArrowRight size={16} /></button>}
                  </StorySection>,
                ][tab]
              }
              <div className="stage-footer">
                <span>
                  STAGE {tab + 1} OF {STAGES.length}
                </span>
                {tab > 0 && (
                  <button className="text-button" onClick={() => pick(tab - 1)}>
                    <ArrowLeft size={16} />
                    {STAGES[tab - 1]}
                  </button>
                )}
                {tab < STAGES.length - 1 && (
                  <button className="button" onClick={() => pick(tab + 1)}>
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
            `Method: ${pending.experiment.method}`,
            `Data: ${pending.experiment.required_data ?? "See experiment specification"}`,
            `Hypotheses: ${pending.experiment.hypothesis_targets?.join(", ") ?? "See plan"}`,
            ...pending.experiment.limitations,
            ...objects<{ assumptions: string[] }>(record, "plan_review").flatMap(p => p.assumptions),
            ...(view?.source
              ? [
                  `Evidence: ${view.source.analysis.claims_a.length} + ${view.source.analysis.claims_b.length} claims extracted from 2 uploaded PDFs (SHA-256 checksummed)`,
                ]
              : []),
            `${pending.experiment.bootstrap_samples} claim resamples · seed ${pending.experiment.seed}`,
            live
              ? 'Python computes locally; model agents interpret results through the configured provider'
              : 'Runs locally on this machine in a few seconds; no network calls',
            'Your approval is recorded in the lab notebook and cannot be undone',
          ]}
          busy={busy}
          onConfirm={() => approve(pending.experiment.experiment_id)}
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
