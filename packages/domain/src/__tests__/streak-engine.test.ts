import { describe, it, expect } from 'vitest';
import { 
  evaluateStreakState, 
  evaluateLogicalDay, 
  applyDailyOutcome,
  StreakState
} from '../streak-engine';

describe('Streak & Freeze Engine', () => {
  
  describe('evaluateLogicalDay', () => {
    it('returns no_scheduled_habits if nothing is scheduled', () => {
      const outcome = evaluateLogicalDay({
        date: '2026-04-18',
        habits: [
          { habitId: 'h1', scheduled: false, completed: false },
          { habitId: 'h2', scheduled: false, completed: false },
        ]
      });
      expect(outcome).toEqual({ date: '2026-04-18', kind: 'no_scheduled_habits' });
    });

    it('returns missed_all_scheduled if scheduled habits exist but none completed', () => {
      const outcome = evaluateLogicalDay({
        date: '2026-04-18',
        habits: [
          { habitId: 'h1', scheduled: true, completed: false },
          { habitId: 'h2', scheduled: false, completed: false },
        ]
      });
      expect(outcome).toEqual({ date: '2026-04-18', kind: 'missed_all_scheduled', scheduledCount: 1 });
    });

    it('returns streak_kept if at least one scheduled habit is completed', () => {
      const outcome = evaluateLogicalDay({
        date: '2026-04-18',
        habits: [
          { habitId: 'h1', scheduled: true, completed: true },
          { habitId: 'h2', scheduled: true, completed: false },
        ]
      });
      expect(outcome).toEqual({ date: '2026-04-18', kind: 'streak_kept', scheduledCount: 2, completedCount: 1 });
    });
  });

  describe('applyDailyOutcome', () => {
    const initialState: StreakState = {
      currentStreak: 10,
      freezesAvailable: 2,
      lastEvaluatedDate: '2026-04-17'
    };

    it('preserves state without incrementing for a neutral day', () => {
      const result = applyDailyOutcome(initialState, { date: '2026-04-18', kind: 'no_scheduled_habits' });
      expect(result.state).toEqual({
        currentStreak: 10,
        freezesAvailable: 2,
        lastEvaluatedDate: '2026-04-18'
      });
      expect(result.event).toEqual({ date: '2026-04-18', kind: 'neutral_day_skipped' });
    });

    it('increments streak for a streak_kept day', () => {
      const result = applyDailyOutcome(initialState, { date: '2026-04-18', kind: 'streak_kept', completedCount: 1, scheduledCount: 1 });
      expect(result.state).toEqual({
        currentStreak: 11,
        freezesAvailable: 2,
        lastEvaluatedDate: '2026-04-18'
      });
      expect(result.event).toEqual({ date: '2026-04-18', kind: 'streak_incremented' });
    });

    it('consumes a freeze for a missed day if freezes are available', () => {
      const result = applyDailyOutcome(initialState, { date: '2026-04-18', kind: 'missed_all_scheduled', scheduledCount: 1 });
      expect(result.state).toEqual({
        currentStreak: 10,
        freezesAvailable: 1,
        lastEvaluatedDate: '2026-04-18'
      });
      expect(result.event).toEqual({ date: '2026-04-18', kind: 'freeze_consumed' });
    });

    it('breaks the streak for a missed day if 0 freezes are available', () => {
      const stateNoFreezes = { ...initialState, freezesAvailable: 0 };
      const result = applyDailyOutcome(stateNoFreezes, { date: '2026-04-18', kind: 'missed_all_scheduled', scheduledCount: 1 });
      expect(result.state).toEqual({
        currentStreak: 0,
        freezesAvailable: 0,
        lastEvaluatedDate: '2026-04-18'
      });
      expect(result.event).toEqual({ date: '2026-04-18', kind: 'streak_broken' });
    });
  });

  describe('Legacy evaluateStreakState (DST-safe version)', () => {
    it('returns Active status when checking on the same day', () => {
      const result = evaluateStreakState('2026-04-18', '2026-04-18', 2, 5);
      expect(result).toEqual({ newStreak: 5, freezesRemaining: 2, status: 'Active' });
    });

    it('returns Active status when checking on the next day (no miss yet)', () => {
      const result = evaluateStreakState('2026-04-18', '2026-04-19', 2, 5);
      expect(result).toEqual({ newStreak: 5, freezesRemaining: 2, status: 'Active' });
    });

    it('returns Frozen and deducts a freeze when exactly 1 day is missed with 1+ freeze available', () => {
      const result = evaluateStreakState('2026-04-18', '2026-04-20', 1, 5);
      expect(result).toEqual({ newStreak: 5, freezesRemaining: 0, status: 'Frozen' });
    });

    it('returns Broken when 1 day is missed with 0 freezes available', () => {
      const result = evaluateStreakState('2026-04-18', '2026-04-20', 0, 5);
      expect(result).toEqual({ newStreak: 0, freezesRemaining: 0, status: 'Broken' });
    });

    it('returns Broken and consumes available freezes when missed days exceed freeze inventory', () => {
      const result = evaluateStreakState('2026-04-18', '2026-04-22', 2, 5);
      expect(result).toEqual({ newStreak: 0, freezesRemaining: 0, status: 'Broken' });
    });

    it('returns Frozen and consumes multiple freezes when missed days are fully covered by inventory', () => {
      const result = evaluateStreakState('2026-04-18', '2026-04-21', 3, 5);
      expect(result).toEqual({ newStreak: 5, freezesRemaining: 1, status: 'Frozen' });
    });

    it('returns Active for a completely new habit (no lastCompletedDate)', () => {
      const result = evaluateStreakState(null, '2026-04-18', 2, 0);
      expect(result).toEqual({ newStreak: 0, freezesRemaining: 2, status: 'Active' });
    });

    it('handles month boundaries properly', () => {
      const result = evaluateStreakState('2026-03-31', '2026-04-02', 1, 5);
      expect(result).toEqual({ newStreak: 5, freezesRemaining: 0, status: 'Frozen' });
    });

    it('supports gapOverride to prevent double consumption of freezes if days were unscheduled', () => {
      // 3 calendar days passed, but we pass gapOverride = 0 (because they were unscheduled)
      const result = evaluateStreakState('2026-04-18', '2026-04-21', 2, 5, 0);
      expect(result).toEqual({ newStreak: 5, freezesRemaining: 2, status: 'Frozen' });
    });
  });
});
