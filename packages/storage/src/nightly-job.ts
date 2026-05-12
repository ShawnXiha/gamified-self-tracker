import { db } from './db';
import { getLogicalDate, calculateDayGap, parseYYYYMMDDToUTCms } from 'domain/src/date-engine';
import { evaluateLogicalDay } from 'domain/src/streak-engine';
import type { LogicalDayInput } from 'domain/src/streak-engine';

function addDaysToLogicalDate(dateStr: string, days: number): string {
  const ms = parseYYYYMMDDToUTCms(dateStr);
  const date = new Date(ms);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export async function runNightlyEvaluation(): Promise<void> {
  const logicalDate = getLogicalDate(Date.now());

  let stats = await db.userStats.toCollection().first();
  if (!stats) {
    stats = { id: 'current', total_xp: 0, current_level: 1, freezes_available: 2, last_evaluated_date: logicalDate };
    await db.userStats.add(stats);
    return;
  }

  if (!stats.last_evaluated_date) {
    stats.last_evaluated_date = logicalDate;
    await db.userStats.put(stats);
    return;
  }

  const gap = calculateDayGap(stats.last_evaluated_date, logicalDate);
  if (gap <= 0) return;

  await db.transaction('rw', db.userStats, db.checkIns, db.streaks, db.habits, async () => {
    const currentStats = await db.userStats.get(stats!.id);
    if (!currentStats) return;

    for (let i = 1; i <= gap; i++) {
      const dateToEvaluate = addDaysToLogicalDate(currentStats.last_evaluated_date!, i);

      if (dateToEvaluate === logicalDate) {
        break;
      }

      // Get habits that were active on dateToEvaluate
      // For MVP, any unarchived habit or habit created before/on this logical date is active.
      const allHabits = await db.habits.toArray();
      const activeHabits = allHabits.filter(h => {
        const habitLogicalDate = getLogicalDate(h.created_at);
        return habitLogicalDate <= dateToEvaluate && h.archived_at === null;
      });

      const checkIns = await db.checkIns.filter(c => c.logical_date === dateToEvaluate).toArray();
      const checkedInIds = new Set(checkIns.map(c => c.habit_id));

      const logicalDayInput: LogicalDayInput = {
        date: dateToEvaluate,
        habits: activeHabits.map(h => ({
          habitId: h.id,
          scheduled: true, // For MVP, all active habits are scheduled every day
          completed: checkedInIds.has(h.id)
        }))
      };

      const outcome = evaluateLogicalDay(logicalDayInput);

      if (outcome.kind === 'no_scheduled_habits') {
        // Do nothing to streaks or freezes
        continue;
      } else if (outcome.kind === 'missed_all_scheduled') {
        if (currentStats.freezes_available > 0) {
          currentStats.freezes_available -= 1;
        } else {
          // Break all streaks
          await db.streaks.toCollection().modify(streak => {
            streak.current_streak = 0;
          });
        }
      } else if (outcome.kind === 'streak_kept') {
        // Break streaks ONLY for habits that were missed
        await db.streaks.toCollection().modify(streak => {
          if (!checkedInIds.has(streak.habit_id)) {
            streak.current_streak = 0;
          }
        });
      }
    }

    currentStats.last_evaluated_date = logicalDate;
    await db.userStats.put(currentStats);
  });
}