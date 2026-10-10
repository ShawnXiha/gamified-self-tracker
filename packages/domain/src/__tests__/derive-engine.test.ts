import { describe, it, expect } from 'vitest';
import {
  deriveTotalXP,
  deriveStreakStats,
  deriveLevelUpAwards,
  deriveFreezesAvailable,
} from '../derive-engine';

const today = '2026-04-17';
const startDate = '2026-04-01';

describe('Derive Engine', () => {
  describe('deriveStreakStats', () => {
    it('returns all zeros for empty sets', () => {
      expect(deriveStreakStats(new Set(), new Set(), startDate, today)).toEqual({
        current: 0,
        longest: 0,
        milestoneAwards: 0,
      });
    });

    it('counts a check-in yesterday as 1 when today is unchecked (in progress day skipped)', () => {
      expect(
        deriveStreakStats(new Set(['2026-04-16']), new Set(), startDate, today),
      ).toEqual({ current: 1, longest: 1, milestoneAwards: 0 });
    });

    it('counts {16, 15} as a current streak of 2', () => {
      expect(
        deriveStreakStats(
          new Set(['2026-04-16', '2026-04-15']),
          new Set(),
          startDate,
          today,
        ),
      ).toEqual({ current: 2, longest: 2, milestoneAwards: 0 });
    });

    it('breaks on the first unprotected miss: {16, 14} gives current 1', () => {
      expect(
        deriveStreakStats(
          new Set(['2026-04-16', '2026-04-14']),
          new Set(),
          startDate,
          today,
        ),
      ).toEqual({ current: 1, longest: 1, milestoneAwards: 0 });
    });

    it('skips freeze days without counting or breaking: {15, 14} + freeze 16 gives current 2', () => {
      expect(
        deriveStreakStats(
          new Set(['2026-04-15', '2026-04-14']),
          new Set(['2026-04-16']),
          startDate,
          today,
        ),
      ).toEqual({ current: 2, longest: 2, milestoneAwards: 0 });
    });

    it('tracks the longest run across two segments: {12, 11, 10} and {16}', () => {
      expect(
        deriveStreakStats(
          new Set(['2026-04-12', '2026-04-11', '2026-04-10', '2026-04-16']),
          new Set(),
          startDate,
          today,
        ),
      ).toEqual({ current: 1, longest: 3, milestoneAwards: 0 });
    });

    it('awards 1 milestone for a run of 8 ({10..17})', () => {
      expect(
        deriveStreakStats(
          new Set([
            '2026-04-10',
            '2026-04-11',
            '2026-04-12',
            '2026-04-13',
            '2026-04-14',
            '2026-04-15',
            '2026-04-16',
            '2026-04-17',
          ]),
          new Set(),
          startDate,
          today,
        ),
      ).toEqual({ current: 8, longest: 8, milestoneAwards: 1 });
    });

    it('awards 2 milestones for a run of 15 ({3..17})', () => {
      const dates = new Set<string>();
      for (let day = 3; day <= 17; day++) {
        dates.add(`2026-04-${String(day).padStart(2, '0')}`);
      }
      expect(deriveStreakStats(dates, new Set(), startDate, today)).toEqual({
        current: 15,
        longest: 15,
        milestoneAwards: 2,
      });
    });

    it('awards 2 milestones for two separate runs of 7 each', () => {
      const dates = new Set<string>();
      for (let day = 1; day <= 7; day++) {
        dates.add(`2026-04-${String(day).padStart(2, '0')}`);
      }
      for (let day = 11; day <= 17; day++) {
        dates.add(`2026-04-${String(day).padStart(2, '0')}`);
      }
      expect(deriveStreakStats(dates, new Set(), startDate, today)).toEqual({
        current: 7,
        longest: 7,
        milestoneAwards: 2,
      });
    });

    it('ignores check-ins before startDate (truncated scan)', () => {
      expect(
        deriveStreakStats(
          new Set(['2026-04-09', '2026-04-08']),
          new Set(),
          '2026-04-10',
          today,
        ),
      ).toEqual({ current: 0, longest: 0, milestoneAwards: 0 });
    });

    it('returns all zeros when startDate is after today (both loops no-op)', () => {
      expect(
        deriveStreakStats(new Set(), new Set(), '2026-04-20', '2026-04-17'),
      ).toEqual({ current: 0, longest: 0, milestoneAwards: 0 });
    });

    it('counts a single check-in when startDate equals today', () => {
      expect(
        deriveStreakStats(
          new Set(['2026-04-17']),
          new Set(),
          '2026-04-17',
          '2026-04-17',
        ),
      ).toEqual({ current: 1, longest: 1, milestoneAwards: 0 });
    });

    it('lets a check-in win when a day is both checked in and frozen', () => {
      expect(
        deriveStreakStats(
          new Set(['2026-04-15', '2026-04-14']),
          new Set(['2026-04-16', '2026-04-15']),
          startDate,
          today,
        ),
      ).toEqual({ current: 2, longest: 2, milestoneAwards: 0 });
    });
  });

  describe('deriveTotalXP', () => {
    it('sums awarded XP across check-ins', () => {
      expect(
        deriveTotalXP([{ awarded_xp: 10 }, { awarded_xp: 16 }]),
      ).toBe(26);
    });

    it('returns 0 for an empty array', () => {
      expect(deriveTotalXP([])).toBe(0);
    });
  });

  describe('deriveLevelUpAwards', () => {
    it('gives 0 level-up awards at level 1', () => {
      expect(deriveLevelUpAwards(1)).toBe(0);
    });

    it('gives level - 1 awards beyond level 1', () => {
      expect(deriveLevelUpAwards(3)).toBe(2);
    });
  });

  describe('deriveFreezesAvailable', () => {
    it('starts with 2 freezes at level 1', () => {
      expect(deriveFreezesAvailable(1, 0, 0)).toBe(2);
    });

    it('combines level, milestone, and consumed terms in range without clamping', () => {
      expect(deriveFreezesAvailable(2, 1, 0)).toBe(4);
    });

    it('clamps to the upper cap of 5', () => {
      expect(deriveFreezesAvailable(5, 0, 0)).toBe(5);
    });

    it('clamps to the lower cap of 0', () => {
      expect(deriveFreezesAvailable(1, 0, 3)).toBe(0);
    });

    it('clamps back down to 5 when the formula overshoots', () => {
      expect(deriveFreezesAvailable(6, 3, 0)).toBe(5);
    });
  });
});
