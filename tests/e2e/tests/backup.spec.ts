import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { resetApp, createHabit } from './helpers';

interface BackupPayload {
  version: number;
  exported_at: string;
  habits: Array<{ title: string; archived_at: number | null }>;
  checkIns: unknown[];
  freezeEvents: unknown[];
}

test.describe('backup export', () => {
  test.beforeEach(async ({ page }) => {
    // resetApp guarantees zero habits, so no weekly-summary modal can exist
    // here — no dismissal guard needed.
    await resetApp(page);
  });

  test('downloads a versioned JSON backup containing the created habit', async ({ page }) => {
    const title = 'Write journal';
    await createHabit(page, title);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export backup' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gamified-backup-\d{4}-\d{2}-\d{2}\.json$/);

    const downloadPath = await download.path();
    if (!downloadPath) {
      throw new Error('Expected a local download path — is acceptDownloads enabled?');
    }

    const payload: BackupPayload = JSON.parse(await fs.readFile(downloadPath, 'utf8'));

    expect(payload.version).toBe(1);
    expect(Date.parse(payload.exported_at)).not.toBeNaN();
    expect(Array.isArray(payload.checkIns)).toBe(true);
    expect(Array.isArray(payload.freezeEvents)).toBe(true);

    const exported = payload.habits.filter(habit => habit.title === title);
    expect(exported).toHaveLength(1);
    expect(exported[0].archived_at).toBeNull();
  });
});
