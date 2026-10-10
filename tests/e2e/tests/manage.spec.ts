import { test, expect, type Page } from '@playwright/test';
import { resetApp, dismissWeeklySummaryIfVisible } from './helpers';

/**
 * Habit management flows: rename, archive/restore, delete. Every habit row owns
 * a uniquely labelled actions menu (`aria-label="Open actions for <title>"`),
 * which keeps the flows unambiguous even though the per-row checkboxes share a
 * single accessible name.
 */

async function createHabit(page: Page, title: string): Promise<void> {
  await page.getByPlaceholder('Enter new habit...').fill(title);
  await page.getByRole('button', { name: 'Add' }).click();
  // The first habit makes the weekly-summary modal eligible on (logical)
  // Mondays; it covers the page, so clear it before the next interaction.
  await dismissWeeklySummaryIfVisible(page);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

const openActionsMenu = (page: Page, title: string) =>
  page.getByRole('button', { name: `Open actions for ${title}`, exact: true }).click();

test.describe('habit management', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await dismissWeeklySummaryIfVisible(page);
  });

  test('renames a habit through the edit modal', async ({ page }) => {
    await createHabit(page, 'Read');
    await createHabit(page, 'Run');

    await openActionsMenu(page, 'Read');
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    const editDialog = page.getByRole('dialog', { name: 'Edit Habit' });
    await expect(editDialog).toBeVisible();

    const titleInput = editDialog.getByLabel('Habit title');
    await expect(titleInput).toHaveValue('Read');
    await titleInput.fill('Read Books');
    await editDialog.getByRole('button', { name: 'Save' }).click();

    await expect(editDialog).toBeHidden();
    await expect(page.getByText('Read Books', { exact: true })).toBeVisible();
    await expect(page.getByText('Read', { exact: true })).toBeHidden();
    await expect(page.getByText('Run', { exact: true })).toBeVisible();
    // The actions menu label tracks the new title.
    await expect(
      page.getByRole('button', { name: 'Open actions for Read Books', exact: true }),
    ).toBeVisible();
  });

  test('archives a habit out of the list and restores it from the archived modal', async ({ page }) => {
    await createHabit(page, 'Read');
    await createHabit(page, 'Run');

    await openActionsMenu(page, 'Run');
    await page.getByRole('menuitem', { name: 'Archive' }).click();

    await expect(page.getByText('Run', { exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Archived (1)', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Archived (1)', exact: true }).click();
    const archivedDialog = page.getByRole('dialog', { name: 'Archived Habits' });
    await expect(archivedDialog).toBeVisible();
    await expect(archivedDialog.getByText('Run', { exact: true })).toBeVisible();

    await archivedDialog.getByRole('button', { name: 'Restore' }).click();
    await expect(archivedDialog.getByText('No archived habits yet')).toBeVisible();
    await archivedDialog.getByRole('button', { name: 'Close' }).click();
    await expect(archivedDialog).toBeHidden();

    await expect(page.getByText('Run', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archived (0)', exact: true })).toBeVisible();
  });

  test('deletes a habit only after confirmation; cancel keeps it', async ({ page }) => {
    await createHabit(page, 'Read');
    await createHabit(page, 'Run');

    // Cancel path: the habit survives.
    await openActionsMenu(page, 'Run');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete habit?' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText('Delete "Run"?')).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText('Run', { exact: true })).toBeVisible();

    // Confirm path: the habit is gone for good.
    await openActionsMenu(page, 'Run');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText('Run', { exact: true })).toBeHidden();
    await expect(page.getByText('Read', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archived (0)', exact: true })).toBeVisible();
  });
});
