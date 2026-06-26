import React, { useState } from 'react';

export default function HeaderCard({ 
  currentBus, 
  currentBusIndex, 
  visibleBusesLength, 
  setCurrentBusIndex, 
  trackingBusId, 
  onOpenTrackingModal,
  handleStopTracking,
  onOpenWhatsAppModal
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedDirection, setSelectedDirection] = useState("Valley Road ➔ Athi River");
  const [selectedType, setSelectedType] = useState("Daystar Bus");

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
              
              <div className="text-[10px] font-bold text-emerald-600 flex items-center justify-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {currentBus.tracker_count} student{currentBus.tracker_count > 1 ? 's' : ''} tracking
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

          {/* DUAL ACTION BUTTON PANEL */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-2.5">
            <button
              onClick={onTrackToggleClick}
              className={`w-full py-2.5 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                isTrackingThisBus
                  ? "bg-red-100 text-red-600 border border-red-200 animate-pulse"
                  : "bg-sky-100 text-sky-600 border border-sky-200 hover:bg-sky-200"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isTrackingThisBus ? "bg-red-500 animate-ping" : "bg-sky-500"}`}></span>
              {isTrackingThisBus ? "Stop Sharing My GPS" : "I'm on this bus (Share GPS)"}
            </button>

            {/* Triggers the dynamic WhatsApp modal in App.jsx */}
            {!isTrackingThisBus && (
              <button
                onClick={onOpenWhatsAppModal}
                className="w-full py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.042-4.03-3.582 8-9-8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Ask a Passenger to Track (WhatsApp)
              </button>
            )}
          </div>
        </>
      ) : (
        /* FALLBACK CARD IF NO BUSES ARE ONLINE (Contains both blue GPS and green WhatsApp buttons!) */
        <div className="text-center py-2 flex flex-col gap-3.5">
          <svg className="w-12 h-12 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 16c0 1.105-1.343 2-3 2H8c-1.657 0-3-.895-3-2V8c0-1.105 1.343-2 3-2h8c1.657 0 3 .895 3 2v8z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 10h14M7 14h2m6 0h2M9 18a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          
          <div>
            <h3 className="font-bold text-gray-700 text-sm">No Active Buses in Transit</h3>
            <p className="text-[11px] text-gray-400 mt-1 max-w-[240px] mx-auto leading-relaxed">
              Are you currently on the bus? Help us track it by tapping the button below.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 w-full">
            {/* Primary tracking activation */}
            <button 
              onClick={onTrackToggleClick}
              className="w-full py-3.5 bg-[#38BDF8] hover:bg-[#0EA5E9] text-white text-xs font-bold rounded-2xl shadow-md transition active:scale-[0.98]"
            >
              I'm on board (Share GPS)
            </button>

            {/* Staging WhatsApp plea loop */}
            <button
              onClick={onOpenWhatsAppModal} // 👈 FIXED: Triggers aligned prop name
              className="w-full py-3.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.042-4.03-3.582 8-9-8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Ask people on board to track (WhatsApp)
            </button>
          </div>
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
                  <option value="Daystar Bus">Daystar Bus (Official)</option>
                  <option value="Jambostar Bus">Jambostar Bus (Hired)</option>
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