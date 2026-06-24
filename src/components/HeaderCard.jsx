import React, { useState } from 'react';

export default function HeaderCard({ 
  currentBus, 
  currentBusIndex, 
  visibleBusesLength, 
  setCurrentBusIndex, 
  trackingBusId, 
  onOpenTrackingModal,
  handleStopTracking
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedDirection, setSelectedDirection] = useState("Valley Road ➔ Athi River");
  const [selectedType, setSelectedType] = useState("Daystar Bus");

  // Null-safe assignment
  const isTrackingThisBus = currentBus ? trackingBusId === currentBus.id : false;

  const onTrackToggleClick = () => {
    if (isTrackingThisBus) {
      handleStopTracking();
    } else {
      setShowConfirmModal(true);
    }
  };

  const confirmTracking = () => {
    setShowConfirmModal(false);
    onOpenTrackingModal(selectedType, selectedDirection);
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50 mb-4 relative">
      {currentBus ? (
        <>
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
              <div className="font-bold text-gray-800 text-lg">{currentBus.bus_type}</div>
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
            {currentBus.bus_type === 'Daystar Bus' ? 'Bus Pass' : 'Cash'}
          </span>

          {/* THE TRACKING CONTROL BUTTON (Now always visible on active cards!) */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-center">
            <button
              onClick={onTrackToggleClick}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                isTrackingThisBus
                  ? "bg-red-100 text-red-600 border border-red-200 animate-pulse"
                  : "bg-sky-100 text-sky-600 border border-sky-200 hover:bg-sky-200"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isTrackingThisBus ? "bg-red-500 animate-ping" : "bg-sky-500"}`}></span>
              {isTrackingThisBus ? "Stop Sharing My GPS" : "I'm on this bus (Share GPS)"}
            </button>
          </div>
        </>
      ) : (
        /* FALLBACK CARD IF NO BUSES ARE ONLINE */
        <div className="text-center py-2">
          <svg className="w-12 h-12 text-gray-300 mb-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 16c0 1.105-1.343 2-3 2H8c-1.657 0-3-.895-3-2V8c0-1.105 1.343-2 3-2h8c1.657 0 3 .895 3 2v8z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 10h14M7 14h2m6 0h2M9 18a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="font-bold text-gray-700 text-sm">No Active Buses in Transit</h3>
          <p className="text-[11px] text-gray-400 mt-1 max-w-[240px] mx-auto leading-relaxed">
            Are you currently riding? Click below to start the tracking session.
          </p>
          <button 
            onClick={onTrackToggleClick}
            className="mt-4 px-5 py-2 bg-sky-100 text-sky-600 hover:bg-sky-200 text-xs font-bold rounded-full transition"
          >
            I'm on board (Share GPS)
          </button>
        </div>
      )}

      {/* GPS CROWDSOURCING VERIFICATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full text-center shadow-lg">
            <div className="text-3xl mb-2">🚌</div>
            <h4 className="font-bold text-gray-800 text-base mb-1">Confirm Tracking Status</h4>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Are you physically sitting inside this bus right now? False reports will mislead students waiting at upcoming stages.
            </p>
            
            <div className="flex flex-col gap-3 mb-5 text-left">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-1">Which Bus did you board?</label>
                <select 
                  value={selectedType} 
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-200 p-3 rounded-xl outline-none font-semibold text-gray-700 text-xs"
                >
                  <option value="Daystar Bus">Daystar Bus (Bus Pass)</option>
                  <option value="Jambostar Bus">Jambostar Bus (Cash)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-1">What is your direction?</label>
                <select 
                  value={selectedDirection} 
                  onChange={(e) => setSelectedDirection(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-200 p-3 rounded-xl outline-none font-semibold text-gray-700 text-xs"
                >
                  <option value="Valley Road ➔ Athi River">Valley Road ➔ Athi River</option>
                  <option value="Athi River ➔ Valley Road">Athi River ➔ Valley Road</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-xs"
              >
                No, Cancel
              </button>
              <button 
                onClick={confirmTracking}
                className="flex-1 py-2.5 bg-[#38BDF8] hover:bg-[#0EA5E9] text-white font-bold rounded-xl text-xs"
              >
                Yes, Start GPS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}