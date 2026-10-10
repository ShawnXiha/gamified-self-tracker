import React, { useState, useEffect } from 'react';
import { renameHabit } from 'storage';

interface EditHabitModalProps {
  habitId: string;
  initialTitle: string;
  onClose: () => void;
}

/**
 * Renames a habit. Prefilled with the current title; Save is disabled for
 * empty/whitespace input (renameHabit also rejects it) and while the rename
 * is in flight, so edits made mid-await cannot be double-submitted under a
 * stale title. Escape closes without saving.
 */
export const EditHabitModal: React.FC<EditHabitModalProps> = ({ habitId, initialTitle, onClose }) => {
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    try {
      await renameHabit(habitId, title);
      onClose();
    } catch (error) {
      console.error('Failed to rename habit:', error);
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Habit"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Habit</h2>
        <input
          type="text"
          aria-label="Habit title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm mb-4"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};