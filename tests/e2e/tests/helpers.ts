import { Page, expect } from '@playwright/test';

/**
 * Resets the app to a pristine state — equivalent to a very first visit:
 * IndexedDB and localStorage are wiped and the page is reloaded so the app
 * re-boots with fresh user stats (the nightly evaluator re-initializes from
 * scratch) and no dismissed state (e.g. the weekly-summary modal shows again).
 *
 * Why the dance with aborted scripts? The app keeps an open Dexie connection
 * to `GamifiedTrackerDB` for the whole page lifetime, and
 * `indexedDB.deleteDatabase` is BLOCKED while any connection is open — issuing
 * it from the running app would hang on `onblocked` and never delete anything.
 * Deleting from a same-origin page whose scripts never ran (all non-document
 * requests aborted) guarantees no connection exists, so the delete lands.
 */
export async function resetApp(page: Page): Promise<void> {
  // Boot the app once: verifies the dev server is up before wiping anything.
  await page.goto('/');

  // Same-origin HTML shell without any app scripts → no Dexie connection.
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'document' ? route.continue() : route.abort(),
  );
  await page.goto('/');

  await page.evaluate(() => {
    localStorage.clear();
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('GamifiedTrackerDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });

  await page.unroute('**/*');
  await page.reload(); // Clean boot: nightly evaluator re-initializes userStats.
}

/**
 * Closes the Monday weekly-summary modal when it is on screen. The modal only
 * renders on Mondays once at least one habit exists, so this is a fast no-op
 * on the other six days of the week. Call it after the app has booted AND a
 * habit exists — with zero habits the modal cannot render, so waiting is dead
 * air. `timeoutMs` lets hot paths (freshly created habits, where the modal's
 * live query resolves in an IndexedDB round-trip) use a shorter budget.
 */
export async function dismissWeeklySummaryIfVisible(
  page: Page,
  { timeoutMs = 3000 }: { timeoutMs?: number } = {},
): Promise<void> {
  // Mirror the engine inside the page (same clock, same timezone): the modal's
  // eligibility is isMonday(getLogicalDate(now)), and getLogicalDate maps
  // 00:00–03:59 local to the PREVIOUS calendar day — so between Tuesday 00:00
  // and 03:59 the logical day is still Monday. Reading the page's clock (not
  // the test runner's) keeps this correct for specs that pin page.clock.
  const isLogicalMonday = await page.evaluate(() => {
    const logical = new Date();
    if (logical.getHours() < 4) {
      logical.setDate(logical.getDate() - 1);
    }
    return logical.getDay() === 1;
  });
  if (!isLogicalMonday) {
    return;
  }

  const closeButton = page.getByRole('button', { name: 'Close', exact: true });
  try {
    await closeButton.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch {
    return; // Monday, but nothing to dismiss (e.g. no habits yet).
  }

  await closeButton.click();
  await expect(page.getByRole('heading', { name: 'Weekly Summary' })).toBeHidden();
}

/**
 * Creates a habit through the top form, asserts it landed in the list, and
 * clears the weekly-summary modal when it appears — the first creation can
 * make it eligible on (logical) Mondays, and it overlays the whole page.
 */
export async function createHabit(page: Page, title: string): Promise<void> {
  await page.getByPlaceholder('Enter new habit...').fill(title);
  await page.getByRole('button', { name: 'Add' }).click();
  // 800ms is ample: the modal's live query resolves within a local IndexedDB
  // round-trip (measured ~80ms). A later creation in the same session cannot
  // re-open the modal (the dismissal is persisted per logical date), so the
  // full 3s default would just be dead air on Mondays.
  await dismissWeeklySummaryIfVisible(page, { timeoutMs: 800 });
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}
