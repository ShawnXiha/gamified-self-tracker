import React from 'react';
import { useWeeklySummary } from 'storage';

export const WeeklySummaryModal: React.FC = () => {
  const { show, summary, dismiss } = useWeeklySummary();

  if (!show || !summary) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h2>Weekly Summary</h2>
        <p>Past 7 Days Performance</p>
        <p>Habits Completed: {summary.completedHabits} / {summary.totalHabits}</p>
        <p>Consistency Rate: {(summary.consistencyRate * 100).toFixed(0)}%</p>
        <p>Longest Streak: {summary.longestStreak}</p>
        <p>Total Lifetime Days: {summary.totalLifetimeDays}</p>
        <p>Freezes Remaining: {summary.freezesRemaining}</p>
        <button onClick={dismiss}>Close</button>
      </div>
    </div>
  );
};
