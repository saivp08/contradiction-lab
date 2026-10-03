import { useState } from 'react';
import type { Result } from './types';
const colors: Record<string, string> = { Adelie: '#65cdb0', Chinstrap: '#bca2ff', Gentoo: '#f3b978' };
export function Scatter({ result }: { result: Result }) {
  const [grouped, setGrouped] = useState(false);
  const groups = grouped
    ? Object.entries(
        result.points.reduce<Record<string, Result['points']>>((groups, p) => {
          (groups[p.species] ??= []).push(p);
          return groups;
        }, {}),
      )
    : [['Pooled', result.points] as const];
  const trends = groups.flatMap(([name, points]) => {
    if (!points?.length) return [];
    const mx = points.reduce((s, p) => s + p.x, 0) / points.length,
      my = points.reduce((s, p) => s + p.y, 0) / points.length;
    const variance = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    if (!variance) return [];
    const slope = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / variance;
    return [
      {
        name,
        min: Math.min(...points.map((p) => p.x)),
        max: Math.max(...points.map((p) => p.x)),
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
        {result.points.map((p, i) => (
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
      <p className="caption">
        Every point is a measured bird. Lines are least-squares fits to the displayed measurements.
      </p>
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
