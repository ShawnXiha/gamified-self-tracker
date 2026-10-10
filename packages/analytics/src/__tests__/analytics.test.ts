import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeviceType, getTimeOfDay, initAnalytics, isPwaInstalled, reportError, trackEvent } from '../index';

/**
 * Behavioral tests against the real module (no mocks): the no-provider path,
 * dev-mode console logging (vitest bakes import.meta.env.DEV=true into the
 * real config module), and the pure helpers. Keyed init paths live in
 * analytics-init.test.ts, where env access is mocked for per-test control.
 */
describe('initAnalytics (no provider env vars)', () => {
  it('initializes nothing, warns exactly once, and trackEvent is a safe no-op', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await initAnalytics();
      await initAnalytics();

      expect(warnSpy).toHaveBeenCalledTimes(1);

      expect(() =>
        trackEvent({
          name: 'app_opened',
          properties: { is_pwa_installed: false, device_type: 'mobile' },
        }),
      ).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('trackEvent (dev mode)', () => {
  it('logs the event to the console with the legacy format', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      trackEvent({ name: 'habit_created', properties: {} });
      expect(logSpy).toHaveBeenCalledWith('[Analytics] habit_created', {});

      trackEvent({
        name: 'check_in_completed',
        properties: { current_streak: 4, time_of_day: 'morning' },
      });
      expect(logSpy).toHaveBeenLastCalledWith('[Analytics] check_in_completed', {
        current_streak: 4,
        time_of_day: 'morning',
      });
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('reportError', () => {
  it('resolves without throwing against an uninitialized Sentry', async () => {
    await expect(reportError(new Error('boom'), { componentStack: 'at x' })).resolves.toBeUndefined();
  });
});

describe('getTimeOfDay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [20, 'evening'],
    [21, 'night'],
    [4, 'night'],
  ] as const)('hour %i maps to %s', (hour, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 11, hour, 15, 0, 0));
    expect(getTimeOfDay()).toBe(expected);
  });
});

function stubMatchMedia(value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', { value, configurable: true, writable: true });
  return () => {
    if (descriptor) {
      Object.defineProperty(window, 'matchMedia', descriptor);
    } else {
      delete (window as unknown as Record<string, unknown>).matchMedia;
    }
  };
}

describe('isPwaInstalled', () => {
  it('returns false without throwing when matchMedia is unavailable (jsdom)', () => {
    const restore = stubMatchMedia(undefined);
    try {
      expect(() => isPwaInstalled()).not.toThrow();
      expect(isPwaInstalled()).toBe(false);
    } finally {
      restore();
    }
  });

  it('returns true when matchMedia reports a standalone display mode', () => {
    const restore = stubMatchMedia(vi.fn().mockReturnValue({ matches: true }));
    try {
      expect(isPwaInstalled()).toBe(true);
    } finally {
      restore();
    }
  });
});

describe('getDeviceType', () => {
  it('returns mobile at or below 768px and desktop above', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
    expect(getDeviceType()).toBe('desktop');

    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 768 });
    expect(getDeviceType()).toBe('mobile');

    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
  });
});
