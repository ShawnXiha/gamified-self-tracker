import React, { useState } from 'react';
import { addHabit } from 'storage';
import { trackEvent } from 'analytics';

export const CreateHabitForm: React.FC = () => {
  const [title, setTitle] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      await addHabit(title);
      trackEvent({ name: 'habit_created', properties: {} });
      setTitle('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        type="text"
        placeholder="Enter new habit..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button 
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-sm"
        type="submit"
      >
        Add
      </button>
    </form>
  );
};
