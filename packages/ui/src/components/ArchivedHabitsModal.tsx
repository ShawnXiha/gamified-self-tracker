import React, { useState, useEffect } from 'react';
import { useArchivedHabits, unarchiveHabit, deleteHabit } from 'storage';
import { ConfirmDialog } from './ConfirmDialog';

interface ArchivedHabitsModalProps {
  onClose: () => void;
}

/**
 * Lists archived habits (history kept, hidden from the daily list). Each row
 * can be restored (no confirmation — recoverable) or permanently deleted
 * (ConfirmDialog, since it also removes the check-in history). Escape closes
 * the modal — unless the inner delete confirmation is open, which consumes the
 * Escape first.
 */
export const ArchivedHabitsModal: React.FC<ArchivedHabitsModalProps> = ({ onClose }) => {
  const archivedHabits = useArchivedHabits();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const habitToDelete = archivedHabits.find(h => h.id === confirmDeleteId) ?? null;

  useEffect(() => {
    if (habitToDelete) return; // The inner ConfirmDialog owns Escape while open.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [habitToDelete, onClose]);

  const handleRestore = async (habitId: string) => {
    try {
      await unarchiveHabit(habitId);
    } catch (error) {
      console.error('Failed to unarchive habit:', error);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;

    const habitId = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await deleteHabit(habitId);
    } catch (error) {
      console.error('Failed to delete habit:', error);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Archived Habits"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Archived Habits</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-gray-500 font-medium hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>

        {archivedHabits.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No archived habits yet</p>
        ) : (
          <ul className="space-y-2 overflow-y-auto">
            {archivedHabits.map(habit => (
              <li
                key={habit.id}
                className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg"
              >
                <span className="text-gray-800 font-medium truncate flex-1">{habit.title}</span>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestore(habit.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(habit.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {habitToDelete && (
        <ConfirmDialog
          title="Delete habit?"
          message={`Delete "${habitToDelete.title}"? This removes the habit and all of its check-in history. This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};