import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Challenge } from '../arena/beats';
import { Slopes } from '../Plots';
import { signed } from '../lib';
import type { LabEvent, ModelComparison, Result, Update } from '../types';
import { Empty, SectionHeading, Tag } from '../ui';

export function ModelEvidence({ comparison, label }: { comparison: ModelComparison; label: string }) {
  // Kass & Raftery (1995) evidence categories for BIC differences.
  const size = Math.abs(comparison.delta_bic);
  const strength = size > 10 ? 'Very strong' : size > 6 ? 'Strong' : size > 2 ? 'Positive' : 'Weak';
  const [better, worse] =
    comparison.delta_bic > 0 ? [`${label}-adjusted`, 'pooled'] : ['pooled', `${label}-adjusted`];
  return (
    <div className="model-evidence">
      <span className="eyebrow">MODEL COMPARISON · BIC</span>
      <strong>
        ΔBIC {signed(comparison.delta_bic, 1)}
        <small>
          {' '}
          · Bayes factor ≈ 10<sup>{comparison.log10_bayes_factor.toFixed(0)}</sup>
        </small>
      </strong>
      <p>
        {strength} evidence that the {better} model fits better than the {worse} model, after penalising extra
        parameters.
      </p>
      <p className="caption">{comparison.note}</p>
    </div>
  );
}

export function ResultChapter({
  result,
  updates,
  status,
  events,
  openChallenges = [],
  onInspect,
  onNextMove,
}: {
  result?: Result;
  updates?: Update[];
  status?: string;
  events: LabEvent[];
  openChallenges?: Challenge[];
  onInspect: () => void;
  onNextMove: () => void;
}) {
  return (
    <section>
      <SectionHeading
        eyebrow="06 / COMPUTATIONAL EVIDENCE"
        title={
          result
            ? result.pooled_slope * result.adjusted_slope < 0
              ? 'The relationship reverses.'
              : 'The evidence is in.'
            : 'Run the experiment. Follow the evidence.'
        }
        aside={result && <Tag tone="green">Actual result · n = {result.n}</Tag>}
      />
      {result ? (
        <>
          <div className="result-metrics">
            <div>
              <span>Pooled slope</span>
              <strong className="coral">{result.pooled_slope.toFixed(3)}</strong>
              <small>mm / mm</small>
            </div>
            <ArrowRight size={23} />
            <div>
              <span>{result.group}-adjusted slope</span>
              <strong className="mint">{signed(result.adjusted_slope)}</strong>
              <small>mm / mm</small>
            </div>
            <div>
              <span>95% bootstrap interval</span>
              <strong className="interval">
                [{result.adjusted_ci95.map((v) => v.toFixed(3)).join(', ')}]
              </strong>
              <small>
                {result.bootstrap_samples} stratified draws · seed {result.seed}
              </small>
            </div>
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
          {result.model_comparison && (
            <ModelEvidence comparison={result.model_comparison} label={result.group} />
          )}
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
                  <p>
                    {c.evidence} The result survives the other challenges, but this one has not been tested.
                  </p>
                </div>
              ))}
              <button className="button amber" onClick={onNextMove}>
                Next experiment required: species + sex + year regression
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <details className="details">
            <summary>Slopes by species, with uncertainty</summary>
            <Slopes result={result} />
          </details>
          <details className="details">
            <summary>Assumptions, sensitivity & reproducibility</summary>
            <p>
              In-sample RMSE: {result.pooled_rmse.toFixed(3)} pooled → {result.adjusted_rmse.toFixed(3)}{' '}
              adjusted.
            </p>
            <div className="sensitivity">
              {result.sensitivity.map((s) => (
                <span key={s.excluded_year}>
                  Omit {s.excluded_year}: <strong>{s.slope.toFixed(3)}</strong>
                </span>
              ))}
            </div>
            {[...result.assumptions, ...result.limitations].map((v) => (
              <p key={v}>• {v}</p>
            ))}
            <p className="hash">Dataset SHA-256: {result.provenance.dataset_sha256}</p>
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
          <span className="eyebrow">LIVE EXPERIMENT EXECUTION</span>
          <h3>Following the evidence.</h3>
          <p>{events.at(-1)?.action}</p>
          <div className="execution-events">
            {events
              .filter((e) => e.agent === 'ExperimentRunner' || e.status === 'running')
              .map((e) => (
                <p key={e.id}>
                  {e.status === 'running' ? '◉' : '✓'} {e.action}
                </p>
              ))}
          </div>
        </div>
      ) : (
        <Empty text="Approval launches regression, resampling, sensitivity checks and artifact persistence." />
      )}
    </section>
  );
}
