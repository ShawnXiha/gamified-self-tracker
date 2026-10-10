import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { DailyCheckInItem } from '../DailyCheckInItem';
import { toggleCheckIn, __setMockCheckIn, __setMockStreak } from 'storage';

// Mock storage
vi.mock('storage', () => {
  let mockCheckIn: any = undefined;
  let mockStreak: any = undefined;
  
  return {
    useCheckIn: vi.fn((habitId) => mockCheckIn),
    useStreak: vi.fn((habitId) => mockStreak),
    toggleCheckIn: vi.fn(async (habitId) => {
      if (mockCheckIn) {
        mockCheckIn = undefined;
        return { action: 'removed', xp: 10 };
      } else {
        mockCheckIn = { id: '1', habit_id: habitId, logical_date: 'mock-date' };
        return { action: 'added', xp: 12 };
      }
    }),
    renameHabit: vi.fn().mockResolvedValue(undefined),
    archiveHabit: vi.fn().mockResolvedValue(undefined),
    deleteHabit: vi.fn().mockResolvedValue(undefined),
    __setMockCheckIn: (val: any) => { mockCheckIn = val; },
    __setMockStreak: (val: any) => { mockStreak = val; }
  };
});

describe('DailyCheckInItem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    __setMockCheckIn(undefined);
    __setMockStreak(undefined);
    vi.useRealTimers();
  });

  it('renders unchecked checkbox when no check-in exists', () => {
    render(<DailyCheckInItem habitId="habit-1" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('renders checked checkbox when check-in exists', () => {
    __setMockCheckIn({ id: '1', habit_id: 'habit-1', logical_date: '2026-04-18' });

    render(<DailyCheckInItem habitId="habit-1" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('calls toggleCheckIn and shows XP Toast when clicked', async () => {
    render(<DailyCheckInItem habitId="habit-1" />);
    
    const checkbox = screen.getByRole('checkbox');
    await act(async () => {
      fireEvent.click(checkbox);
    });
    
    expect(toggleCheckIn).toHaveBeenCalledWith('habit-1');
    expect(screen.getByTestId('xp-toast')).toHaveTextContent('+12 XP');

    // Wait for animation to finish
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(screen.queryByTestId('xp-toast')).not.toBeInTheDocument();
  });

  it('shows Streak Flame if streak > 0', () => {
    __setMockStreak({ current_streak: 5 });

    render(<DailyCheckInItem habitId="habit-1" habitTitle="Read" />);
    
    expect(screen.getByTestId('streak-flame')).toHaveTextContent('🔥5');
  });
});


