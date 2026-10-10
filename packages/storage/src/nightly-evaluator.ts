import { db } from './db';
import { getLogicalDate, calculateDayGap, addDaysToLogicalDate } from 'domain/src/date-engine';
import { evaluateLogicalDay } from 'domain/src/streak-engine';
import type { LogicalDayInput } from 'domain/src/streak-engine';
import { recomputeCachesForHabit, recomputeUserStatsCache } from './check-in-service';

/**
 * Evaluates every past logical day that has not been evaluated yet and
 * appends the freeze ledger rows those days call for. This is the only
 * persistent decision the evaluator makes: a past day where at least one
 * unarchived, already-created habit was scheduled and none were completed
 * (`missed_all_scheduled`) consumes one freeze if one is available; otherwise
 * nothing is written and the derived streak scan naturally treats the day as
 * a break.
 *
 * Availability is always the *derived* value, re-read from the source of
 * truth before the first day and after every append: consuming a freeze can
 * itself raise availability (a protected day bridges a missed day in the
 * streak scan, and a bridge crossing a 7-day boundary awards a milestone that
 * adds a freeze), so a local running count would under-spend. Days are
 * evaluated chronologically — an earlier day's append is visible to every
 * later day, and earlier decisions are never retroactively changed.
 *
 * Streaks, XP, level and freeze counts are never written directly — after the
 * per-day loop every habit's streak cache and the user stats cache are rebuilt
 * from the sources of truth (`checkIns` + `freezeEvents` + habit creation
 * dates), so this run and `toggleCheckIn` can never disagree.
 *
 * Idempotency: `userStats.last_evaluated_date` is the checkpoint. A second run
 * on the same logical day has `gap <= 0` and returns before touching anything,
 * so a freeze is consumed exactly once. "Past is final" holds because past
 * check-ins can no longer be toggled (only today can), which makes the
 * append-only ledger + checkpoint combination sound.
 *
 * The whole evaluation (ledger appends + cache rebuilds + checkpoint) runs in
 * one transaction that includes `freezeEvents`, so the consumed rows and the
 * checkpoint always commit together.
 */
export async function runNightlyEvaluation(): Promise<void> {
  const logicalDate = getLogicalDate(Date.now());

  const stats = await db.userStats.get('current');
  if (!stats) {
    // Brand-new user (or a database from before userStats existed): establish
    // the save point without evaluating anything. `put` (upsert) instead of
    // `add` so two concurrent first-boot calls (React StrictMode double-fires
    // effects on a fresh DB) both settle: they write identical rows, so the
    // second upsert is idempotent instead of rejecting on a duplicate key.
    await db.userStats.put({
      id: 'current',
      total_xp: 0,
      current_level: 1,
      freezes_available: 2,
      last_evaluated_date: logicalDate,
    });
    return;
  }

  if (!stats.last_evaluated_date) {
    // Existing row with unknown history: never retro-evaluate it, just start
    // the checkpoint from today.
    await db.userStats.put({ ...stats, last_evaluated_date: logicalDate });
    return;
  }

  const gap = calculateDayGap(stats.last_evaluated_date, logicalDate);
  if (gap <= 0) return; // Already evaluated today (or the clock moved backwards): no-op.

  await db.transaction(
    'rw',
    [db.userStats, db.checkIns, db.streaks, db.habits, db.freezeEvents],
    async () => {
      const currentStats = await db.userStats.get('current');
      const checkpoint = currentStats?.last_evaluated_date;
      if (!checkpoint) return; // Deleted concurrently: nothing to evaluate.

      // The availability check must use the derived freeze count, not a local
      // running total: appending a consumed freeze can RAISE derived
      // availability (a protected day bridges a missed day in the streak
      // scan, and a bridge crossing a 7-day boundary awards a milestone that
      // itself adds a freeze). Rebuild user stats from the source of truth
      // before the first day's decision — the checkpoint is preserved by the
      // rebuild — and again after every append below.
      await recomputeUserStatsCache();

      const allHabits = await db.habits.toArray();

      for (let i = 1; i <= gap; i++) {
        const dateToEvaluate = addDaysToLogicalDate(checkpoint, i);
        if (dateToEvaluate >= logicalDate) break; // Today is still in progress: never evaluated.

        // A habit was active on `dateToEvaluate` when it is not archived and
        // was created on or before that logical day.
        const activeHabits = allHabits.filter(h => {
          const habitLogicalDate = getLogicalDate(h.created_at);
          return habitLogicalDate <= dateToEvaluate && h.archived_at === null;
        });

        const checkIns = await db.checkIns
          .where('logical_date')
          .equals(dateToEvaluate)
          .toArray();
        const checkedInIds = new Set(checkIns.map(c => c.habit_id));

        const logicalDayInput: LogicalDayInput = {
          date: dateToEvaluate,
          habits: activeHabits.map(h => ({
            habitId: h.id,
            scheduled: true, // For MVP, every active habit is scheduled every day.
            completed: checkedInIds.has(h.id),
          })),
        };

        const outcome = evaluateLogicalDay(logicalDayInput);

        if (outcome.kind === 'missed_all_scheduled') {
          // Ask the derived caches how many freezes are available right now.
          // Days are processed chronologically, so a milestone bump caused by
          // an earlier freeze in this same run is visible to every later day
          // — without retroactively changing earlier decisions.
          const derivedStats = await db.userStats.get('current');
          if (derivedStats && derivedStats.freezes_available > 0) {
            await db.freezeEvents.add({
              id: crypto.randomUUID(),
              type: 'consumed',
              logical_date: dateToEvaluate,
              created_at: Date.now(),
            });
            // The ledger grew: re-derive before the next day's decision so
            // availability always reflects the ledger as it stands.
            await recomputeUserStatsCache();
          }
        }
        // streak_kept / no_scheduled_habits / out-of-freezes: no ledger row.
        // A break is not recorded — derivation handles it from the absence of
        // a check-in or consumed freeze.
      }

      // Rebuild every habit's streak cache and the user stats cache from the
      // source of truth (including the rows just appended). The evaluator
      // never edits `streaks` directly; this keeps every write on the derived
      // path shared with `toggleCheckIn`.
      for (const habit of allHabits) {
        await recomputeCachesForHabit(habit.id);
      }
      await recomputeUserStatsCache();

      const finalStats = await db.userStats.get('current');
      if (finalStats) {
        finalStats.last_evaluated_date = logicalDate;
        await db.userStats.put(finalStats);
      }
    },
  );
}
