import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { db } from '../db';
import { useWeeklySummary } from '../hooks';

// Helper component
const WeeklySummaryTest = () => {
  const { show, summary, dismiss } = useWeeklySummary();

  if (!show || !summary) {
    return <div data-testid="hidden">Hidden</div>;
  }

  return (
    <div>
      <div data-testid="completed-habits">{summary.completedHabits}</div>
      <div data-testid="consistency-rate">{summary.consistencyRate}</div>
      <div data-testid="lifetime-days">{summary.totalLifetimeDays}</div>
      <div data-testid="longest-streak">{summary.longestStreak}</div>
      <div data-testid="freezes-remaining">{summary.freezesRemaining}</div>
      <button onClick={dismiss}>Dismiss</button>
    </div>
  );
};

describe('useWeeklySummary', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('hides summary if not Monday', () => {
    // 2026-04-21 is a Tuesday
    vi.setSystemTime(new Date(2026, 3, 21, 10, 0, 0));
    
    render(<WeeklySummaryTest />);
    
    expect(screen.getByTestId('hidden')).toBeDefined();
  });

  it('shows summary on Monday with calculated stats', async () => {
    // Setup some habits and check-ins
    const habitId = await db.habits.add({
      id: 'h1',
      title: 'Test Habit',
      created_at: Date.now(),
      archived_at: null,
      order: 0
    });

    await db.userStats.add({
      id: 'current',
      total_xp: 100,
      current_level: 2,
      freezes_available: 3
    });

    await db.streaks.add({
      id: 's1',
      habit_id: habitId,
      current_streak: 5,
      longest_streak: 12,
      last_check_in_date: '2026-04-19'
    });

    // 2026-04-20 is a Monday
    const monday = new Date(2026, 3, 20, 10, 0, 0);
    
    // Add check-ins for the past 7 days (2026-04-13 to 2026-04-19)
    await db.checkIns.bulkAdd([
      { id: 'c1', habit_id: habitId, logical_date: '2026-04-15', created_at: Date.now(), awarded_xp: 10 },
      { id: 'c2', habit_id: habitId, logical_date: '2026-04-18', created_at: Date.now(), awarded_xp: 10 },
    ]);

    vi.setSystemTime(monday);

    render(<WeeklySummaryTest />);

    await waitFor(() => {
      expect(screen.getByTestId('completed-habits').textContent).toBe('2');
    });
    // 1 active habit * 7 days = 7 total; 2 check-ins → 2/7 consistency rate
    expect(screen.getByTestId('consistency-rate').textContent).toBe(String(2 / 7));
    // 2 unique check-in dates across all habits
    expect(screen.getByTestId('lifetime-days').textContent).toBe('2');
    expect(screen.getByTestId('longest-streak').textContent).toBe('12');
    expect(screen.getByTestId('freezes-remaining').textContent).toBe('3');
  });

  it('can be dismissed', async () => {
    // Add a habit so summary is not null
    await db.habits.add({
      id: 'h1',
      title: 'Test Habit',
      created_at: Date.now(),
      archived_at: null,
      order: 0
    });

    // 2026-04-20 is a Monday
    vi.setSystemTime(new Date(2026, 3, 20, 10, 0, 0));

    render(<WeeklySummaryTest />);

    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeDefined();
    });

    // Click dismiss
    screen.getByText('Dismiss').click();

    // Should be hidden
    await waitFor(() => {
      expect(screen.getByTestId('hidden')).toBeDefined();
    });

    // Re-rendering should still be hidden (testing persistence via localStorage or similar)
    cleanup();
    render(<WeeklySummaryTest />);

    await waitFor(() => {
      expect(screen.getByTestId('hidden')).toBeDefined();
    });
  });
});