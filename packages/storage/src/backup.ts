import { db } from './db';
import type { Habit, DailyCheckIn, UserStats, FreezeEvent } from './db';

/**
 * Versioned JSON snapshot of the local database, shaped for a future
 * import/migration path. `version` is a literal so consumers can exhaustively
 * switch on it when the format evolves.
 */
export interface BackupPayload {
  version: 1;
  exported_at: string;
  habits: Habit[];
  checkIns: DailyCheckIn[];
  userStats: UserStats | undefined;
  freezeEvents: FreezeEvent[];
}

/**
 * Assembles a backup payload from data the caller already holds. Pure by
 * design: no db access, inputs pass straight through, and only `exported_at`
 * is stamped (with the current time).
 */
export function buildBackupPayload(
  habits: Habit[],
  checkIns: DailyCheckIn[],
  userStats: UserStats | undefined,
  freezeEvents: FreezeEvent[],
): BackupPayload {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    habits,
    checkIns,
    userStats,
    freezeEvents,
  };
}

/**
 * Reads the full local database and returns it as a versioned backup payload.
 * Check-ins are the source of truth, so the payload carries them alongside the
 * habit rows, the derived `userStats` cache (undefined before first use), and
 * the append-only freeze ledger.
 *
 * All four table reads run in a single readonly transaction, so the payload is
 * an atomic snapshot: it can never mix rows from before and after a concurrent
 * write (e.g., a toggle or deletion landing mid-export).
 */
export async function exportBackup(): Promise<BackupPayload> {
  return db.transaction(
    'r',
    [db.habits, db.checkIns, db.userStats, db.freezeEvents],
    async () => {
      const [habits, checkIns, userStats, freezeEvents] = await Promise.all([
        db.habits.toArray(),
        db.checkIns.toArray(),
        db.userStats.get('current'),
        db.freezeEvents.toArray(),
      ]);

      return buildBackupPayload(habits, checkIns, userStats, freezeEvents);
    },
  );
}