export type LogicalDate = string;
export type HabitId = string;

export type HabitDayInput = Readonly<{
  habitId: HabitId;
  scheduled: boolean;
  completed: boolean;
}>;

export type LogicalDayInput = Readonly<{
  date: LogicalDate;
  habits: ReadonlyArray<HabitDayInput>;
}>;

export type DailyOutcome =
  | Readonly<{
      date: LogicalDate;
      kind: 'no_scheduled_habits';
    }>
  | Readonly<{
      date: LogicalDate;
      kind: 'streak_kept';
      scheduledCount: number;
      completedCount: number;
    }>
  | Readonly<{
      date: LogicalDate;
      kind: 'missed_all_scheduled';
      scheduledCount: number;
    }>;

/**
 * Evaluates a single logical day to determine its aggregated outcome
 * across all habits.
 */
export function evaluateLogicalDay(input: LogicalDayInput): DailyOutcome {
  const scheduledHabits = input.habits.filter(h => h.scheduled);
  const scheduledCount = scheduledHabits.length;

  if (scheduledCount === 0) {
    return { date: input.date, kind: 'no_scheduled_habits' };
  }

  const completedCount = scheduledHabits.filter(h => h.completed).length;

  if (completedCount === 0) {
    return { date: input.date, kind: 'missed_all_scheduled', scheduledCount };
  }

  return { date: input.date, kind: 'streak_kept', scheduledCount, completedCount };
}
