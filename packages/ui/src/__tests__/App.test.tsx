import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../App';
import { useHabits, addHabit, runNightlyEvaluation, useWeeklySummary, useCheckIn, useStreak, toggleCheckIn, useArchivedHabits } from 'storage';

// Mock the storage hooks
vi.mock('storage', () => ({
  useHabits: vi.fn(),
  addHabit: vi.fn(),
  runNightlyEvaluation: vi.fn().mockResolvedValue(undefined),
  useWeeklySummary: vi.fn().mockReturnValue({ show: false, summary: null, dismiss: vi.fn() }),
  useCheckIn: vi.fn().mockReturnValue(null),
  useStreak: vi.fn().mockReturnValue(0),
  useArchivedHabits: vi.fn().mockReturnValue([]),
  useUserStats: vi.fn().mockReturnValue({ total_xp: 0, current_level: 1 }),
  useLogicalDate: vi.fn().mockReturnValue('2026-05-11'),
  toggleCheckIn: vi.fn(),
}));

// Mock window.matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('App & Habit CRUD UI', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(runNightlyEvaluation).mockResolvedValue(undefined);
    vi.mocked(useWeeklySummary).mockReturnValue({ show: false, summary: null, dismiss: vi.fn() });
    vi.mocked(useArchivedHabits).mockReturnValue([]);
  });

  it('runs nightly evaluation on boot', async () => {
    vi.mocked(useHabits).mockReturnValue([]);
    
    render(<App />);
    
    expect(screen.getByText('Loading tracker...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(runNightlyEvaluation).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Loading tracker...')).not.toBeInTheDocument();
    });
  });

  it('renders an empty state when no habits exist', async () => {
    vi.mocked(useHabits).mockReturnValue([]);
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('No habits yet')).toBeInTheDocument();
    });
  });

  it('renders a list of habits', async () => {
    vi.mocked(useHabits).mockReturnValue([
      { id: '1', title: 'Drink Water', created_at: Date.now(), archived_at: null },
      { id: '2', title: 'Read Book', created_at: Date.now(), archived_at: null },
    ]);
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('Drink Water')).toBeInTheDocument();
      expect(screen.getByText('Read Book')).toBeInTheDocument();
    });
  });

  it('adds a new habit', async () => {
    vi.mocked(useHabits).mockReturnValue([]);
    vi.mocked(addHabit).mockResolvedValue('test-id');

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading tracker...')).not.toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Enter new habit...');
    const button = screen.getByRole('button', { name: /add/i });

    fireEvent.change(input, { target: { value: 'Exercise' } });
    fireEvent.click(button);

    expect(addHabit).toHaveBeenCalledWith('Exercise');
    await waitFor(() => expect(input).toHaveValue('')); // should clear after add
  });
});
