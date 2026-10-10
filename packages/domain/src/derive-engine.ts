import { parseYYYYMMDDToUTCms } from './date-engine';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function deriveTotalXP(
  checkIns: ReadonlyArray<{ awarded_xp: number }>,
): number {
  return checkIns.reduce((sum, checkIn) => sum + checkIn.awarded_xp, 0);
}

export interface StreakStats {
  current: number;
  longest: number;
  milestoneAwards: number;
}

/**
 * Derives streak stats from the single source of truth (check-ins).
 *
 * - current: walks backwards from `today`. Today being unchecked is fine
 *   (the day is still in progress) and freeze days are skipped without
 *   counting or breaking; the first unprotected miss breaks the run.
 * - longest / milestoneAwards: forward scan from `startDate` to `today`.
 *   A check-in increments the run (awarding a milestone at every 7-day
 *   crossing), a freeze day leaves the run unchanged, and a miss resets it.
 */
export function deriveStreakStats(
  checkInDates: ReadonlySet<string>,
  freezeDates: ReadonlySet<string>,
  startDate: string,
  today: string,
): StreakStats {
  const startMs = parseYYYYMMDDToUTCms(startDate);
  const todayMs = parseYYYYMMDDToUTCms(today);

  // Backward walk from today: the current streak.
  let current = 0;
  let cursorMs = todayMs;

  while (cursorMs >= startMs) {
    const date = new Date(cursorMs);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const logicalDate = `${year}-${month}-${day}`;

    if (checkInDates.has(logicalDate)) {
      current += 1;
    } else if (freezeDates.has(logicalDate)) {
      // Protected day: no count, no break.
    } else if (cursorMs === todayMs) {
      // Today is still in progress: skipping it does not break the streak.
    } else {
      break; // First unprotected miss before today breaks the streak.
    }

    cursorMs -= MS_PER_DAY;
  }

  // Forward scan from startDate to today: longest run and milestone awards.
  let run = 0;
  let longest = 0;
  let milestoneAwards = 0;

  for (let ms = startMs; ms <= todayMs; ms += MS_PER_DAY) {
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const logicalDate = `${year}-${month}-${day}`;

    if (checkInDates.has(logicalDate)) {
      run += 1;
      if (run % 7 === 0) {
        milestoneAwards += 1;
      }
      if (run > longest) {
        longest = run;
      }
    } else if (freezeDates.has(logicalDate)) {
      // Protected day: run carries over unchanged.
    } else {
      run = 0;
    }
  }

  return { current, longest, milestoneAwards };
}

export function deriveLevelUpAwards(level: number): number {
  return Math.max(0, level - 1);
}

export function deriveFreezesAvailable(
  level: number,
  milestoneAwards: number,
  consumedCount: number,
): number {
  const available =
    2 + (level - 1) + milestoneAwards - consumedCount;
  return Math.min(5, Math.max(0, available));
}