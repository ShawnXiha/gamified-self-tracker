import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect } from 'react';
import { db } from './db';
import type { Habit, DailyCheckIn, StreakState, UserStats } from './db';
import { getLogicalDate, isMonday, getPast7LogicalDays } from 'domain/src/date-engine';

export { toggleCheckIn } from './check-in-service';

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
