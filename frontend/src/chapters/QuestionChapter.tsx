import { Clock3, Layers3, ShieldCheck } from 'lucide-react';

export function QuestionChapter({ question }: { question: string }) {
  return (
    <section className="question-card">
      <div className="section-kicker">
        <span className="eyebrow">01 / RESEARCH QUESTION</span>
        <b className="stamp hon">Known result · workflow case study</b>
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
    </section>
  );
}
