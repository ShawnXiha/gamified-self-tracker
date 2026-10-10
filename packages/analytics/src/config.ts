/**
 * Env access, isolated in its own module so tests can vi.mock it: in vitest,
 * `import.meta.env` is live only in test files — imported modules get a
 * transform-time snapshot, so per-test config values need this seam (tests
 * mock readConfig/isDev against a controllable map).
 */
type Env = Record<string, string | boolean | undefined>;
const importMetaEnv = (import.meta as unknown as { env: Env }).env;

export function readConfig(key: string): string | undefined {
  const value = importMetaEnv[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function isDev(): boolean {
  return Boolean(importMetaEnv.DEV);
}
