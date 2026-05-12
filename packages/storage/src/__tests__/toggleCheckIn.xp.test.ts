import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import { toggleCheckIn } from '../hooks';
import { calculateXP } from 'domain/src/scoring-engine';

describe('toggleCheckIn (XP and Streak Integration)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    
    // Seed initial user stats
    await db.userStats.add({
      id: 'current',
      total_xp: 100,
      current_level: 2,
      freezes_available: 0
    });
    
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('awards XP based on current streak and increments total_xp', async () => {
    const habitId = 'habit-test-xp';
    
    // Seed a streak of 3 for this habit
    await db.streaks.add({
      habit_id: habitId,
      current_streak: 3,
      longest_streak: 3,
      last_check_in_date: '2026-04-16' // yesterday
    });
    
    // Today is 2026-04-17
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    
    // Toggle Check-In (ON)
    await toggleCheckIn(habitId);
    
    const checkIn = await db.checkIns.where({ habit_id: habitId }).first();
    const userStats = await db.userStats.get('current');
    const streak = await db.streaks.get(habitId);
    
    // Streak was 3, so awarded XP should be calculateXP(3) = 16
    expect(checkIn).toBeDefined();
    expect(checkIn?.streak_at_time).toBe(3);
    expect(checkIn?.awarded_xp).toBe(16);
    
    expect(userStats?.total_xp).toBe(116);
    expect(streak?.current_streak).toBe(4);
    expect(streak?.last_check_in_date).toBe('2026-04-17');
  });

  it('reverts XP and streak when unchecked on the same day', async () => {
    const habitId = 'habit-test-revert';
    
    await db.checkIns.add({
      id: 'past-checkin',
      habit_id: habitId,
      logical_date: '2026-04-16',
      completed_at: Date.now() - 86400000,
      awarded_xp: 10,
      streak_at_time: 4
    });

    await db.streaks.add({
      habit_id: habitId,
      current_streak: 5,
      longest_streak: 5,
      last_check_in_date: '2026-04-16'
    });
    
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    
    // Toggle ON
    await toggleCheckIn(habitId);
    const midStats = await db.userStats.get('current');
    expect(midStats?.total_xp).toBe(120); // 100 + calculateXP(5) -> 100 + 20
    
    // Toggle OFF
    await toggleCheckIn(habitId);
    
    const checkIn = await db.checkIns.where({ habit_id: habitId, logical_date: '2026-04-17' }).first();
    const finalStats = await db.userStats.get('current');
    const finalStreak = await db.streaks.get(habitId);
    
    expect(checkIn).toBeUndefined();
    expect(finalStats?.total_xp).toBe(100);
    expect(finalStreak?.current_streak).toBe(5);
    expect(finalStreak?.longest_streak).toBe(6); // longest streak retains the high water mark during simple reverts
    expect(finalStreak?.last_check_in_date).toBe('2026-04-16');
  });

  it('correctly reverts last_check_in_date to the true previous check-in date when a gap existed', async () => {
    const habitId = 'habit-test-gap-revert';
    
    // Previous check in was 2 days ago!
    await db.checkIns.add({
      id: 'past-checkin',
      habit_id: habitId,
      logical_date: '2026-04-15',
      completed_at: Date.now() - 86400000 * 2,
      awarded_xp: 10,
      streak_at_time: 4
    });

    await db.streaks.add({
      habit_id: habitId,
      current_streak: 5,
      longest_streak: 5,
      last_check_in_date: '2026-04-15'
    });
    
    // Today is the 17th. Missing the 16th.
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    
    // Toggle ON
    await toggleCheckIn(habitId);
    let currentStreak = await db.streaks.get(habitId);
    expect(currentStreak?.last_check_in_date).toBe('2026-04-17');
    expect(currentStreak?.current_streak).toBe(6);
    
    // Toggle OFF
    await toggleCheckIn(habitId);
    
    currentStreak = await db.streaks.get(habitId);
    expect(currentStreak?.current_streak).toBe(5);
    // BUG IS LIKELY HERE: This will be 2026-04-16 because of the simple -1 day math.
    // We expect it to properly revert to the actual previous check in date.
    expect(currentStreak?.last_check_in_date).toBe('2026-04-15');
  });
});
