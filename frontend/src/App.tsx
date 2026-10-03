import { useEffect, useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { REFERENCE_QUESTION, api, freshRuns, navigate, parseRoute, type Route } from './lib';
import type { Dataset, Evidence, Point, RecordData, Summary } from './types';
import { Home } from './pages/Home';
import { Investigation } from './pages/Investigation';
import { NewInvestigationDialog } from './panels/Dialogs';

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [history, setHistory] = useState<Summary[]>([]);
  const [reference, setReference] = useState<Evidence[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('local');
  const [label, setLabel] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [featured, setFeatured] = useState<RecordData | null>(null);

  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (route.page === 'home') window.scrollTo({ top: 0 });
  }, [route.page]);
  useEffect(() => {
    api<{ omnigent_ready: boolean }>('/health')
      .then((h) => {
        setReady(h.omnigent_ready);
        if (h.omnigent_ready) setMode('omnigent');
      })
      .catch((e) => setError(e.message));
    api<{ evidence: Evidence[]; dataset: Dataset; points: Point[] }>('/reference')
      .then((r) => {
        setReference(r.evidence);
        setDataset(r.dataset);
        setPoints(r.points);
      })
      .catch((e) => setError(e.message));
    refreshHistory();
  }, []);
  useEffect(() => {
    if (!newOpen) return;
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setNewOpen(false);
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [newOpen]);

  // The home page hero shows the floor of the most recent completed debate.
  const featuredId = history.find((h) => h.status === 'complete')?.id;
  useEffect(() => {
    if (!featuredId) return setFeatured(null);
    api<RecordData>('/investigations/' + featuredId)
      .then(setFeatured)
      .catch(() => setFeatured(null));
  }, [featuredId]);

  function refreshHistory() {
    api<Summary[]>('/investigations')
      .then(setHistory)
      .catch((e) => setError(e.message));
  }
  async function start(name = label) {
    setBusy(true);
    setError('');
    try {
      const r = await api<RecordData>('/investigations', {
        method: 'POST',
        body: JSON.stringify({ objective: REFERENCE_QUESTION, label: name.trim() || null, mode, seed: 42 }),
      });
      setNewOpen(false);
      setLabel('');
      refreshHistory();
      freshRuns.add(r.id);
      navigate({ page: 'run', id: r.id, replay: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => navigate({ page: 'home' })}
          aria-label="Contradiction Lab home"
        >
          <FlaskConical size={20} />
          contradiction<span>lab</span>
        </button>
        <span className="topbar-tagline hide-small">Evidence → Experiment → Updated decision</span>
        <a
          className="text-button topbar-link"
          href="https://journal.r-project.org/articles/RJ-2022-020/"
          target="_blank"
          rel="noreferrer"
        >
          Reference science
        </a>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {route.page === 'home' ? (
        <Home
          history={history}
          featured={featured}
          busy={busy}
          onNew={() => setNewOpen(true)}
          onQuickStart={() => start('')}
        />
      ) : (
        <Investigation
          id={route.id}
          replay={route.replay}
          reference={reference}
          referencePoints={points}
          dataset={dataset}
          onNew={() => setNewOpen(true)}
          onChanged={refreshHistory}
        />
      )}
      {newOpen && (
        <NewInvestigationDialog
          label={label}
          onLabel={setLabel}
          mode={mode}
          onMode={setMode}
          ready={ready}
          busy={busy}
          onStart={() => start()}
          onClose={() => setNewOpen(false)}
        />
      )}
    </div>
  );
}
