import React from 'react';

interface StreakFlameProps {
  streak: number;
}

export const StreakFlame: React.FC<StreakFlameProps> = ({ streak }) => {
  if (streak === 0) return null;

  return (
    <span 
      data-testid="streak-flame"
      style={{ 
        marginLeft: '8px', 
        color: '#ff9800', 
        fontWeight: 'bold',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      <span role="img" aria-label="streak flame">🔥</span>
      <span>{streak}</span>
    </span>
  );
};
