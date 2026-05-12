import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect } from 'react';
import { db } from './db';
import type { Habit, DailyCheckIn, StreakState, UserStats } from './db';
import { getLogicalDate, isMonday, getPast7LogicalDays } from 'domain/src/date-engine';
import { calculateXP, calculateLevel } from 'domain/src/scoring-engine';

export const useLogicalDate = () => {
  const [date, setDate] = useState(getLogicalDate(Date.now()));
  
  useEffect(() => {
    const interval = setInterval(() => {
      const newDate = getLogicalDate(Date.now());
      if (newDate !== date) {
        setDate(newDate);
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [date]);
  
  return date;
};

export const useWeeklySummary = () => {
  const date = useLogicalDate();
  const todayIsMonday = isMonday(date);
  
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem(`weekly-summary-dismissed-${date}`) === 'true';
  });

  const habits = useHabits();
  
  const summary = useLiveQuery(async () => {
    if (!todayIsMonday || isDismissed || !habits || habits.length === 0) return null;

    const past7Days = getPast7LogicalDays(date);
    const activeHabits = habits.filter(h => !h.archived_at);
    
    // total possible checkins for active habits in past 7 days
    const totalHabits = activeHabits.length * 7;
    
    // get checkins for active habits in past 7 days
        const habitIds = activeHabits.map(h => h.id);
        const checkIns = await db.checkIns
          .where('habit_id').anyOf(habitIds)
          .and(c => past7Days.includes(c.logical_date))
          .toArray();
          
        const completedHabits = checkIns.length;
        const consistencyRate = totalHabits > 0 ? completedHabits / totalHabits : 0;

        const userStats = await db.userStats.get('current');
        const freezesRemaining = userStats?.freezes_available || 0;

        const allStreaks = await db.streaks.toArray();
        let longestStreak = 0;
        if (allStreaks.length > 0) {
            longestStreak = Math.max(...allStreaks.map(s => s.longest_streak));
        }

        // Count unique logical_dates across all checkins for lifetime days
        const allCheckIns = await db.checkIns.toArray();
        const uniqueDays = new Set(allCheckIns.map(c => c.logical_date));
        const totalLifetimeDays = uniqueDays.size;

        return {
          completedHabits,
          totalHabits,
          consistencyRate,
          longestStreak,
          freezesRemaining,
          totalLifetimeDays
        };
  }, [date, todayIsMonday, isDismissed, habits]);

  const dismiss = () => {
    localStorage.setItem(`weekly-summary-dismissed-${date}`, 'true');
    setIsDismissed(true);
  };

  return { 
    show: todayIsMonday && !isDismissed && summary !== null && summary !== undefined, 
    summary, 
    dismiss 
  };
};

export const useHabits = () => {
  return useLiveQuery(
    () => db.habits.filter(h => h.archived_at === null).toArray(),
    []
  ) || [];
};

export const addHabit = async (title: string) => {
  const id = crypto.randomUUID();
  await db.habits.add({
    id,
    title,
    created_at: Date.now(),
    archived_at: null
  });
  return id;
};

export const useUserStats = () => {
  return useLiveQuery(
    () => db.userStats.get('current'),
    []
  );
};

export const useCheckIn = (habitId: string) => {
  const logicalDate = useLogicalDate();
  return useLiveQuery(() => {
    return db.checkIns.where({ habit_id: habitId, logical_date: logicalDate }).first();
  }, [habitId, logicalDate]);
};

export const useStreak = (habitId: string) => {
  return useLiveQuery(
    () => db.streaks.get({ habit_id: habitId }),
    [habitId]
  );
};

export const toggleCheckIn = async (habitId: string): Promise<{ action: 'added' | 'removed', xp: number, leveled_up: boolean }> => {
  const logicalDate = getLogicalDate(new Date());
  let resultXP = 0;
  let action: 'added' | 'removed' = 'added';
  let leveledUp = false;

  await db.transaction('rw', db.checkIns, db.userStats, db.streaks, async () => {
    // 1. Get current stats
    let stats = await db.userStats.toCollection().first();
    if (!stats) {
      stats = { id: 'current', total_xp: 0, current_level: 1, freezes_available: 2 };
      await db.userStats.add(stats);
    }
    const oldLevel = stats.current_level;

    // 2. Get current streak state for this habit
    let streakState = await db.streaks.get({ habit_id: habitId });
    if (!streakState) {
      streakState = { 
        id: crypto.randomUUID(), 
        habit_id: habitId, 
        current_streak: 0, 
        longest_streak: 0, 
        last_check_in_date: null 
      };
      await db.streaks.add(streakState);
    }

    // 3. Find if already checked in for today
    const existing = await db.checkIns
      .where({ habit_id: habitId })
      .filter(ci => ci.logical_date === logicalDate)
      .first();

    if (existing) {
      // Removing the check-in
      action = 'removed';
      resultXP = existing.awarded_xp || calculateXP(existing.streak_at_time || 0);

      await db.checkIns.delete(existing.id);

      // Revert XP and level
      stats.total_xp = Math.max(0, stats.total_xp - resultXP);
      stats.current_level = calculateLevel(stats.total_xp);
      await db.userStats.put(stats);

      // Revert streak
      streakState.current_streak = Math.max(0, streakState.current_streak - 1);
      if (streakState.current_streak === 0) {
        streakState.last_check_in_date = null;
      } else {
        // Find the actual previous check-in to get the correct last date
        const previousCheckIn = await db.checkIns
          .where({ habit_id: habitId })
          .filter(ci => ci.id !== existing.id)
          .reverse()
          .sortBy('logical_date');
        
        if (previousCheckIn && previousCheckIn.length > 0) {
          streakState.last_check_in_date = previousCheckIn[0].logical_date;
        } else {
          // Fallback if somehow there's a streak > 0 but no checkins found
          const previousDate = new Date(logicalDate);
          previousDate.setDate(previousDate.getDate() - 1);
          streakState.last_check_in_date = getLogicalDate(previousDate);
        }
      }
      await db.streaks.put(streakState);
    } else {
      // Adding the check-in
      action = 'added';
      const awarded_xp = calculateXP(streakState.current_streak);
      resultXP = awarded_xp;
      const streak_at_time = streakState.current_streak;

      await db.checkIns.add({
        id: crypto.randomUUID(),
        habit_id: habitId,
        logical_date: logicalDate,
        completed_at: Date.now(),
        awarded_xp,
        streak_at_time
      });

      // Update XP and level
      stats.total_xp += awarded_xp;
      const newLevel = calculateLevel(stats.total_xp);
      if (newLevel > oldLevel) {
        leveledUp = true;
        stats.freezes_available = Math.min(5, stats.freezes_available + 1);
      }
      stats.current_level = newLevel;

      // Update streak
      streakState.current_streak += 1;
      streakState.longest_streak = Math.max(streakState.longest_streak, streakState.current_streak);
      streakState.last_check_in_date = logicalDate;

      // Award freeze on 7-day streak milestones
      if (streakState.current_streak > 0 && streakState.current_streak % 7 === 0) {
        stats.freezes_available = Math.min(5, stats.freezes_available + 1);
      }

      await db.userStats.put(stats);
      await db.streaks.put(streakState);
    }
  });

  return { action, xp: resultXP, leveled_up: leveledUp };
};
