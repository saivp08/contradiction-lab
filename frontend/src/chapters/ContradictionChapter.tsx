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
  evidence = [],
  contradiction,
  model = false,
}: {
  canTrace: boolean;
  onTrace: () => void;
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
  if (evidence.length === 2) {
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
      <SectionHeading eyebrow="03 / THE CONTRADICTION" title="Where the papers disagree." />
      <p>{contradiction?.conflicting_claim ?? 'The comparison is still being assessed.'}</p>
      {!!contradiction?.differing_conditions.length && (
        <ul className="differs-list">
          {contradiction.differing_conditions.map((condition) => (
            <li key={condition}>{condition}</li>
          ))}
        </ul>
      )}
      <button className="text-button" onClick={onTrace} disabled={!canTrace}>
        Trace the contradiction record
        <ArrowUpRight size={16} />
      </button>
    </section>
  );
}
