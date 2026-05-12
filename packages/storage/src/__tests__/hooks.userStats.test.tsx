import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { db } from '../db';
import { useUserStats } from '../hooks';

// Helper component to test hooks
const TestComponent = () => {
  const stats = useUserStats();
  
  if (!stats) return <div data-testid="stats">loading</div>;

  return (
    <div data-testid="stats">
      <span data-testid="xp">{stats.total_xp}</span>
      <span data-testid="level">{stats.current_level}</span>
      <span data-testid="freezes">{stats.freezes_available}</span>
    </div>
  );
};

describe('useUserStats Hook', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    // Seed singleton
    await db.userStats.add({
      id: 'current',
      total_xp: 15,
      current_level: 1,
      freezes_available: 3
    });
  });

  it('can read user stats', async () => {
    render(<TestComponent />);
    
    // Check values from the seed
    const xp = await screen.findByTestId('xp');
    expect(xp.textContent).toBe('15');
    
    const level = screen.getByTestId('level');
    expect(level.textContent).toBe('1');
    
    const freezes = screen.getByTestId('freezes');
    expect(freezes.textContent).toBe('3');
  });
});
