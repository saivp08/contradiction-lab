import { ArrowUpRight, Check, Clock3, FlaskConical, ShieldCheck, X } from 'lucide-react';
import type { LabObject, RecordData } from '../types';

export function AgentPanel({
  open,
  record,
  live,
  onClose,
  onSelect,
}: {
  open: boolean;
  record: RecordData | null;
  live: boolean;
  onClose: () => void;
  onSelect: (object: LabObject) => void;
}) {
  return (
    <>
      {open && <div className="drawer-backdrop" onClick={onClose} />}
      <aside
        className={'agent-panel ' + (open ? 'open' : '')}
        role="dialog"
        aria-modal={open}
        aria-label="Agent activity"
        inert={!open}
      >
        <div className="agent-panel-heading">
          <span className="eyebrow">{live ? 'LIVE AGENTS' : 'LOCAL SPECIALISTS'} / ACTIVITY</span>
          <button aria-label="Close agents" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <h3>
          Observable work.
          <br />
          Traceable decisions.
        </h3>
        <p className="agent-disclosure">
          {live
            ? 'Language-model agents route work through restricted scientific tools.'
            : 'This run uses fixed, rule-based specialists. Every entry below is a real backend event.'}
        </p>
        <div className="activity-list">
          {record?.events.length ? (
            record.events.map((e, i) => (
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
                    <span>{String(i + 1).padStart(2, '0')}</span>
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
            ))
          ) : (
            <div className="agent-empty">
              <FlaskConical size={27} />
              <p>The lab is ready.</p>
              <small>
                Start an investigation to see evidence retrieval, scientific tools and structured handoffs.
              </small>
            </div>
          )}
        </div>
        <div className="rigor-box">
          <ShieldCheck size={18} />
          <strong>Rigor is part of the workflow.</strong>
          <p>Citations. Explicit uncertainty. Human approval. Reproducible computation.</p>
        </div>
      </aside>
    </>
  );
}
