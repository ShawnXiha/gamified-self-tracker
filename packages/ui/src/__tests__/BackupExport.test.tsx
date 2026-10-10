import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BackupPayload } from 'storage';
import { App } from '../App';
import { downloadBackup } from '../lib/download';
import { useHabits, useArchivedHabits, runNightlyEvaluation, exportBackup } from 'storage';

// Mock the storage hooks (mirrors App.test.tsx, plus exportBackup)
vi.mock('storage', () => ({
  useHabits: vi.fn(),
  addHabit: vi.fn(),
  runNightlyEvaluation: vi.fn().mockResolvedValue(undefined),
  exportBackup: vi.fn(),
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

const samplePayload: BackupPayload = {
  version: 1,
  exported_at: '2026-05-11T08:00:00.000Z',
  habits: [{ id: '1', title: 'Drink Water', created_at: 1747478400000, archived_at: null }],
  checkIns: [],
  userStats: undefined,
  freezeEvents: [],
};

// jsdom does not implement URL.createObjectURL/revokeObjectURL, and anchor
// clicks would attempt navigation, so both get no-op stand-ins (restored
// after each test). The originals are captured once for symmetric restores.
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;
let clickSpy: ReturnType<typeof vi.spyOn>;
let createElementSpy: ReturnType<typeof vi.spyOn>;
let createdAnchors: HTMLAnchorElement[];

beforeEach(() => {
  createObjectURLMock = vi.fn(() => 'blob:mock-url');
  revokeObjectURLMock = vi.fn();
  URL.createObjectURL = createObjectURLMock as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURLMock as unknown as typeof URL.revokeObjectURL;

  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  createdAnchors = [];
  const originalCreateElement = document.createElement.bind(document);
  createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(
    (tag: string, options?: ElementCreationOptions) => {
      const el = originalCreateElement(tag, options);
      if (tag.toLowerCase() === 'a') {
        createdAnchors.push(el as HTMLAnchorElement);
      }
      return el;
    },
  );
});

afterEach(() => {
  clickSpy.mockRestore();
  createElementSpy.mockRestore();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('downloadBackup', () => {
  it('serializes the payload to a JSON blob and triggers a dated file download', async () => {
    downloadBackup(samplePayload, new Date('2026-05-11T10:00:00.000Z'));

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    const blob = createObjectURLMock.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json');
    const parsed = JSON.parse(await blob.text());
    expect(parsed.version).toBe(1);
    expect(parsed.habits).toHaveLength(1);
    expect(parsed.habits[0].title).toBe('Drink Water');

    expect(createdAnchors).toHaveLength(1);
    expect(createdAnchors[0]!.download).toBe('gamified-backup-2026-05-11.json');
    expect(createdAnchors[0]!.href).toBe('blob:mock-url');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Revoke is deferred to the next tick (Safari download race hardening).
    await waitFor(() => {
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  it('defaults the filename date to the current date (YYYY-MM-DD)', () => {
    downloadBackup(samplePayload);

    expect(createdAnchors[0]!.download).toMatch(/^gamified-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('keeps versioning and omits undefined fields for a habitless backup', async () => {
    const emptyPayload: BackupPayload = {
      version: 1,
      exported_at: '2026-05-11T08:00:00.000Z',
      habits: [],
      checkIns: [],
      userStats: undefined,
      freezeEvents: [],
    };

    downloadBackup(emptyPayload, new Date('2026-05-11T10:00:00.000Z'));

    const blob = createObjectURLMock.mock.calls[0]?.[0] as Blob;
    const parsed = JSON.parse(await blob.text());
    expect(parsed.version).toBe(1);
    expect(parsed.habits).toEqual([]);
    expect(parsed.checkIns).toEqual([]);
    expect(parsed.freezeEvents).toEqual([]);
    // JSON.stringify drops `undefined` — pin this so the future import path
    // knows userStats round-trips as absent (restored as undefined).
    expect('userStats' in parsed).toBe(false);
  });
});

describe('App footer export backup', () => {
  beforeEach(() => {
    // Clear call history from previous tests (keeps implementations).
    vi.clearAllMocks();
    vi.mocked(useHabits).mockReturnValue([
      { id: '1', title: 'Drink Water', created_at: Date.now(), archived_at: null },
    ]);
    vi.mocked(useArchivedHabits).mockReturnValue([]);
    vi.mocked(exportBackup).mockResolvedValue(samplePayload);
  });

  it('exports a backup download when the Export backup footer button is clicked', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading tracker...')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /export backup/i }));

    await waitFor(() => {
      expect(exportBackup).toHaveBeenCalledTimes(1);
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    });

    const blob = createObjectURLMock.mock.calls[0]?.[0] as Blob;
    const parsed = JSON.parse(await blob.text());
    expect(parsed.version).toBe(1);
    expect(parsed.habits).toHaveLength(1);
    expect(parsed.habits[0].title).toBe('Drink Water');

    expect(createdAnchors).toHaveLength(1);
    expect(createdAnchors[0]!.download).toMatch(/^gamified-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Revoke is deferred to the next tick (Safari download race hardening).
    await waitFor(() => {
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  it('logs and recovers when exportBackup rejects, re-enabling the button for retry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(exportBackup).mockRejectedValueOnce(new Error('boom'));

    try {
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Loading tracker...')).not.toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /export backup/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith('Failed to export backup:', expect.any(Error));
        expect(button).not.toBeDisabled();
      });
      expect(createObjectURLMock).not.toHaveBeenCalled();

      // The button was re-enabled after the failure: a second click works.
      fireEvent.click(button);
      await waitFor(() => {
        expect(exportBackup).toHaveBeenCalledTimes(2);
        expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('shows the Archived entry next to the Export backup entry in the footer', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Loading tracker...')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /archived/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export backup/i })).toBeInTheDocument();
  });
});
