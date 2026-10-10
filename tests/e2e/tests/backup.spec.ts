import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { resetApp, dismissWeeklySummaryIfVisible } from './helpers';

interface BackupPayload {
  version: number;
  exported_at: string;
  habits: Array<{ title: string; archived_at: number | null }>;
}

test.describe('backup export', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await dismissWeeklySummaryIfVisible(page);
  });

  test('downloads a versioned JSON backup containing the created habit', async ({ page }) => {
    const title = 'Write journal';
    await page.getByPlaceholder('Enter new habit...').fill(title);
    await page.getByRole('button', { name: 'Add' }).click();
    await dismissWeeklySummaryIfVisible(page);
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export backup' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gamified-backup-\d{4}-\d{2}-\d{2}\.json$/);

    const payload: BackupPayload = JSON.parse(await fs.readFile(await download.path(), 'utf8'));

    expect(payload.version).toBe(1);
    expect(Date.parse(payload.exported_at)).not.toBeNaN();

    const exported = payload.habits.filter(habit => habit.title === title);
    expect(exported).toHaveLength(1);
    expect(exported[0].archived_at).toBeNull();
  });
});
