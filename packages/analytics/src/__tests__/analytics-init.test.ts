import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

/**
 * Env-gated init behavior. `import.meta.env` in imported modules is a
 * transform-time snapshot under vitest (only test files see the live proxy),
 * so env access is mocked via the config seam and driven by envMap — the same
 * values `VITE_*` vars would inject in a real build. posthog-js is mocked to
 * assert on init/capture without SDK internals or network.
 */
const { envMap } = vi.hoisted(() => ({
  envMap: {} as Record<string, string | boolean | undefined>,
}));

vi.mock('../config', () => ({
  readConfig: (key: string) => {
    const value = envMap[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  },
  isDev: () => envMap.DEV === true,
}));

vi.mock('posthog-js', () => ({
  default: { init: vi.fn(), capture: vi.fn() },
}));

type AnalyticsModule = typeof import('../index');

let analytics: AnalyticsModule;
let posthogInit: Mock;
let posthogCapture: Mock;

beforeEach(async () => {
  // Fresh module registry + mock instances per test (module-level
  // `initialized` must start clean so idempotency is measurable).
  vi.resetModules();
  envMap.DEV = true;
  delete envMap.VITE_POSTHOG_KEY;
  delete envMap.VITE_POSTHOG_HOST;
  delete envMap.VITE_SENTRY_DSN;
  delete envMap.VITE_APP_VERSION;

  const posthogMock = (await import('posthog-js')) as unknown as { default: { init: Mock; capture: Mock } };
  posthogInit = posthogMock.default.init;
  posthogCapture = posthogMock.default.capture;
  posthogInit.mockClear();
  posthogCapture.mockClear();
  analytics = await import('../index');
});

describe('initAnalytics with VITE_POSTHOG_KEY configured', () => {
  it('initializes posthog with a key, default api_host, and privacy defaults', async () => {
    envMap.VITE_POSTHOG_KEY = 'phc_test_key';

    await analytics.initAnalytics();

    expect(posthogInit).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({
        api_host: 'https://app.posthog.com',
        autocapture: false,
        capture_pageview: false,
      }),
    );
  });

  it('uses VITE_POSTHOG_HOST as the api_host override', async () => {
    envMap.VITE_POSTHOG_KEY = 'phc_test_key';
    envMap.VITE_POSTHOG_HOST = 'https://eu.posthog.com';

    await analytics.initAnalytics();

    expect(posthogInit).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({ api_host: 'https://eu.posthog.com' }),
    );
  });

  it('is idempotent: a second call does not re-initialize', async () => {
    envMap.VITE_POSTHOG_KEY = 'phc_test_key';

    await analytics.initAnalytics();
    await analytics.initAnalytics();

    expect(posthogInit).toHaveBeenCalledTimes(1);
  });

  it('sends tracked events to posthog.capture once initialized (non-dev)', async () => {
    envMap.DEV = false;
    envMap.VITE_POSTHOG_KEY = 'phc_test_key';

    await analytics.initAnalytics();
    analytics.trackEvent({ name: 'habit_created', properties: {} });

    expect(posthogCapture).toHaveBeenCalledWith('habit_created', {});
  });

  it('is a silent no-op before init in non-dev mode', async () => {
    envMap.DEV = false;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      analytics.trackEvent({ name: 'habit_created', properties: {} });

      expect(posthogCapture).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });
});
