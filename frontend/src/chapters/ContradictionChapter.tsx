import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Scatter } from '../Plots';
import type { Result } from '../types';
import { SectionHeading } from '../ui';

export function ContradictionChapter({
  result,
  canTrace,
  onTrace,
  onNext,
}: {
  result?: Result;
  canTrace: boolean;
  onTrace: () => void;
  onNext: () => void;
}) {
  return (
    <section id="stage-2">
      <SectionHeading
        eyebrow="03 / THE CONTRADICTION"
        title="Perspective changes everything."
        aside={
          <button className="text-button" onClick={onTrace} disabled={!canTrace}>
            Trace evidence
            <ArrowUpRight size={16} />
          </button>
        }
      />
      <div className="opposing">
        <div>
          <span className="eyebrow">AGGREGATED DATA</span>
          <h3 className="coral">↘ Negative relationship</h3>
        </div>
        <span>≠</span>
        <div>
          <span className="eyebrow">WITHIN SPECIES</span>
          <h3 className="mint">↗ Positive relationship</h3>
        </div>
      </div>
      {result ? (
        <Scatter result={result} />
      ) : (
        <div className="contradiction-explainer">
          <span className="editorial-mark">≠</span>
          <h3>
            The species context changes.
            <br />
            The measurements do not.
          </h3>
          <p>
            The source reports an aggregation reversal. Run an experiment to explore the measured birds and
            fitted trends.
          </p>
        </div>
      )}
      <button className="button primary" onClick={onNext}>
        Explore hypotheses
        <ArrowRight size={18} />
      </button>
    </section>
  );
}
