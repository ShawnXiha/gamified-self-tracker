import { describe, it, expect } from 'vitest';
import { evaluateLogicalDay } from '../streak-engine';

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
});
