import { Clock3, FileText, Layers3, ShieldCheck } from 'lucide-react';

const ICONS = { layers: Layers3, clock: Clock3, shield: ShieldCheck, file: FileText } as const;

export function QuestionChapter({
  question,
  stamp = 'User-supplied papers · parsed evidence',
  chips,
  scope = 'Reference reanalysis of a published aggregation reversal. One article, two analysis contexts; not conflicting independent studies.',
}: {
  question: string;
  stamp?: string;
  chips?: [keyof typeof ICONS, string][];
  scope?: string;
}) {
  const shown = chips ?? [];
  return (
    <section className="question-card">
      <div className="section-kicker">
        <span className="eyebrow">01 / RESEARCH QUESTION</span>
        <b className="stamp hon">{stamp}</b>
      </div>
      <h2>{question}</h2>
      <div className="question-meta">
        {shown.map(([icon, label]) => {
          const Icon = ICONS[icon];
          return (
            <span key={label}>
              <Icon size={13} />
              {label}
            </span>
          );
        })}
      </div>
      <p className="scope-note">{scope}</p>
    </section>
  );
}
