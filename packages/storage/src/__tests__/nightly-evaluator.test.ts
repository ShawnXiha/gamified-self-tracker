import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import { runNightlyEvaluation } from '../nightly-evaluator';
import { toggleCheckIn } from '../check-in-service';
import { calculateXP, calculateLevel } from 'domain/src/scoring-engine';
import { deriveStreakStats, deriveTotalXP, deriveFreezesAvailable } from 'domain/src/derive-engine';

const HABIT_START_DATE = '2026-04-01';
const HABIT_CREATED_AT = new Date('2026-04-01T00:00:00.000Z').getTime();

/**
 * Seed value chosen so the seeded histories stay below the level-2 threshold
 * (27 XP). These rows are cache seeds only — XP is never the subject here.
 */
const XP_PER_CHECK_IN = 5;

/**
 * Seeds a habit created well before every seeded check-in, so the derived
 * streak scan has a stable startDate on any test machine.
 */
async function seedHabit(habitId: string, archivedAt: number | null = null): Promise<void> {
  await db.habits.add({
    id: habitId,
    title: `Habit ${habitId}`,
    created_at: HABIT_CREATED_AT,
    archived_at: archivedAt,
  });
}

async function seedCheckIn(habitId: string, logicalDate: string): Promise<void> {
  await db.checkIns.add({
    id: `${habitId}-${logicalDate}`,
    habit_id: habitId,
    logical_date: logicalDate,
    completed_at: Date.parse(`${logicalDate}T12:00:00.000Z`),
    awarded_xp: XP_PER_CHECK_IN,
    streak_at_time: 0,
  });
}

/**
 * Seeds the evaluator checkpoint with deliberately stale derived fields
 * (total_xp / level / freezes all 0). The evaluator must re-derive them from
 * the source of truth instead of trusting this cache row.
 */
async function seedUserStats(lastEvaluatedDate: string): Promise<void> {
  await db.userStats.add({
    id: 'current',
    total_xp: 0,
    current_level: 1,
    freezes_available: 0,
    last_evaluated_date: lastEvaluatedDate,
  });
}

async function seedConsumedFreeze(id: string, logicalDate: string): Promise<void> {
  await db.freezeEvents.add({
    id,
    type: 'consumed',
    logical_date: logicalDate,
    created_at: Date.parse(`${logicalDate}T05:00:00.000Z`),
  });
}

describe('nightly evaluator (freeze ledger decisions)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consumes one freeze for a fully missed day and keeps the protected streak alive', async () => {
    const habitId = 'h1';

    // Today is 2026-04-18; 2026-04-17 was fully missed.
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));
    await seedHabit(habitId);
    await seedCheckIn(habitId, '2026-04-14');
    await seedCheckIn(habitId, '2026-04-15');
    await seedCheckIn(habitId, '2026-04-16');
    await seedUserStats('2026-04-16');

    await runNightlyEvaluation();

    // Derived availability was 2 (level 1, no milestones), so one freeze is
    // consumed for 04-17 — and today (04-18) is never evaluated.
    const events = await db.freezeEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('consumed');
    expect(events[0].logical_date).toBe('2026-04-17');

    const stats = await db.userStats.get('current');
    expect(stats?.total_xp).toBe(15); // 3 × 5
    expect(stats?.current_level).toBe(1);
    expect(stats?.freezes_available).toBe(1); // derived 2 − 1 consumed
    expect(stats?.last_evaluated_date).toBe('2026-04-18');

    // The protected day neither counts nor breaks: the run survives.
    const streak = await db.streaks.get(habitId);
    expect(streak?.current_streak).toBe(3);
    expect(streak?.longest_streak).toBe(3);
    expect(streak?.last_check_in_date).toBe('2026-04-16');
  });

  it('breaks the streak on the second consecutive missed day when no freeze remains', async () => {
    const habitId = 'h1';

    // Today is 2026-04-19; 04-17 and 04-18 were both fully missed.
    vi.setSystemTime(new Date('2026-04-19T12:00:00.000Z'));
    await seedHabit(habitId);
    await seedCheckIn(habitId, '2026-04-14');
    await seedCheckIn(habitId, '2026-04-15');
    await seedCheckIn(habitId, '2026-04-16');
    // One freeze was already spent on 04-10: derived availability is 1.
    await seedConsumedFreeze('f-old', '2026-04-10');
    await seedUserStats('2026-04-16');

    await runNightlyEvaluation();

    const dates = (await db.freezeEvents.orderBy('logical_date').toArray()).map(e => e.logical_date);
    expect(dates).toEqual(['2026-04-10', '2026-04-17']); // 04-18: no freeze left, no event

    const stats = await db.userStats.get('current');
    expect(stats?.freezes_available).toBe(0); // 2 − 1 old − 1 new
    expect(stats?.last_evaluated_date).toBe('2026-04-19');

    // 04-17 was protected; 04-18 was not — the unprotected miss breaks the run.
    const streak = await db.streaks.get(habitId);
    expect(streak?.current_streak).toBe(0);
    expect(streak?.longest_streak).toBe(3);
    expect(streak?.last_check_in_date).toBe('2026-04-16');
  });

  it('keeps the streak of a partially completed day and consumes no freeze', async () => {
    // Today is 2026-04-18; only h2 fully missed 04-17.
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));
    await seedHabit('h1');
    await seedHabit('h2');
    await seedCheckIn('h1', '2026-04-15');
    await seedCheckIn('h1', '2026-04-16');
    await seedCheckIn('h1', '2026-04-17');
    await seedCheckIn('h2', '2026-04-15');
    await seedCheckIn('h2', '2026-04-16');
    await seedUserStats('2026-04-16');

    await runNightlyEvaluation();

    // Some habit was completed → streak_kept → the freeze ledger stays empty.
    expect(await db.freezeEvents.count()).toBe(0);

    const stats = await db.userStats.get('current');
    expect(stats?.total_xp).toBe(25); // 5 × 5
    expect(stats?.current_level).toBe(1);
    expect(stats?.freezes_available).toBe(2); // untouched
    expect(stats?.last_evaluated_date).toBe('2026-04-18');

    // The habit that checked in keeps its run; the missed one breaks.
    const kept = await db.streaks.get('h1');
    expect(kept?.current_streak).toBe(3);
    expect(kept?.last_check_in_date).toBe('2026-04-17');

    const missed = await db.streaks.get('h2');
    expect(missed?.current_streak).toBe(0);
    expect(missed?.longest_streak).toBe(2);
    expect(missed?.last_check_in_date).toBe('2026-04-16');
  });

  it('does not schedule archived habits: their fully missed days consume no freeze', async () => {
    const habitId = 'h1';

    // Today is 2026-04-18; the only habit was archived before 04-17.
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));
    await seedHabit(habitId, Date.parse('2026-04-16T12:00:00.000Z'));
    await seedCheckIn(habitId, '2026-04-15');
    await seedCheckIn(habitId, '2026-04-16');
    await seedUserStats('2026-04-16');

    await runNightlyEvaluation();

    // No unarchived habit was scheduled on 04-17 → no_scheduled_habits.
    expect(await db.freezeEvents.count()).toBe(0);
    expect((await db.userStats.get('current'))?.freezes_available).toBe(2);

    // The archived habit's history is preserved and its cache stays derived
    // from that history.
    expect(await db.checkIns.where('habit_id').equals(habitId).count()).toBe(2);
    const streak = await db.streaks.get(habitId);
    expect(streak?.longest_streak).toBe(2);
    expect(streak?.last_check_in_date).toBe('2026-04-16');
  });

  it('ignores an archived habit completed on a day when an active habit missed', async () => {
    // Today is 2026-04-18.
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));
    await seedHabit('h-active');
    await seedHabit('h-archived', Date.now());
    await seedCheckIn('h-active', '2026-04-15');
    await seedCheckIn('h-active', '2026-04-16');
    await seedCheckIn('h-archived', '2026-04-17');
    await seedUserStats('2026-04-16');

    await runNightlyEvaluation();

    // Only h-active is scheduled and it missed on 04-17 → one freeze is
    // consumed, even though the archived habit has a check-in for that day.
    const events = await db.freezeEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0].logical_date).toBe('2026-04-17');

    // The consumed freeze protects the whole logical day: h-active's run
    // survives (if the archived habit had wrongly counted as scheduled, no
    // freeze would be spent and 04-17 would break the run instead).
    const streak = await db.streaks.get('h-active');
    expect(streak?.current_streak).toBe(2);
    expect(streak?.longest_streak).toBe(2);
    expect(streak?.last_check_in_date).toBe('2026-04-16');
    expect(await db.checkIns.where('habit_id').equals('h-archived').count()).toBe(1);
  });

  it('is idempotent: a second run neither duplicates the ledger nor mutates caches', async () => {
    const habitId = 'h1';

    // Today is 2026-04-18; 2026-04-17 was fully missed.
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));
    await seedHabit(habitId);
    await seedCheckIn(habitId, '2026-04-14');
    await seedCheckIn(habitId, '2026-04-15');
    await seedCheckIn(habitId, '2026-04-16');
    await seedUserStats('2026-04-16');

    await runNightlyEvaluation();

    const firstStats = await db.userStats.get('current');
    const firstStreak = await db.streaks.get(habitId);
    const firstEvents = await db.freezeEvents.toArray();
    expect(firstEvents).toHaveLength(1);

    await runNightlyEvaluation();

    // gap ≤ 0 → early return: nothing in the database changes at all.
    expect(await db.userStats.get('current')).toEqual(firstStats);
    expect(await db.streaks.get(habitId)).toEqual(firstStreak);
    expect(await db.freezeEvents.toArray()).toEqual(firstEvents);
    expect(await db.freezeEvents.where('logical_date').equals('2026-04-17').count()).toBe(1);
    expect((await db.userStats.get('current'))?.last_evaluated_date).toBe('2026-04-18');
  });

  it('initializes a brand-new user without evaluating and without throwing', async () => {
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));

    await expect(runNightlyEvaluation()).resolves.toBeUndefined();

    expect(await db.userStats.get('current')).toEqual({
      id: 'current',
      total_xp: 0,
      current_level: 1,
      freezes_available: 2,
      last_evaluated_date: '2026-04-18',
    });
    expect(await db.freezeEvents.count()).toBe(0);

    // A second boot on the same day stays a no-op.
    await runNightlyEvaluation();
    expect((await db.userStats.get('current'))?.last_evaluated_date).toBe('2026-04-18');
  });

  it('backfills a missing checkpoint without retro-evaluating unknown history', async () => {
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));
    await seedHabit('h1');
    await seedCheckIn('h1', '2026-04-15');
    await db.userStats.add({
      id: 'current',
      total_xp: 5,
      current_level: 1,
      freezes_available: 2,
      // last_evaluated_date intentionally missing.
    });

    await runNightlyEvaluation();

    expect((await db.userStats.get('current'))?.last_evaluated_date).toBe('2026-04-18');
    expect(await db.freezeEvents.count()).toBe(0); // no history touched
  });
});

describe('nightly evaluator ↔ toggleCheckIn contract', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an evaluated freeze protection when toggling today, staying equal to pure derivation', async () => {
    const habitId = 'h1';
    const today = '2026-04-18';

    // Today is 2026-04-18; 2026-04-17 was fully missed.
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'));
    await seedHabit(habitId);
    await seedCheckIn(habitId, '2026-04-14');
    await seedCheckIn(habitId, '2026-04-15');
    await seedCheckIn(habitId, '2026-04-16');
    await seedUserStats('2026-04-16');

    await runNightlyEvaluation();
    expect(await db.freezeEvents.count()).toBe(1); // 04-17 protected

    // The freeze must be visible to the toggle: the derived streak before
    // today's insert is 3 (04-14..16 with 04-17 protected), so XP = 16 and
    // the total of 31 XP crosses into level 2.
    const result = await toggleCheckIn(habitId);
    expect(result).toEqual({ action: 'added', xp: calculateXP(3), leveled_up: true });

    const todayRow = await db.checkIns.where({ habit_id: habitId, logical_date: today }).first();
    expect(todayRow?.streak_at_time).toBe(3);
    expect(todayRow?.awarded_xp).toBe(calculateXP(3));

    // Pure derivation oracle, read straight from the sources of truth.
    const checkIns = await db.checkIns.where('habit_id').equals(habitId).toArray();
    const consumed = await db.freezeEvents.where('type').equals('consumed').toArray();
    const derived = deriveStreakStats(
      new Set(checkIns.map(c => c.logical_date)),
      new Set(consumed.map(e => e.logical_date)),
      HABIT_START_DATE,
      today,
    );
    const totalXp = deriveTotalXP(checkIns);
    const level = calculateLevel(totalXp);
    const derivedFreezes = deriveFreezesAvailable(level, derived.milestoneAwards, consumed.length);

    // The evaluator's decision survived the toggle's cache rewrite.
    expect(consumed).toHaveLength(1);
    expect(consumed[0].logical_date).toBe('2026-04-17');

    const streak = await db.streaks.get(habitId);
    expect(streak?.current_streak).toBe(4);
    expect(streak?.current_streak).toBe(derived.current);
    expect(streak?.longest_streak).toBe(derived.longest);
    expect(streak?.last_check_in_date).toBe(today);

    const stats = await db.userStats.get('current');
    expect(stats?.total_xp).toBe(totalXp);
    expect(stats?.total_xp).toBe(31); // 15 seeded + calculateXP(3) = 16
    expect(stats?.current_level).toBe(level);
    expect(stats?.current_level).toBe(2);
    expect(stats?.freezes_available).toBe(derivedFreezes);
    expect(stats?.freezes_available).toBe(2); // 2 + (level 2 − 1) − 1 consumed
    // The checkpoint itself also survives the toggle.
    expect(stats?.last_evaluated_date).toBe(today);
  });
});
