import { ArrowUpRight } from 'lucide-react';
import type { Evidence } from '../types';
import { SectionHeading } from '../ui';

const ARROWS: Record<string, [string, string]> = {
  positive: ['↗ Positive effect', 'mint'],
  negative: ['↘ Negative effect', 'coral'],
  unknown: ['Unknown effect direction', 'muted-strong'],
  mixed: ['⇅ Mixed effects', 'muted-strong'],
};

export function ContradictionChapter({
  canTrace,
  onTrace,
  papers = false,
  evidence = [],
  contradiction,
  model = false,
}: {
  canTrace: boolean;
  onTrace: () => void;
  papers?: boolean;
  evidence?: Evidence[];
  contradiction?: { conflicting_claim: string; differing_conditions: string[]; uncertainty: string; explanation?: string; disposition?: string };
  model?: boolean;
}) {
  if (model) return <section>
    <SectionHeading eyebrow="03 / SCIENTIFIC COMPARISON" title={contradiction?.disposition?.replaceAll('_', ' ') ?? 'Assessing the evidence'} />
    <p>{contradiction?.conflicting_claim}</p>
    <p>{contradiction?.explanation}</p>
    <ul className="differs-list">{contradiction?.differing_conditions.map(condition => <li key={condition}>{condition}</li>)}</ul>
    <p className="caption">{contradiction?.uncertainty}</p>
    <button className="text-button" onClick={onTrace} disabled={!canTrace}>Inspect comparison and provenance <ArrowUpRight size={16} /></button>
  </section>;
  if (papers && evidence.length === 2) {
    const [a, b] = evidence;
    const [labelA, toneA] = ARROWS[a.direction_of_effect] ?? ARROWS.unknown;
    const [labelB, toneB] = ARROWS[b.direction_of_effect] ?? ARROWS.unknown;
    return (
      <section>
        <SectionHeading eyebrow="03 / THE CONTRADICTION" title="Same question. Different answers." />
        <div className="opposing">
          <div>
            <span className="eyebrow">PAPER A · {a.citation.year ?? 'N.D.'}</span>
            <h3 className={toneA}>{labelA}</h3>
          </div>
          <span>≠</span>
          <div>
            <span className="eyebrow">PAPER B · {b.citation.year ?? 'N.D.'}</span>
            <h3 className={toneB}>{labelB}</h3>
          </div>
        </div>
        {contradiction && (
          <>
            <p>{contradiction.conflicting_claim}</p>
            <ul className="differs-list">
              {contradiction.differing_conditions.slice(0, 5).map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
            <p className="caption">{contradiction.uncertainty}</p>
          </>
        )}
        <button className="text-button" onClick={onTrace} disabled={!canTrace}>
          Trace the contradiction record
          <ArrowUpRight size={16} />
        </button>
      </section>
    );
  }
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
