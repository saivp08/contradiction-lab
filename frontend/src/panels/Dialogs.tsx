import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Play, ShieldCheck, X } from 'lucide-react';
import { REFERENCE_QUESTION } from '../lib';
import type { LabObject, RecordData } from '../types';

function Dialog({
  id,
  className = '',
  closeLabel,
  onClose,
  children,
}: {
  id: string;
  className?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus the first control, trap Tab inside the dialog, lock page scroll, and restore focus on close.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const selector = 'button:not(:disabled),a[href],input,textarea,select,summary,[tabindex="0"]';
    const controls = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.getClientRects().length > 0,
      );
    controls()[0]?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const elements = controls(),
        first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className={'modal ' + className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" aria-label={closeLabel} onClick={onClose}>
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}

export function NewInvestigationDialog({
  label,
  onLabel,
  mode,
  onMode,
  ready,
  busy,
  onStart,
  onClose,
}: {
  label: string;
  onLabel: (value: string) => void;
  mode: string;
  onMode: (value: string) => void;
  ready: boolean;
  busy: boolean;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog id="modal-title" closeLabel="Close" onClose={onClose}>
      <span className="eyebrow">NEW INVESTIGATION</span>
      <h2 id="modal-title">Start a new run.</h2>
      <p>This version investigates one question on the Palmer Penguins dataset:</p>
      <blockquote className="fixed-question">{REFERENCE_QUESTION}</blockquote>
      <label htmlFor="run-label">Run name (optional)</label>
      <input
        id="run-label"
        value={label}
        placeholder="e.g. Seed 42 check"
        onChange={(e) => onLabel(e.target.value)}
        maxLength={120}
      />
      <p className="caption">The name helps you find this run later. It does not change the analysis.</p>
      <label htmlFor="engine">Who runs the steps</label>
      <select id="engine" value={mode} onChange={(e) => onMode(e.target.value)}>
        <option value="local">Rule-based specialists (no AI) — real computation</option>
        <option value="omnigent" disabled={!ready}>
          Live AI agents via Omnigent{!ready ? ' (needs API key)' : ''}
        </option>
      </select>
      {!ready && (
        <p className="caption">Live agents need ANTHROPIC_API_KEY on the server.</p>
      )}
      <button className="button primary full" disabled={busy} onClick={onStart}>
        <Play size={15} />
        Start investigation
      </button>
    </Dialog>
  );
}

export function ApprovalDialog({
  title,
  question,
  details,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  question: string;
  details: string[];
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog id="approval-title" className="approval" closeLabel="Cancel approval" onClose={onClose}>
      <span className="eyebrow">HUMAN APPROVAL</span>
      <h2 id="approval-title">Run “{title}”?</h2>
      <p>{question}</p>
      <ul className="approval-list">
        {details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" disabled={busy} onClick={onConfirm}>
          <ShieldCheck size={16} />
          Approve & run
        </button>
      </div>
    </Dialog>
  );
}

export function ProvenanceDialog({
  object,
  record,
  onSelect,
  onClose,
}: {
  object: LabObject;
  record: RecordData | null;
  onSelect: (o: LabObject | null) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      id="provenance-title"
      className="provenance-modal"
      closeLabel="Close provenance"
      onClose={onClose}
    >
      <span className="eyebrow">RESEARCH RECORD / {object.kind.toUpperCase()}</span>
      <h2 id="provenance-title">{object.id}</h2>
      <p>Created {new Date(object.created_at).toLocaleString()}</p>
      <h4>DERIVED FROM</h4>
      <div className="id-links">
        {object.input_ids.length ? (
          object.input_ids.map((id) => (
            <button key={id} onClick={() => onSelect(record?.objects[id] || null)}>
              {id}
              <ArrowUpRight size={12} />
            </button>
          ))
        ) : (
          <span className="muted">Human scientific objective</span>
        )}
      </div>
      <pre>{JSON.stringify(object.data, null, 2)}</pre>
    </Dialog>
  );
}
