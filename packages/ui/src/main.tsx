import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerSW } from 'virtual:pwa-register';
import { initAnalytics } from 'analytics';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Fire-and-forget: lazy-loads PostHog/Sentry only when the matching VITE_*
// env vars are present, without blocking first render.
void initAnalytics();

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
