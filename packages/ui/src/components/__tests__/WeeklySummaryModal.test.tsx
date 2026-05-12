import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWeeklySummary } from 'storage/src/hooks';
import { WeeklySummaryModal } from '../WeeklySummaryModal';

vi.mock('storage/src/hooks', () => ({
  useWeeklySummary: vi.fn()
}));

describe('WeeklySummaryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when show is false', () => {
    vi.mocked(useWeeklySummary).mockReturnValue({
      show: false,
      summary: null,
      dismiss: vi.fn()
    });

    const { container } = render(<WeeklySummaryModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when summary is null', () => {
    vi.mocked(useWeeklySummary).mockReturnValue({
      show: true,
      summary: null,
      dismiss: vi.fn()
    });

    const { container } = render(<WeeklySummaryModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal with summary data when show is true', () => {
    vi.mocked(useWeeklySummary).mockReturnValue({
      show: true,
      summary: {
        completedHabits: 5,
        totalHabits: 7,
        consistencyRate: 5 / 7,
        longestStreak: 12,
        totalLifetimeDays: 42,
        freezesRemaining: 3
      },
      dismiss: vi.fn()
    });

    render(<WeeklySummaryModal />);

    expect(screen.getByText('Weekly Summary')).toBeInTheDocument();
    expect(screen.getByText('Past 7 Days Performance')).toBeInTheDocument();
    expect(screen.getByText('Habits Completed: 5 / 7')).toBeInTheDocument();
    expect(screen.getByText('Consistency Rate: 71%')).toBeInTheDocument();
    expect(screen.getByText('Longest Streak: 12')).toBeInTheDocument();
    expect(screen.getByText('Total Lifetime Days: 42')).toBeInTheDocument();
    expect(screen.getByText('Freezes Remaining: 3')).toBeInTheDocument();
  });

  it('calls dismiss when Close button is clicked', () => {
    const dismissMock = vi.fn();
    vi.mocked(useWeeklySummary).mockReturnValue({
      show: true,
      summary: {
        completedHabits: 5,
        totalHabits: 7,
        consistencyRate: 5 / 7,
        longestStreak: 12,
        totalLifetimeDays: 42,
        freezesRemaining: 3
      },
      dismiss: dismissMock,
    });

    render(<WeeklySummaryModal />);

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    expect(dismissMock).toHaveBeenCalledTimes(1);
  });
});
