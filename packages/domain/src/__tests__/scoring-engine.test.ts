import { describe, it, expect } from 'vitest';
import { calculateXP, calculateLevel, calculateProgressToNextLevel, getBaseXPForLevel } from '../scoring-engine';

describe('Scoring Engine', () => {
  describe('calculateXP', () => {
    it('returns base 10 XP for 0 streak', () => {
      expect(calculateXP(0)).toBe(10);
    });

    it('adds 2 XP per streak count', () => {
      expect(calculateXP(1)).toBe(12);
      expect(calculateXP(3)).toBe(16);
    });

    it('caps the streak bonus at 10 (streak of 5 or more)', () => {
      expect(calculateXP(5)).toBe(20);
      expect(calculateXP(6)).toBe(20);
      expect(calculateXP(100)).toBe(20);
    });

    it('throws on negative streak', () => {
      expect(() => calculateXP(-1)).toThrow('Streak count cannot be negative');
    });
  });

  describe('getBaseXPForLevel', () => {
    it('returns 0 for level 1', () => {
      expect(getBaseXPForLevel(1)).toBe(0);
    });

    it('calculates correct XP thresholds using 25L + L^2*2 (using L-1)', () => {
      // level 2 (L=1): 25*1 + 1*2 = 27
      expect(getBaseXPForLevel(2)).toBe(27);
      // level 3 (L=2): 25*2 + 4*2 = 58
      expect(getBaseXPForLevel(3)).toBe(58);
      // level 4 (L=3): 25*3 + 9*2 = 93
      expect(getBaseXPForLevel(4)).toBe(93);
    });
  });

  describe('calculateLevel', () => {
    it('starts at level 1 for 0 XP', () => {
      expect(calculateLevel(0)).toBe(1);
    });

    it('returns level 1 for negative XP', () => {
      expect(calculateLevel(-10)).toBe(1);
    });

    it('levels up at exact thresholds', () => {
      expect(calculateLevel(26)).toBe(1);
      expect(calculateLevel(27)).toBe(2);
      expect(calculateLevel(57)).toBe(2);
      expect(calculateLevel(58)).toBe(3);
    });
  });

  describe('calculateProgressToNextLevel', () => {
    it('returns accurate progress metrics', () => {
      const progress = calculateProgressToNextLevel(30);
      // Currently level 2 (threshold 27). Next level 3 (threshold 58).
      // Progress XP = 30 - 27 = 3
      // Required XP = 58 - 27 = 31
      expect(progress.currentLevel).toBe(2);
      expect(progress.currentLevelBaseXP).toBe(27);
      expect(progress.nextLevelBaseXP).toBe(58);
      expect(progress.progressXP).toBe(3);
      expect(progress.requiredXP).toBe(31);
    });
  });
});
