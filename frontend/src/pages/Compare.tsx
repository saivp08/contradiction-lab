import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, FileText, Play, Scale, Upload, X } from 'lucide-react';
import { api, freshRuns, navigate, uploadFile } from '../lib';
import type { AnalysisReport, PaperClaim, PaperSummary, RecordData } from '../types';
import { Tag } from '../ui';

type Slot = { status: 'empty' | 'uploading' | 'ready' | 'error'; summary?: PaperSummary; error?: string };

const DIRECTION_LABEL: Record<string, string> = {
  positive: 'positive effect',
  negative: 'negative effect',
  null: 'no significant effect',
  mixed: 'mixed effects',
};

function PaperSlot({
  letter,
  slot,
  onFile,
  onClear,
}: {
  letter: 'A' | 'B';
  slot: Slot;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const summary = slot.summary;
  return (
    <div className={'paper-slot ' + slot.status}>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        aria-label={`Paper ${letter} PDF`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <div className="card-top">
        <span className="eyebrow">PAPER {letter}</span>
        {summary && (
          <button className="text-button" onClick={onClear}>
            <X size={13} />
            Remove
          </button>
        )}
      </div>
      {summary ? (
        <div className="paper-parsed">
          <h3>{summary.meta.title}</h3>
          <p className="paper-byline">
            {summary.meta.authors.length ? summary.meta.authors.join(', ') : 'Authors not extracted'}
            {summary.meta.year ? ` · ${summary.meta.year}` : ' · year unknown'}
            {summary.meta.journal ? ` · ${summary.meta.journal}` : ''}
          </p>
          <div className="paper-chips">
            <Tag>{summary.meta.doi ? `DOI ${summary.meta.doi}` : 'No DOI found'}</Tag>
            <Tag>{summary.pages} pages</Tag>
            <Tag>{summary.n_claims} claims extracted</Tag>
            {summary.sample_size && <Tag>n = {summary.sample_size}</Tag>}
          </div>
          <p className="caption">
            Sections parsed: {summary.sections.join(', ') || 'none detected'}.
            {summary.warnings.length > 0 && ` ${summary.warnings.join(' ')}`}
          </p>
        </div>
      ) : (
        <button
          className="paper-drop"
          disabled={slot.status === 'uploading'}
          onClick={() => input.current?.click()}
        >
          {slot.status === 'uploading' ? (
            <span className="eyebrow">PARSING…</span>
          ) : (
            <>
              <Upload size={22} />
              <strong>Upload a research-paper PDF</strong>
              <small>Parsed locally: metadata, sections, and claim sentences with page provenance</small>
            </>
          )}
        </button>
      )}
      {slot.error && (
        <p className="paper-error" role="alert">
          {slot.error}
        </p>
      )}
    </div>
  );
}

function QuoteCard({ claim, paper }: { claim: PaperClaim; paper: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="quote-card">
      <blockquote>“{claim.text}”</blockquote>
      <div className="quote-meta">
        <Tag tone={claim.direction === 'null' ? '' : 'green'}>
          {DIRECTION_LABEL[claim.direction] ?? claim.direction}
        </Tag>
        <button className="text-button" onClick={() => setOpen(!open)} aria-expanded={open}>
          View evidence
        </button>
      </div>
      {open && (
        <dl className="quote-provenance">
          <div>
            <dt>Source</dt>
            <dd>{paper}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              p. {claim.page} · {claim.section} section
            </dd>
          </div>
          {claim.stats.length > 0 && (
            <div>
              <dt>Statistics in sentence</dt>
              <dd>{claim.stats.join('; ')}</dd>
            </div>
          )}
          <div>
            <dt>Extraction</dt>
            <dd>Exact sentence from the PDF text layer; nothing paraphrased.</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function ComparisonRow({ label, a, b }: { label: string; a: ReactNode; b: ReactNode }) {
  return (
    <div className="versus-row">
      <span className="versus-label">{label}</span>
      <div>{a ?? '—'}</div>
      <div>{b ?? '—'}</div>
    </div>
  );
}

function Report({ report, busy, onStart }: { report: AnalysisReport; busy: boolean; onStart: () => void }) {
  const [a, b] = report.papers;
  const best = report.best_pair;
  const claimA = best ? report.claims_a[best.a] : report.claims_a[0];
  const claimB = best ? report.claims_b[best.b] : report.claims_b[0];
  const defensible = report.defensible_contradiction;
  const tone = defensible ? 'contested' : 'calm';
  return (
    <section className="compare-report">
      <div className="versus-table">
        <div className="versus-row versus-head">
          <span className="versus-label" />
          <div>
            <span className="eyebrow">PAPER A</span>
            <h3>{a.meta.title}</h3>
          </div>
          <div>
            <span className="eyebrow">PAPER B</span>
            <h3>{b.meta.title}</h3>
          </div>
        </div>
        <ComparisonRow
          label="Finding"
          a={claimA ? <QuoteCard claim={claimA} paper={a.meta.title} /> : 'No directional claims extracted'}
          b={claimB ? <QuoteCard claim={claimB} paper={b.meta.title} /> : 'No directional claims extracted'}
        />
        <ComparisonRow
          label="Population"
          a={report.evidence?.[0]?.population_or_system}
          b={report.evidence?.[1]?.population_or_system}
        />
        <ComparisonRow label="Method" a={report.methods.a} b={report.methods.b} />
        <ComparisonRow
          label="Sample"
          a={a.sample_size ? `n = ${a.sample_size}` : 'not extracted'}
          b={b.sample_size ? `n = ${b.sample_size}` : 'not extracted'}
        />
        <ComparisonRow
          label="Limitations"
          a={report.limitations.a.join(' ') || 'not extracted'}
          b={report.limitations.b.join(' ') || 'not extracted'}
        />
      </div>

      <div className={'relationship-banner ' + tone}>
        <span className="eyebrow">SCIENTIFIC RELATIONSHIP</span>
        <h2>{report.relationship}</h2>
        {defensible ? (
          <>
            <p>
              The strongest aligned pair ({Math.round((best?.similarity ?? 0) * 100)}% term overlap,{' '}
              {best?.kind === 'tension' ? 'a directional claim against a null result' : 'opposite directions'}
              ) is a defensible disagreement worth investigating — stated with uncertainty, not as proof that
              either paper is wrong.
            </p>
            <button className="button primary" disabled={busy} onClick={onStart}>
              <Play size={15} />
              {busy ? 'Starting…' : 'Start the investigation'}
            </button>
          </>
        ) : (
          <div className="no-contradiction">
            <p>
              {report.relationship === 'complementary findings'
                ? 'These papers point in the same direction; their findings complement rather than contradict each other.'
                : 'These papers address related questions, but their findings are not sufficiently comparable to support a scientific contradiction.'}{' '}
              An investigation will not be fabricated.
            </p>
            <dl className="quote-provenance">
              <div>
                <dt>Paper A found</dt>
                <dd>{claimA ? `“${claimA.text}”` : 'No directional claim was extracted.'}</dd>
              </div>
              <div>
                <dt>Paper B found</dt>
                <dd>{claimB ? `“${claimB.text}”` : 'No directional claim was extracted.'}</dd>
              </div>
              <div>
                <dt>Why not contradictory</dt>
                <dd>
                  {report.relationship === 'complementary findings'
                    ? 'The best-aligned claims report effects in the same direction.'
                    : best
                      ? `The best term overlap between claims is ${Math.round(best.similarity * 100)}%, below the comparability bar.`
                      : 'No pair of claims shares enough terminology to compare.'}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {report.condition_differences.length > 0 && (
        <div className="differs">
          <span className="eyebrow">WHAT DIFFERS?</span>
          <div className="differs-grid">
            {report.condition_differences.map((difference) => (
              <div key={difference.field}>
                <strong>{difference.field}</strong>
                <small>A · {difference.a}</small>
                <small>B · {difference.b}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.pairs.length > 1 && (
        <details className="details">
          <summary>All aligned claim pairs ({report.pairs.length})</summary>
          {report.pairs.slice(0, 6).map((pair) => (
            <div className="pair-row" key={`${pair.a}-${pair.b}`}>
              <Tag tone={pair.kind === 'aligned' ? 'green' : ''}>
                {pair.kind} · {Math.round(pair.similarity * 100)}%
              </Tag>
              <p>“{report.claims_a[pair.a].text}”</p>
              <p>“{report.claims_b[pair.b].text}”</p>
            </div>
          ))}
        </details>
      )}

      <p className="caption">
        {report.engine}. {report.caveats.join(' ')}
      </p>
    </section>
  );
}

export function Compare() {
  const [slotA, setSlotA] = useState<Slot>({ status: 'empty' });
  const [slotB, setSlotB] = useState<Slot>({ status: 'empty' });
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const upload = (set: (slot: Slot) => void) => async (file: File) => {
    set({ status: 'uploading' });
    setReport(null);
    try {
      set({ status: 'ready', summary: await uploadFile<PaperSummary>('/papers', file) });
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
    }
  };

  async function analyze() {
    if (!slotA.summary || !slotB.summary) return;
    setAnalyzing(true);
    setError('');
    try {
      setReport(
        await api<AnalysisReport>('/papers/analyze', {
          method: 'POST',
          body: JSON.stringify({ paper_a: slotA.summary.id, paper_b: slotB.summary.id }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function start() {
    if (!report) return;
    setStarting(true);
    setError('');
    try {
      const record = await api<RecordData>('/investigations', {
        method: 'POST',
        body: JSON.stringify({ mode: 'local', source_analysis: report.analysis_id }),
      });
      freshRuns.add(record.id);
      navigate({ page: 'run', id: record.id, replay: false });
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <main className="compare">
      <header className="compare-head">
        <button className="text-button back" onClick={() => navigate({ page: 'home' })}>
          <ArrowLeft size={16} />
          Investigations
        </button>
        <div>
          <span className="eyebrow">NEW INVESTIGATION · FROM TWO PAPERS</span>
          <h1>Do these two papers disagree?</h1>
          <p>
            Upload any two research-paper PDFs. The lab parses their actual contents, extracts claims with
            page-level provenance, aligns comparable claims, and only starts an investigation if a defensible
            disagreement exists.
          </p>
        </div>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="paper-slots">
        <PaperSlot
          letter="A"
          slot={slotA}
          onFile={upload(setSlotA)}
          onClear={() => {
            setSlotA({ status: 'empty' });
            setReport(null);
          }}
        />
        <span className="versus-mark" aria-hidden="true">
          <Scale size={20} />
        </span>
        <PaperSlot
          letter="B"
          slot={slotB}
          onFile={upload(setSlotB)}
          onClear={() => {
            setSlotB({ status: 'empty' });
            setReport(null);
          }}
        />
      </div>
      {!report && (
        <div className="compare-actions">
          <button
            className="button primary"
            disabled={!slotA.summary || !slotB.summary || analyzing}
            onClick={analyze}
          >
            <FileText size={15} />
            {analyzing ? 'Analyzing contents…' : 'Analyze papers'}
            <ArrowRight size={15} />
          </button>
          <span className="caption">Analysis reads the parsed full text, not just titles or abstracts.</span>
        </div>
      )}
      {report && <Report report={report} busy={starting} onStart={start} />}
    </main>
  );
}
