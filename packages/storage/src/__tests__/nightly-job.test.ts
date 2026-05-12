import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import { runNightlyEvaluation } from '../nightly-job';
import { getLogicalDate } from 'domain/src/date-engine';
import 'fake-indexeddb/auto';

describe('nightly-job', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes last_evaluated_date if it does not exist', async () => {
    // Current time
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
    const logicalDate = getLogicalDate(new Date());

    // Setup basic user stats
    await db.userStats.add({
      id: 'current',
      total_xp: 0,
      current_level: 1,
      freezes_available: 0
    });

    await runNightlyEvaluation();

    const stats = await db.userStats.get('current');
    expect(stats?.last_evaluated_date).toBe(logicalDate);
  });

  it('does nothing if last_evaluated_date is today', async () => {
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
    
    await db.userStats.add({
      id: 'current',
      total_xp: 0,
      current_level: 1,
      freezes_available: 2,
      last_evaluated_date: '2026-04-18'
    });

    await db.habits.add({ id: 'h1', title: 'H1', created_at: 0, archived_at: null });
    // Suppose we have an active streak
    await db.streaks.add({
      id: 's1', // assuming hook uses id
      habit_id: 'h1',
      current_streak: 5,
      longest_streak: 5,
      last_check_in_date: '2026-04-17'
    } as any);

    await runNightlyEvaluation();

    const stats = await db.userStats.get('current');
    expect(stats?.freezes_available).toBe(2); // no freezes consumed
    
    const streak = await db.streaks.get({ habit_id: 'h1' });
    expect(streak?.current_streak).toBe(5); // streak intact
  });

  it('deducts freezes and keeps streak if 1 day was missed and freeze is available', async () => {
    // Today is 2026-04-18
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
    
    // Last evaluated was 2026-04-16 (meaning 2026-04-17 was completely missed)
    await db.userStats.add({
      id: 'current',
      total_xp: 0,
      current_level: 1,
      freezes_available: 1,
      last_evaluated_date: '2026-04-16'
    });

    await db.habits.add({ id: 'h1', title: 'H1', created_at: 0, archived_at: null });
    
    await db.streaks.add({
      id: 's1',
      habit_id: 'h1',
      current_streak: 5,
      longest_streak: 5,
      last_check_in_date: '2026-04-16'
    } as any);

    await runNightlyEvaluation();

    const stats = await db.userStats.get('current');
    expect(stats?.freezes_available).toBe(0); // 1 freeze consumed for the 17th
    expect(stats?.last_evaluated_date).toBe('2026-04-18');
    
    const streak = await db.streaks.get({ habit_id: 'h1' });
    expect(streak?.current_streak).toBe(5); // streak intact
  });

  it('breaks streak if 1 day was missed and no freeze is available', async () => {
    // Today is 2026-04-18
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
    
    // Last evaluated was 2026-04-16 (meaning 2026-04-17 was completely missed)
    await db.userStats.add({
      id: 'current',
      total_xp: 0,
      current_level: 1,
      freezes_available: 0, // No freezes!
      last_evaluated_date: '2026-04-16'
    });

    await db.habits.add({ id: 'h1', title: 'H1', created_at: 0, archived_at: null });
    
    await db.streaks.add({
      id: 's1',
      habit_id: 'h1',
      current_streak: 5,
      longest_streak: 5,
      last_check_in_date: '2026-04-16'
    } as any);

    await runNightlyEvaluation();

    const stats = await db.userStats.get('current');
    expect(stats?.freezes_available).toBe(0);
    expect(stats?.last_evaluated_date).toBe('2026-04-18');
    
    const streak = await db.streaks.get({ habit_id: 'h1' });
    expect(streak?.current_streak).toBe(0); // streak broken!
  });

  it('does not deduct freeze if one habit checked in, but breaks streak of the missed habit', async () => {
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
    
    await db.userStats.add({
      id: 'current',
      total_xp: 0,
      current_level: 1,
      freezes_available: 2,
      last_evaluated_date: '2026-04-16'
    });

    await db.habits.add({ id: 'h1', title: 'H1', created_at: 0, archived_at: null });
    await db.habits.add({ id: 'h2', title: 'H2', created_at: 0, archived_at: null });
    
    await db.streaks.add({
      id: 's1', habit_id: 'h1', current_streak: 5, longest_streak: 5, last_check_in_date: '2026-04-16'
    } as any);

    await db.streaks.add({
      id: 's2', habit_id: 'h2', current_streak: 3, longest_streak: 3, last_check_in_date: '2026-04-16'
    } as any);

    // h1 is checked in on 2026-04-17!
    await db.checkIns.add({
      id: 'ci1',
      habit_id: 'h1',
      logical_date: '2026-04-17',
      completed_at: Date.now(),
      awarded_xp: 10,
      streak_at_time: 5
    });

    await runNightlyEvaluation();

    const stats = await db.userStats.get('current');
    expect(stats?.freezes_available).toBe(2); // NO freeze consumed!
    
    const streak1 = await db.streaks.get({ habit_id: 'h1' });
    expect(streak1?.current_streak).toBe(5); // h1 keeps its streak
    
    const streak2 = await db.streaks.get({ habit_id: 'h2' });
    expect(streak2?.current_streak).toBe(0); // h2 breaks its streak!
  });

  it('does not deduct freeze if there are no scheduled habits (0 habits)', async () => {
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
    
    // Last evaluated was 2026-04-16
    await db.userStats.add({
      id: 'current',
      total_xp: 0,
      current_level: 1,
      freezes_available: 2,
      last_evaluated_date: '2026-04-16'
    });

    // NO HABITS ADDED!

    await runNightlyEvaluation();

    const stats = await db.userStats.get('current');
    expect(stats?.freezes_available).toBe(2); // no freezes consumed because there were no habits
    expect(stats?.last_evaluated_date).toBe('2026-04-18');
  });
});
