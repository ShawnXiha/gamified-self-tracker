import posthog from 'posthog-js';

/**
 * Minimal Observability Tracker
 * 
 * Tracks essential beta retention events locally or via a lightweight analytics provider.
 * For MVP, it logs to the console but can be wired up to Vercel Analytics or Plausible.
 *
 * Privacy Note: We do not send identifiable user IDs.
 */

export type AnalyticsEvent =
  | { name: 'app_opened'; properties: { is_pwa_installed: boolean; device_type: 'mobile' | 'desktop' } }
  | { name: 'check_in_completed'; properties: { current_streak: number; time_of_day: 'morning' | 'afternoon' | 'evening' | 'night' } }
  | { name: 'habit_created'; properties: {} };

export function trackEvent(event: AnalyticsEvent) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Analytics] ${event.name}`, event.properties);
  } else {
    try {
      // Safely capture event if PostHog was initialized in main.tsx
      posthog.capture(event.name, event.properties);
    } catch (e) {
      console.debug(`[Analytics-Prod-Error] Failed to track ${event.name}`, e);
    }
  }
}

export function getDeviceType(): 'mobile' | 'desktop' {
  return typeof window !== 'undefined' && window.innerWidth <= 768 ? 'mobile' : 'desktop';
}

export function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || 
         ('standalone' in window.navigator && (window.navigator as any).standalone);
}

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
