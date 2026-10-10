import { test, expect } from '@playwright/test';
import { resetApp, dismissWeeklySummaryIfVisible } from './helpers';

const HABIT_TITLE = 'Read for 20 minutes';

test.describe('core habit loop', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await dismissWeeklySummaryIfVisible(page);
  });

  test('starts empty, creates a habit, and shows it in the list', async ({ page }) => {
    await expect(page.getByText('No habits yet')).toBeVisible();

    await page.getByPlaceholder('Enter new habit...').fill(HABIT_TITLE);
    await page.getByRole('button', { name: 'Add' }).click();

    // On Mondays the first habit makes the weekly-summary modal eligible to
    // appear; dismiss it before touching the list.
    await dismissWeeklySummaryIfVisible(page);

    await expect(page.getByText(HABIT_TITLE)).toBeVisible();
    await expect(page.getByText('No habits yet')).toBeHidden();
  });

  test('checking in shows a +10 XP toast; unchecking removes it', async ({ page }) => {
    await page.getByPlaceholder('Enter new habit...').fill(HABIT_TITLE);
    await page.getByRole('button', { name: 'Add' }).click();
    await dismissWeeklySummaryIfVisible(page);
    await expect(page.getByText(HABIT_TITLE)).toBeVisible();

    const checkbox = page.getByRole('checkbox', { name: 'Daily Check-In' });
    await expect(checkbox).not.toBeChecked();

    // First check-in of a fresh account: streak 0 → calculateXP(0) = 10 XP.
    // The checkbox is controlled by an async IndexedDB round-trip, so use
    // click() and assert the eventual state (check() would verify the DOM
    // state before React re-renders and report "did not change its state").
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(page.getByText('+10 XP')).toBeVisible();

    // Unchecking removes today's check-in: the toast flips to the removal
    // form (-10 XP) and then auto-unmounts after its animation.
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await expect(page.getByText('+10 XP')).toBeHidden();
    await expect(page.getByTestId('xp-toast')).toHaveCount(0);
  });

  test('resetApp wipes IndexedDB so the next boot starts pristine', async ({ page }) => {
    await page.getByPlaceholder('Enter new habit...').fill(HABIT_TITLE);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(HABIT_TITLE)).toBeVisible();

    await resetApp(page);

    await expect(page.getByText('No habits yet')).toBeVisible();
    await expect(page.getByText(HABIT_TITLE)).toBeHidden();
  });
});