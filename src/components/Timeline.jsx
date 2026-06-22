import React from 'react';

export default function Timeline({ 
  orderedStagesList, 
  currentStageIndex, 
  activeDirectionCounts, 
  isCoordinator, 
  currentBus, 
  handleUpdateStage 
}) {
  return (
    <div className="flex-1 px-4 relative mb-6">
      {/* Continuous vertical line */}
      <div className="absolute left-[29px] top-4 bottom-4 w-[2px] bg-gray-200 -z-0"></div>

      <div className="flex flex-col gap-6 relative z-10">
        {orderedStagesList.map((stage, idx) => {
          const isPassed = currentBus ? idx < currentStageIndex : false;
          const isCurrent = currentBus ? idx === currentStageIndex : false;
          const currentWaitCount = activeDirectionCounts[stage.name] || 0;

          // Manual click triggers only if manual tracking is enabled
          const isManualClickable = isCoordinator && currentBus && currentBus.tracking_mode === 'manual';

          return (
            <div 
              key={stage.id} 
              className={`flex items-start gap-4 transition-all ${
                isManualClickable ? "cursor-pointer hover:bg-gray-200/50 p-1.5 -m-1.5 rounded-xl" : ""
              }`}
              onClick={() => isManualClickable && handleUpdateStage(stage.id)}
            >
              <div className="flex items-center justify-center w-[30px] h-[30px] mt-0.5">
                {isCurrent ? (
                  <div className="w-4 h-4 rounded-full bg-black ring-4 ring-black/10"></div>
                ) : isPassed ? (
                  <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                ) : (
                  <div className="w-3 h-3 rounded-full bg-[#E5E5E5] border border-gray-300"></div>
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`font-semibold text-base transition-all duration-200 ${
                    isPassed ? "text-gray-400 line-through" : "text-gray-800"
                  }`}>
                    {stage.name}
                  </h3>
                  {isCurrent && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold animate-pulse">ACTIVE</span>
                  )}
                </div>
                
                {isPassed && stage.time_passed && (
                  <p className="text-xs italic text-gray-400 font-medium">{stage.time_passed}</p>
                )}
                
                {currentWaitCount > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-blue-500 font-semibold">{currentWaitCount} waiting</span>
                    {isCoordinator && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}