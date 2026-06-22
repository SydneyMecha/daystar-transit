import React from 'react';

export default function CoordinatorPanel({ 
  buses, 
  currentBusIndex, 
  setCurrentBusIndex, 
  currentBus, 
  handleUpdateDirection, 
  handleToggleActive, 
  handleUpdateTrackingMode 
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50 mb-4 flex flex-col gap-4">
      <div className="flex items-center gap-2 text-gray-600 font-semibold text-sm border-b border-gray-100 pb-2">
        <img src="/logo.png" alt="Transit Logo" className="w-8 h-8 object-contain" />
        Coordinator Control Panel
      </div>

      {/* 1. Bus Selection Dropdown */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Select Active Bus Plate</label>
        <select 
          value={currentBusIndex} 
          onChange={(e) => setCurrentBusIndex(parseInt(e.target.value))}
          className="bg-gray-100 border border-gray-200 rounded-2xl p-3.5 outline-none font-bold text-gray-700 cursor-pointer text-sm w-full"
        >
          {buses.map((b, idx) => (
            <option key={b.id} value={idx}>{b.plate_number} ({b.type})</option>
          ))}
        </select>
      </div>

      {currentBus && (
        <>
          {/* 2. Direction & Go Online Row Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 flex flex-col gap-1 shadow-sm">
              <label className="text-[9px] uppercase font-bold tracking-wider text-gray-400">Trip Direction</label>
              <select 
                value={currentBus.direction} 
                onChange={(e) => handleUpdateDirection(e.target.value)}
                className="bg-transparent w-full outline-none font-bold text-gray-700 cursor-pointer text-xs"
              >
                <option value="Valley Road ➔ Athi River">Valley Road ➔ Athi River</option>
                <option value="Athi River ➔ Valley Road">Athi River ➔ Valley Road</option>
              </select>
            </div>

            <button 
              onClick={handleToggleActive}
              className={`py-4 font-bold rounded-2xl transition text-xs active:scale-[0.98] text-center shadow-sm ${
                currentBus.is_active 
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/10" 
                  : "bg-gray-800 hover:bg-gray-900 text-white shadow-gray-800/10"
              }`}
            >
              {currentBus.is_active ? "🟢 Go Offline (End)" : "⚪ Go Online (Start)"}
            </button>
          </div>

          {/* 3. Tracking Mode Row Grid (Automatic vs Manual) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleUpdateTrackingMode('auto')}
              className={`py-3.5 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                currentBus.tracking_mode === 'auto'
                  ? "bg-sky-100 text-sky-600 border-sky-200"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${currentBus.tracking_mode === 'auto' ? "bg-sky-500 animate-pulse" : "bg-gray-300"}`}></span>
              Auto Tracking
            </button>

            <button
              onClick={() => handleUpdateTrackingMode('manual')}
              className={`py-3.5 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                currentBus.tracking_mode === 'manual'
                  ? "bg-amber-100 text-amber-600 border-amber-200"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${currentBus.tracking_mode === 'manual' ? "bg-amber-500" : "bg-gray-300"}`}></span>
              Manual Tracking
            </button>
          </div>
        </>
      )}
    </div>
  );
}