import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { App } from '../../App';
import { db } from 'storage';

// Keep the real storage layer (hooks + services) but neutralise the boot-time
// side effects that are not under test here (nightly evaluation, weekly
// summary) — same style as App.test.tsx but with the actual db behind it.
vi.mock('storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('storage')>();
  return {
    ...actual,
    runNightlyEvaluation: vi.fn().mockResolvedValue(undefined),
    useWeeklySummary: vi.fn().mockReturnValue({ show: false, summary: null, dismiss: vi.fn() }),
  };
});

// Mock window.matchMedia for jsdom (same as App.test.tsx)
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

const FIXED_CREATED_AT = new Date('2026-04-01T00:00:00.000Z').getTime();

/**
 * Seeds a habit directly into the fake-indexeddb (the UI components never
 * touch the db themselves; the services/hooks do, and they are real here).
 */
async function seedHabit(id: string, title: string, archived = false): Promise<void> {
  await db.habits.add({
    id,
    title,
    created_at: FIXED_CREATED_AT,
    archived_at: archived ? FIXED_CREATED_AT : null,
  });
}

async function openMenuFor(title: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: `Open actions for ${title}` }));
}

describe('Habit management UI (edit / archive / delete / archived list)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    cleanup();
  });

  it('renames a habit through the actions menu and updates the list title', async () => {
    await seedHabit('h1', 'Drink Water');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Drink Water')).toBeInTheDocument());

    await openMenuFor('Drink Water');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    const input = screen.getByLabelText('Habit title');
    expect(input).toHaveValue('Drink Water');

    fireEvent.change(input, { target: { value: 'Drink More Water' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Drink More Water')).toBeInTheDocument();
      expect(screen.queryByText('Drink Water')).not.toBeInTheDocument();
    });
  });

  it('archives a habit: hidden from the daily list, visible in the archived modal, restorable', async () => {
    await seedHabit('h1', 'Drink Water');
    await seedHabit('h2', 'Read Book');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Read Book')).toBeInTheDocument());

    await openMenuFor('Drink Water');
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    });

    // Archived habits no longer come from useHabits.
    await waitFor(() => {
      expect(screen.queryByText('Drink Water')).not.toBeInTheDocument();
      expect(screen.getByText('Read Book')).toBeInTheDocument();
    });

    // Footer entry reflects the archived count.
    expect(screen.getByRole('button', { name: /^Archived \(1\)$/ })).toBeInTheDocument();

    // The archived modal lists the habit (its live query resolves async).
    fireEvent.click(screen.getByRole('button', { name: /^Archived \(1\)$/ }));
    const modal = await waitFor(() => screen.getByRole('dialog', { name: 'Archived Habits' }));
    await waitFor(() => expect(within(modal).getByText('Drink Water')).toBeInTheDocument());

    // Restore brings it back to the daily list.
    await act(async () => {
      fireEvent.click(within(modal).getByRole('button', { name: 'Restore' }));
    });
    await waitFor(() => expect(within(modal).getByText('No archived habits yet')).toBeInTheDocument());

    fireEvent.click(within(modal).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(screen.getByText('Drink Water')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Archived \(0\)$/ })).toBeInTheDocument();
  });

  it('shows an empty archived list when nothing is archived', async () => {
    await seedHabit('h1', 'Drink Water');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Drink Water')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /^Archived \(0\)$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Archived \(0\)$/ }));
    const modal = await waitFor(() => screen.getByRole('dialog', { name: 'Archived Habits' }));
    expect(within(modal).getByText('No archived habits yet')).toBeInTheDocument();
  });

  it('keeps the habit when the delete confirmation is cancelled', async () => {
    await seedHabit('h1', 'Drink Water');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Drink Water')).toBeInTheDocument());

    await openMenuFor('Drink Water');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    const dialog = await waitFor(() => screen.getByRole('alertdialog', { name: 'Delete habit?' }));
    expect(within(dialog).getByText(/Drink Water/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Drink Water')).toBeInTheDocument();
  });

  it('deletes the habit when the delete confirmation is confirmed', async () => {
    await seedHabit('h1', 'Drink Water');
    await seedHabit('h2', 'Read Book');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Read Book')).toBeInTheDocument());

    await openMenuFor('Drink Water');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    const dialog = await waitFor(() => screen.getByRole('alertdialog', { name: 'Delete habit?' }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    });

    await waitFor(() => {
      expect(screen.queryByText('Drink Water')).not.toBeInTheDocument();
      expect(screen.getByText('Read Book')).toBeInTheDocument();
    });
  });

  it('deletes an archived habit from the archived modal after confirmation', async () => {
    await seedHabit('h1', 'Drink Water', true);
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Archived \(1\)$/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Archived \(1\)$/ }));
    const modal = await waitFor(() => screen.getByRole('dialog', { name: 'Archived Habits' }));
    await waitFor(() => expect(within(modal).getByText('Drink Water')).toBeInTheDocument());

    // Cancel keeps the archived habit.
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }));
    const cancelDialog = await waitFor(() => screen.getByRole('alertdialog', { name: 'Delete habit?' }));
    fireEvent.click(within(cancelDialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(within(modal).getByText('Drink Water')).toBeInTheDocument();

    // Confirm removes it for good.
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }));
    const confirmDialog = await waitFor(() => screen.getByRole('alertdialog', { name: 'Delete habit?' }));
    await act(async () => {
      fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }));
    });

    await waitFor(() => expect(within(modal).getByText('No archived habits yet')).toBeInTheDocument());

    fireEvent.click(within(modal).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Archived \(0\)$/ })).toBeInTheDocument();
  });

  it('closes the actions menu with Escape without taking an action', async () => {
    await seedHabit('h1', 'Drink Water');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Drink Water')).toBeInTheDocument());

    await openMenuFor('Drink Water');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(screen.getByText('Drink Water')).toBeInTheDocument();
  });

  it('closes the edit modal with Escape without renaming', async () => {
    await seedHabit('h1', 'Drink Water');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Drink Water')).toBeInTheDocument());

    await openMenuFor('Drink Water');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    const input = screen.getByLabelText('Habit title');
    fireEvent.change(input, { target: { value: 'Should Not Save' } });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Drink Water')).toBeInTheDocument();
    expect(screen.queryByText('Should Not Save')).not.toBeInTheDocument();
  });

  it('Escape on the delete confirmation cancels and keeps the habit', async () => {
    await seedHabit('h1', 'Drink Water');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Drink Water')).toBeInTheDocument());

    await openMenuFor('Drink Water');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('alertdialog', { name: 'Delete habit?' })).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Drink Water')).toBeInTheDocument();
  });

  it('Escape closes the archived modal, but closes the inner delete confirmation first', async () => {
    await seedHabit('h1', 'Drink Water', true);
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Archived \(1\)$/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Archived \(1\)$/ }));
    const modal = await waitFor(() => screen.getByRole('dialog', { name: 'Archived Habits' }));
    await waitFor(() => expect(within(modal).getByText('Drink Water')).toBeInTheDocument());

    // First Escape closes the inner confirmation, keeping the modal open.
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('alertdialog', { name: 'Delete habit?' })).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Archived Habits' })).toBeInTheDocument();

    // Second Escape closes the archived modal itself; the habit stays archived.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Archived \(1\)$/ })).toBeInTheDocument();
  });

  it('disables Save while renameHabit is in flight and ignores edits during the await', async () => {
    const storageNs = await import('storage');
    const renameSpy = vi.spyOn(storageNs, 'renameHabit').mockImplementation(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 60));
      },
    );

    try {
      await seedHabit('h1', 'Drink Water');
      render(<App />);
      await waitFor(() => expect(screen.getByText('Drink Water')).toBeInTheDocument());

      await openMenuFor('Drink Water');
      fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

      const input = screen.getByLabelText('Habit title');
      fireEvent.change(input, { target: { value: 'New Title' } });

      // Keep the element reference: its label changes to "Saving…" mid-await.
      const saveButton = screen.getByRole('button', { name: 'Save' });
      await act(async () => {
        fireEvent.click(saveButton);
      });

      await waitFor(() => expect(saveButton).toBeDisabled());
      expect(renameSpy).toHaveBeenCalledTimes(1);

      // Editing the input mid-await must not lead to a second rename call.
      fireEvent.change(input, { target: { value: 'Edited Mid-Await' } });
      expect(renameSpy).toHaveBeenCalledTimes(1);

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(renameSpy).toHaveBeenCalledWith('h1', 'New Title');
    } finally {
      renameSpy.mockRestore();
    }
  });
});