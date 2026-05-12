import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';
import { db } from '../db';
import { useHabits, addHabit, useCheckIn, toggleCheckIn } from '../hooks';

// Helper component to test habits hook
const TestComponent = () => {
  const habits = useHabits();
  
  return (
    <div>
      <ul data-testid="habit-list">
        {habits?.map(habit => (
          <li key={habit.id}>{habit.title}</li>
        ))}
      </ul>
      <button onClick={() => addHabit('New Test Habit')}>Add</button>
    </div>
  );
};

// Helper component to test checkin hooks
const CheckInTestComponent = ({ habitId }: { habitId: string }) => {
  const checkIn = useCheckIn(habitId);

  return (
    <div>
      <div data-testid="checkin-status">{checkIn ? 'Checked In' : 'Not Checked In'}</div>
      <button onClick={() => toggleCheckIn(habitId)}>Toggle</button>
    </div>
  );
};

describe('Storage Hooks', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('can read empty habits list and add a new habit', async () => {
    render(<TestComponent />);
    
    // Initially empty
    const list = screen.getByTestId('habit-list');
    expect(list.children.length).toBe(0);

    // Add a habit via the hook function
    await act(async () => {
      screen.getByText('Add').click();
    });

    // Should now contain the new habit — waitFor polls until Dexie live query updates
    await waitFor(() => {
      expect(list.children.length).toBe(1);
    });
    expect(list.children[0].textContent).toBe('New Test Habit');
  });

  it('can toggle a daily check-in', async () => {
    const habitId = 'test-habit-1';
    
    render(<CheckInTestComponent habitId={habitId} />);
    
    const status = screen.getByTestId('checkin-status');
    expect(status.textContent).toBe('Not Checked In');

    // Toggle on
    await act(async () => {
      screen.getByText('Toggle').click();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(status.textContent).toBe('Checked In');

    // Verify it was stored correctly
    const stored = await db.checkIns.where({ habit_id: habitId }).first();
    expect(stored).toBeDefined();
    expect(stored?.awarded_xp).toBe(10); // Default base XP

    // Toggle off
    await act(async () => {
      screen.getByText('Toggle').click();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(status.textContent).toBe('Not Checked In');
    const storedAfterToggleOff = await db.checkIns.where({ habit_id: habitId }).first();
    expect(storedAfterToggleOff).toBeUndefined();
  });

  it('stores check-in under previous logical date when clicked at 03:00 AM local time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const habitId = 'test-habit-3am';
    
    // Set time to 3:00 AM on April 18, 2026 -> Logical Date 2026-04-17
    // Use local time instead of UTC to avoid timezone issues
    vi.setSystemTime(new Date(2026, 3, 18, 3, 0, 0));
    
    render(<CheckInTestComponent habitId={habitId} />);
    
    // Toggle on
    await act(async () => {
      screen.getByText('Toggle').click();
      // wait for dexie transaction via fake timers workaround if needed, 
      // but since we are using fake timers, setTimeout needs advanceTimersByTime or we temporarily switch to real
    });
    
    vi.useRealTimers(); // release timers so db transaction resolves naturally
    await new Promise(resolve => setTimeout(resolve, 50));

    const checkIns = await db.checkIns.where({ habit_id: habitId }).toArray();
    expect(checkIns.length).toBe(1);
    expect(checkIns[0].logical_date).toBe('2026-04-17');
  });
});
