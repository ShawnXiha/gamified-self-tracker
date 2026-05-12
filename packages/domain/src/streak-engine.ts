import { calculateDayGap } from './date-engine';

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

export type StreakState = Readonly<{
  currentStreak: number;
  freezesAvailable: number;
  lastEvaluatedDate: LogicalDate | null;
}>;

export type StreakEvent =
  | Readonly<{ date: LogicalDate; kind: 'streak_incremented' }>
  | Readonly<{ date: LogicalDate; kind: 'freeze_consumed' }>
  | Readonly<{ date: LogicalDate; kind: 'neutral_day_skipped' }>
  | Readonly<{ date: LogicalDate; kind: 'streak_broken' }>;

/**
 * Applies a DailyOutcome to a global StreakState.
 */
export function applyDailyOutcome(
  state: StreakState,
  outcome: DailyOutcome,
): Readonly<{
  state: StreakState;
  event: StreakEvent;
}> {
  // If we already evaluated this day, throw or handle safely. Assuming strictly progressive here.
  
  if (outcome.kind === 'no_scheduled_habits') {
    return {
      state: {
        ...state,
        lastEvaluatedDate: outcome.date
      },
      event: { date: outcome.date, kind: 'neutral_day_skipped' }
    };
  }

  if (outcome.kind === 'streak_kept') {
    return {
      state: {
        ...state,
        currentStreak: state.currentStreak + 1,
        lastEvaluatedDate: outcome.date
      },
      event: { date: outcome.date, kind: 'streak_incremented' }
    };
  }

  // outcome.kind === 'missed_all_scheduled'
  if (state.freezesAvailable > 0) {
    return {
      state: {
        ...state,
        freezesAvailable: state.freezesAvailable - 1,
        lastEvaluatedDate: outcome.date
      },
      event: { date: outcome.date, kind: 'freeze_consumed' }
    };
  } else {
    return {
      state: {
        ...state,
        currentStreak: 0,
        freezesAvailable: 0,
        lastEvaluatedDate: outcome.date
      },
      event: { date: outcome.date, kind: 'streak_broken' }
    };
  }
}

/**
 * LEGACY / PER-HABIT evaluateStreakState 
 * Maintained temporarily but refactored to use the new DST-safe date math.
 * Note: Spec 003 clarifies freezes are global, so calling this per habit 
 * risks double-consuming freezes. Prefer evaluateLogicalDay + applyDailyOutcome instead.
 */
export function evaluateStreakState(
  lastCompletedDate: string | null,
  currentDate: string,
  freezesAvailable: number,
  currentStreak: number,
  gapOverride?: number // Optional param if caller pre-computed scheduled gaps
): { newStreak: number; freezesRemaining: number; status: 'Active' | 'Frozen' | 'Broken' } {
  if (!lastCompletedDate) {
    return { newStreak: 0, freezesRemaining: freezesAvailable, status: 'Active' };
  }

  // Calculate gap in whole days safely
  const gapInDays = calculateDayGap(lastCompletedDate, currentDate);

  if (gapInDays <= 1) {
    return { newStreak: currentStreak, freezesRemaining: freezesAvailable, status: 'Active' };
  }

  const missedDays = gapOverride !== undefined ? gapOverride : gapInDays - 1;

  if (freezesAvailable >= missedDays) {
    return {
      newStreak: currentStreak,
      freezesRemaining: freezesAvailable - missedDays,
      status: 'Frozen'
    };
  } else {
    return {
      newStreak: 0,
      freezesRemaining: 0,
      status: 'Broken'
    };
  }
}
