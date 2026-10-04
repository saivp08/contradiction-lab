import { useEffect, useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { api, navigate, parseRoute, type Route } from './lib';
import type { RecordData, Summary } from './types';
import { Home } from './pages/Home';
import { Compare } from './pages/Compare';
import { Investigation } from './pages/Investigation';

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [history, setHistory] = useState<Summary[]>([]);
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
    refreshHistory();
  }, []);

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
  const compare = () => navigate({ page: 'compare' });

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
        <Home history={history} featured={featured} onNew={compare} />
      ) : route.page === 'compare' ? (
        <Compare />
      ) : (
        <Investigation id={route.id} replay={route.replay} onNew={compare} onChanged={refreshHistory} />
      )}
    </div>
  );
}
