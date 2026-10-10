import Dexie from 'dexie';
import type { Table } from 'dexie';

export interface Habit {
  id: string;
  title: string;
  created_at: number;
  archived_at: number | null;
}

export interface DailyCheckIn {
  id: string;
  habit_id: string;
  logical_date: string;
  completed_at: number;
  awarded_xp: number;
  streak_at_time: number;
}

export interface StreakState {
  habit_id: string;
  current_streak: number;
  longest_streak: number;
  last_check_in_date: string | null;
}

export interface UserStats {
  id: string;
  total_xp: number;
  current_level: number;
  freezes_available: number;
  last_evaluated_date?: string;
}

export interface FreezeEvent {
  id: string;
  type: 'consumed';
  logical_date: string;
  created_at: number;
}

export class GamifiedTrackerDB extends Dexie {
  habits!: Table<Habit, string>;
  checkIns!: Table<DailyCheckIn, string>;
  streaks!: Table<StreakState, string>;
  userStats!: Table<UserStats, string>;
  freezeEvents!: Table<FreezeEvent, string>;

  constructor() {
    super('GamifiedTrackerDB');
    
    this.version(2).stores({
      habits: 'id, title, created_at, archived_at',
      checkIns: 'id, &[habit_id+logical_date], habit_id, logical_date, completed_at',
      streaks: 'habit_id, current_streak, longest_streak, last_check_in_date',
      userStats: 'id, total_xp, current_level, freezes_available'
    }).upgrade(tx => {
      // Handle schema upgrade smoothly for the streaks table
    });

    // v3: adds the append-only freezeEvents ledger. All tables must be
    // restated here — Dexie deletes any table omitted from a version's
    // stores declaration during upgrade.
    this.version(3).stores({
      habits: 'id, title, created_at, archived_at',
      checkIns: 'id, &[habit_id+logical_date], habit_id, logical_date, completed_at',
      streaks: 'habit_id, current_streak, longest_streak, last_check_in_date',
      userStats: 'id, total_xp, current_level, freezes_available',
      freezeEvents: 'id, type, logical_date'
    });
  }
}

export const db = new GamifiedTrackerDB();
