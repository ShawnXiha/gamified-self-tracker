import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite for the gamified self-tracker UI.
 *
 * The Vite dev server is started for the UI workspace on a fixed port
 * (4173 --strictPort) so it can never collide with a developer's own
 * 5173 dev server. Vite is invoked directly with cwd = packages/ui — this
 * avoids npm's `--` argument forwarding entirely (npm swallows args after
 * `--` when a workspace flag is present, which would start vite on its
 * default 5173 instead of 4173). Locally an already-running server is
 * reused; CI always starts a fresh one.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    cwd: path.resolve(__dirname, '../../packages/ui'),
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});