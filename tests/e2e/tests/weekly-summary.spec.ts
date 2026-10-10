import { test, expect } from '@playwright/test';
import { resetApp } from './helpers';

// 2026-10-12 is a Monday. 10:00 sits safely inside the logical day (the engine
// maps 00:00–03:59 to the previous day), and the fixed clock survives every
// navigation — including resetApp's reloads and the explicit reload below.
const LOGICAL_MONDAY = new Date('2026-10-12T10:00:00');

test.describe('weekly summary modal', () => {
  test.beforeEach(async ({ page }) => {
    // Must happen before any navigation: the app reads the logical date while
    // booting, and page.clock.install() only affects documents loaded after it.
    await page.clock.install({ time: LOGICAL_MONDAY });
    await page.clock.setFixedTime(LOGICAL_MONDAY);
    await resetApp(page);
  });

  // Deliberately does NOT use dismissWeeklySummaryIfVisible: this spec asserts
  // that the modal really appears, then closes it through its own button.
  test('appears on a logical Monday once a habit exists and stays dismissed after reload', async ({ page }) => {
    await expect(page.getByText('No habits yet')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Weekly Summary' })).toBeHidden();

    await page.getByPlaceholder('Enter new habit...').fill('Meditate');
    await page.getByRole('button', { name: 'Add' }).click();

    const heading = page.getByRole('heading', { name: 'Weekly Summary' });
    await expect(heading).toBeVisible();
    // Fresh state: 1 active habit × the 7 slots in getPast7LogicalDays. That
    // window is today-7..today-1 (it EXCLUDES today), so the plan's "2
    // check-ins in the window" scenario is intentionally dropped — check-ins
    // made today can never raise these numbers.
    await expect(page.getByText('Habits Completed: 0 / 7')).toBeVisible();
    await expect(page.getByText('Consistency Rate: 0%')).toBeVisible();

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(heading).toBeHidden();

    await page.reload();
    await expect(page.getByText('Meditate', { exact: true })).toBeVisible();
    // Give the (would-be) summary query a moment to resolve after boot: if the
    // dismissal were not persisted, the modal would pop up right here.
    await page.waitForTimeout(500);
    await expect(heading).toBeHidden();
  });
});
