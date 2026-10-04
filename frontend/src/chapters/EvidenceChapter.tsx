import { evidenceLabels } from '../lib';
import type { Evidence } from '../types';
import { SectionHeading, Source, Tag } from '../ui';

export function EvidenceChapter({ evidence }: { evidence: Evidence[] }) {
  const sources = new Set(evidence.map((e) => e.citation.identifier)).size;
  return (
    <section>
      <SectionHeading
        eyebrow="02 / SOURCE EVIDENCE"
        title="What each paper actually says"
        aside={
          <Tag>
            {sources} source{sources === 1 ? '' : 's'} · {evidence.length} claims
          </Tag>
        }
      />
      <div className="evidence-grid">
        {evidence.map((e, i) => {
          const labels = evidenceLabels(e, i);
          return (
            <article className={'evidence-card ' + labels.tone} key={e.evidence_id}>
              <div className="card-top">
                <span className="eyebrow">{labels.eyebrow}</span>
                <Tag>{labels.tag}</Tag>
              </div>
              <h3>{labels.headline}</h3>
              <p>{e.claim}</p>
              <dl>
                {Object.entries(e.experimental_conditions).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <Source citation={e.citation} />
              <details>
                <summary>Source details & limitations</summary>
                <p>{e.citation.title}</p>
                <p>{e.citation.location}</p>
                {e.limitations.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </details>
            </article>
          );
        })}
      </div>
      <div className="conflict-band">
        <span className="conflict-symbol">≠</span>
        <div>
          <strong>Same question. Different answers.</strong>
          <p>
            {sources === 1 ? 'One uploaded paper' : `${sources} uploaded papers`}, {evidence.length} quoted
            claims with page-level provenance.
          </p>
        </div>
      </div>
    </section>
  );
}
