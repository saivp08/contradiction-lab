import { useMemo, useState } from 'react';
import { ArrowRight, Play, RotateCcw, Search } from 'lucide-react';
import { MiniSlopes } from '../Plots';
import { Floor } from '../arena/Arena';
import { buildBeats } from '../arena/beats';
import { REFERENCE_QUESTION, STAGES, navigate, sectionReady, signed, statusLabel } from '../lib';
import type { RecordData, Summary } from '../types';

function StageMeter({ stage, status }: { stage: number; status: string }) {
  const filled =
    status === 'complete' ? STAGES.length : STAGES.filter((_, i) => sectionReady(stage, i)).length;
  return (
    <div className="stage-meter" aria-label={`${filled} of ${STAGES.length} stages`}>
      {STAGES.map((s, i) => (
        <i key={s} className={i < filled ? 'on' : ''} />
      ))}
    </div>
  );
}

function Tally({ challenges }: { challenges: Record<string, number> }) {
  return (
    <div className="tally">
      {Object.entries(challenges).map(([verdict, n]) => (
        <span key={verdict} className={'stamp ' + verdict.replace(' ', '-')}>
          {n} {verdict}
        </span>
      ))}
    </div>
  );
}

function InvestigationCard({ item }: { item: Summary }) {
  const open = () => navigate({ page: 'run', id: item.id, replay: false });
  return (
    <article className={'run-card ' + item.status}>
      <button className="run-card-main" onClick={open}>
        <div className="run-card-top">
          <span className={'status-pill ' + item.status}>{statusLabel(item.status)}</span>
          <span className="muted">
            {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
            {item.mode === 'omnigent' ? 'AI agents' : 'Rule-based'}
          </span>
        </div>
        <h3>{item.label || `Investigation ${item.id.slice(-6)}`}</h3>
        {item.result ? (
          <div className="run-card-result">
            <MiniSlopes
              pooled={item.result.pooled_slope}
              adjusted={item.result.adjusted_slope}
              followup={item.followup?.adjusted_slope}
            />
            <div>
              <strong>
                <span className="coral">{signed(item.result.pooled_slope)}</span>
                <ArrowRight size={14} />
                <span className="mint">{signed(item.result.adjusted_slope)}</span>
              </strong>
              <small>
                {item.result.group}-adjusted · n = {item.result.n}
                {item.followup && ` · follow-up ${signed(item.followup.adjusted_slope)}`}
              </small>
            </div>
          </div>
        ) : (
          <p className="run-card-pending">
            {item.status === 'awaiting_approval'
              ? 'The planner is waiting for you to approve an experiment.'
              : 'No result yet.'}
          </p>
        )}
        {item.challenges && <Tally challenges={item.challenges} />}
        {item.next_decision && (
          <p className="run-card-next">
            <span>Next</span> {item.next_decision}
          </p>
        )}
        <StageMeter stage={item.stage} status={item.status} />
      </button>
      {item.status === 'complete' && (
        <button
          className="text-button replay-link"
          onClick={() => navigate({ page: 'run', id: item.id, replay: true })}
        >
          <RotateCcw size={13} />
          Watch the verified debate
        </button>
      )}
    </article>
  );
}

export function Home({
  history,
  featured,
  busy,
  onNew,
  onQuickStart,
}: {
  history: Summary[];
  featured: RecordData | null;
  busy: boolean;
  onNew: () => void;
  onQuickStart: () => void;
}) {
  const [query, setQuery] = useState('');
  const beats = useMemo(() => buildBeats(featured), [featured]);
  const shown = history.filter((h) =>
    (h.label || h.objective + h.id).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const needsYou = history.filter((h) => h.status === 'awaiting_approval').length;
  const featuredSummary = featured && history.find((h) => h.id === featured.id);
  return (
    <main className="home">
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow">CONTRADICTION LAB · AGENTIC SCIENCE</span>
          <h1>
            Two findings disagree. <em>Let the agents fight it out.</em>
          </h1>
          <p>
            Ten seats, one contested question. Specialists pull the evidence, propose explanations and design
            a test. You approve it. Then a critic attacks the result, and every challenge is settled by
            numbers the experiment actually computed.
          </p>
          <blockquote className="hero-question">{REFERENCE_QUESTION}</blockquote>
          <div className="hero-actions">
            <button className="button primary" disabled={busy} onClick={onQuickStart}>
              <Play size={15} />
              {busy ? 'Starting…' : 'Start a debate'}
            </button>
            <button className="text-button" onClick={onNew}>
              Name the run first
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <figure className="hero-floor">
          {featured ? (
            <>
              <Floor record={featured} visible={beats} />
              <figcaption>
                <span>
                  Latest debate · {featured.label || featured.id.slice(-6)}
                  {featuredSummary?.challenges && <Tally challenges={featuredSummary.challenges} />}
                </span>
                <button
                  className="text-button"
                  onClick={() => navigate({ page: 'run', id: featured.id, replay: true })}
                >
                  <RotateCcw size={13} />
                  Watch it play out
                </button>
              </figcaption>
            </>
          ) : (
            <div className="hero-empty">
              <p>No debates yet. Start one and watch the agents take their seats.</p>
            </div>
          )}
        </figure>
      </section>
      <section className="home-list">
        <div className="home-list-head">
          <div>
            <h2>Investigations</h2>
            <p className="muted">
              {history.length} run{history.length === 1 ? '' : 's'}
              {needsYou > 0 && <span className="needs-you"> · {needsYou} waiting for your approval</span>}
            </p>
          </div>
          <div className="home-list-actions">
            {history.length > 4 && (
              <label className="search">
                <Search size={14} />
                <input
                  aria-label="Search investigations"
                  placeholder="Search runs"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}
            <button className="button" onClick={onNew}>
              New investigation…
            </button>
          </div>
        </div>
        {shown.length ? (
          <div className="run-grid">
            {shown.map((item) => (
              <InvestigationCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>
              {history.length
                ? 'No runs match your search.'
                : 'No investigations yet. Start a debate on the reference question to begin.'}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
