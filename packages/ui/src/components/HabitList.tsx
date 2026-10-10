import React from 'react';
import type { Habit } from 'storage';
import { DailyCheckInItem } from './DailyCheckInItem';

export const HabitList: React.FC<{ habits: Habit[] }> = ({ habits }) => {
  if (habits.length === 0) {
    return (
      <div className="text-center py-12 px-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No habits yet</h3>
        <p className="text-gray-500 text-sm">Create your first habit above to start tracking and earning XP!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {habits.map(habit => (
        <DailyCheckInItem key={habit.id} habitId={habit.id} habitTitle={habit.title} />
      ))}
    </div>
  );
};
