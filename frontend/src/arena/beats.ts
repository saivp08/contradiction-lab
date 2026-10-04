import type { LabEvent, RecordData } from '../types';

/** The specialists on the floor, in pipeline order, plus the human who poses the question and approves. */
export const AGENTS = [
  { id: 'Human', short: 'You', name: 'You', initials: 'YOU', stage: 0 },
  { id: 'LiteratureAgent', short: 'Literature', name: 'Literature', initials: 'LI', stage: 1 },
  { id: 'ContradictionAgent', short: 'Contradiction', name: 'Contradiction', initials: 'CO', stage: 2 },
  { id: 'HypothesisAgent', short: 'Hypothesis', name: 'Hypothesis', initials: 'HY', stage: 3 },
  { id: 'ExperimentPlanner', short: 'Planner', name: 'Experiment planner', initials: 'PL', stage: 4 },
  { id: 'ExperimentRunner', short: 'Runner', name: 'Experiment runner', initials: 'RU', stage: 5 },
  { id: 'AnalysisAgent', short: 'Analysis', name: 'Analysis', initials: 'AN', stage: 5 },
  { id: 'CriticAgent', short: 'Critic', name: 'Critic', initials: 'CR', stage: 5 },
  { id: 'DecisionAgent', short: 'Decision', name: 'Decision', initials: 'DE', stage: 6 },
  { id: 'SafetyAgent', short: 'Safety', name: 'Safety audit', initials: 'SA', stage: 6 },
] as const;
export type AgentId = (typeof AGENTS)[number]['id'];
const ROLE_IDS = new Set<string>(AGENTS.filter((a) => a.id !== 'Human').map((a) => a.id));
export const agentOf = (id: string) => AGENTS.find((a) => a.id === id);

export type Verdict = 'rebutted' | 'stands' | 'open' | 'partly conceded';
export interface Challenge {
  challenge_id: string;
  attack: string;
  test: string;
  evidence: string;
  verdict: Verdict;
}

export interface Beat {
  key: string;
  kind: 'handoff' | 'work' | 'attack' | 'defend' | 'approval' | 'note';
  from?: AgentId;
  to?: AgentId;
  /** Short tag carried on the packet. */
  label: string;
  /** Transcript line. */
  text: string;
  eventIndex: number;
  timestamp: string;
  /** Object kind the packet carries, for colour-coding (evidence, hypothesis, experiment, result…). */
  payload?: string;
  challenge?: Challenge;
}

const KIND_LABELS: Record<string, [string, string]> = {
  question: ['question', 'questions'],
  evidence: ['claim', 'claims'],
  contradiction: ['contradiction', 'contradictions'],
  hypothesis: ['hypothesis', 'hypotheses'],
  experiment: ['test spec', 'test specs'],
  run: ['run', 'runs'],
  result: ['result', 'results'],
  analysis: ['analysis', 'analyses'],
  critique: ['critique', 'critiques'],
  decision: ['decision', 'decisions'],
  followup_result: ['follow-up result', 'follow-up results'],
};

function describe(ids: string[], record: RecordData) {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const kind = record.objects[id]?.kind;
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts]
    .map(([kind, n]) => {
      const [one, many] = KIND_LABELS[kind] ?? [kind, kind + 's'];
      return n === 1 ? one : `${n} ${many}`;
    })
    .join(' + ');
}

/** Expands recorded events into animation beats. Every beat is derived from a real event or object. */
export function buildBeats(record: RecordData | null): Beat[] {
  if (!record) return [];
  // Which agent produced each object, and when, so a handoff comes from the most recent contributor.
  const producer = new Map<string, { agent: string; at: number }>();
  for (const o of Object.values(record.objects))
    if (o.kind === 'question') producer.set(o.id, { agent: 'Human', at: -1 });
  const beats: Beat[] = [];
  let lastRole: AgentId | undefined;
  record.events.forEach((e: LabEvent, i) => {
    const base = { eventIndex: i, timestamp: e.timestamp };
    const to = (ROLE_IDS.has(e.agent) || e.agent === 'Human' ? e.agent : undefined) as AgentId | undefined;
    if (e.agent === 'Human' || e.tool === 'approval_gate') {
      beats.push({
        ...base,
        key: e.id,
        kind: 'approval',
        from: 'Human',
        to: 'ExperimentRunner',
        label: 'approved',
        text: e.action,
      });
    } else if (!to) {
      beats.push({ ...base, key: e.id, kind: 'note', label: e.agent, text: e.action });
    } else if (e.status === 'running') {
      beats.push({ ...base, key: e.id, kind: 'work', to, label: 'working', text: e.action });
    } else {
      const latest = e.input_ids
        .map((id) => producer.get(id))
        .filter((p) => p !== undefined)
        .sort((a, b) => b.at - a.at)[0];
      const from = (latest?.agent ?? lastRole) as AgentId | undefined;
      const carried = describe(e.input_ids, record);
      const kinds = e.input_ids.map((id) => record.objects[id]?.kind).filter(Boolean);
      const payload = kinds.at(-1);
      beats.push({
        ...base,
        key: e.id,
        kind: 'handoff',
        from: from === to ? undefined : from,
        to,
        label: carried || 'handoff',
        payload,
        // The critic's summary is the verdict tally, so it is told after the exchanges rather than before.
        text: e.agent === 'CriticAgent' ? `Took the ${carried} under review.` : e.action,
      });
      if (e.agent === 'CriticAgent') {
        const critique = e.output_ids.map((id) => record.objects[id]).find((o) => o?.kind === 'critique');
        const challenges = (critique?.data.challenges ?? []) as Challenge[];
        challenges.forEach((c) => {
          beats.push({
            ...base,
            key: `${e.id}-${c.challenge_id}-attack`,
            kind: 'attack',
            from: 'CriticAgent',
            to: 'AnalysisAgent',
            label: c.challenge_id,
            text: c.attack,
            challenge: c,
          });
          beats.push({
            ...base,
            key: `${e.id}-${c.challenge_id}-defend`,
            kind: 'defend',
            from: 'AnalysisAgent',
            to: 'CriticAgent',
            label: c.verdict,
            text: c.evidence,
            challenge: c,
          });
        });
        beats.push({
          ...base,
          key: `${e.id}-summary`,
          kind: 'work',
          to: 'CriticAgent',
          label: 'summary',
          text: e.action,
        });
      }
      lastRole = to;
    }
    for (const id of e.output_ids) producer.set(id, { agent: e.agent, at: i });
  });
  return beats;
}

export const beatDuration = (beat: Beat) =>
  beat.kind === 'work' ? 450 : beat.kind === 'attack' ? 850 : beat.kind === 'defend' ? 1000 : 900;

/** The record as it stood when the given number of beats had played: objects, events, stage and status. */
export function visibleRecord(record: RecordData | null, beats: Beat[], shown: number): RecordData | null {
  if (!record || shown >= beats.length) return record;
  const lastEvent = shown > 0 ? beats[shown - 1].eventIndex : -1;
  const events = record.events.slice(0, lastEvent + 1);
  const ids = new Set<string>();
  for (const o of Object.values(record.objects)) if (o.kind === 'question') ids.add(o.id);
  for (const e of events) for (const id of [...e.input_ids, ...e.output_ids]) ids.add(id);
  const objects = Object.fromEntries(Object.entries(record.objects).filter(([id]) => ids.has(id)));
  const stage = Math.min(
    record.stage,
    events.filter((e) => ROLE_IDS.has(e.agent) && e.status === 'complete' && !e.tool.startsWith('interpret'))
      .length,
  );
  const last = events.at(-1);
  const approved = events.some((e) => e.tool === 'approval_gate');
  return {
    ...record,
    events,
    objects,
    stage,
    status: last?.agent === 'ExperimentRunner' || (approved && stage < 5) ? 'running' : 'investigating',
    approval: approved ? record.approval : null,
    metrics: {},
  };
}
