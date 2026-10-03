import { ShieldCheck, Sparkles } from 'lucide-react';
import { experimentTitle } from '../lib';
import type { Experiment } from '../types';
import { Empty, SectionHeading, Tag } from '../ui';

export function ExperimentChapter({
  experiments,
  selected,
  rationale,
  canApprove,
  busy,
  onRequestApproval,
}: {
  experiments: Experiment[];
  selected?: string;
  rationale?: string;
  canApprove: boolean;
  busy: boolean;
  onRequestApproval: (experiment: Experiment) => void;
}) {
  return (
    <section>
      <SectionHeading
        eyebrow="05 / EXPERIMENT DESIGN"
        title="Choose the test that teaches us more"
        aside={
          <Tag tone={canApprove ? 'green' : ''}>
            {canApprove ? 'Your approval needed' : 'Human approval required'}
          </Tag>
        }
      />
      {experiments.length ? (
        <>
          {canApprove && (
            <div className="approval-callout" role="status">
              <ShieldCheck size={20} />
              <p>
                <strong>Nothing runs without you.</strong> Review both tests below, then approve one to run it
                on the dataset.
              </p>
            </div>
          )}
          <div className="experiment-grid">
            {experiments.map((e) => {
              const recommended = e.experiment_id === selected;
              return (
                <article
                  className={'experiment-card ' + (recommended ? 'recommended' : '')}
                  key={e.experiment_id}
                >
                  <div className="card-top">
                    <span className="eyebrow">{e.experiment_id} / EXPERIMENT</span>
                    {recommended && <Tag tone="green">Recommended</Tag>}
                  </div>
                  <h3>{experimentTitle(e)}</h3>
                  <p>{e.scientific_question}</p>
                  <div className="planning-metrics">
                    {(
                      [
                        ['Learning value', e.expected_information_gain],
                        ['Feasibility', e.feasibility],
                        ['Data coverage', e.data_availability],
                        ['Planning score', e.planning_score],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <strong>
                          {Math.round(v * 100)}
                          <small>/100</small>
                        </strong>
                        <meter min="0" max="1" value={v} aria-label={k} />
                      </div>
                    ))}
                  </div>
                  <details>
                    <summary>Planning assumptions & cost</summary>
                    <p className="caption">
                      Discrimination: {Math.round(e.discrimination * 100)} / 100 · Compute cost:{' '}
                      {e.computational_cost}
                    </p>
                    {e.limitations.map((l) => (
                      <p className="caption" key={l}>
                        {l}
                      </p>
                    ))}
                  </details>
                  <p className="caption">
                    {e.bootstrap_samples} bootstrap samples · seed {e.seed} · local CPU
                    <br />
                    Observational, exploratory; no causal identification.
                  </p>
                  {canApprove && (
                    <button
                      className={'button full ' + (recommended ? 'primary' : '')}
                      disabled={busy}
                      onClick={() => onRequestApproval(e)}
                    >
                      <ShieldCheck size={16} />
                      {recommended ? 'Approve & run experiment' : 'Approve alternative & run'}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <div className="rationale">
            <Sparkles size={16} />
            <p>
              <strong>Why this experiment?</strong> {rationale}
            </p>
          </div>
        </>
      ) : (
        <Empty text="The planner will compare learning value, feasibility, data coverage and compute cost." />
      )}
    </section>
  );
}
