import React from 'react';
import { calculateProgressToNextLevel } from 'domain/src';

export const LevelProgressBar = ({ total_xp }: { total_xp: number }) => {
  const progress = calculateProgressToNextLevel(total_xp);
  
  // Prevent division by zero if for some reason requiredXP is 0
  const percentage = progress.requiredXP > 0 
    ? Math.min(100, Math.max(0, (progress.progressXP / progress.requiredXP) * 100))
    : 0;

  return (
    <div 
      data-testid="progress-bar-container"
      style={{
        width: '100%',
        height: '20px',
        backgroundColor: '#e0e0e0',
        borderRadius: '10px',
        overflow: 'hidden'
      }}
    >
      <div 
        data-testid="progress-bar-fill"
        style={{
          width: `${percentage}%`,
          height: '100%',
          backgroundColor: '#4caf50',
          transition: 'width 0.3s ease-in-out'
        }}
      />
    </div>
  );
};
