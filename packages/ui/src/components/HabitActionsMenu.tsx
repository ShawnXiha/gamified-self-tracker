import React, { useState, useEffect } from 'react';
import { archiveHabit, deleteHabit } from 'storage';
import { EditHabitModal } from './EditHabitModal';
import { ConfirmDialog } from './ConfirmDialog';

interface HabitActionsMenuProps {
  habitId: string;
  habitTitle?: string;
}

/**
 * ⋯ dropdown per habit row: Edit (rename), Archive (no confirmation —
 * recoverable), Delete (ConfirmDialog — permanent). Escape closes the open
 * menu; no outside-click or arrow-key navigation by design.
 */
export const HabitActionsMenu: React.FC<HabitActionsMenuProps> = ({ habitId, habitTitle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleArchive = async () => {
    setIsOpen(false);
    try {
      await archiveHabit(habitId);
    } catch (error) {
      console.error('Failed to archive habit:', error);
    }
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteHabit(habitId);
    } catch (error) {
      console.error('Failed to delete habit:', error);
    }
  };

  const title = habitTitle ?? habitId;

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Open actions for ${title}`}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      >
        ⋯
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Habit actions"
          className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[9rem]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              setShowEdit(true);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleArchive}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Archive
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              setShowDeleteConfirm(true);
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {showEdit && (
        <EditHabitModal
          habitId={habitId}
          initialTitle={habitTitle ?? ''}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete habit?"
          message={`Delete "${title}"? This removes the habit and all of its check-in history. This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};