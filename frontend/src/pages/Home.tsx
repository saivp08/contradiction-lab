import { useState } from 'react';
import { ArrowRight, Clock3, Layers3, Play, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { MiniSlopes } from '../Plots';
import { REFERENCE_QUESTION, STAGES, navigate, sectionReady, signed, statusLabel } from '../lib';
import type { Summary } from '../types';

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

function InvestigationCard({ item }: { item: Summary }) {
  const open = () => navigate({ page: 'run', id: item.id, replay: false });
  return (
    <article className="run-card">
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
              ? 'Waiting for you to approve an experiment.'
              : 'No result yet.'}
          </p>
        )}
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
          Verified replay
        </button>
      )}
    </article>
  );
}

export function Home({
  history,
  busy,
  onNew,
  onQuickStart,
}: {
  history: Summary[];
  busy: boolean;
  onNew: () => void;
  onQuickStart: () => void;
}) {
  const [query, setQuery] = useState('');
  const shown = history.filter((h) =>
    (h.label || h.objective + h.id).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const needsYou = history.filter((h) => h.status === 'awaiting_approval').length;
  return (
    <main className="home">
      <section className="home-hero">
        <div>
          <span className="eyebrow">CONTRADICTION LAB</span>
          <h1>Turn scientific disagreement into the next experiment.</h1>
          <p>
            Compare cited findings, register competing explanations, approve a test, run real analysis, and
            let the result change the research plan.
          </p>
        </div>
        <div className="question-tile">
          <span className="eyebrow">REFERENCE QUESTION</span>
          <h2>{REFERENCE_QUESTION}</h2>
          <div className="question-meta">
            <span>
              <Layers3 size={13} />
              Palmer Penguins
            </span>
            <span>
              <Clock3 size={13} />
              2007–2009
            </span>
            <span>
              <ShieldCheck size={13} />
              CC0 public data
            </span>
          </div>
          <button className="button primary" disabled={busy} onClick={onQuickStart}>
            <Play size={15} />
            {busy ? 'Starting…' : 'Run investigation'}
          </button>
        </div>
      </section>
      <section className="home-list">
        <div className="home-list-head">
          <div>
            <h2>Your investigations</h2>
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
                : 'No investigations yet. Run the reference question to begin.'}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
