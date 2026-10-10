import type { Habit, DailyCheckIn } from './db';

export interface WeeklySummary {
  completedHabits: number;
  totalHabits: number;
  consistencyRate: number;
  longestStreak: number;
  freezesRemaining: number;
  totalLifetimeDays: number;
}

/**
 * Aggregates the weekly summary entirely from already-fetched data. Pure —
 * no db access, so it is trivially unit-testable.
 *
 * @param activeHabits     habits that are NOT archived
 * @param past7CheckIns    check-ins belonging to active habits within the
 *                         past 7 logical days (the caller filters by date)
 * @param allCheckIns      every check-in across ALL habits, including
 *                         archived-habit history
 * @param longestStreak    longest streak across all habits — streak rows are
 *                         never deleted on archive, so the caller decides
 *                         which streaks to include
 * @param freezesRemaining freeze tokens left in the player's account
 */
export function buildWeeklySummary(
  activeHabits: Habit[],
  past7CheckIns: DailyCheckIn[],
  allCheckIns: DailyCheckIn[],
  longestStreak: number,
  freezesRemaining: number,
): WeeklySummary {
  // Total possible check-ins for active habits in the past 7 days.
  const totalHabits = activeHabits.length * 7;

  // Completed check-ins for active habits in the past 7 days. Relies on the
  // compound unique index [habit_id+logical_date]: at most one row per habit
  // per day, so length == number of uniquely completed slots.
  const completedHabits = past7CheckIns.length;

  // Consistency rate with divide-by-zero protection.
  const consistencyRate = totalHabits > 0 ? completedHabits / totalHabits : 0;

  // Count unique logical dates across ALL check-ins (includes archived
  // habit history).
  const totalLifetimeDays = new Set(allCheckIns.map(c => c.logical_date)).size;

  return {
    completedHabits,
    totalHabits,
    consistencyRate,
    longestStreak,
    freezesRemaining,
    totalLifetimeDays,
  };
}
