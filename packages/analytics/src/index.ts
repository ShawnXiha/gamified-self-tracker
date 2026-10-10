import type { PostHog } from 'posthog-js';
import { isDev, readConfig } from './config';

/**
 * Minimal Observability Tracker
 *
 * Tracks essential beta retention events locally or via a lightweight
 * analytics provider. For MVP, it logs to the console in dev and can be
 * wired up to PostHog / Sentry via VITE_* env vars in production builds.
 *
 * Privacy Note: We do not send identifiable user IDs, and only explicitly
 * tracked events leave the app (autocapture and automatic pageviews are
 * disabled).
 *
 * Environment variables:
 *  - VITE_POSTHOG_KEY / VITE_POSTHOG_HOST  -> enables PostHog capture
 *  - VITE_SENTRY_DSN                       -> enables Sentry error reporting
 *  - VITE_APP_VERSION                      -> Sentry release tag
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

let posthog: PostHog | null = null;
let initialized = false;
let warnedOnce = false;

/**
 * Lazily initializes PostHog and/or Sentry based on the configured env vars.
 * Idempotent: after a successful initialization subsequent calls no-op.
 * Without any provider env vars it warns once and leaves analytics disabled
 * (trackEvent becomes a no-op).
 */
export async function initAnalytics(): Promise<void> {
  if (initialized) return;

  const posthogKey = readConfig('VITE_POSTHOG_KEY');
  const sentryDsn = readConfig('VITE_SENTRY_DSN');

  if (posthogKey) {
    const posthogModule = await import('posthog-js');
    const client = (posthogModule.default ?? posthogModule) as unknown as PostHog;
    posthog = client;
    client.init(posthogKey, {
      api_host: readConfig('VITE_POSTHOG_HOST') || 'https://app.posthog.com',
      autocapture: false,
      capture_pageview: false,
    });
    initialized = true;
  }

  if (sentryDsn) {
    const { init: initSentry } = await import('@sentry/react');
    const release = readConfig('VITE_APP_VERSION');
    initSentry(release ? { dsn: sentryDsn, release } : { dsn: sentryDsn });
    initialized = true;
  }

  if (!posthogKey && !sentryDsn && !warnedOnce) {
    warnedOnce = true;
    console.warn('[Analytics] Not initialized: neither VITE_POSTHOG_KEY nor VITE_SENTRY_DSN is configured.');
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  if (isDev()) {
    console.log(`[Analytics] ${event.name}`, event.properties);
    return;
  }
  if (!initialized || !posthog) return;
  try {
    posthog.capture(event.name, event.properties);
  } catch (e) {
    console.debug(`[Analytics-Prod-Error] Failed to track ${event.name}`, e);
  }
}

/**
 * Reports an error to Sentry (if initialized — @sentry/react's captureException
 * is a built-in no-op before init). Sentry is loaded lazily; this never throws.
 */
export async function reportError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  try {
    const { captureException } = await import('@sentry/react');
    captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Never throws — a missing/unavailable SDK must not break the app.
  }
}

export function getDeviceType(): 'mobile' | 'desktop' {
  return typeof window !== 'undefined' && window.innerWidth <= 768 ? 'mobile' : 'desktop';
}

export function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
    const nav = window.navigator as Navigator & { standalone?: unknown };
    return 'standalone' in nav && Boolean(nav.standalone);
  } catch {
    return false;
  }
}

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
