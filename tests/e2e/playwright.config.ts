import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite for the gamified self-tracker UI.
 *
 * The Vite dev server is started for the UI workspace on a fixed port
 * (4173 --strictPort) so it can never collide with a developer's own
 * 5173 dev server. Locally an already-running server is reused; CI always
 * starts a fresh one.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
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
    command: 'npm run dev --workspace=ui -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});