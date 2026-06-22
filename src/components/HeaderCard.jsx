import React from 'react';

export default function HeaderCard({ 
  currentBus, 
  currentBusIndex, 
  visibleBusesLength, 
  setCurrentBusIndex, 
  trackingBusId, 
  setTrackingBusId 
}) {
  if (!currentBus) return null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50 mb-4 relative">
      <div className="flex items-center justify-center gap-2 text-gray-600 font-medium text-sm mb-3">
        <img src="/logo.png" alt="Transit Logo" className="w-8 h-8 object-contain" />
        School Bus System
      </div>
      
      <div className="flex justify-between items-center px-2">
        <button 
          disabled={currentBusIndex === 0}
          onClick={() => setCurrentBusIndex(prev => prev - 1)}
          className={`p-1 rounded-full ${currentBusIndex === 0 ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:bg-gray-100"}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="text-center">
          <div className="font-bold text-gray-800 text-lg"># {currentBus.plate_number}</div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mt-0.5">
            Bus {currentBusIndex + 1} of {visibleBusesLength}
          </div>
        </div>

        <button 
          disabled={currentBusIndex === visibleBusesLength - 1}
          onClick={() => setCurrentBusIndex(prev => prev + 1)}
          className={`p-1 rounded-full ${currentBusIndex === visibleBusesLength - 1 ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:bg-gray-100"}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <span className="absolute top-4 right-4 flex items-center gap-1.5 text-[11px] font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
        {currentBus.type}
      </span>

      {currentBus.tracking_mode === 'auto' && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-center">
          <button
            onClick={() => setTrackingBusId(trackingBusId === currentBus.id ? null : currentBus.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
              trackingBusId === currentBus.id
                ? "bg-red-100 text-red-600 border border-red-200"
                : "bg-sky-100 text-sky-600 border-sky-200 hover:bg-sky-200"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${trackingBusId === currentBus.id ? "bg-red-500 animate-ping" : "bg-sky-500"}`}></span>
            {trackingBusId === currentBus.id ? "Stop My Tracking" : "I'm on this bus (Share GPS)"}
          </button>
        </div>
      )}
    </div>
  );
}