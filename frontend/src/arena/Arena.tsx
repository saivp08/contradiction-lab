import { useEffect, useMemo, useRef, useState } from 'react';
import { FastForward, Play, RotateCcw } from 'lucide-react';
import { objects, type FollowupDecision, type Hypothesis, type RecordData, type Update } from '../types';
import { AGENTS, agentOf, beatDuration, type AgentId, type Beat, type Challenge } from './beats';

const W = 640,
  H = 380,
  CENTER = { x: 320, y: 190 };
const SEATS: Record<AgentId, { x: number; y: number }> = {
  LiteratureAgent: { x: 82, y: 58 },
  ContradictionAgent: { x: 234, y: 58 },
  HypothesisAgent: { x: 386, y: 58 },
  ExperimentPlanner: { x: 538, y: 58 },
  Human: { x: 584, y: 190 },
  ExperimentRunner: { x: 538, y: 322 },
  AnalysisAgent: { x: 386, y: 322 },
  DecisionAgent: { x: 234, y: 322 },
  SafetyAgent: { x: 82, y: 322 },
  CriticAgent: { x: 60, y: 190 },
};
const LANES: [AgentId, AgentId][] = [
  ['LiteratureAgent', 'ContradictionAgent'],
  ['ContradictionAgent', 'HypothesisAgent'],
  ['HypothesisAgent', 'ExperimentPlanner'],
  ['ExperimentPlanner', 'Human'],
  ['Human', 'ExperimentRunner'],
  ['ExperimentRunner', 'AnalysisAgent'],
  ['AnalysisAgent', 'CriticAgent'],
  ['CriticAgent', 'DecisionAgent'],
  ['DecisionAgent', 'SafetyAgent'],
];

/** Quadratic path between seats: neighbours arc outward, long throws cut across the floor. */
function route(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const far = Math.hypot(b.x - a.x, b.y - a.y) > 220;
  const k = far ? 0.45 : -0.45;
  const c = { x: mid.x + (CENTER.x - mid.x) * k, y: mid.y + (CENTER.y - mid.y) * k };
  return { a, b, c, d: `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}` };
}
const at = (r: ReturnType<typeof route>, t: number) => ({
  x: (1 - t) ** 2 * r.a.x + 2 * (1 - t) * t * r.c.x + t ** 2 * r.b.x,
  y: (1 - t) ** 2 * r.a.y + 2 * (1 - t) * t * r.c.y + t ** 2 * r.b.y,
});

function useTween(key: string, duration: number) {
  const [t, setT] = useState(1);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setT(1);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setT(1 - (1 - p) ** 3);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setT(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, duration]);
  return t;
}

const TONE: Record<Beat['kind'], string> = {
  handoff: 'handoff',
  work: 'handoff',
  attack: 'attack',
  defend: 'defend',
  approval: 'approval',
  note: 'handoff',
};

function Packet({ beat, speed }: { beat: Beat; speed: number }) {
  const t = useTween(beat.key, (beatDuration(beat) * 0.7) / speed);
  if (!beat.from || !beat.to) return null;
  const r = route(SEATS[beat.from], SEATS[beat.to]);
  const p = at(r, t);
  const raw = beat.kind === 'defend' ? beat.label.toUpperCase() : beat.label;
  const label = raw.length > 24 ? raw.slice(0, 23) + '…' : raw;
  const width = Math.min(190, label.length * 6.8 + 18);
  const payload = beat.kind === 'handoff' && beat.payload ? ' k-' + beat.payload : '';
  return (
    <g className={'packet ' + TONE[beat.kind] + payload} style={{ opacity: t >= 1 ? 0.0 : 1 }}>
      <path d={r.d} className="trail" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - t} />
      <g transform={`translate(${p.x} ${p.y})`}>
        <rect x={-width / 2} y={-10} width={width} height={20} rx={10} />
        <text y={4} textAnchor="middle">
          {label}
        </text>
      </g>
    </g>
  );
}

function Seat({ id, state }: { id: AgentId; state: 'idle' | 'done' | 'active' | 'waiting' }) {
  const agent = agentOf(id)!;
  const { x, y } = SEATS[id];
  // Wide enough for every real agent name; the label still ellipsizes as a safety net.
  const width = id === 'Human' ? 92 : 116;
  return (
    <g
      className={'seat ' + state + (id === 'Human' ? ' human' : '') + (id === 'CriticAgent' ? ' critic' : '')}
    >
      {state === 'active' && <circle className="ripple" cx={x} cy={y} r={30} />}
      <rect x={x - width / 2} y={y - 22} width={width} height={44} rx={id === 'Human' ? 22 : 6} />
      <foreignObject x={x - width / 2} y={y - 22} width={width} height={44}>
        <div className={'seat-label' + (id === 'Human' ? ' centered' : '')} title={agent.name}>
          {id === 'Human' ? (
            <span className="seat-name">{state === 'waiting' ? 'You · approve' : 'You'}</span>
          ) : (
            <>
              <span className="seat-initials">{agent.initials}</span>
              <span className="seat-name">{agent.short}</span>
            </>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

function Board({ record }: { record: RecordData | null }) {
  const hypotheses = objects<Hypothesis>(record, 'hypothesis');
  const updates = objects<{ updates: Update[] }>(record, 'analysis')[0]?.updates;
  const followup = objects<FollowupDecision>(record, 'followup_decision')[0];
  const support = (h: Hypothesis) =>
    followup?.hypothesis_id === h.hypothesis_id
      ? followup.updated_support
      : (updates?.find((u) => u.hypothesis_id === h.hypothesis_id)?.updated_support ?? h.support_score);
  return (
    <g className="board">
      <rect x={150} y={112} width={340} height={156} rx={8} />
      <text className="board-title" x={166} y={134}>
        CONTESTED EXPLANATIONS
      </text>
      {hypotheses.length === 0 && (
        <text className="board-empty" x={320} y={200} textAnchor="middle">
          waiting for hypotheses
        </text>
      )}
      {hypotheses.map((h, i) => {
        const y = 160 + i * 36;
        const value = support(h);
        const delta = value - h.support_score;
        return (
          <g key={h.hypothesis_id} className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>
            <text className="hid" x={166} y={y + 4}>
              {h.hypothesis_id}
            </text>
            <foreignObject x={194} y={y - 17} width={240} height={16}>
              <div className="board-statement" title={h.statement}>
                {h.statement}
              </div>
            </foreignObject>
            <rect className="track" x={194} y={y + 4} width={240} height={5} rx={2.5} />
            <rect className="fill" x={194} y={y + 4} width={(240 * value) / 100} height={5} rx={2.5} />
            <line className="prior" x1={194 + 120} x2={194 + 120} y1={y + 1} y2={y + 12} />
            <text className="score" x={474} y={y + 10} textAnchor="end">
              {value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ChallengeStrip({ beats }: { beats: Beat[] }) {
  const state = new Map<string, { challenge: Challenge; settled: boolean }>();
  for (const b of beats) {
    if (!b.challenge) continue;
    state.set(b.challenge.challenge_id, { challenge: b.challenge, settled: b.kind === 'defend' });
  }
  if (!state.size) return null;
  return (
    <div className="challenge-strip" aria-label="Critic challenges">
      {[...state.values()].map(({ challenge, settled }) => (
        <div
          key={challenge.challenge_id}
          className={'challenge ' + (settled ? challenge.verdict.replace(' ', '-') : 'live')}
        >
          <span>{challenge.challenge_id}</span>
          <p>{challenge.attack}</p>
          <b>{settled ? challenge.verdict : 'under fire'}</b>
        </div>
      ))}
    </div>
  );
}

function Transcript({ beats }: { beats: Beat[] }) {
  const start = beats[0] ? new Date(beats[0].timestamp).getTime() : 0;
  const clock = (b: Beat) => {
    const ms = Math.max(0, new Date(b.timestamp).getTime() - start);
    return `+${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
  };
  return (
    <div className="transcript" aria-live="polite">
      {[...beats].reverse().map((b) => (
        <div key={b.key} className={'line ' + b.kind}>
          <time>{clock(b)}</time>
          <span className="who">
            {b.from && b.to && b.from !== b.to
              ? `${agentOf(b.from)?.short} → ${agentOf(b.to)?.short}`
              : (agentOf(b.to ?? '')?.short ?? b.label)}
          </span>
          <p>
            {b.kind === 'attack' && <em>“{b.text}”</em>}
            {b.kind !== 'attack' && b.text}
            {b.kind === 'defend' && b.challenge && (
              <b className={'stamp ' + b.challenge.verdict.replace(' ', '-')}>{b.challenge.verdict}</b>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The debate floor: seats, lanes, the contested-explanations board and the packet in flight. */
export function Floor({
  record,
  visible,
  current,
  speed = 1,
  waitingForYou = false,
}: {
  record: RecordData | null;
  visible: Beat[];
  current?: Beat;
  speed?: number;
  waitingForYou?: boolean;
}) {
  const spoke = useMemo(() => new Set(visible.flatMap((b) => [b.from, b.to]).filter(Boolean)), [visible]);
  const seatState = (id: AgentId) =>
    id === 'Human' && waitingForYou
      ? 'waiting'
      : current && (current.to === id || (current.kind === 'attack' && current.from === id))
        ? 'active'
        : spoke.has(id)
          ? 'done'
          : 'idle';
  return (
    <svg
      className="floor"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Agents passing work and challenges"
    >
      {LANES.map(([a, b]) => (
        <path key={a + b} className="lane" d={route(SEATS[a], SEATS[b]).d} />
      ))}
      <Board record={record} />
      {AGENTS.map((a) => (
        <Seat key={a.id} id={a.id} state={seatState(a.id)} />
      ))}
      {current && <Packet key={current.key} beat={current} speed={speed} />}
    </svg>
  );
}

export function Arena({
  record,
  beats,
  shown,
  playing,
  speed,
  live,
  waitingForYou,
  onSpeed,
  onReplay,
  onSkip,
  onReview,
}: {
  record: RecordData | null;
  beats: Beat[];
  shown: number;
  playing: boolean;
  speed: number;
  live: boolean;
  waitingForYou: boolean;
  onSpeed: (speed: number) => void;
  onReplay: () => void;
  onSkip: () => void;
  onReview: () => void;
}) {
  const visible = beats.slice(0, shown);
  const current = playing ? visible.at(-1) : undefined;
  const tally = visible
    .filter((b) => b.kind === 'defend')
    .reduce<Record<string, number>>((t, b) => ({ ...t, [b.label]: (t[b.label] ?? 0) + 1 }), {});
  return (
    <section className="arena" aria-label="Agent arena">
      <div className="arena-bar">
        <span className={'arena-mode ' + (playing ? 'on' : '')}>
          <i />
          {playing ? 'Playing back' : waitingForYou ? 'Paused for you' : 'Recorded'}
        </span>
        <span className="arena-count">
          {shown}/{beats.length} exchanges
          {Object.keys(tally).length > 0 && (
            <>
              {' · '}
              {Object.entries(tally)
                .map(([k, v]) => `${v} ${k}`)
                .join(' · ')}
            </>
          )}
        </span>
        <div className="arena-controls">
          {playing ? (
            <>
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  className={speed === s ? 'on' : ''}
                  onClick={() => onSpeed(s)}
                  aria-pressed={speed === s}
                >
                  {s}×
                </button>
              ))}
              <button onClick={onSkip} aria-label="Skip to end">
                <FastForward size={14} />
              </button>
            </>
          ) : (
            beats.length > 0 && (
              <button className="replay" onClick={onReplay}>
                {shown < beats.length ? <Play size={13} /> : <RotateCcw size={13} />}
                Replay the debate
              </button>
            )
          )}
        </div>
      </div>
      <Floor
        record={record}
        visible={visible}
        current={current}
        speed={speed}
        waitingForYou={waitingForYou}
      />
      <div className="arena-legend" aria-hidden="true">
        {[
          ['evidence', 'Evidence'],
          ['hypothesis', 'Hypotheses'],
          ['experiment', 'Test spec'],
          ['result', 'Result'],
          ['critique', 'Critique'],
          ['decision', 'Decision'],
        ].map(([k, name]) => (
          <span key={k} className={'legend-' + k}>
            <i />
            {name}
          </span>
        ))}
      </div>
      {waitingForYou && (
        <button className="gate-call" onClick={onReview}>
          The planner needs your approval to run an experiment. Review the options →
        </button>
      )}
      <ChallengeStrip beats={visible} />
      <Transcript beats={visible} />
      <p className="arena-note">
        Every exchange is drawn from a recorded event or a computed challenge verdict
        {live ? '.' : ', played back at a readable pace. Specialists are rule-based; no language model.'}
      </p>
    </section>
  );
}
