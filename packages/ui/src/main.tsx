import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerSW } from 'virtual:pwa-register';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ 
    dsn: import.meta.env.VITE_SENTRY_DSN,
    release: import.meta.env.VITE_APP_VERSION,
  });
}

if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
  });
}

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
