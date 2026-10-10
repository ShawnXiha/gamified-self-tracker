import React, { useEffect, useState } from 'react';
import { useHabits, useArchivedHabits, runNightlyEvaluation } from 'storage';
import { HabitList } from './components/HabitList';
import { CreateHabitForm } from './components/CreateHabitForm';
import { WeeklySummaryModal } from './components/WeeklySummaryModal';
import { GamificationHeader } from './components/GamificationHeader';
import { ArchivedHabitsModal } from './components/ArchivedHabitsModal';
import { trackEvent, isPwaInstalled, getDeviceType } from './lib/analytics';

export const App: React.FC = () => {
  const habits = useHabits();
  const archivedHabits = useArchivedHabits();
  const [showArchived, setShowArchived] = useState(false);
  const [isBooted, setIsBooted] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const bootApp = async () => {
      try {
        await runNightlyEvaluation();
        trackEvent({
          name: 'app_opened',
          properties: {
            is_pwa_installed: isPwaInstalled(),
            device_type: getDeviceType()
          }
        });
      } catch (error) {
        console.error('Failed to run nightly evaluation:', error);
      } finally {
        if (mounted) {
          setIsBooted(true);
        }
      }
    };

    bootApp();

    return () => {
      mounted = false;
    };
  }, []);

  if (!isBooted) {
    return <div className="flex h-screen items-center justify-center text-gray-500 font-medium">Loading tracker...</div>;
  }

  return (
    <div className="max-w-md mx-auto p-4 font-sans bg-white min-h-screen shadow-sm">
      <WeeklySummaryModal />
      <GamificationHeader />
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Daily Habits</h1>
      <CreateHabitForm />
      <div className="mt-8">
        <HabitList habits={habits} />
      </div>
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
        >
          Archived ({archivedHabits.length})
        </button>
      </div>
      {showArchived && <ArchivedHabitsModal onClose={() => setShowArchived(false)} />}
    </div>
  );
};


