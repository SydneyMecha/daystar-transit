import React from 'react';

export default function AnnouncementBanner({ announcement }) {
  if (!announcement) return null;

  return (
    <div className="bg-amber-100 border border-amber-200 rounded-2xl p-3 text-amber-800 leading-relaxed text-xs font-semibold mb-4 flex items-start gap-2 shadow-sm animate-pulse">
      <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
      <div>{announcement.message}</div>
    </div>
  );
}