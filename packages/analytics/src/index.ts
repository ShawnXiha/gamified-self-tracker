import type { PostHog } from 'posthog-js';

/**
 * Minimal Observability Tracker
 *
 * Tracks essential beta retention events locally or via a lightweight
 * analytics provider. For MVP, it logs to the console in dev and can be
 * wired up to PostHog / Sentry via VITE_* env vars in production builds.
 *
 * Privacy Note: We do not send identifiable user IDs.
 *
 * Environment variables:
 *  - VITE_POSTHOG_KEY / VITE_POSTHOG_HOST  -> enables PostHog capture
 *  - VITE_SENTRY_DSN  -> enables Sentry error reporting init
 *  - VITE_APP_VERSION -> Sentry release tag
 */

export type AnalyticsEvent = {
  name:
    | 'app_opened'
    | 'check_in_completed'
    | 'habit_created'
    | 'habit_renamed'
    | 'habit_archived'
    | 'habit_unarchived'
    | 'habit_deleted'
    | 'backup_exported';
  properties: Record<string, unknown>;
};

const importMetaEnv = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

/**
 * Reads a runtime key from Vite's `import.meta.env` first, then from
 * `process.env` (covers non-Vite consumers such as vitest/node). The
 * `globalThis` lookup is a no-op in the browser bundle.
 */
function readConfig(key: string): string | undefined {
  const fromImportMeta = importMetaEnv[key];
  if (fromImportMeta) return fromImportMeta;
  const nodeProcess = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
  return nodeProcess?.env[key];
}

let posthog: PostHog | null = null;
let initialized = false;
let warnedOnce = false;

/**
 * Lazily initializes PostHog and/or Sentry based on the configured env vars.
 * Safe to call multiple times; without any provider env vars it warns once
 * and leaves analytics disabled (trackEvent becomes a no-op).
 */
export async function initAnalytics(): Promise<void> {
  const posthogKey = readConfig('VITE_POSTHOG_KEY');
  const sentryDsn = readConfig('VITE_SENTRY_DSN');

  if (posthogKey) {
    const posthogModule = await import('posthog-js');
    const client = (posthogModule.default ?? posthogModule) as unknown as PostHog;
    posthog = client;
    client.init(posthogKey, {
      api_host: readConfig('VITE_POSTHOG_HOST') || 'https://app.posthog.com',
    });
    initialized = true;
  }

  if (sentryDsn) {
    const { init: initSentry } = await import('@sentry/react');
    initSentry({
      dsn: sentryDsn,
      release: readConfig('VITE_APP_VERSION'),
    });
    initialized = true;
  }

  if (!posthogKey && !sentryDsn && !warnedOnce) {
    warnedOnce = true;
    console.warn('[Analytics] Not initialized: neither VITE_POSTHOG_KEY nor VITE_SENTRY_DSN is configured.');
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  if (import.meta.env.DEV) {
    console.log(`[Analytics] ${event.name}`, event.properties);
    return;
  }
  if (initialized && posthog) {
    posthog.capture(event.name, event.properties);
  }
  // Not initialized: no-op by design (never throws).
}

export function getDeviceType(): 'mobile' | 'desktop' {
  return typeof window !== 'undefined' && window.innerWidth <= 768 ? 'mobile' : 'desktop';
}

export function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  const nav = window.navigator as Navigator & { standalone?: unknown };
  return 'standalone' in nav && Boolean(nav.standalone);
}

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ErrorBoundary feeds captured errors into the shared Sentry client that
// initAnalytics() configured (no-op before init, same as the previous UI-own
// integration).
export { captureException } from '@sentry/react';