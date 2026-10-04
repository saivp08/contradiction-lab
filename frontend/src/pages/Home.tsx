import { useMemo, useState } from 'react';
import { Play, RotateCcw, Search } from 'lucide-react';
import { Floor } from '../arena/Arena';
import { buildBeats } from '../arena/beats';
import { STAGES, navigate, sectionReady, statusLabel } from '../lib';
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
        {item.paper_result ? (
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
  onNew,
}: {
  history: Summary[];
  featured: RecordData | null;
  onNew: () => void;
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
            Upload two research papers. Nine specialist agents and one human seat read them, find where they
            disagree, design a test, run real computation, attack their own result, and let the surviving
            evidence pick the next experiment.
          </p>
          <div className="hero-facts">
            {featuredSummary?.papers && (
              <div className="fact">
                <span>LATEST COMPARISON · {featuredSummary.papers.relationship.toUpperCase()}</span>
                <strong>
                  {featuredSummary.paper_result && (
                    <b className={featuredSummary.paper_result.robust_disagreement ? 'mint' : 'coral'}>
                      {Math.round(featuredSummary.paper_result.disagreement_rate * 100)}%
                    </b>
                  )}{' '}
                  disagreement rate
                </strong>
                <small>
                  {featuredSummary.papers.titles[0]} vs {featuredSummary.papers.titles[1]}
                </small>
              </div>
            )}
            <div className="fact loop-line-text" aria-label="How a debate runs">
              Papers → contradiction → experiment → <b className="mint">result</b> →{' '}
              <b className="coral">critic</b> → next experiment
            </div>
            {featuredSummary?.next_decision && (
              <div className="fact">
                <span>NEXT SCIENTIFIC QUESTION</span>
                <strong>{featuredSummary.next_decision}</strong>
              </div>
            )}
          </div>
          <div className="hero-actions">
            <button className="button primary" onClick={onNew}>
              <Play size={15} />
              Compare two papers
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
              <p>No debates yet. Upload two papers and watch the agents take their seats.</p>
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
              Compare two papers…
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
                : 'No investigations yet. Upload two papers to start a debate.'}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
