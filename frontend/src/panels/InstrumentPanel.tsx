import { useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, Clock3, Download, ShieldCheck } from 'lucide-react';
import { DecompositionChart, Scatter } from '../Plots';
import { ResearchGraph } from '../ResearchGraph';
import { fmt, signed } from '../lib';
import type {
  Decomposition,
  LabObject,
  PapersResult,
  PapersSource,
  Point,
  RecordData,
  Result,
} from '../types';
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
  const source = record?.source ?? null;
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
        {tab === 'Data' && source?.kind === 'papers' && (
          <PapersData
            source={source}
            result={
              Object.values(record?.objects ?? {}).find((o) => o.kind === 'result')?.data as
                PapersResult | undefined
            }
          />
        )}
        {tab === 'Data' && source?.kind !== 'papers' && (
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
