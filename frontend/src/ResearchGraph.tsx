import { useState } from 'react';
import type { LabObject, RecordData } from './types';
const kinds = [
  'question',
  'paper',
  'prior_result',
  'prior_critique',
  'prior_decision',
  'evidence',
  'contradiction',
  'hypothesis',
  'experiment',
  'run',
  'result',
  'analysis',
  'critique',
  'decision',
  'plan_review',
  'safety',
];
const palette: Record<string, string> = {
  evidence: '#9fcdb7',
  contradiction: '#de9d90',
  hypothesis: '#b6acd0',
  experiment: '#96bbd1',
  result: '#96bbd1',
};
export function ResearchGraph({
  record,
  onSelect,
}: {
  record: RecordData;
  onSelect: (object: LabObject) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const columns = kinds
    .map((kind) => Object.values(record.objects).filter((o) => o.kind === kind))
    .filter((nodes) => nodes.length);
  // Vertical lineage: one row per object kind, objects spread across the row.
  const width = 520,
    row = 74,
    left = 150;
  const nodes = columns.flatMap((column, c) =>
    column.map((object, r) => ({
      object,
      x: left + ((width - left - 30) * (r + 1)) / (column.length + 1),
      y: 34 + c * row,
    })),
  );
  const positions = new Map(nodes.map((n) => [n.object.id, n]));
  const height = columns.length * row + 10;
  const focused = active ? positions.get(active) : null;
  return (
    <div className="research-constellation">
      <div className="graph-toolbar">
        <span>RESEARCH LINEAGE</span>
        <span>{nodes.length} objects · edges follow recorded inputs</span>
      </div>
      <div className="constellation-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Interactive scientific provenance graph"
        >
          {columns.map((column, c) => (
            <text key={column[0].kind} className="row-label" x="8" y={38 + c * row}>
              {column[0].kind.replace('_', ' ').toUpperCase()}
            </text>
          ))}
          {nodes.flatMap((n) =>
            n.object.input_ids.map((id) => {
              const from = positions.get(id);
              if (!from) return null;
              const lit = active === n.object.id || active === id;
              return (
                <path
                  key={id + n.object.id}
                  className={'lineage-edge ' + (lit ? 'highlight' : '')}
                  d={`M ${from.x} ${from.y} C ${from.x} ${from.y + 40}, ${n.x} ${n.y - 40}, ${n.x} ${n.y}`}
                  fill="none"
                />
              );
            }),
          )}
          {nodes.map((n) => (
            <g
              key={n.object.id}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${n.object.kind} ${n.object.id}`}
              onFocus={() => setActive(n.object.id)}
              onMouseEnter={() => setActive(n.object.id)}
              onClick={() => onSelect(n.object)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(n.object);
                }
              }}
              className={'constellation-node ' + (active === n.object.id ? 'active' : '')}
            >
              <rect x={n.x - 40} y={n.y - 20} width="80" height="56" fill="transparent" />
              <circle cx={n.x} cy={n.y} r="14" fill="#111b1e" stroke={palette[n.object.kind] || '#8baba0'} />
              <circle cx={n.x} cy={n.y} r="3.5" fill={palette[n.object.kind] || '#8baba0'} />
              <text className="node-id" x={n.x} y={n.y + 30} textAnchor="middle">
                {String(
                  n.object.data.hypothesis_id ||
                    n.object.data.experiment_id ||
                    n.object.data.evidence_id ||
                    n.object.id.slice(-6),
                )}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="graph-insight">
        {focused ? (
          <>
            <span>{focused.object.kind.toUpperCase()}</span>
            <p>
              {String(
                focused.object.data.statement ||
                  focused.object.data.claim ||
                  focused.object.data.scientific_question ||
                  focused.object.data.next_decision ||
                  focused.object.data.objective ||
                  'Select to inspect the complete scientific record.',
              )}
            </p>
          </>
        ) : (
          <>
            <span>EVERY CLAIM HAS A HISTORY</span>
            <p>Follow a connection. Select a node. Inspect the evidence behind it.</p>
          </>
        )}
      </div>
      <details className="details">
        <summary>Browse all research objects</summary>
        <div className="graph">
          {columns.map((column) => (
            <div className="graph-row" key={column[0].kind}>
              <span>{column[0].kind}</span>
              <div>
                {column.map((o) => (
                  <button key={o.id} onClick={() => onSelect(o)}>
                    <strong>
                      {String(o.data.statement || o.data.experiment_id || o.data.evidence_id || o.kind)}
                    </strong>
                    <small>
                      {o.id.slice(-6)} · {o.input_ids.length} incoming
                    </small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
