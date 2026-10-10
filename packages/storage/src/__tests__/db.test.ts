import { describe, it, expect, beforeEach } from 'vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

import { db } from '../db';

describe('Database Schema', () => {
  beforeEach(async () => {
    await db.delete(); // Reset DB before each test
    await db.open();
  });

  it('should initialize with habits, checkIns, userStats, and streaks tables', () => {
    const tableNames = db.tables.map(t => t.name);
    expect(tableNames).toContain('habits');
    expect(tableNames).toContain('checkIns');
    expect(tableNames).toContain('userStats');
    expect(tableNames).toContain('streaks');
  });

  it('can perform basic CRUD on habits', async () => {
    const habitId = 'test-habit-id';
    await db.habits.add({
      id: habitId,
      title: 'Drink Water',
      created_at: 1000,
      archived_at: null
    });

    const habit = await db.habits.get(habitId);
    expect(habit).toEqual({
      id: habitId,
      title: 'Drink Water',
      created_at: 1000,
      archived_at: null
    });
  });

  it('can perform basic CRUD on checkIns', async () => {
    const checkInId = 'test-check-id';
    await db.checkIns.add({
      id: checkInId,
      habit_id: 'test-habit-id',
      logical_date: '2026-04-18',
      completed_at: 1000,
      awarded_xp: 14,
      streak_at_time: 3
    });

    const checkIn = await db.checkIns.get(checkInId);
    expect(checkIn).toEqual({
      id: checkInId,
      habit_id: 'test-habit-id',
      logical_date: '2026-04-18',
      completed_at: 1000,
      awarded_xp: 14,
      streak_at_time: 3
    });
  });

  it('enforces uniqueness on [habit_id+logical_date] for checkIns', async () => {
    await db.checkIns.add({
      id: 'id-1',
      habit_id: 'duplicate-habit',
      logical_date: '2026-04-18',
      completed_at: 1000,
      awarded_xp: 10,
      streak_at_time: 1
    });

    await expect(db.checkIns.add({
      id: 'id-2',
      habit_id: 'duplicate-habit',
      logical_date: '2026-04-18',
      completed_at: 2000,
      awarded_xp: 10,
      streak_at_time: 2
    })).rejects.toThrow(); // Dexie will throw a ConstraintError
  });

  it('can perform basic CRUD on streaks', async () => {
    const habitId = 'test-habit-id';
    await db.streaks.add({
      habit_id: habitId,
      current_streak: 5,
      best_streak: 10,
      last_check_in_date: '2026-04-17'
    });

    const streak = await db.streaks.get(habitId);
    expect(streak).toEqual({
      habit_id: habitId,
      current_streak: 5,
      best_streak: 10,
      last_check_in_date: '2026-04-17'
    });
  });

  it('can perform basic CRUD on userStats', async () => {
    const statId = 'user-stat-1';
    await db.userStats.add({
      id: statId,
      total_xp: 0,
      current_level: 1,
      freezes_available: 2
    });

    const stats = await db.userStats.get(statId);
    expect(stats).toEqual({
      id: statId,
      total_xp: 0,
      current_level: 1,
      freezes_available: 2
    });
  });

  it('can close and reopen the database without losing data', async () => {
    await db.habits.add({
      id: 'persist-1',
      title: 'Persistent Habit',
      created_at: Date.now(),
      archived_at: null
    });

    await db.userStats.add({
      id: 'current',
      total_xp: 42,
      current_level: 1,
      freezes_available: 2
    });

    // Close the connection
    db.close();

    // Reopen
    await db.open();

    // Data should still be there (fake-indexeddb retains it per-process)
    const habit = await db.habits.get('persist-1');
    expect(habit).toBeDefined();
    expect(habit?.title).toBe('Persistent Habit');

    const stats = await db.userStats.get('current');
    expect(stats?.total_xp).toBe(42);
  });
});

describe('freezeEvents Table', () => {
  beforeEach(async () => {
    await db.delete(); // Reset DB before each test
    await db.open();
  });

  it('should initialize with a freezeEvents table', () => {
    const tableNames = db.tables.map(t => t.name);
    expect(tableNames).toContain('freezeEvents');
  });

  it('can add and get a consumed freeze event', async () => {
    const eventId = 'freeze-event-1';
    await db.freezeEvents.add({
      id: eventId,
      type: 'consumed',
      logical_date: '2026-04-18',
      created_at: 1000
    });

    const event = await db.freezeEvents.get(eventId);
    expect(event).toEqual({
      id: eventId,
      type: 'consumed',
      logical_date: '2026-04-18',
      created_at: 1000
    });
  });

  it('can query consumed events via the type index', async () => {
    await db.freezeEvents.add({
      id: 'freeze-event-1',
      type: 'consumed',
      logical_date: '2026-04-18',
      created_at: 1000
    });
    await db.freezeEvents.add({
      id: 'freeze-event-2',
      type: 'consumed',
      logical_date: '2026-04-19',
      created_at: 2000
    });

    const consumedEvents = await db.freezeEvents
      .where('type')
      .equals('consumed')
      .toArray();

    expect(consumedEvents).toHaveLength(2);
    expect(consumedEvents.map(e => e.id)).toEqual(['freeze-event-1', 'freeze-event-2']);
    expect(consumedEvents[0]).toMatchObject({
      type: 'consumed',
      logical_date: '2026-04-18',
      created_at: 1000
    });
  });
});
