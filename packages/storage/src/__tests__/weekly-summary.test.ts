import { describe, it, expect } from 'vitest';
import { buildWeeklySummary } from '../weekly-summary';
import type { Habit, DailyCheckIn } from '../db';

/** Minimal partial check-in helper — only fields used by the aggregation. */
function checkIn(id: string, habitId: string, logicalDate: string): DailyCheckIn {
  return {
    id,
    habit_id: habitId,
    logical_date: logicalDate,
    completed_at: Date.parse(`${logicalDate}T12:00:00.000Z`),
    awarded_xp: 0,
    streak_at_time: 0,
  };
}

function habit(id: string, archivedAt: number | null = null): Habit {
  return {
    id,
    title: `Habit ${id}`,
    created_at: Date.parse('2026-04-01T00:00:00.000Z'),
    archived_at: archivedAt,
  };
}

describe('buildWeeklySummary (pure)', () => {
  it('computes totals and consistency rate for regular input', () => {
    const activeHabits = [habit('h1'), habit('h2')];
    // 10 check-ins across the past 7 days (5 per habit)
    const past7CheckIns = [
      checkIn('a', 'h1', '2026-04-13'),
      checkIn('b', 'h1', '2026-04-14'),
      checkIn('c', 'h1', '2026-04-15'),
      checkIn('d', 'h1', '2026-04-16'),
      checkIn('e', 'h1', '2026-04-17'),
      checkIn('f', 'h2', '2026-04-13'),
      checkIn('g', 'h2', '2026-04-14'),
      checkIn('h', 'h2', '2026-04-15'),
      checkIn('i', 'h2', '2026-04-16'),
      checkIn('j', 'h2', '2026-04-18'),
    ];

    const summary = buildWeeklySummary(activeHabits, past7CheckIns, past7CheckIns, 21, 3);

    expect(summary.totalHabits).toBe(14); // 2 habits * 7 days
    expect(summary.completedHabits).toBe(10);
    expect(summary.consistencyRate).toBeCloseTo(10 / 14, 4); // ≈ 0.7143
  });

  it('guards against division by zero when there are no active habits', () => {
    const summary = buildWeeklySummary([], [], [], 5, 2);

    expect(summary.totalHabits).toBe(0);
    expect(summary.completedHabits).toBe(0);
    expect(summary.consistencyRate).toBe(0);
  });

  it('returns zero consistency when active habits exist but no past-7-day check-ins', () => {
    const activeHabits = [habit('h1'), habit('h2')];

    const summary = buildWeeklySummary(activeHabits, [], [], 0, 0);

    // totalHabits > 0 branch: rate must still be 0, not NaN or Infinity.
    expect(summary.totalHabits).toBe(14);
    expect(summary.completedHabits).toBe(0);
    expect(summary.consistencyRate).toBe(0);
  });

  it('counts no lifetime days when there are no check-ins at all', () => {
    const summary = buildWeeklySummary([habit('h1')], [], [], 0, 0);

    expect(summary.totalLifetimeDays).toBe(0);
  });

  it('counts unique logical dates across all check-ins (dedup)', () => {
    const allCheckIns = [
      checkIn('a', 'h1', '2026-04-13'),
      checkIn('b', 'h1', '2026-04-13'), // duplicate date, different habit
      checkIn('c', 'h1', '2026-04-14'),
      checkIn('d', 'h1', '2026-04-14'), // duplicate date
      checkIn('e', 'h1', '2026-04-15'),
    ];

    const summary = buildWeeklySummary([habit('h1')], [], allCheckIns, 0, 0);

    expect(summary.totalLifetimeDays).toBe(3);
  });

  it('includes check-in history of archived habits in lifetime days', () => {
    const archived = habit('h-archived', Date.parse('2026-04-15T00:00:00.000Z'));
    const active = habit('h-active');
    const allCheckIns = [
      checkIn('a', archived.id, '2026-04-01'), // archived habit history
      checkIn('b', archived.id, '2026-04-02'),
      checkIn('c', active.id, '2026-04-13'),
    ];

    const summary = buildWeeklySummary([active], [], allCheckIns, 0, 0);

    // Archived habit's 2 unique dates must still count, plus the active one.
    expect(summary.totalLifetimeDays).toBe(3);
  });

  it('passes longestStreak and freezesRemaining through directly', () => {
    const activeHabits = [habit('h1')];
    const past7CheckIns = [checkIn('a', 'h1', '2026-04-13')];

    const summary = buildWeeklySummary(activeHabits, past7CheckIns, past7CheckIns, 42, 7);

    expect(summary.longestStreak).toBe(42);
    expect(summary.freezesRemaining).toBe(7);
  });
});
