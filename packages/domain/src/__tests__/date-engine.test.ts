import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  getLogicalDate,
  isToday,
  isMonday,
  getPast7LogicalDays,
  addDaysToLogicalDate,
} from '../date-engine';

describe('Date Engine', () => {
  describe('getLogicalDate', () => {
    it('returns the same calendar day for times after 04:00 AM', () => {
      const dt = new Date(2026, 3, 18, 14, 30, 0); // April 18, 2026 14:30
      expect(getLogicalDate(dt)).toBe('2026-04-18');
    });

    it('returns the previous calendar day for times before 04:00 AM', () => {
      const dt = new Date(2026, 3, 18, 3, 59, 59); // April 18, 2026 03:59:59
      expect(getLogicalDate(dt)).toBe('2026-04-17');
    });

    it('returns the current calendar day for exactly 04:00 AM', () => {
      const dt = new Date(2026, 3, 18, 4, 0, 0); // April 18, 2026 04:00:00
      expect(getLogicalDate(dt)).toBe('2026-04-18');
    });

    it('handles numeric timestamp inputs', () => {
      const dtNum = new Date(2026, 3, 18, 2, 0, 0).getTime();
      expect(getLogicalDate(dtNum)).toBe('2026-04-17');
    });

    it('handles string inputs', () => {
      // Create a local date string representation
      const dt = new Date(2026, 3, 18, 5, 0, 0); 
      expect(getLogicalDate(dt.toISOString())).toBe('2026-04-18');
    });

    it('throws error for invalid dates', () => {
      expect(() => getLogicalDate('invalid-date')).toThrow('Invalid date provided');
    });
  });

  describe('isToday', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns true when the input date matches the current logical date', () => {
      const mockNow = new Date(2026, 3, 18, 14, 30, 0); // logical 2026-04-18
      vi.setSystemTime(mockNow);
      expect(isToday('2026-04-18')).toBe(true);
      expect(isToday('2026-04-17')).toBe(false);
    });

    it('returns true for the previous calendar date if it is currently before 04:00 AM', () => {
      const mockNow = new Date(2026, 3, 18, 2, 0, 0); // logical 2026-04-17
      vi.setSystemTime(mockNow);
      expect(isToday('2026-04-17')).toBe(true);
      expect(isToday('2026-04-18')).toBe(false);
    });
  });

  describe('isMonday', () => {
    it('returns true if the logical date is a Monday', () => {
      // 2026-04-20 is a Monday
      expect(isMonday('2026-04-20')).toBe(true);
    });

    it('returns false if the logical date is not a Monday', () => {
      // 2026-04-19 is a Sunday
      expect(isMonday('2026-04-19')).toBe(false);
    });
  });

  describe('getPast7LogicalDays', () => {
    it('returns the 7 dates preceding the given logical date', () => {
      // If given Monday 2026-04-20, it should return 13th to 19th
      const days = getPast7LogicalDays('2026-04-20');
      expect(days.length).toBe(7);
      expect(days[0]).toBe('2026-04-13'); // start (Monday of previous week)
      expect(days[6]).toBe('2026-04-19'); // end (Sunday just passed)
    });
  });

  describe('addDaysToLogicalDate', () => {
    it('adds whole days to a logical date', () => {
      expect(addDaysToLogicalDate('2026-04-18', 1)).toBe('2026-04-19');
      expect(addDaysToLogicalDate('2026-04-18', 0)).toBe('2026-04-18');
    });

    it('rolls over month and year boundaries in UTC', () => {
      expect(addDaysToLogicalDate('2026-03-31', 1)).toBe('2026-04-01');
      expect(addDaysToLogicalDate('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('supports negative offsets', () => {
      expect(addDaysToLogicalDate('2026-04-01', -1)).toBe('2026-03-31');
    });
  });
});
