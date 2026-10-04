import type { ReactNode } from 'react';
import { ArrowRight, Beaker, GitBranch, ShieldCheck } from 'lucide-react';
import type { Challenge } from '../arena/beats';
import { signed } from '../lib';
import type { Decision, FollowupDecision, Result } from '../types';
import { Empty, SectionHeading, Tag } from '../ui';

const FOLLOWUP = 'Species + sex + year regression';
const LOOP_NODES = ['Question', 'Evidence', 'Hypotheses', 'Experiment', 'Result', 'Critique', 'Decision'];

/** The discovery loop with the critique → experiment branch: learning, not a progress bar. */
function LearningLoop({ branched, closed }: { branched: boolean; closed: boolean }) {
  const x = (i: number) => 56 + i * 98;
  return (
    <svg
      className={'learning-loop ' + (closed ? 'closed' : branched ? 'branched' : '')}
      viewBox="0 0 700 118"
      role="img"
      aria-label={
        closed
          ? 'Discovery loop: the critique branched back into a follow-up experiment, now resolved'
          : branched
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
            {closed ? 'follow-up run · challenge partly conceded' : '1 open challenge → new experiment'}
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

/** Evidence chain behind the follow-up decision: inspectable accountability, not narrative. */
function WhyThisDecision({
  challenge,
  approval,
  followup,
  followupResult,
}: {
  challenge?: Challenge;
  approval?: { approved_at: string; actor: string } | null;
  followup?: FollowupDecision;
  followupResult?: Result;
}) {
  const rows: [string, ReactNode][] = [
    ['Triggered by', `Critic challenge ${challenge?.challenge_id ?? 'X5'} — sex confounding`],
    [
      'Evidence for the gap',
      challenge?.evidence ?? 'The first model adjusts for species only; sex was not controlled.',
    ],
    [
      'Expected learning',
      'Does the positive within-species slope survive adjustment for sex and collection year?',
    ],
    [
      'Human approval',
      approval ? `Approved · ${new Date(approval.approved_at).toLocaleString()}` : 'Awaiting your approval',
    ],
  ];
  if (followupResult) {
    rows.push([
      'Computed result',
      `Slope ${signed(followupResult.adjusted_slope)} · 95% CI [${followupResult.adjusted_ci95
        .map((v) => v.toFixed(3))
        .join(', ')}] · n = ${followupResult.n}`,
    ]);
  }
  if (followup) rows.push(['Decision after the result', followup.summary]);
  return (
    <details className="why-decision" open={!followup}>
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
  ['followup_experiments', 'Follow-ups triggered'],
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
  followup,
  followupResult,
  openChallenge,
  resolvedChallenge,
  followupApproval,
  metrics,
  canRunFollowup,
  busy,
  onRunFollowup,
}: {
  decision?: Decision;
  followup?: FollowupDecision;
  followupResult?: Result;
  openChallenge?: Challenge;
  resolvedChallenge?: Challenge;
  followupApproval?: { approved_at: string; actor: string } | null;
  metrics?: Record<string, number | string>;
  canRunFollowup: boolean;
  busy: boolean;
  onRunFollowup: () => void;
}) {
  const branched = !!(openChallenge || resolvedChallenge);
  return (
    <section>
      <SectionHeading
        eyebrow="07 / EVIDENCE-DRIVEN DECISION"
        title="Science moves when the plan changes."
        aside={<GitBranch size={21} />}
      />
      {decision ? (
        <div className="decision-card">
          <LearningLoop branched={branched} closed={!!followup} />
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
            {canRunFollowup && decision.next_experiment === FOLLOWUP && !followup && (
              <button className="button primary" disabled={busy} onClick={onRunFollowup}>
                <ShieldCheck size={16} />
                {busy ? 'Running…' : 'Approve & run follow-up'}
              </button>
            )}
          </div>
          {decision.next_experiment === FOLLOWUP && (
            <WhyThisDecision
              challenge={resolvedChallenge ?? openChallenge}
              approval={followupApproval}
              followup={followup}
              followupResult={followupResult}
            />
          )}
          {followup && followupResult && (
            <div className="followup">
              <div className="card-top">
                <span className="eyebrow">FOLLOW-UP / E3 · {FOLLOWUP.toUpperCase()}</span>
                <Tag tone="green">Actual result · n = {followupResult.n}</Tag>
              </div>
              <h3>{followup.summary}</h3>
              <div className="result-metrics compact">
                <div>
                  <span>Species-only slope</span>
                  <strong>{signed(followupResult.species_only_slope ?? 0)}</strong>
                </div>
                <ArrowRight size={20} />
                <div>
                  <span>+ sex + year</span>
                  <strong className="mint">{signed(followupResult.adjusted_slope)}</strong>
                </div>
                <div>
                  <span>95% bootstrap interval</span>
                  <strong className="interval">
                    [{followupResult.adjusted_ci95.map((v) => v.toFixed(3)).join(', ')}]
                  </strong>
                </div>
              </div>
              <p>
                {followup.hypothesis_id} support {followup.prior_support} → {followup.updated_support} ·{' '}
                {followup.result_consistency}. {followup.evidence}
              </p>
              <div className="next-test">
                <GitBranch size={20} />
                <div>
                  <span className="eyebrow">UPDATED NEXT STEP</span>
                  <strong>{followup.next_decision}</strong>
                </div>
              </div>
            </div>
          )}
          {metrics && <DiscoveryAcceleration metrics={metrics} />}
        </div>
      ) : (
        <Empty text="The next decision will be selected from the actual result, after uncertainty and sensitivity checks." />
      )}
    </section>
  );
}
