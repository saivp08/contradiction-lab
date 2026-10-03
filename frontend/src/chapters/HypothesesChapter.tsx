import { ArrowRight } from 'lucide-react';
import type { Hypothesis } from '../types';
import { Empty, SectionHeading, Tag } from '../ui';

/** Shows hypotheses as registered before the experiment; updated support is revealed on the Result chapter. */
export function HypothesesChapter({
  hypotheses,
  updated,
  onShowResult,
}: {
  hypotheses: Hypothesis[];
  updated: boolean;
  onShowResult: () => void;
}) {
  return (
    <section>
      <SectionHeading
        eyebrow="04 / COMPETING EXPLANATIONS"
        title={
          <>
            Three explanations.
            <br />
            One contradiction.
          </>
        }
        aside={<span className="muted">Support scores are heuristics, not probabilities</span>}
      />
      {hypotheses.length ? (
        <>
          <div className="hypothesis-grid">
            {hypotheses.map((h) => (
              <article className="hypothesis-card" key={h.hypothesis_id}>
                <div className="card-top">
                  <span className="hypothesis-id">{h.hypothesis_id}</span>
                  {h.agent_generated && <Tag>AI-generated</Tag>}
                </div>
                <h3>{h.statement}</h3>
                <div className="score-line">
                  <span>Starting support</span>
                  <strong>
                    {h.support_score}
                    <small>/100</small>
                  </strong>
                </div>
                <div className="score-track">
                  <div style={{ width: `${h.support_score}%` }} />
                </div>
                <details>
                  <summary>Prediction & falsification</summary>
                  <h4>PREDICTION</h4>
                  {h.predictions.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  <h4>WEAKENED IF</h4>
                  <p>{h.falsification_condition}</p>
                  <h4>RATIONALE</h4>
                  <p>{h.rationale}</p>
                </details>
              </article>
            ))}
          </div>
          {updated && (
            <div className="rationale">
              <p>
                <strong>The experiment has updated these scores.</strong> Each explanation starts neutral; see
                how the evidence moved them.
              </p>
              <button className="text-button" onClick={onShowResult}>
                Jump to updated support
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty text="Start the investigation to register testable explanations." />
      )}
    </section>
  );
}
