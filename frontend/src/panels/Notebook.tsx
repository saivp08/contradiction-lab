import { ArrowUpRight, Download } from 'lucide-react';
import { fmt } from '../lib';
import { ResearchGraph } from '../ResearchGraph';
import type { LabObject, RecordData } from '../types';
import { Empty, SectionHeading, Tag } from '../ui';

export function GraphView({
  record,
  onSelect,
}: {
  record: RecordData | null;
  onSelect: (o: LabObject) => void;
}) {
  return (
    <section>
      <SectionHeading eyebrow="CONNECTED RESEARCH RECORD" title="Follow the evidence backward." />
      <p className="muted">Select a node to inspect its inputs, scientific data and provenance.</p>
      {record ? (
        <ResearchGraph record={record} onSelect={onSelect} />
      ) : (
        <Empty text="Start an investigation to build its provenance graph." />
      )}
    </section>
  );
}

export function Notebook({
  record,
  onSelect,
}: {
  record: RecordData | null;
  onSelect: (o: LabObject) => void;
}) {
  return (
    <section>
      <SectionHeading
        eyebrow="PERSISTENT & RECONSTRUCTABLE"
        title="Lab notebook"
        aside={
          record && (
            <a className="button" href={`/api/investigations/${record.id}/export`}>
              <Download size={15} />
              Export JSON
            </a>
          )
        }
      />
      <p className="muted">
        Observable actions and scientific rationale only. Every handoff retains stable object IDs.
      </p>
      {!record && <Empty text="Start an investigation to begin the research notebook." />}
      {record && (
        <details className="details">
          <summary>Discovery measurements</summary>
          <div className="support-updates">
            {Object.entries(record.metrics).map(([key, value]) => (
              <div key={key}>
                <span>{key.replaceAll('_', ' ')}</span>
                <p>{typeof value === 'number' ? fmt(value) : value}</p>
              </div>
            ))}
          </div>
          <p className="caption">
            Measured prototype activity. No manual baseline or speedup claim. Wall time includes human
            approval.
          </p>
        </details>
      )}
      {record?.events.map((e) => (
        <article className="notebook-event" key={e.id}>
          <div>
            <Tag>{e.agent}</Tag>
            <span className="muted">{new Date(e.timestamp).toLocaleTimeString()}</span>
          </div>
          <h3>{e.action}</h3>
          <p>
            Tool: <code>{e.tool}</code> · {e.elapsed_seconds.toFixed(3)}s
          </p>
          <div className="id-links">
            {[...e.input_ids, ...e.output_ids].map((id) => (
              <button key={id} onClick={() => onSelect(record.objects[id])}>
                {id}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
