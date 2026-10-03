import { useState } from 'react';
import type { Decomposition, Point, Result } from './types';
const colors: Record<string, string> = { Adelie: '#65cdb0', Chinstrap: '#bca2ff', Gentoo: '#f3b978' };
export function Scatter({ points, caption = true }: { points: Point[]; caption?: boolean }) {
  const [grouped, setGrouped] = useState(false);
  const groups = grouped
    ? Object.entries(
        points.reduce<Record<string, Point[]>>((groups, p) => {
          (groups[p.species] ??= []).push(p);
          return groups;
        }, {}),
      )
    : [['Pooled', points] as const];
  const trends = groups.flatMap(([name, members]) => {
    if (!members?.length) return [];
    const mx = members.reduce((s, p) => s + p.x, 0) / members.length,
      my = members.reduce((s, p) => s + p.y, 0) / members.length;
    const variance = members.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    if (!variance) return [];
    const slope = members.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / variance;
    return [
      {
        name,
        min: Math.min(...members.map((p) => p.x)),
        max: Math.max(...members.map((p) => p.x)),
        slope,
        intercept: my - slope * mx,
      },
    ];
  });
  const x = (n: number) => 55 + ((n - 30) / 32) * 585,
    y = (n: number) => 280 - ((n - 12) / 10) * 235;
  return (
    <div className="plot">
      <div className="plot-head">
        <span>BILL MORPHOMETRY</span>
        <div className="plot-toggle">
          <button
            className={!grouped ? 'active' : ''}
            aria-pressed={!grouped}
            onClick={() => setGrouped(false)}
          >
            Pooled data
          </button>
          <button className={grouped ? 'active' : ''} aria-pressed={grouped} onClick={() => setGrouped(true)}>
            Color by species
          </button>
        </div>
        <div className="legend">
          {Object.entries(colors).map(([s, c]) => (
            <span key={s}>
              <i style={{ background: c }} />
              {s}
            </span>
          ))}
        </div>
      </div>
      <svg
        viewBox="0 0 700 330"
        role="img"
        aria-label={
          grouped
            ? 'Actual bill measurements with species-specific fitted trends'
            : 'Actual bill measurements with pooled fitted trend'
        }
      >
        {[14, 16, 18, 20, 22].map((v) => (
          <g key={v}>
            <line className="gridline" x1="55" x2="650" y1={y(v)} y2={y(v)} />
            <text x="42" y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {[30, 35, 40, 45, 50, 55, 60].map((v) => (
          <text key={v} x={x(v)} y="300" textAnchor="middle">
            {v}
          </text>
        ))}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.x)}
            cy={y(p.y)}
            r="3.2"
            fill={grouped ? colors[p.species] : '#aabbb5'}
            opacity=".72"
          >
            <title>
              {p.species}, {p.year}: {p.x} × {p.y} mm
            </title>
          </circle>
        ))}
        {trends.map((t) => (
          <line
            key={t.name}
            x1={x(t.min)}
            x2={x(t.max)}
            y1={y(t.intercept + t.slope * t.min)}
            y2={y(t.intercept + t.slope * t.max)}
            stroke={grouped ? colors[t.name] : '#df9c91'}
            strokeWidth="2.5"
          />
        ))}
        <text x="350" y="326" textAnchor="middle">
          Bill length (mm)
        </text>
        <text transform="translate(15,170) rotate(-90)" textAnchor="middle">
          Bill depth (mm)
        </text>
      </svg>
      {caption && (
        <p className="caption">
          Every point is a measured bird. Lines are least-squares fits to the displayed measurements.
        </p>
      )}
    </div>
  );
}
export function Slopes({ result }: { result: Result }) {
  const rows = [
    { label: 'All species pooled', value: result.pooled_slope },
    { label: `${result.group}-adjusted`, value: result.adjusted_slope },
    ...result.subgroups.map((s) => ({ label: `${s.group} · n=${s.n}`, value: s.slope })),
  ];
  const extent =
    Math.max(0.4, ...rows.map((r) => Math.abs(r.value)), ...result.adjusted_ci95.map(Math.abs)) * 1.2;
  const x = (n: number) => 160 + ((n + extent) / (extent * 2)) * 460;
  return (
    <div className="plot">
      <div className="plot-head">
        ASSOCIATION REVERSAL <span className="muted">mm depth / mm length</span>
      </div>
      <svg
        viewBox={`0 0 680 ${rows.length * 43 + 45}`}
        role="img"
        aria-label="Pooled, adjusted and subgroup regression slopes"
      >
        <line x1={x(0)} x2={x(0)} y1="10" y2={rows.length * 43 + 10} stroke="#62717c" strokeDasharray="4 4" />
        {rows.map((r, i) => (
          <g key={r.label}>
            <text x="145" y={i * 43 + 31} textAnchor="end">
              {r.label}
            </text>
            <line
              x1={x(0)}
              x2={x(r.value)}
              y1={i * 43 + 27}
              y2={i * 43 + 27}
              stroke={r.value < 0 ? '#f4a39e' : '#65cdb0'}
              strokeWidth="3"
            />
            {i === 1 && (
              <line
                x1={x(result.adjusted_ci95[0])}
                x2={x(result.adjusted_ci95[1])}
                y1={i * 43 + 27}
                y2={i * 43 + 27}
                stroke="#fff"
                strokeWidth="2"
              />
            )}
            <circle cx={x(r.value)} cy={i * 43 + 27} r="5" fill={r.value < 0 ? '#f4a39e' : '#65cdb0'} />
            <text x="645" y={i * 43 + 31} textAnchor="end">
              {r.value.toFixed(3)}
            </text>
          </g>
        ))}
      </svg>
      <p className="caption">
        White interval: stratified bootstrap 95% confidence interval for the adjusted slope.
      </p>
    </div>
  );
}

const MINT = '#65cdb0',
  CORAL = '#f4a39e';

/** Diverging bars showing the exact within + between split of the pooled slope. */
export function DecompositionChart({ parts }: { parts: Decomposition }) {
  const rows = [
    {
      label: `Within ${parts.group}`,
      value: parts.within_contribution,
      detail: `${parts.within_slope.toFixed(3)} × ${(parts.within_weight * 100).toFixed(0)}%`,
    },
    {
      label: `Between ${parts.group}`,
      value: parts.between_contribution,
      detail: `${parts.between_slope.toFixed(3)} × ${((1 - parts.within_weight) * 100).toFixed(0)}%`,
    },
    { label: '= Pooled slope', value: parts.pooled_slope, detail: 'sum' },
  ];
  const extent = Math.max(...rows.map((r) => Math.abs(r.value))) * 1.15;
  const x = (n: number) => 250 + (n / extent) * 150;
  return (
    <svg
      viewBox="0 0 560 150"
      role="img"
      aria-label="Pooled slope split into within-group and between-group contributions"
    >
      <line x1={x(0)} x2={x(0)} y1="6" y2="140" stroke="#62717c" strokeDasharray="4 4" />
      {rows.map((r, i) => {
        const y = 22 + i * 46;
        const color = r.value < 0 ? CORAL : MINT;
        return (
          <g key={r.label}>
            {i === 2 && <line x1="10" x2="550" y1={y - 22} y2={y - 22} stroke="#ffffff1a" />}
            <text x="10" y={y + 5}>
              {r.label}
            </text>
            <rect
              x={Math.min(x(0), x(r.value))}
              y={y - 9}
              width={Math.abs(x(r.value) - x(0))}
              height="18"
              rx="2"
              fill={color}
              opacity={i === 2 ? 1 : 0.8}
            />
            <text x="550" y={y + 5} textAnchor="end" fill={color}>
              {(r.value > 0 ? '+' : '') + r.value.toFixed(3)}
            </text>
            <text x="550" y={y + 20} textAnchor="end" className="chart-note">
              {r.detail}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Tiny before/after slope glyph for dashboard cards. */
export function MiniSlopes({
  pooled,
  adjusted,
  followup,
}: {
  pooled: number;
  adjusted: number;
  followup?: number;
}) {
  const line = (slope: number) => {
    const rise = Math.max(-1, Math.min(1, slope / 0.25)) * 26;
    return { y1: 32 + rise, y2: 32 - rise };
  };
  const lines = [
    { slope: pooled, color: CORAL, dash: '' },
    { slope: adjusted, color: MINT, dash: '' },
    ...(followup === undefined ? [] : [{ slope: followup, color: MINT, dash: '4 3' }]),
  ];
  return (
    <svg viewBox="0 0 96 64" className="mini-slopes" aria-hidden="true">
      <line x1="0" x2="96" y1="32" y2="32" stroke="#ffffff14" />
      {lines.map((l, i) => (
        <line
          key={i}
          x1="8"
          x2="88"
          {...line(l.slope)}
          stroke={l.color}
          strokeWidth="2.5"
          strokeDasharray={l.dash}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
