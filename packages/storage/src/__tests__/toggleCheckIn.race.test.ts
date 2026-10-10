import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import { toggleCheckIn } from '../hooks';

const TODAY = '2026-04-17';

async function seedHabit(habitId: string): Promise<void> {
  await db.habits.add({
    id: habitId,
    title: 'Test Habit',
    created_at: new Date('2026-04-01T00:00:00.000Z').getTime(),
    archived_at: null
  });
}

async function seedCheckIns(habitId: string): Promise<void> {
  await db.checkIns.add({
    id: 'c1',
    habit_id: habitId,
    logical_date: '2026-04-15',
    completed_at: new Date('2026-04-15T12:00:00.000Z').getTime(),
    awarded_xp: 10,
    streak_at_time: 1
  });
  await db.checkIns.add({
    id: 'c2',
    habit_id: habitId,
    logical_date: '2026-04-16',
    completed_at: new Date('2026-04-16T12:00:00.000Z').getTime(),
    awarded_xp: 10,
    streak_at_time: 2
  });
}

describe('toggleCheckIn (Race Condition Prevention)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the derived state consistent under concurrent toggles', async () => {
    const habitId = 'habit-test-race';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);
    await seedCheckIns(habitId);

    // Trigger two toggles simultaneously. Dexie serializes read-write
    // transactions over the shared tables, so exactly one of them wins: the
    // second either sees the first's row (and removes it) or hits the unique
    // [habit_id+logical_date] index and aborts with a ConstraintError.
    const p1 = toggleCheckIn(habitId);
    const p2 = toggleCheckIn(habitId);

    try {
      await Promise.all([p1, p2]);
    } catch (e) {
      // A ConstraintError on the unique index of the second insert is the
      // accepted resolution; anything else would be a real bug.
      expect((e as Error).name).toBe('ConstraintError');
    }

    // Ultimately there is exactly ONE (or zero) check-in for this logical date.
    const todayCheckIns = await db.checkIns
      .where({ habit_id: habitId, logical_date: TODAY })
      .toArray();
    expect(todayCheckIns.length).toBeLessThanOrEqual(1);

    const userStats = await db.userStats.get('current');
    const streak = await db.streaks.get(habitId);

    if (todayCheckIns.length === 1) {
      // XP awarded exactly once, from the derived streak of 2.
      expect(todayCheckIns[0]?.awarded_xp).toBe(14);
      expect(todayCheckIns[0]?.streak_at_time).toBe(2);

      expect(userStats?.total_xp).toBe(34); // 10 + 10 + 14 — nothing double-counted
      expect(streak?.current_streak).toBe(3);
      expect(streak?.last_check_in_date).toBe(TODAY);
    } else {
      // The second toggle saw the first's row and removed it: honest revert,
      // all caches reflect the actual remaining check-ins.
      expect(userStats?.total_xp).toBe(20); // 10 + 10
      expect(streak?.current_streak).toBe(2);
      expect(streak?.last_check_in_date).toBe('2026-04-16');
    }
  });
});