import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, Clock3, Download, ShieldCheck } from 'lucide-react';
import { ResearchGraph } from '../ResearchGraph';
import { fmt } from '../lib';
import type { LabObject, PapersResult, PapersSource, RecordData } from '../types';
import { Empty } from '../ui';

const TABS = ['Arena', 'Data', 'Lineage', 'Activity'] as const;
type Tab = (typeof TABS)[number];

function Activity({ record, onSelect }: { record: RecordData; onSelect: (o: LabObject) => void }) {
  return (
    <>
      <div className="activity-list">
        {record.events.map((e, i) => (
          <div className="activity" key={e.id}>
            <div className="activity-icon">
              {e.agent === 'Human' ? (
                <ShieldCheck size={14} />
              ) : e.status === 'running' ? (
                <Clock3 size={13} />
              ) : (
                <Check size={13} />
              )}
            </div>
            <div>
              <div className="activity-title">
                {e.agent.replace('Agent', '')}
                <span>
                  {String(i + 1).padStart(2, '0')} · {new Date(e.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p>{e.action}</p>
              <details>
                <summary>Inspect handoff</summary>
                <small>
                  Tool: {e.tool} · {e.elapsed_seconds.toFixed(2)}s
                </small>
                <p>Input: {e.input_ids.join(', ') || 'Objective'}</p>
                <p>Output: {e.output_ids.join(', ') || 'Pending'}</p>
              </details>
              {e.output_ids.length > 0 && (
                <button className="trace" onClick={() => onSelect(record.objects[e.output_ids[0]])}>
                  Inspect output
                  <ArrowUpRight size={11} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <details className="details">
        <summary>Run measurements</summary>
        <div className="metric-list">
          {Object.entries(record.metrics).map(([key, value]) => (
            <div key={key}>
              <span>{key.replaceAll('_', ' ')}</span>
              <strong>{typeof value === 'number' ? fmt(value) : value}</strong>
            </div>
          ))}
        </div>
        <p className="caption">
          Measured prototype activity. Wall time includes the wait for human approval.
        </p>
      </details>
      <a className="button full" href={`/api/investigations/${record.id}/export`}>
        <Download size={15} />
        Export JSON
      </a>
    </>
  );
}

export function InstrumentPanel({
  record,
  onSelect,
  arena,
}: {
  record: RecordData | null;
  onSelect: (o: LabObject) => void;
  arena: ReactNode;
}) {
  const source = record?.source ?? null;
  const [tab, setTab] = useState<Tab>('Arena');
  return (
    <aside className="instrument" aria-label="Data and provenance">
      <div className="panel-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t === 'Lineage' ? 'Research graph' : t === 'Activity' ? 'Record' : t}
          </button>
        ))}
      </div>
      <div className="panel-body" role="tabpanel" aria-label={tab}>
        {tab === 'Arena' && arena}
        {tab === 'Data' && source?.kind === 'papers' && (
          <PapersData
            source={source}
            result={
              Object.values(record?.objects ?? {}).find((o) => o.kind === 'result')?.data as
                PapersResult | undefined
            }
          />
        )}
        {tab === 'Lineage' &&
          (record ? (
            <ResearchGraph record={record} onSelect={onSelect} />
          ) : (
            <Empty text="Start an investigation to build its provenance graph." />
          ))}
        {tab === 'Activity' &&
          (record?.events.length ? (
            <Activity record={record} onSelect={onSelect} />
          ) : (
            <Empty text="Agent and tool activity appears here as the run progresses." />
          ))}
      </div>
    </aside>
  );
}

/** Data tab for paper comparisons: parsed metadata, claim counts and the contested quotes. */
function PapersData({ source, result }: { source: PapersSource; result?: PapersResult }) {
  const analysis = source.analysis;
  const best = analysis.best_pair;
  const quotes = result
    ? [
        [result.top_pair.quote_a, result.top_pair.location_a],
        [result.top_pair.quote_b, result.top_pair.location_b],
      ]
    : best
      ? [
          [
            analysis.claims_a[best.a].text,
            `p. ${analysis.claims_a[best.a].page} · ${analysis.claims_a[best.a].section}`,
          ],
          [
            analysis.claims_b[best.b].text,
            `p. ${analysis.claims_b[best.b].page} · ${analysis.claims_b[best.b].section}`,
          ],
        ]
      : [];
  return (
    <>
      <div className="key-numbers">
        <div>
          <span>Extracted claims</span>
          <strong>
            {analysis.claims_a.length}+{analysis.claims_b.length}
          </strong>
          <small>with page-level provenance</small>
        </div>
        <div>
          <span>Relationship</span>
          <strong className="relationship-word">{source.relationship}</strong>
          <small>
            {result
              ? `disagreement rate ${Math.round(result.disagreement_rate * 100)}%`
              : 'audit pending approval'}
          </small>
        </div>
      </div>
      {source.papers.map((paper, index) => (
        <div className="panel-block" key={paper.id}>
          <span className="eyebrow">PAPER {index === 0 ? 'A' : 'B'}</span>
          <h3>{paper.meta.title}</h3>
          <p className="caption">
            {(paper.meta.authors.length ? paper.meta.authors.join(', ') : 'Authors not extracted') +
              ` · ${paper.meta.year ?? 'year unknown'} · ${paper.pages} pages` +
              (paper.meta.doi ? ` · DOI ${paper.meta.doi}` : ' · no DOI found') +
              (paper.sample_size ? ` · n = ${paper.sample_size}` : '')}
          </p>
          {quotes[index] && (
            <blockquote className="quote-card">
              “{quotes[index][0]}”<footer>{quotes[index][1]}</footer>
            </blockquote>
          )}
        </div>
      ))}
      {analysis.condition_differences.length > 0 && (
        <div className="panel-block">
          <h3>What differs</h3>
          {analysis.condition_differences.map((difference) => (
            <p className="caption" key={difference.field}>
              <strong>{difference.field}:</strong> {difference.a} · {difference.b}
            </p>
          ))}
        </div>
      )}
      <p className="caption">{source.engine}.</p>
    </>
  );
}
