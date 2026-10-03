import { ArrowRight, Clock3, Layers3, ShieldCheck } from 'lucide-react';
import { Tag } from '../ui';

export function QuestionChapter({
  question,
  status,
  busy,
  started,
  onBegin,
}: {
  question: string;
  status: string;
  busy: boolean;
  started: boolean;
  onBegin: () => void;
}) {
  return (
    <section className="question-card" id="stage-0">
      <div className="section-kicker">
        <span className="eyebrow">RESEARCH QUESTION / 01</span>
        <Tag tone="green">{status}</Tag>
      </div>
      <h2>{question}</h2>
      <div className="question-meta">
        <span>
          <Layers3 size={13} />
          Palmer Penguins
        </span>
        <span>
          <Clock3 size={13} />
          2007–2009 observations
        </span>
        <span>
          <ShieldCheck size={13} />
          CC0 · public data
        </span>
      </div>
      <p className="scope-note">
        Reference reanalysis of a published aggregation reversal. One article, two analysis contexts; not
        conflicting independent studies.
      </p>
      <button className="button primary begin" disabled={busy} onClick={onBegin}>
        {started ? 'Continue investigation' : 'Begin investigation'}
        <ArrowRight size={18} />
      </button>
    </section>
  );
}
