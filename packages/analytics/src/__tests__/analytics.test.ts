import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { getDeviceType, getTimeOfDay, initAnalytics, isPwaInstalled, trackEvent } from '../index';

const CONFIG_KEYS = ['VITE_POSTHOG_KEY', 'VITE_POSTHOG_HOST', 'VITE_SENTRY_DSN', 'VITE_APP_VERSION'];

describe('initAnalytics (no provider env vars)', () => {
  beforeEach(() => {
    // Guarantee the no-provider path regardless of the shell's environment:
    // vi.stubEnv clears the import.meta.env backing object; process.env is
    // cleared for the implementation's node fallback.
    for (const key of CONFIG_KEYS) {
      vi.stubEnv(key, '');
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

describe('isPwaInstalled', () => {
  it('returns false without throwing when matchMedia is unavailable (jsdom)', () => {
    // jsdom does not implement window.matchMedia; the guard must handle it.
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      expect(() => isPwaInstalled()).not.toThrow();
      expect(isPwaInstalled()).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    }
  });

  it('returns true when matchMedia reports a standalone display mode', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    try {
      expect(isPwaInstalled()).toBe(true);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        value: undefined,
        configurable: true,
        writable: true,
      });
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