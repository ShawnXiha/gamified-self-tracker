import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import { buildBackupPayload, exportBackup } from '../backup';
import type { Habit, DailyCheckIn, UserStats, FreezeEvent } from '../db';

const sampleHabit: Habit = {
  id: 'h1',
  title: 'Drink Water',
  created_at: new Date('2026-04-01T00:00:00.000Z').getTime(),
  archived_at: null
};

const sampleCheckIn: DailyCheckIn = {
  id: 'c1',
  habit_id: 'h1',
  logical_date: '2026-04-15',
  completed_at: new Date('2026-04-15T12:00:00.000Z').getTime(),
  awarded_xp: 10,
  streak_at_time: 1
};

const sampleStats: UserStats = {
  id: 'current',
  total_xp: 10,
  current_level: 1,
  freezes_available: 2,
  last_evaluated_date: '2026-04-16'
};

const sampleFreezeEvent: FreezeEvent = {
  id: 'f1',
  type: 'consumed',
  logical_date: '2026-04-16',
  created_at: new Date('2026-04-17T05:00:00.000Z').getTime()
};

describe('buildBackupPayload (pure function)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('snapshots the v1 payload shape with an ISO exported_at and all four data categories', () => {
    const payload = buildBackupPayload(
      [sampleHabit],
      [sampleCheckIn],
      sampleStats,
      [sampleFreezeEvent],
    );

    expect(payload).toEqual({
      version: 1,
      exported_at: '2026-04-17T10:00:00.000Z',
      habits: [sampleHabit],
      checkIns: [sampleCheckIn],
      userStats: sampleStats,
      freezeEvents: [sampleFreezeEvent]
    });
  });

  it('allows an absent userStats row', () => {
    const payload = buildBackupPayload([], [], undefined, []);
    expect(payload.version).toBe(1);
    expect(payload.userStats).toBeUndefined();
    expect(payload.exported_at).toBe('2026-04-17T10:00:00.000Z');
  });
});

describe('exportBackup (reads the live db)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assembles a complete payload from the database', async () => {
    await db.habits.add({ ...sampleHabit, id: 'h1' });
    await db.checkIns.add({ ...sampleCheckIn, id: 'c1' });
    await db.checkIns.add({
      id: 'c2',
      habit_id: 'h1',
      logical_date: '2026-04-16',
      completed_at: new Date('2026-04-16T12:00:00.000Z').getTime(),
      awarded_xp: 16,
      streak_at_time: 2
    });
    await db.freezeEvents.add(sampleFreezeEvent);
    await db.userStats.put(sampleStats);

    const payload = await exportBackup();

    expect(payload.version).toBe(1);
    expect(payload.exported_at).toBe('2026-04-17T10:00:00.000Z');
    expect(payload.habits).toEqual([{ ...sampleHabit, id: 'h1' }]);
    expect(payload.checkIns).toHaveLength(2);
    expect(payload.checkIns.map(c => c.awarded_xp)).toEqual([10, 16]);
    expect(payload.userStats).toEqual(sampleStats);
    expect(payload.freezeEvents).toEqual([sampleFreezeEvent]);
  });

  it('yields undefined userStats when no stats row exists yet', async () => {
    await db.habits.add({ ...sampleHabit, id: 'h1' });

    const payload = await exportBackup();

    expect(payload.userStats).toBeUndefined();
    expect(payload.habits).toHaveLength(1);
    expect(payload.checkIns).toEqual([]);
    expect(payload.freezeEvents).toEqual([]);
  });
});