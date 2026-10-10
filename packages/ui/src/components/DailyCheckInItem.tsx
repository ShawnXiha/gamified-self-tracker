import React, { useState } from 'react';
import { useCheckIn, toggleCheckIn, useStreak } from 'storage';
import { XPToast } from './XPToast';
import { StreakFlame } from './StreakFlame';
import { HabitActionsMenu } from './HabitActionsMenu';
import { trackEvent, getTimeOfDay } from 'analytics';

interface DailyCheckInItemProps {
  habitId: string;
  habitTitle?: string;
}

export const DailyCheckInItem: React.FC<DailyCheckInItemProps> = ({ habitId, habitTitle }) => {
  const checkIn = useCheckIn(habitId);
  const streak = useStreak(habitId);
  const [toast, setToast] = useState<{ id: number, xp: number, isAddition: boolean, leveledUp?: boolean } | null>(null);
  const [toastIdCounter, setToastIdCounter] = useState(0);

  const handleChange = async () => {
    const result = await toggleCheckIn(habitId);
    
    if (result.action === 'added') {
      trackEvent({
        name: 'check_in_completed',
        properties: {
          current_streak: streak ? streak.current_streak + 1 : 1,
          time_of_day: getTimeOfDay()
        }
      });
    }

    // Trigger toast
    setToast({
      id: toastIdCounter,
      xp: result.xp,
      isAddition: result.action === 'added',
      leveledUp: result.leveled_up
    });
    setToastIdCounter(prev => prev + 1);
  };

  const handleAnimationEnd = () => {
    setToast(null);
  };

  return (
    <div className="relative flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center flex-1 min-w-0 gap-3">
        <label className="relative flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={!!checkIn}
            onChange={handleChange}
            className="w-7 h-7 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer transition-colors"
            aria-label="Daily Check-In"
          />
        </label>
        {habitTitle && <span className="text-lg font-medium text-gray-800 truncate">{habitTitle}</span>}
      </div>
      
      <div className="flex-shrink-0 flex items-center justify-end gap-2 min-w-[3rem]">
        <HabitActionsMenu habitId={habitId} habitTitle={habitTitle} />
        {streak && streak.current_streak > 0 && <StreakFlame streak={streak.current_streak} />}
      </div>
      
      {toast && (
        <XPToast
          key={toast.id}
          xpAmount={toast.xp}
          isAddition={toast.isAddition}
          leveledUp={toast.leveledUp}
          onAnimationEnd={handleAnimationEnd}
        />
      )}
    </div>
  );
};
