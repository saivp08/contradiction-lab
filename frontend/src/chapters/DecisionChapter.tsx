import type { ReactNode } from 'react';
import { ArrowRight, Beaker, GitBranch } from 'lucide-react';
import type { Challenge } from '../arena/beats';
import type { Decision } from '../types';
import { Empty, SectionHeading, Tag } from '../ui';

const LOOP_NODES = ['Question', 'Evidence', 'Hypotheses', 'Experiment', 'Result', 'Critique', 'Decision'];

/** The discovery loop with the critique → experiment branch: learning, not a progress bar. */
function LearningLoop({ branched, openCount = 1 }: { branched: boolean; openCount?: number }) {
  const x = (i: number) => 56 + i * 98;
  return (
    <svg
      className={'learning-loop ' + (branched ? 'branched' : '')}
      viewBox="0 0 700 118"
      role="img"
      aria-label={
        branched
          ? 'Discovery loop: an open critique branches back into the experiment stage'
          : 'Discovery loop from question to decision'
      }
    >
      {LOOP_NODES.slice(0, -1).map((n, i) => (
        <line key={n} className="loop-line" x1={x(i) + 34} x2={x(i + 1) - 34} y1="34" y2="34" />
      ))}
      {branched && (
        <>
          <path
            className="loop-back"
            d={`M ${x(5)} 48 C ${x(5)} 96, ${x(3)} 96, ${x(3)} 48`}
            markerEnd="url(#loop-arrow)"
          />
          <text className="loop-back-label" x={(x(3) + x(5)) / 2} y="106" textAnchor="middle">
            {`${openCount} open challenge${openCount === 1 ? '' : 's'} → new experiment`}
          </text>
          <defs>
            <marker
              id="loop-arrow"
              viewBox="0 0 8 8"
              refX="6"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
            </marker>
          </defs>
        </>
      )}
      {LOOP_NODES.map((n, i) => (
        <g key={n} className={'loop-node' + (branched && (i === 3 || i === 5) ? ' hot' : '')}>
          <circle cx={x(i)} cy="34" r="4" />
          <text x={x(i)} y="16" textAnchor="middle">
            {n}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Evidence chain behind the decision: inspectable accountability, not narrative. */
function WhyThisDecision({ decision, challenge }: { decision: Decision; challenge?: Challenge }) {
  const rows: [string, ReactNode][] = [
    [
      'Triggered by',
      challenge ? `Critic challenge ${challenge.challenge_id}: ${challenge.attack}` : 'The computed result',
    ],
    ...(challenge ? [['Evidence for the gap', challenge.evidence] as [string, ReactNode]] : []),
    ['Reasoning', decision.rationale],
    ['Expected learning', decision.next_evidence_search],
    ['Human approval', 'Required again: the next experiment runs only after you approve a new plan'],
  ];
  return (
    <details className="why-decision" open>
      <summary>Why this decision? Trace the evidence chain</summary>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const METRIC_LABELS: [string, string][] = [
  ['hypotheses_evaluated', 'Hypotheses registered'],
  ['experiments_compared', 'Experiments compared'],
  ['agent_handoffs', 'Agent handoffs'],
  ['human_approvals', 'Human approval points'],
  ['challenges_raised', 'Challenges raised'],
  ['challenges_rebutted', 'Rebutted by data'],
  ['challenges_open', 'Still open'],
  ['question_to_spec_seconds', 'Question → test spec (s)'],
  ['compute_seconds', 'Computation (s)'],
  ['result_to_decision_seconds', 'Result → decision (s)'],
];

const formatMetric = (v: number | string) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;

function DiscoveryAcceleration({ metrics }: { metrics: Record<string, number | string> }) {
  const shown = METRIC_LABELS.filter(([k]) => metrics[k] !== undefined);
  if (!shown.length) return null;
  return (
    <div className="acceleration">
      <div className="acceleration-head">
        <span className="eyebrow">DISCOVERY ACCELERATION</span>
        <Tag>Workflow compression · prototype measurement</Tag>
      </div>
      <div className="acceleration-grid">
        {shown.map(([key, label]) => (
          <div key={key}>
            <strong>{formatMetric(metrics[key])}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="caption">
        Measured from this run's recorded events. No manual baseline was measured, so no speed multiplier is
        claimed; wall time includes waiting for human approval.
      </p>
    </div>
  );
}

export function DecisionChapter({
  decision,
  openChallenge,
  openChallenges,
  metrics,
}: {
  decision?: Decision;
  openChallenge?: Challenge;
  openChallenges?: Challenge[];
  metrics?: Record<string, number | string>;
}) {
  const openCount = openChallenges?.length ?? (openChallenge ? 1 : 0);
  return (
    <section>
      <SectionHeading
        eyebrow="07 / EVIDENCE-DRIVEN DECISION"
        title="Science moves when the plan changes."
        aside={<GitBranch size={21} />}
      />
      {decision ? (
        <div className="decision-card">
          <LearningLoop branched={!!openChallenge} openCount={openCount} />
          <div className="decision-columns">
            <div>
              <span className="eyebrow">BEFORE THE EXPERIMENT</span>
              <h3>{decision.previous_plan}</h3>
              <p>Three plausible explanations. Neutral initial support.</p>
            </div>
            <div className="decision-arrow">
              <ArrowRight size={25} />
            </div>
            <div>
              <span className="eyebrow mint">AFTER THE EXPERIMENT</span>
              <h3>{decision.next_decision}</h3>
              <p>{decision.rationale}</p>
            </div>
          </div>
          <div className="next-test">
            <Beaker size={20} />
            <div>
              <span className="eyebrow">NEXT SCIENTIFIC ACTION</span>
              <strong>{decision.next_experiment}</strong>
              <p>{decision.next_evidence_search}</p>
            </div>
          </div>
          <WhyThisDecision decision={decision} challenge={openChallenge} />
          {metrics && <DiscoveryAcceleration metrics={metrics} />}
        </div>
      ) : (
        <Empty text="The next decision will be selected from the actual result, after uncertainty and sensitivity checks." />
      )}
    </section>
  );
}
