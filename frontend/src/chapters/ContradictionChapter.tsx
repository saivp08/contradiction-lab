import { ArrowUpRight } from 'lucide-react';
import { SectionHeading } from '../ui';

export function ContradictionChapter({ canTrace, onTrace }: { canTrace: boolean; onTrace: () => void }) {
  return (
    <section>
      <SectionHeading eyebrow="03 / THE CONTRADICTION" title="Perspective changes everything." />
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
      <p>
        Both claims describe the same birds. The difference is the analysis context: pooling species versus
        separating them. Use <strong>Colour by species</strong> on the data panel to see the trend reverse.
      </p>
      <button className="text-button" onClick={onTrace} disabled={!canTrace}>
        Trace the contradiction record
        <ArrowUpRight size={16} />
      </button>
    </section>
  );
}
