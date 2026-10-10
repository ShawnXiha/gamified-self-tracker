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
 * on the other six days of the week. Call it after the app has booted, and
 * again after creating a habit (creating the first habit is what makes the
 * modal eligible to appear).
 */
export async function dismissWeeklySummaryIfVisible(page: Page): Promise<void> {
  // The app decides via isMonday(getLogicalDate(new Date())), and
  // getLogicalDate maps 00:00–03:59 local to the PREVIOUS calendar day — so
  // between Tuesday 00:00 and 03:59 the logical day is still Monday and the
  // app shows the modal. Mirror the engine's 4am shift before the weekday
  // check, otherwise the modal would overlay the page untested.
  const logical = new Date();
  if (logical.getHours() < 4) {
    logical.setDate(logical.getDate() - 1);
  }
  if (logical.getDay() !== 1) {
    return;
  }

  const closeButton = page.getByRole('button', { name: 'Close', exact: true });
  try {
    await closeButton.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    return; // Monday, but nothing to dismiss (e.g. no habits yet).
  }

  await closeButton.click();
  await expect(page.getByRole('heading', { name: 'Weekly Summary' })).toBeHidden();
}