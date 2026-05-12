import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GamificationHeader } from '../GamificationHeader';
import { LevelProgressBar } from '../LevelProgressBar';

// Mock storage
vi.mock('storage', () => ({
  useUserStats: vi.fn(),
}));

import { useUserStats } from 'storage';

describe('LevelProgressBar', () => {
  it('renders a progress bar based on total_xp and domain logic', () => {
    // For 0 XP: level 1, required XP 27 (0 to 27). Progress is 0.
    const { rerender } = render(<LevelProgressBar total_xp={0} />);
    
    let bar = screen.getByTestId('progress-bar-fill');
    expect(bar.style.width).toBe('0%');

    // For 13.5 XP (halfway to 27):
    rerender(<LevelProgressBar total_xp={13.5} />);
    bar = screen.getByTestId('progress-bar-fill');
    expect(bar.style.width).toBe('50%');
  });
});

describe('GamificationHeader', () => {
  it('displays Level X and total_xp properly based on useUserStats', () => {
    // Mock user stats
    vi.mocked(useUserStats).mockReturnValue({
      id: 'current',
      total_xp: 50, // Should be level 2 based on scoring-engine formula
      current_level: 2,
      freezes_available: 2
    });

    render(<GamificationHeader />);

    // Should display "Level 2"
    expect(screen.getByText(/Level 2/i)).toBeInTheDocument();
    
    // Should render the progress bar
    expect(screen.getByTestId('progress-bar-container')).toBeInTheDocument();
  });
});
