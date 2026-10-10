import { db } from './db';
import type { StreakState, UserStats } from './db';
import { getLogicalDate } from 'domain/src/date-engine';
import { calculateXP, calculateLevel } from 'domain/src/scoring-engine';
import {
  deriveTotalXP,
  deriveStreakStats,
  deriveFreezesAvailable,
} from 'domain/src/derive-engine';

/**
 * The single write path for daily check-ins.
 *
 * `checkIns` is the only source of truth; `streaks` and `userStats` are
 * derived caches rebuilt inside the same transaction. Freeze awards are never
 * written here — the freeze ledger (`freezeEvents`) is only appended to by the
 * nightly evaluator. Consumed freeze dates merely protect days during streak
 * derivation (they skip without counting or breaking).
 */

async function readConsumedFreezeDates(): Promise<ReadonlySet<string>> {
  const consumed = await db.freezeEvents.where('type').equals('consumed').toArray();
  return new Set(consumed.map(e => e.logical_date));
}

/**
 * Re-derives one habit's streak cache row from its check-ins (plus consumed
 * freeze dates and the habit's creation date as the streak start) and writes
 * it back to the `streaks` cache. Sharing this helper across services keeps
 * every streak write on the derived path.
 */
export async function recomputeCachesForHabit(habitId: string): Promise<void> {
  const habit = await db.habits.get(habitId);
  if (!habit) return; // Unknown habit: nothing to cache (idempotent).

  const checkIns = await db.checkIns.where('habit_id').equals(habitId).toArray();

  const checkInDates = new Set<string>();
  let lastCheckInDate: string | null = null;
  for (const checkIn of checkIns) {
    checkInDates.add(checkIn.logical_date);
    if (lastCheckInDate === null || checkIn.logical_date > lastCheckInDate) {
      lastCheckInDate = checkIn.logical_date;
    }
  }

  const stats = deriveStreakStats(
    checkInDates,
    await readConsumedFreezeDates(),
    getLogicalDate(habit.created_at),
    getLogicalDate(new Date()),
  );

  const cached: StreakState = {
    habit_id: habitId,
    current_streak: stats.current,
    longest_streak: stats.longest,
    last_check_in_date: lastCheckInDate,
  };
  await db.streaks.put(cached);
}

/**
 * Re-derives the `userStats` cache row from the source of truth:
 *
 * - `total_xp` = Σ awarded_xp over ALL check-ins (monotonic in check-ins)
 * - `current_level` = calculateLevel(total_xp)
 * - `freezes_available` = deriveFreezesAvailable(level, Σ milestone awards, consumed count)
 *
 * Milestone awards are derived per habit with the same freeze-aware streak
 * scan the nightly evaluator uses, so a check-in that closes a 7-day run is
 * counted exactly once across all services.
 */
export async function recomputeUserStatsCache(): Promise<void> {
  const allCheckIns = await db.checkIns.toArray();
  const totalXp = deriveTotalXP(allCheckIns);
  const level = calculateLevel(totalXp);

  const freezeDates = await readConsumedFreezeDates();
  const today = getLogicalDate(new Date());
  const habits = await db.habits.toArray();

  let milestoneAwards = 0;
  for (const habit of habits) {
    const habitCheckIns = await db.checkIns.where('habit_id').equals(habit.id).toArray();
    const habitDates = new Set(habitCheckIns.map(c => c.logical_date));
    milestoneAwards += deriveStreakStats(
      habitDates,
      freezeDates,
      getLogicalDate(habit.created_at),
      today,
    ).milestoneAwards;
  }

  const consumedCount = await db.freezeEvents.where('type').equals('consumed').count();
  const freezesAvailable = deriveFreezesAvailable(level, milestoneAwards, consumedCount);

  const existing = await db.userStats.get('current');
  const stats: UserStats = {
    id: 'current',
    total_xp: totalXp,
    current_level: level,
    freezes_available: freezesAvailable,
  };
  // Keep the nightly evaluator's checkpoint when the row already exists.
  if (existing?.last_evaluated_date !== undefined) {
    stats.last_evaluated_date = existing.last_evaluated_date;
  }
  await db.userStats.put(stats);
}

/**
 * Adds or removes today's check-in for a habit and rewrites the derived caches
 * in the same transaction, so concurrent toggles stay consistent and XP/streak
 * state always equals the Σ of the check-ins.
 *
 * - added:  `awarded_xp = calculateXP(derived current streak before insert)`,
 *           `streak_at_time = that derived current`; `leveled_up` is true when
 *           the cached level rose compared to before the transaction.
 * - removed: deletes the row; `xp` is the removed row's award; caches fall
 *           back to the remaining check-ins (level can honestly drop).
 */
export async function toggleCheckIn(
  habitId: string,
): Promise<{ action: 'added' | 'removed'; xp: number; leveled_up: boolean }> {
  const logicalDate = getLogicalDate(new Date());

  return db.transaction(
    'rw',
    [db.habits, db.checkIns, db.streaks, db.userStats, db.freezeEvents],
    async () => {
      const habit = await db.habits.get(habitId);
      if (!habit) throw new Error('Habit not found');

      const existing = await db.checkIns
        .where({ habit_id: habitId, logical_date: logicalDate })
        .first();

      if (existing) {
        // Removing the check-in.
        await db.checkIns.delete(existing.id);
        await recomputeCachesForHabit(habitId);
        await recomputeUserStatsCache();
        return { action: 'removed', xp: existing.awarded_xp, leveled_up: false };
      }

      // Adding the check-in. Level before the transaction decides `leveled_up`.
      const levelBefore = (await db.userStats.get('current'))?.current_level ?? 1;

      // Derive the streak from the source of truth BEFORE inserting today's row.
      const checkIns = await db.checkIns.where('habit_id').equals(habitId).toArray();
      const checkInDates = new Set(checkIns.map(c => c.logical_date));
      const streakBefore = deriveStreakStats(
        checkInDates,
        await readConsumedFreezeDates(),
        getLogicalDate(habit.created_at),
        logicalDate,
      ).current;

      const awardedXp = calculateXP(streakBefore);

      await db.checkIns.add({
        id: crypto.randomUUID(),
        habit_id: habitId,
        logical_date: logicalDate,
        completed_at: Date.now(),
        awarded_xp: awardedXp,
        streak_at_time: streakBefore,
      });

      await recomputeCachesForHabit(habitId);
      await recomputeUserStatsCache();

      const leveledUp =
        ((await db.userStats.get('current'))?.current_level ?? 1) > levelBefore;
      return { action: 'added', xp: awardedXp, leveled_up: leveledUp };
    },
  );
}