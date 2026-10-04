import type { Citation, Evidence, Experiment } from './types';

export const STAGES = [
  'Question',
  'Evidence',
  'Contradiction',
  'Hypotheses',
  'Experiment',
  'Result',
  'Next move',
];
/** Statuses where nothing more happens without a person acting. */
export const RESTING = ['complete', 'failed', 'no_contradiction', 'blocked', 'awaiting_approval'];

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail));
  return body;
}

export const fmt = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : String(v ?? '—'));
export const signed = (v: number, digits = 3) => (v > 0 ? '+' : '') + v.toFixed(digits);

/** "Horst, Hill & Gorman" from the citation's author list. */
export function citeShort(citation: Citation) {
  const names = citation.authors.map((a) => a.trim().split(/\s+/).at(-1) ?? a);
  if (names.length > 3) return `${names[0]} et al.`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0];
}

const lower = (s: string) => s.replace(/\s*\(.*\)$/, '').toLowerCase();

export function evidenceLabels(e: Evidence, index: number) {
  const letter = String.fromCharCode(65 + index);
  const context = e.experimental_conditions.aggregation ?? e.source;
  const direction = e.direction_of_effect;
  const x = lower(e.intervention_or_variable),
    y = lower(e.outcome);
  const noEffect = !!e.experimental_conditions.reported_effect;
  const headline = noEffect
    ? `No significant effect on ${y}.`
    : direction === 'negative'
      ? `Greater ${x}, lower ${y}.`
      : direction === 'positive'
        ? `Greater ${x}, greater ${y}.`
        : `${direction} association.`;
  return {
    eyebrow: `${letter} / ${context}`.toUpperCase(),
    tag: noEffect
      ? 'No significant effect'
      : `${direction[0].toUpperCase()}${direction.slice(1)} association`,
    headline,
    tone: direction === 'negative' ? 'negative' : 'positive',
  };
}

export const experimentTitle = (e: Experiment) => e.title || e.method.replaceAll('_', ' ');

export type Route = { page: 'home' } | { page: 'compare' } | { page: 'run'; id: string; replay: boolean };

export function parseRoute(hash: string): Route {
  if (/^#\/compare$/.test(hash)) return { page: 'compare' };
  const match = hash.match(/^#\/run\/([\w-]+)(\/replay)?$/);
  return match ? { page: 'run', id: match[1], replay: !!match[2] } : { page: 'home' };
}

export const navigate = (route: Route) => {
  window.location.hash =
    route.page === 'home'
      ? '/'
      : route.page === 'compare'
        ? '/compare'
        : `/run/${route.id}${route.replay ? '/replay' : ''}`;
};

/** Multipart upload; unlike api(), no JSON content-type so the browser sets the boundary. */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api' + path, { method: 'POST', body });
  const parsed = await response.json();
  if (!response.ok)
    throw new Error(typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail));
  return parsed;
}

export const STATUS_LABELS: Record<string, string> = {
  created: 'Starting',
  investigating: 'In progress',
  awaiting_approval: 'Needs approval',
  approved: 'Running',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
  no_contradiction: 'No contradiction',
  sponsor_preparing_approval: 'Preparing',
  sponsor_verifying: 'Verifying',
};
export const statusLabel = (status: string) => STATUS_LABELS[status] ?? status.replaceAll('_', ' ');

/** Backend stage counter (one step per specialist role) needed before each story section has content. */
const STAGE_NEEDED = [0, 1, 2, 3, 4, 5, 8];
export const sectionReady = (stage: number, section: number) => stage >= STAGE_NEEDED[section];

/** Runs started in this browser session; their arena animates from the first exchange. */
export const freshRuns = new Set<string>();
