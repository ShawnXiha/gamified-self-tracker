import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import {
  renameHabit,
  archiveHabit,
  unarchiveHabit,
  deleteHabit,
  recomputeCachesForHabit,
  recomputeUserStatsCache,
} from '../check-in-service';

const SEEDED_CREATED_AT = new Date('2026-04-01T00:00:00.000Z').getTime();

/**
 * Seeds a habit created on 2026-04-01 so the derived streak scan has a stable
 * startDate on any test machine (same pattern as toggleCheckIn.xp.test.ts).
 */
async function seedHabit(habitId: string): Promise<void> {
  await db.habits.add({
    id: habitId,
    title: 'Test Habit',
    created_at: SEEDED_CREATED_AT,
    archived_at: null
  });
}

/**
 * Seeds two consecutive 10 XP check-ins (Apr 15 + Apr 16).
 */
async function seedCheckIns(habitId: string): Promise<void> {
  await db.checkIns.add({
    id: `${habitId}-c1`,
    habit_id: habitId,
    logical_date: '2026-04-15',
    completed_at: new Date('2026-04-15T12:00:00.000Z').getTime(),
    awarded_xp: 10,
    streak_at_time: 1
  });
  await db.checkIns.add({
    id: `${habitId}-c2`,
    habit_id: habitId,
    logical_date: '2026-04-16',
    completed_at: new Date('2026-04-16T12:00:00.000Z').getTime(),
    awarded_xp: 10,
    streak_at_time: 2
  });
}

describe('habit management (rename / archive / unarchive / delete)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renames the habit without changing its id or check-in history', async () => {
    const habitId = 'habit-rename';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);
    await seedCheckIns(habitId);

    await renameHabit(habitId, 'New Title');

    const habit = await db.habits.get(habitId);
    expect(habit?.title).toBe('New Title');
    expect(habit?.id).toBe(habitId);
    expect(habit?.created_at).toBe(SEEDED_CREATED_AT);
    expect(habit?.archived_at).toBeNull();

    // The check-in history is untouched by a rename.
    const checkIns = await db.checkIns.where('habit_id').equals(habitId).toArray();
    expect(checkIns).toHaveLength(2);
    expect(checkIns.map(c => c.awarded_xp)).toEqual([10, 10]);
  });

  it('rejects empty and whitespace-only titles', async () => {
    const habitId = 'habit-rename-empty';
    await seedHabit(habitId);

    await expect(renameHabit(habitId, '')).rejects.toThrow('Title cannot be empty');
    await expect(renameHabit(habitId, '   ')).rejects.toThrow('Title cannot be empty');

    // The original title is preserved after a rejected rename.
    expect((await db.habits.get(habitId))?.title).toBe('Test Habit');
  });

  it('trims leading and trailing whitespace from the stored title', async () => {
    const habitId = 'habit-rename-trim';
    await seedHabit(habitId);

    await renameHabit(habitId, '  Foo  ');

    expect((await db.habits.get(habitId))?.title).toBe('Foo');
    expect((await db.habits.get(habitId))?.id).toBe(habitId);
    expect((await db.habits.get(habitId))?.archived_at).toBeNull();
  });

  it('archives the habit with a non-null archived_at and is idempotent', async () => {
    const habitId = 'habit-archive';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);

    await archiveHabit(habitId);
    const first = (await db.habits.get(habitId))?.archived_at;
    expect(first).not.toBeNull();

    // A second call later must keep the original timestamp (true idempotency,
    // not just "does not throw").
    vi.setSystemTime(new Date('2026-04-20T10:00:00.000Z'));
    await archiveHabit(habitId);
    expect((await db.habits.get(habitId))?.archived_at).toBe(first);
  });

  it('unarchives by clearing archived_at', async () => {
    const habitId = 'habit-unarchive';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);
    await archiveHabit(habitId);

    await unarchiveHabit(habitId);

    const habit = await db.habits.get(habitId);
    expect(habit?.archived_at).toBeNull();
    expect(habit?.title).toBe('Test Habit');
  });

  it('deletes the habit, its check-ins, and its streak row; XP falls back to the remaining check-ins; freezeEvents untouched', async () => {
    const deletedId = 'habit-delete-me';
    const keptId = 'habit-keep';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));

    // Habit to delete: 10 + 10 = 20 XP.
    await seedHabit(deletedId);
    await seedCheckIns(deletedId);

    // Surviving habit: 10 + 16 = 26 XP.
    await seedHabit(keptId);
    await db.checkIns.add({
      id: 'keep-c1',
      habit_id: keptId,
      logical_date: '2026-04-15',
      completed_at: new Date('2026-04-15T12:00:00.000Z').getTime(),
      awarded_xp: 10,
      streak_at_time: 1
    });
    await db.checkIns.add({
      id: 'keep-c2',
      habit_id: keptId,
      logical_date: '2026-04-16',
      completed_at: new Date('2026-04-16T12:00:00.000Z').getTime(),
      awarded_xp: 16,
      streak_at_time: 3
    });

    // A consumed freeze: the global ledger must survive the deletion unchanged.
    await db.freezeEvents.add({
      id: 'freeze-1',
      type: 'consumed',
      logical_date: '2026-04-16',
      created_at: new Date('2026-04-17T05:00:00.000Z').getTime()
    });

    // Build the caches on the derived path so the delete has a truthful before-state.
    await recomputeCachesForHabit(deletedId);
    await recomputeCachesForHabit(keptId);
    await recomputeUserStatsCache();
    expect((await db.userStats.get('current'))?.total_xp).toBe(46); // 20 + 26

    await deleteHabit(deletedId);

    // All three habit-owned rows are gone.
    expect(await db.habits.get(deletedId)).toBeUndefined();
    expect(await db.checkIns.where('habit_id').equals(deletedId).count()).toBe(0);
    expect(await db.streaks.get(deletedId)).toBeUndefined();

    // XP honestly falls back to the Σ of the remaining check-ins (26), and the
    // level/freeze cache is re-derived from that (level 1, 2 + 0 + 0 − 1 = 1).
    const stats = await db.userStats.get('current');
    expect(stats?.total_xp).toBe(26);
    expect(stats?.current_level).toBe(1);
    expect(stats?.freezes_available).toBe(1);

    // The freeze ledger is untouched (global events are never retroactively removed).
    expect(await db.freezeEvents.count()).toBe(1);
    expect(await db.freezeEvents.get('freeze-1')).toBeDefined();

    // The surviving habit's rows are intact.
    expect((await db.habits.get(keptId))?.title).toBe('Test Habit');
    expect(await db.checkIns.where('habit_id').equals(keptId).count()).toBe(2);
    expect((await db.streaks.get(keptId))?.current_streak).toBe(2);
  });

  it('deletes a habit that has no check-ins or streak row', async () => {
    const bareId = 'habit-delete-bare';
    const keptId = 'habit-keep-bare';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));

    // A habit that was created but never checked in.
    await seedHabit(bareId);

    // A survivor with one check-in so the derived total stays meaningful.
    await seedHabit(keptId);
    await db.checkIns.add({
      id: 'bare-keep-c1',
      habit_id: keptId,
      logical_date: '2026-04-15',
      completed_at: new Date('2026-04-15T12:00:00.000Z').getTime(),
      awarded_xp: 10,
      streak_at_time: 1
    });
    await recomputeUserStatsCache();
    expect((await db.userStats.get('current'))?.total_xp).toBe(10);

    await deleteHabit(bareId);

    // No orphan rows for the bare habit, and the derived state is untouched.
    expect(await db.habits.get(bareId)).toBeUndefined();
    expect(await db.checkIns.where('habit_id').equals(bareId).count()).toBe(0);
    expect(await db.streaks.get(bareId)).toBeUndefined();
    expect((await db.userStats.get('current'))?.total_xp).toBe(10);
    expect((await db.habits.get(keptId))?.title).toBe('Test Habit');
  });

  it('deletes an already-archived habit together with its check-ins', async () => {
    const habitId = 'habit-delete-archived';
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    await seedHabit(habitId);
    await archiveHabit(habitId);
    await seedCheckIns(habitId);

    const archived = await db.habits.get(habitId);
    expect(archived?.archived_at).not.toBeNull();

    await deleteHabit(habitId);

    expect(await db.habits.get(habitId)).toBeUndefined();
    expect(await db.checkIns.where('habit_id').equals(habitId).count()).toBe(0);
    expect(await db.streaks.get(habitId)).toBeUndefined();
  });
});

describe('habit management error contracts', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when renaming a habit that does not exist', async () => {
    await expect(renameHabit('nonexistent-habit', 'New Title')).rejects.toThrow('Habit not found');
  });

  it('throws when archiving a habit that does not exist', async () => {
    await expect(archiveHabit('nonexistent-habit')).rejects.toThrow('Habit not found');
  });

  it('throws when unarchiving a habit that does not exist', async () => {
    await expect(unarchiveHabit('nonexistent-habit')).rejects.toThrow('Habit not found');
  });

  it('throws when deleting a habit that does not exist', async () => {
    await expect(deleteHabit('nonexistent-habit')).rejects.toThrow('Habit not found');
  });
});