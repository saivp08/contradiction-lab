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
        <h3>
          {item.label ||
            (item.papers
              ? `${item.papers.titles[0].slice(0, 34)}… vs ${item.papers.titles[1].slice(0, 34)}…`
              : `Investigation ${item.id.slice(-6)}`)}
        </h3>
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
        ) : item.paper_result ? (
          <div className="run-card-result">
            <div>
              <strong>
                <span className={item.paper_result.robust_disagreement ? 'mint' : 'coral'}>
                  {Math.round(item.paper_result.disagreement_rate * 100)}%
                </span>
              </strong>
              <small>disagreement rate · {item.papers?.relationship ?? 'paper comparison'}</small>
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
          <span className="eyebrow">CONTRADICTION LAB · AGENTIC SCIENTIFIC DISCOVERY</span>
          <h1>
            A laboratory that <em>tries to prove itself wrong.</em>
          </h1>
          <p>
            Nine specialist agents and one human seat. The lab finds a contradiction, designs a test, runs
            real computation, attacks its own result, and lets the surviving evidence pick the next
            experiment.
          </p>
          <div className="hero-facts">
            <div className="fact">
              <span>KNOWN CONTRADICTION · WORKFLOW CASE STUDY</span>
              <strong>
                <b className="coral">{signed(featuredSummary?.result?.pooled_slope ?? -0.085)}</b> pooled ·{' '}
                <b className="mint">{signed(featuredSummary?.result?.adjusted_slope ?? 0.2)}</b> within
                species
              </strong>
              <small>{REFERENCE_QUESTION}</small>
            </div>
            <div className="fact loop-line-text" aria-label="What happened">
              Hypotheses → experiment → <b className="mint">result</b> → <b className="coral">critic</b> →
              follow-up
            </div>
            {featuredSummary?.followup && (
              <div className="fact">
                <span>CURRENT FINDING · COMPUTED</span>
                <strong>
                  <b className="mint">{signed(featuredSummary.followup.adjusted_slope)}</b> after species +
                  sex + year
                </strong>
                <small>
                  95% CI [{featuredSummary.followup.adjusted_ci95.map((v) => v.toFixed(3)).join(', ')}] · the
                  critic's sex challenge partly conceded
                </small>
              </div>
            )}
            {featuredSummary?.next_decision && (
              <div className="fact">
                <span>NEXT SCIENTIFIC QUESTION</span>
                <strong>{featuredSummary.next_decision}</strong>
              </div>
            )}
          </div>
          <div className="hero-actions">
            <button className="button primary" disabled={busy} onClick={onQuickStart}>
              <Play size={15} />
              {busy ? 'Starting…' : 'Start a debate'}
            </button>
            {featured && (
              <button
                className="text-button"
                onClick={() => navigate({ page: 'run', id: featured.id, replay: true })}
              >
                <RotateCcw size={14} />
                Watch the recorded demo
              </button>
            )}
            <button className="text-button" onClick={() => navigate({ page: 'compare' })}>
              Compare two papers
              <ArrowRight size={15} />
            </button>
            <button className="text-button" onClick={onNew}>
              Name the run first
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
            <button className="button" onClick={() => navigate({ page: 'compare' })}>
              Compare two papers…
            </button>
            <button className="button" onClick={onNew}>
              New reference run…
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
