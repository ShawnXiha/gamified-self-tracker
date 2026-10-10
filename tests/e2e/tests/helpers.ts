import { Page, expect } from '@playwright/test';

/**
 * Resets the app to a pristine state — equivalent to a very first visit:
 * IndexedDB is wiped and the page is reloaded so the app re-boots with fresh
 * user stats (the nightly evaluator re-initializes from scratch).
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

  await page.evaluate(() =>
    new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('GamifiedTrackerDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
  );

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
  // The app decides via isMonday(getLogicalDate(new Date())) — same local
  // weekday as this check, so skipping the wait on non-Mondays is sound.
  if (new Date().getDay() !== 1) {
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