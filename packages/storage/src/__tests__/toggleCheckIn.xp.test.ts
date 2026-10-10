import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import { toggleCheckIn } from '../hooks';
import { recomputeCachesForHabit, recomputeUserStatsCache } from '../check-in-service';
import { calculateXP, calculateLevel } from 'domain/src/scoring-engine';

const TODAY = '2026-04-17';

/**
 * Seeds a habit created on 2026-04-01 (well before the seeded check-ins) so
 * the derived streak scan has a stable startDate on any test machine.
 */
async function seedHabit(habitId: string): Promise<void> {
  await db.habits.add({
    id: habitId,
    title: 'Test Habit',
    created_at: new Date('2026-04-01T00:00:00.000Z').getTime(),
    archived_at: null
  });
}

/**
 * Seeds two consecutive check-ins (Apr 15 + Apr 16) whose derived streak is 2
 * when today (Apr 17) is still unchecked. This is the single source of truth —
 * no manual userStats / streaks seeding.
 */
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

describe('toggleCheckIn (derived XP and streak caches)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('awards XP from the derived current streak and refreshes the caches', async () => {
    const habitId = 'habit-test-xp';

    // Today is 2026-04-17
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);
    await seedCheckIns(habitId);

    // Toggle Check-In (ON)
    const result = await toggleCheckIn(habitId);

    // Derived streak before the insert was 2 (Apr 15 + Apr 16; today in progress),
    // so the awarded XP is calculateXP(2) = 14 — not the legacy incremental value.
    expect(result).toEqual({ action: 'added', xp: calculateXP(2), leveled_up: true });

    const checkIn = await db.checkIns.where({ habit_id: habitId, logical_date: TODAY }).first();
    expect(checkIn).toBeDefined();
    expect(checkIn?.streak_at_time).toBe(2);
    expect(checkIn?.awarded_xp).toBe(14);

    // userStats cache is fully derived: total_xp = Σ awarded_xp across ALL rows.
    const userStats = await db.userStats.get('current');
    expect(userStats?.total_xp).toBe(34); // 10 + 10 + 14
    expect(userStats?.current_level).toBe(calculateLevel(34)); // 2
    expect(userStats?.freezes_available).toBe(3); // 2 + (level 2 − 1) + 0 milestones − 0 consumed

    const streak = await db.streaks.get(habitId);
    expect(streak?.current_streak).toBe(3);
    expect(streak?.longest_streak).toBe(3);
    expect(streak?.last_check_in_date).toBe(TODAY);
  });

  it('stores the check-in under the previous logical date before the 04:00 boundary', async () => {
    const habitId = 'habit-test-4am';

    // Local 03:30 on April 18 → logical date April 17. Parsed as LOCAL time on
    // purpose: 03:30 < 04:00 holds in every timezone, so this assertion is
    // deterministic regardless of the test machine's zone.
    vi.setSystemTime(new Date('2026-04-18T03:30:00'));
    await seedHabit(habitId);
    await seedCheckIns(habitId);

    const result = await toggleCheckIn(habitId);
    expect(result.action).toBe('added');

    const checkIns = await db.checkIns.where('habit_id').equals(habitId).sortBy('logical_date');
    expect(checkIns.map(c => c.logical_date)).toEqual(['2026-04-15', '2026-04-16', '2026-04-17']);

    const streak = await db.streaks.get(habitId);
    expect(streak?.current_streak).toBe(3);
    expect(streak?.last_check_in_date).toBe('2026-04-17');
  });

  it('removing the check-in reverts the caches to the derived state', async () => {
    const habitId = 'habit-test-revert';

    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);
    await seedCheckIns(habitId);

    // Toggle ON
    const added = await toggleCheckIn(habitId);
    expect(added).toEqual({ action: 'added', xp: 14, leveled_up: true });

    // Toggle OFF
    const removed = await toggleCheckIn(habitId);
    expect(removed).toEqual({ action: 'removed', xp: 14, leveled_up: false });

    const todayCheckIn = await db.checkIns.where({ habit_id: habitId, logical_date: TODAY }).first();
    expect(todayCheckIn).toBeUndefined();

    // total_xp falls back to the Σ of the remaining check-ins.
    const userStats = await db.userStats.get('current');
    expect(userStats?.total_xp).toBe(20); // 10 + 10
    expect(userStats?.current_level).toBe(calculateLevel(20)); // 1
    expect(userStats?.freezes_available).toBe(2); // 2 + 0 + 0 − 0

    // Streak cache is re-derived from the remaining rows: current reverted to 2
    // and last_check_in_date back to the true previous check-in (Apr 16).
    const streak = await db.streaks.get(habitId);
    expect(streak?.current_streak).toBe(2);
    expect(streak?.longest_streak).toBe(2); // derived longest, not a retained high-water mark
    expect(streak?.last_check_in_date).toBe('2026-04-16');
  });

  it('same-day on/off/on stays stable and reports leveled_up per toggle honestly', async () => {
    const habitId = 'habit-test-redo';

    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);

    // Seed 10 + 16 = 26 XP: one point below the level-2 threshold (27), so the
    // add crosses the level boundary in both directions as XP moves.
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
      awarded_xp: 16,
      streak_at_time: 3
    });

    // First ON: 26 + 14 = 40 XP → level 1 → 2, so leveled_up is true.
    const firstOn = await toggleCheckIn(habitId);
    expect(firstOn).toEqual({ action: 'added', xp: 14, leveled_up: true });

    const singleOnState = await db.userStats.get('current');

    // OFF: removal never levels up and XP honestly falls back below the threshold.
    const off = await toggleCheckIn(habitId);
    expect(off).toEqual({ action: 'removed', xp: 14, leveled_up: false });
    expect((await db.userStats.get('current'))?.total_xp).toBe(26);

    // Second ON: recomputed per toggle (no sticky flag). XP fell back under the
    // threshold during OFF, so this add crosses the level again; no ledger rows
    // are written and no freeze is ever minted by toggling.
    const reOn = await toggleCheckIn(habitId);
    expect(reOn.action).toBe('added');
    expect(reOn.xp).toBe(14);
    expect(reOn.leveled_up).toBe(true);

    // Final derived state equals the state after a single toggle-on: no drift,
    // no double XP, no duplicate freeze awards.
    const finalState = await db.userStats.get('current');
    expect(finalState?.total_xp).toBe(singleOnState?.total_xp);
    expect(finalState?.current_level).toBe(singleOnState?.current_level);
    expect(finalState?.freezes_available).toBe(singleOnState?.freezes_available);
  });

  it('does not report leveled_up when XP stays within the current level', async () => {
    const habitId = 'habit-test-no-level';

    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);

    // Seed 10 + 24 = 34 XP → already level 2; 34 + 14 = 48 stays level 2.
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
      awarded_xp: 24,
      streak_at_time: 4
    });

    // The app invariant is cache ≡ Σ check-ins; seed the cache at the derived
    // level so leveled_up compares against a truthful before-state (level 2).
    await db.userStats.add({
      id: 'current',
      total_xp: 34,
      current_level: 2,
      freezes_available: 3
    });

    const result = await toggleCheckIn(habitId);
    expect(result.action).toBe('added');
    expect(result.xp).toBe(14);
    expect(result.leveled_up).toBe(false);
  });
});

describe('toggleCheckIn (freeze-consumed wiring)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subtracts the consumed freeze and treats the protected day as neither break nor count', async () => {
    const habitId = 'habit-test-freeze';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);

    await db.checkIns.add({
      id: 'c1',
      habit_id: habitId,
      logical_date: '2026-04-15',
      completed_at: new Date('2026-04-15T12:00:00.000Z').getTime(),
      awarded_xp: 10,
      streak_at_time: 1
    });
    await db.freezeEvents.add({
      id: 'f1',
      type: 'consumed',
      logical_date: '2026-04-16',
      created_at: new Date('2026-04-17T05:00:00.000Z').getTime()
    });

    await recomputeCachesForHabit(habitId);
    await recomputeUserStatsCache();

    // 2026-04-16 is protected: it neither breaks the run (04-15 still counts)
    // nor extends it.
    const streak = await db.streaks.get(habitId);
    expect(streak?.current_streak).toBe(1);
    expect(streak?.last_check_in_date).toBe('2026-04-15');

    // freezes_available = 2 + (level 1 − 1) + 0 milestones − 1 consumed = 1
    const stats = await db.userStats.get('current');
    expect(stats?.total_xp).toBe(10);
    expect(stats?.current_level).toBe(1);
    expect(stats?.freezes_available).toBe(1);
  });

  it('awards XP from the protected run when checking in today', async () => {
    const habitId = 'habit-test-freeze-toggle';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);

    await db.checkIns.add({
      id: 'c1',
      habit_id: habitId,
      logical_date: '2026-04-15',
      completed_at: new Date('2026-04-15T12:00:00.000Z').getTime(),
      awarded_xp: 10,
      streak_at_time: 1
    });
    await db.freezeEvents.add({
      id: 'f1',
      type: 'consumed',
      logical_date: '2026-04-16',
      created_at: new Date('2026-04-17T05:00:00.000Z').getTime()
    });

    // Streak before insert: 04-17 in progress (skip), 04-16 frozen (skip),
    // 04-15 → 1. The freeze protected the run without counting toward it.
    const result = await toggleCheckIn(habitId);
    expect(result).toEqual({ action: 'added', xp: calculateXP(1), leveled_up: false });

    const inserted = await db.checkIns
      .where({ habit_id: habitId, logical_date: '2026-04-17' })
      .first();
    expect(inserted?.streak_at_time).toBe(1);
    expect(inserted?.awarded_xp).toBe(12);

    // The consumed freeze stays deducted even though today's check-in carried
    // the run through the protected day — the ledger is never touched by toggles.
    const stats = await db.userStats.get('current');
    expect(stats?.total_xp).toBe(22); // 10 + 12
    expect(stats?.current_level).toBe(1);
    expect(stats?.freezes_available).toBe(1); // 2 + 0 + 0 − 1

    const streak = await db.streaks.get(habitId);
    expect(streak?.current_streak).toBe(2); // 04-15 + 04-17 with 04-16 protected
    expect(streak?.last_check_in_date).toBe('2026-04-17');
  });
});

describe('check-in service contracts', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when toggling a habit that does not exist', async () => {
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await expect(toggleCheckIn('nonexistent-habit')).rejects.toThrow('Habit not found');
  });

  it('recomputeCachesForHabit silently no-ops for an unknown habit', async () => {
    await expect(recomputeCachesForHabit('nonexistent-habit')).resolves.toBeUndefined();
    expect(await db.streaks.count()).toBe(0);
  });
});
