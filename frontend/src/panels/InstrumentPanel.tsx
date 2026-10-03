import { useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, Clock3, Download, ShieldCheck } from 'lucide-react';
import { DecompositionChart, Scatter } from '../Plots';
import { ResearchGraph } from '../ResearchGraph';
import { fmt, signed } from '../lib';
import type { Decomposition, LabObject, Point, RecordData, Result } from '../types';
import { Empty } from '../ui';

const TABS = ['Arena', 'Data', 'Lineage', 'Activity'] as const;
type Tab = (typeof TABS)[number];

function pooledSlope(points: Point[]) {
  if (!points.length) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length,
    my = points.reduce((s, p) => s + p.y, 0) / points.length;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return sxx ? points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx : null;
}

function KeyNumbers({ result, points }: { result?: Result; points: Point[] }) {
  const pooled = result?.pooled_slope ?? pooledSlope(points);
  return (
    <div className="key-numbers">
      <div>
        <span>Pooled slope</span>
        <strong className="coral">{pooled === null ? '—' : signed(pooled)}</strong>
        <small>all birds together</small>
      </div>
      <ArrowRight size={18} className="key-arrow" />
      <div>
        <span>{result ? `${result.group}-adjusted` : 'Adjusted slope'}</span>
        <strong className={result ? 'mint' : 'pending'}>
          {result ? signed(result.adjusted_slope) : '?'}
        </strong>
        <small>
          {result
            ? `95% CI [${result.adjusted_ci95.map((v) => v.toFixed(3)).join(', ')}]`
            : 'after you approve an experiment'}
        </small>
      </div>
    </div>
  );
}

function WhyItFlips({ parts }: { parts: Decomposition }) {
  const between = 1 - parts.within_weight;
  return (
    <section className="panel-block">
      <h3>Why the sign flips</h3>
      <p>
        The pooled slope splits exactly into a <em>within-{parts.group}</em> part and a{' '}
        <em>between-{parts.group}</em> part. {Math.round(between * 100)}% of the variation in bill length lies
        between {parts.group} groups, where the slope through the group means is {signed(parts.between_slope)}
        . Within groups the slope is {signed(parts.within_slope)}, but it carries only{' '}
        {Math.round(parts.within_weight * 100)}% of the weight.
      </p>
      <DecompositionChart parts={parts} />
      <p className="caption">{parts.note}</p>
    </section>
  );
}

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
  referencePoints,
  onSelect,
  arena,
}: {
  record: RecordData | null;
  referencePoints: Point[];
  onSelect: (o: LabObject) => void;
  arena: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('Arena');
  const results = Object.values(record?.objects ?? {});
  const result = results.find((o) => o.kind === 'result')?.data as Result | undefined;
  const followup = results.find((o) => o.kind === 'followup_result')?.data as Result | undefined;
  const points = result?.points ?? referencePoints;
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
        {tab === 'Data' && (
          <>
            <KeyNumbers result={result} points={points} />
            {followup && (
              <p className="followup-line">
                Follow-up adding sex + year:{' '}
                <strong className="mint">{signed(followup.adjusted_slope)}</strong>{' '}
                <span className="muted">[{followup.adjusted_ci95.map((v) => v.toFixed(3)).join(', ')}]</span>
              </p>
            )}
            {points.length ? <Scatter points={points} caption={false} /> : null}
            {result?.decomposition ? (
              <WhyItFlips parts={result.decomposition} />
            ) : (
              <p className="caption">
                Every point is a measured bird. Toggle to colour by species and see the trend reverse. The
                slope decomposition appears after the experiment runs.
              </p>
            )}
          </>
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
