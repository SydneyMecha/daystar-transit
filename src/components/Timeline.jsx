import React from 'react';

export default function Timeline({ 
  orderedStagesList, 
  currentStageIndex, 
  activeDirectionCounts, 
  currentBus 
}) {
  return (
    <div className="flex-1 px-4 relative mb-6">
      <div className="absolute left-[29px] top-4 bottom-4 w-[2px] bg-gray-200 -z-0"></div>

      <div className="flex flex-col gap-6 relative z-10">
        {orderedStagesList.map((stage, idx) => {
          const isPassed = currentBus ? idx < currentStageIndex : false;
          const isCurrent = currentBus ? idx === currentStageIndex : false;
          const hasStudentsWaiting = activeDirectionCounts[stage.name] > 0;

          // Extracts passing time independently from the specific active bus JSONB mapping
          const timePassed = currentBus?.passed_stages?.[String(stage.id)] || null;

          return (
            <div key={stage.id} className="flex items-start gap-4">
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
                
                {isPassed && timePassed && (
                  <p className="text-xs italic text-gray-400 font-medium">{timePassed}</p>
                )}
                
                {/* SECURITY IMPROVEMENT: Shows generic "Waiting" status instead of precise student counts */}
                {!isPassed && hasStudentsWaiting && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold">Waiting</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
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