import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Challenge } from '../arena/beats';
import type { LabEvent, PapersResult, Update } from '../types';
import { Empty, SectionHeading, Tag } from '../ui';

const DIRECTION_SHORT: Record<string, string> = {
  positive: 'positive effect',
  negative: 'negative effect',
  null: 'no significant effect',
  mixed: 'mixed effects',
};

/** Result stage for paper comparisons: robustness of the detected disagreement, all computed. */
export function PapersResultChapter({
  result,
  updates,
  status,
  events,
  openChallenges = [],
  nextLabel = 'obtain comparable primary data',
  onInspect,
  onNextMove,
}: {
  result?: PapersResult;
  updates?: Update[];
  status?: string;
  events: LabEvent[];
  openChallenges?: Challenge[];
  nextLabel?: string;
  onInspect: () => void;
  onNextMove: () => void;
}) {
  return (
    <section>
      <SectionHeading
        eyebrow="06 / COMPUTATIONAL EVIDENCE"
        title={
          result
            ? result.robust_disagreement
              ? 'The disagreement holds.'
              : 'The disagreement does not hold up.'
            : 'Run the audit. Follow the evidence.'
        }
        aside={
          result && (
            <Tag tone="green">Computed on {result.n_claims.a + result.n_claims.b} extracted claims</Tag>
          )
        }
      />
      {result ? (
        <>
          <div className="result-metrics">
            <div>
              <span>Disagreement rate</span>
              <strong className={result.robust_disagreement ? 'mint' : 'coral'}>
                {Math.round(result.disagreement_rate * 100)}%
              </strong>
              <small>
                of {result.bootstrap_samples} claim resamples · seed {result.seed}
              </small>
            </div>
            <ArrowRight size={23} />
            <div>
              <span>Top-pair overlap</span>
              <strong>{Math.round(result.top_pair.similarity * 100)}%</strong>
              <small>95% CI [{result.similarity_ci95.map((v) => v.toFixed(2)).join(', ')}]</small>
            </div>
            <div>
              <span>Comparable pairs</span>
              <strong className="interval">
                {result.opposed_pairs + result.tension_pairs} vs {result.aligned_pairs}
              </strong>
              <small>disagreeing vs aligned, of {result.comparable_pairs} comparable</small>
            </div>
          </div>
          <div className="paper-quotes">
            {[
              [result.top_pair.quote_a, result.top_pair.location_a, result.top_pair.directions[0]],
              [result.top_pair.quote_b, result.top_pair.location_b, result.top_pair.directions[1]],
            ].map(([quote, location, direction], index) => (
              <blockquote key={index} className="quote-card">
                “{quote}”
                <footer>
                  Paper {index === 0 ? 'A' : 'B'} · {location} · {DIRECTION_SHORT[direction] ?? direction}
                </footer>
              </blockquote>
            ))}
          </div>
          <div className="support-updates">
            {updates?.map((u) => (
              <div key={u.hypothesis_id}>
                <span>{u.hypothesis_id} · support / 100</span>
                <strong>
                  {u.prior_support} → {u.updated_support}
                </strong>
                <p>{u.result_consistency}</p>
              </div>
            ))}
          </div>
          {openChallenges.length > 0 && (
            <div className="gap-callout" role="status">
              <div className="gap-head">
                <span className="eyebrow">CRITIC FOUND A GAP</span>
                <b className="stamp open">unresolved</b>
              </div>
              {openChallenges.map((c) => (
                <div key={c.challenge_id} className="gap-body">
                  <h3>
                    <em>“{c.attack}”</em>
                  </h3>
                  <p>{c.evidence}</p>
                </div>
              ))}
              <button className="button amber" onClick={onNextMove}>
                Next experiment required: {nextLabel}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <details className="details">
            <summary>Section sensitivity, coverage & reproducibility</summary>
            <div className="sensitivity">
              {result.section_sensitivity.map((s) => (
                <span key={s.excluded_section}>
                  Omit {s.excluded_section}:{' '}
                  <strong className={s.holds ? 'mint' : 'coral'}>
                    {s.holds ? `holds (${s.similarity.toFixed(2)})` : 'gone'}
                  </strong>
                </span>
              ))}
            </div>
            <p>
              Statistical reporting coverage: paper A {Math.round(result.stats_coverage.a * 100)}%, paper B{' '}
              {Math.round(result.stats_coverage.b * 100)}% of extracted claims. Sample sizes:{' '}
              {result.sample_sizes.a ?? 'not found'} and {result.sample_sizes.b ?? 'not found'}.
            </p>
            {[...result.assumptions, ...result.limitations].map((v) => (
              <p key={v}>• {v}</p>
            ))}
            <p className="hash">Papers SHA-256 digest: {result.provenance.dataset_sha256}</p>
            <p className="hash">Code SHA-256: {result.provenance.code_sha256}</p>
            <button className="text-button" onClick={onInspect}>
              Inspect complete result provenance
              <ArrowUpRight size={14} />
            </button>
          </details>
        </>
      ) : status === 'running' || status === 'approved' ? (
        <div className="running" role="status">
          <div className="spinner" />
          <span className="eyebrow">LIVE AUDIT EXECUTION</span>
          <h3>Testing the disagreement.</h3>
          <p>{events.at(-1)?.action}</p>
        </div>
      ) : (
        <Empty text="Approval launches claim resampling, section-exclusion sensitivity and artifact persistence." />
      )}
    </section>
  );
}
