import React from 'react';
import { useUserStats } from 'storage';
import { LevelProgressBar } from './LevelProgressBar';

export const GamificationHeader = () => {
  const stats = useUserStats();

  const currentLevel = stats?.current_level ?? 1;
  const totalXp = stats?.total_xp ?? 0;

  return (
    <div style={{ padding: '20px', borderBottom: '1px solid #ccc' }}>
      <h2>Level {currentLevel}</h2>
      <LevelProgressBar total_xp={totalXp} />
    </div>
  );
};
