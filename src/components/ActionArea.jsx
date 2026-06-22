import React from 'react';

export default function ActionArea({ 
  isCoordinator, 
  currentBus, 
  userState, 
  setUserState, 
  selectedStop, 
  setSelectedStop, 
  orderedStagesList, 
  currentStageIndex, 
  handleMarkAsWaiting, 
  handleCancel, 
  handleBoarded, 
  handleClearWaitlistManual,
  handleToggleFull
}) {
  return (
    <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col gap-3">
      {isCoordinator && currentBus ? (
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={handleClearWaitlistManual}
            className="w-full py-4 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition text-white font-bold rounded-2xl shadow-md text-center text-sm"
          >
            🧹 Clear Active Waitlist
          </button>

          <button 
            onClick={handleToggleFull}
            className={`w-full py-4 font-bold rounded-2xl transition active:scale-[0.98] text-center shadow-md text-sm ${
              currentBus.is_full 
                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/10" 
                : "bg-white border border-gray-200 hover:bg-gray-50 text-gray-700"
            }`}
          >
            {currentBus.is_full ? "Mark As Available" : "Mark As Full"}
          </button>
        </div>
      ) : (
        <>
          {userState === "idle" && (
            <>
              <button className="w-full py-4 px-6 bg-gray-100 hover:bg-gray-200 transition text-gray-800 font-semibold rounded-2xl flex justify-between items-center">
                <select 
                  value={selectedStop} 
                  onChange={(e) => setSelectedStop(e.target.value)}
                  className="bg-transparent w-full outline-none text-left appearance-none cursor-pointer"
                >
                  {orderedStagesList.filter((s, idx) => currentBus ? idx >= currentStageIndex : true).map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
                <svg className="w-5 h-5 text-gray-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button 
                onClick={handleMarkAsWaiting}
                className="w-full py-4 bg-[#38BDF8] hover:bg-[#0EA5E9] active:scale-[0.98] transition text-white font-bold rounded-2xl shadow-lg shadow-sky-500/20 text-center"
              >
                Mark As Waiting
              </button>
            </>
          )}

          {userState === "waiting" && (
            <>
              <button className="w-full py-4 px-6 bg-gray-100 text-gray-800 font-semibold rounded-2xl flex justify-between items-center cursor-not-allowed opacity-75">
                <span>{selectedStop}</span>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="flex gap-3">
                <button 
                  onClick={handleCancel}
                  className="flex-1 py-4 border border-gray-200 hover:bg-gray-50 bg-white transition text-gray-700 font-bold rounded-2xl text-center"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBoarded}
                  className="flex-1 py-4 bg-[#38BDF8] hover:bg-[#0EA5E9] active:scale-[0.98] transition text-white font-bold rounded-2xl shadow-lg shadow-sky-500/20 text-center"
                >
                  Boarded
                </button>
              </div>
            </>
          )}

          {userState === "boarded" && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
              <p className="text-green-800 font-bold">🎉 Have a safe journey!</p>
              <button 
                onClick={() => { setUserState("idle"); }} 
                className="mt-2 text-xs text-green-600 underline font-semibold hover:text-green-800"
              >
                Reset status
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}