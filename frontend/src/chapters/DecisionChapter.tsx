import { ArrowRight, Beaker, GitBranch, ShieldCheck } from 'lucide-react';
import { signed } from '../lib';
import type { Decision, FollowupDecision, Result } from '../types';
import { Empty, SectionHeading, Tag } from '../ui';

const FOLLOWUP = 'Species + sex + year regression';

export function DecisionChapter({
  decision,
  followup,
  followupResult,
  canRunFollowup,
  busy,
  onRunFollowup,
}: {
  decision?: Decision;
  followup?: FollowupDecision;
  followupResult?: Result;
  canRunFollowup: boolean;
  busy: boolean;
  onRunFollowup: () => void;
}) {
  return (
    <section>
      <SectionHeading
        eyebrow="07 / EVIDENCE-DRIVEN DECISION"
        title="Science moves when the plan changes."
        aside={<GitBranch size={21} />}
      />
      {decision ? (
        <div className="decision-card">
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
        </div>
      ) : (
        <Empty text="The next decision will be selected from the actual result, after uncertainty and sensitivity checks." />
      )}
    </section>
  );
}
