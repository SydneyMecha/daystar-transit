import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [buses, setBuses] = useState([]);
  const [currentBusIndex, setCurrentBusIndex] = useState(0);
  const [stages, setStages] = useState([]);
  const [waitCounts, setWaitCounts] = useState({});
  
  // App Navigation & Roles
  const [activeTab, setActiveTab] = useState("tracker"); // "tracker" or "schedule"
  const [isCoordinator, setIsCoordinator] = useState(false);

  // Student interaction states
  const [selectedStop, setSelectedStop] = useState(() => localStorage.getItem('transit_selected_stop') || "");
  const [userState, setUserState] = useState(() => localStorage.getItem('transit_user_state') || "idle");
  const [waitingRecordId, setWaitingRecordId] = useState(() => localStorage.getItem('transit_waiting_record_id') || null);

  // Filter buses based on role
  const visibleBuses = isCoordinator ? buses : buses.filter(b => b.is_active);
  const currentBus = visibleBuses[currentBusIndex];

  // Adjust index if out of range after role switch or visibility change
  useEffect(() => {
    if (currentBusIndex >= visibleBuses.length && visibleBuses.length > 0) {
      setCurrentBusIndex(0);
    }
  }, [visibleBuses, currentBusIndex]);

  useEffect(() => {
    fetchInitialData();

    // Subscribe to real-time updates
    const dbSubscription = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, () => {
        fetchBusesData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages' }, () => {
        fetchStagesData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wait_list' }, () => {
        fetchWaitCounts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dbSubscription);
    };
  }, []);

  // Sync state to LocalStorage
  useEffect(() => {
    if (userState) localStorage.setItem('transit_user_state', userState);
    if (waitingRecordId) localStorage.setItem('transit_waiting_record_id', waitingRecordId);
    else localStorage.removeItem('transit_waiting_record_id');
    if (selectedStop) localStorage.setItem('transit_selected_stop', selectedStop);
  }, [userState, waitingRecordId, selectedStop]);

  // Verify waiting status on load
  useEffect(() => {
    if (waitingRecordId) {
      verifyUserWaitingStatus();
    }
  }, [waitingRecordId]);

  const verifyUserWaitingStatus = async () => {
    const { data, error } = await supabase
      .from('wait_list')
      .select('status')
      .eq('id', waitingRecordId)
      .single();

    if (error || !data || data.status !== 'waiting') {
      setUserState("idle");
      setWaitingRecordId(null);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    await Promise.all([
      fetchBusesData(),
      fetchStagesData(),
      fetchWaitCounts()
    ]);
    setLoading(false);
  };

  const fetchBusesData = async () => {
    const { data, error } = await supabase
      .from('buses')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) console.error("Error fetching buses:", error);
    else setBuses(data);
  };

  const fetchStagesData = async () => {
    const { data, error } = await supabase
      .from('stages')
      .select('*')
      .order('sequence_order', { ascending: true });

    if (error) console.error("Error fetching stages:", error);
    else setStages(data);
  };

  const fetchWaitCounts = async () => {
    const { data, error } = await supabase
      .from('wait_list')
      .select('selected_stage, direction')
      .eq('status', 'waiting');

    if (error) {
      console.error("Error fetching wait counts:", error);
      return;
    }

    const counts = {};
    data.forEach(item => {
      const dir = item.direction;
      if (!counts[dir]) counts[dir] = {};
      counts[dir][item.selected_stage] = (counts[dir][item.selected_stage] || 0) + 1;
    });
    setWaitCounts(counts);
  };

  // STUDENT ACTIONS
  const handleMarkAsWaiting = async () => {
    if (!currentBus) return;

    const { data, error } = await supabase
      .from('wait_list')
      .insert([{ 
        selected_stage: selectedStop, 
        status: 'waiting',
        direction: currentBus.direction 
      }])
      .select()
      .single();

    if (error) console.error("Error joining queue:", error);
    else {
      setWaitingRecordId(data.id);
      setUserState("waiting");
    }
  };

  const handleCancel = async () => {
    if (!waitingRecordId) return;
    const { error } = await supabase
      .from('wait_list')
      .update({ status: 'cancelled' })
      .eq('id', waitingRecordId);

    if (error) console.error("Error cancelling status:", error);
    else {
      setUserState("idle");
      setWaitingRecordId(null);
    }
  };

  const handleBoarded = async () => {
    if (!waitingRecordId) return;
    const { error } = await supabase
      .from('wait_list')
      .update({ status: 'boarded' })
      .eq('id', waitingRecordId);

    if (error) console.error("Error updating boarding status:", error);
    else {
      setUserState("boarded");
    }
  };

  // COORDINATOR ACTIONS
  const handleUpdateStage = async (stageId) => {
    if (!currentBus) return;

    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();

    const { error: busError } = await supabase
      .from('buses')
      .update({ current_stage_id: stageId })
      .eq('id', currentBus.id);

    const orderedStages = getOrderedStages();
    const currentIdx = orderedStages.findIndex(s => s.id === stageId);

    const updates = orderedStages.map((stage, idx) => {
      let passedTime = stage.time_passed;
      if (idx < currentIdx) {
        passedTime = stage.time_passed || timeString;
      } else if (idx === currentIdx) {
        passedTime = timeString;
      } else {
        passedTime = null;
      }
      return supabase.from('stages').update({ time_passed: passedTime }).eq('id', stage.id);
    });

    await Promise.all(updates);

    if (busError) console.error("Error moving bus:", busError);
  };

  const handleToggleFull = async () => {
    if (!currentBus) return;
    const { error } = await supabase
      .from('buses')
      .update({ is_full: !currentBus.is_full })
      .eq('id', currentBus.id);

    if (error) console.error("Error toggling capacity status:", error);
  };

  const handleUpdateDirection = async (newDirection) => {
    if (!currentBus) return;
    const defaultStageId = newDirection.startsWith("Valley Road") ? 1 : 7;

    const { error } = await supabase
      .from('buses')
      .update({ 
        direction: newDirection,
        current_stage_id: defaultStageId,
        is_full: false
      })
      .eq('id', currentBus.id);

    if (error) {
      console.error("Error updating direction:", error);
      return;
    }

    const clearUpdates = stages.map(stage => {
      return supabase.from('stages').update({ time_passed: null }).eq('id', stage.id);
    });
    await Promise.all(clearUpdates);
  };

  const handleToggleActive = async () => {
    if (!currentBus) return;
    const { error } = await supabase
      .from('buses')
      .update({ is_active: !currentBus.is_active })
      .eq('id', currentBus.id);

    if (error) console.error("Error toggling active status:", error);
  };

  const getOrderedStages = () => {
    if (!currentBus) return [];
    const isReverse = currentBus.direction.startsWith("Athi River");
    return isReverse ? [...stages].reverse() : stages;
  };

  useEffect(() => {
    if (currentBus) {
      const ordered = getOrderedStages();
      const available = ordered.filter(s => {
        const currentIdx = ordered.findIndex(st => st.id === currentBus.current_stage_id);
        const thisIdx = ordered.findIndex(st => st.id === s.id);
        return thisIdx >= currentIdx;
      });
      if (available.length > 0 && (!selectedStop || !available.some(s => s.name === selectedStop))) {
        setSelectedStop(available[0].name);
      }
    }
  }, [currentBus, stages]);

  if (loading || buses.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F7]">
        <div className="text-gray-500 font-semibold animate-pulse">Loading transit portal...</div>
      </div>
    );
  }

  const orderedStagesList = getOrderedStages();
  const currentStageIndex = orderedStagesList.findIndex(s => s.id === currentBus?.current_stage_id);
  const activeDirectionCounts = currentBus ? (waitCounts[currentBus.direction] || {}) : {};

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#F7F7F7] flex flex-col justify-between p-4 shadow-md pb-8">
      
      {/* Role Toggle Header Indicator */}
      <div className="text-center mb-3">
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 bg-gray-200/50 px-3 py-1 rounded-full">
          {isCoordinator ? "🛠️ Coordinator Mode" : "🎓 Passenger Mode"}
        </span>
      </div>

      {/* Segmented Tab Control */}
      <div className="flex bg-gray-200/60 p-1 rounded-2xl mb-5">
        <button 
          onClick={() => setActiveTab("tracker")}
          className={`flex-1 py-2.5 text-center font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === "tracker" 
              ? "bg-white text-gray-800 shadow-sm" 
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "tracker" ? "bg-sky-400 animate-pulse" : "bg-transparent"}`}></span>
          Live Tracker
        </button>
        <button 
          onClick={() => setActiveTab("schedule")}
          className={`flex-1 py-2.5 text-center font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === "schedule" 
              ? "bg-white text-gray-800 shadow-sm" 
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <span>📅</span> Bus Schedule
        </button>
      </div>

      {activeTab === "tracker" ? (
        /* ==================== TAB 1: LIVE TRACKER ==================== */
        <>
          {visibleBuses.length === 0 ? (
            /* EMPTY STATE FALLBACK (If no buses are online) */
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="text-5xl mb-4">🚌</div>
              <h3 className="font-bold text-gray-700 text-lg mb-2">No Buses in Transit</h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-[280px]">
                There are currently no active buses reported on the road. Please switch to the <strong>Bus Schedule</strong> tab to check normal departure times.
              </p>
            </div>
          ) : (
            /* ACTIVE BUS TRACKING VIEW */
            <>
              {/* 1. Header Card (With Swipe Chevrons) */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50 mb-4 relative">
                <div className="flex items-center justify-center gap-2 text-gray-600 font-medium text-sm mb-3">
                  <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
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
                      Bus {currentBusIndex + 1} of {visibleBuses.length}
                    </div>
                  </div>

                  <button 
                    disabled={currentBusIndex === visibleBuses.length - 1}
                    onClick={() => setCurrentBusIndex(prev => prev + 1)}
                    className={`p-1 rounded-full ${currentBusIndex === visibleBuses.length - 1 ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:bg-gray-100"}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                <span className="absolute top-4 right-4 flex items-center gap-1.5 text-[11px] font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                  💰 {currentBus.type}
                </span>
              </div>

              {/* Dynamic pagination dots */}
              {visibleBuses.length > 1 && (
                <div className="flex justify-center gap-2 mb-6">
                  {visibleBuses.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentBusIndex(index)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        index === currentBusIndex ? "w-5 bg-sky-400" : "w-2 bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* 2. Route Direction Title */}
              <div className="bg-white rounded-2xl p-4 shadow-sm text-center font-semibold text-gray-800 mb-6 border border-gray-100/50 relative">
                {currentBus.direction}
                {currentBus.is_full && (
                  <div className="mt-1 text-xs text-red-500 font-bold animate-pulse">⚠️ BUS REPORTED FULL</div>
                )}
              </div>

              {/* 3. Timeline Section */}
              <div className="flex-1 px-4 relative mb-6">
                <div className="absolute left-[29px] top-4 bottom-4 w-[2px] bg-gray-200 -z-0"></div>

                <div className="flex flex-col gap-6 relative z-10">
                  {orderedStagesList.map((stage, idx) => {
                    const isPassed = idx < currentStageIndex;
                    const isCurrent = idx === currentStageIndex;
                    const currentWaitCount = activeDirectionCounts[stage.name] || 0;

                    return (
                      <div 
                        key={stage.id} 
                        className={`flex items-start gap-4 transition-all ${
                          isCoordinator ? "cursor-pointer hover:bg-gray-200/50 p-1.5 -m-1.5 rounded-xl" : ""
                        }`}
                        onClick={() => isCoordinator && handleUpdateStage(stage.id)}
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
                            {isCoordinator && isCurrent && (
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

              {/* 4. Action Area */}
              <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col gap-3">
                {isCoordinator ? (
                  /* Coordinator Controls */
                  <div className="flex flex-col gap-3 w-full">
                    {/* Active Switch Toggle */}
                    <button 
                      onClick={handleToggleActive}
                      className={`w-full py-4 font-bold rounded-2xl transition active:scale-[0.98] text-center shadow-md ${
                        currentBus.is_active 
                          ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/10" 
                          : "bg-gray-800 hover:bg-gray-900 text-white shadow-gray-800/10"
                      }`}
                    >
                      {currentBus.is_active ? "🟢 GO OFFLINE (End Trip)" : "⚪ GO ONLINE (Start Trip)"}
                    </button>

                    {/* Trip Direction Selector */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-1.5 shadow-sm">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Set Trip Direction</label>
                      <select 
                        value={currentBus.direction} 
                        onChange={(e) => handleUpdateDirection(e.target.value)}
                        className="bg-transparent w-full outline-none font-bold text-gray-700 cursor-pointer text-sm"
                      >
                        <option value="Valley Road ➔ Athi River">Valley Road ➔ Athi River</option>
                        <option value="Athi River ➔ Valley Road">Athi River ➔ Valley Road</option>
                      </select>
                    </div>

                    {/* Toggle Capacity Button */}
                    <button 
                      onClick={handleToggleFull}
                      className={`w-full py-4 font-bold rounded-2xl transition active:scale-[0.98] text-center shadow-md ${
                        currentBus.is_full 
                          ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/10" 
                          : "bg-white border border-gray-200 hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      {currentBus.is_full ? "Mark As Available" : "Mark As Full"}
                    </button>
                  </div>
                ) : (
                  /* Student Controls */
                  <>
                    {userState === "idle" && (
                      <>
                        <button className="w-full py-4 px-6 bg-gray-100 hover:bg-gray-200 transition text-gray-800 font-semibold rounded-2xl flex justify-between items-center">
                          <select 
                            value={selectedStop} 
                            onChange={(e) => setSelectedStop(e.target.value)}
                            className="bg-transparent w-full outline-none text-left appearance-none cursor-pointer"
                          >
                            {orderedStagesList.filter((s, idx) => idx >= currentStageIndex).map(s => (
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
                          onClick={() => { setUserState("idle"); setWaitingRecordId(null); }} 
                          className="mt-2 text-xs text-green-600 underline font-semibold hover:text-green-800"
                        >
                          Reset status
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        /* ==================== TAB 2: STATIC SCHEDULE ==================== */
        <div className="flex-1 flex flex-col gap-5 overflow-y-auto max-h-[75vh] px-1 pb-4">
          
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50">
            <h3 className="font-bold text-gray-800 text-base mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
              <span>📍</span> Athi River ➔ Valley Road
            </h3>
            
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold text-sky-500 uppercase tracking-wider">Mon, Wed, Fri</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5">5:00 a.m. | 11:00 a.m. | 4:00 p.m. | 5:00 p.m.</p>
              </div>
              
              <div>
                <p className="text-xs font-bold text-sky-500 uppercase tracking-wider">Tue, Thu</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5">5:00 a.m. | 1:00 p.m. | 4:00 p.m. | 5:00 p.m.</p>
              </div>

              <div className="pt-1">
                <p className="text-xs font-bold text-[#EAB308] uppercase tracking-wider">Saturday (Weekend)</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5">9:00 a.m.</p>
              </div>
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-100 p-3 rounded-xl text-xs text-amber-800 leading-relaxed">
              <strong>⚠️ Parking Location:</strong> The <strong>5:00 a.m.</strong> weekday bus and the <strong>Saturday</strong> bus park strictly at the <strong>Hope Centre Park</strong>.
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50">
            <h3 className="font-bold text-gray-800 text-base mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
              <span>📍</span> Valley Road ➔ Athi River
            </h3>
            
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold text-sky-500 uppercase tracking-wider">Mon to Fri (Weekdays)</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5">6:20 a.m. | 5:00 p.m.</p>
              </div>

              <div>
                <p className="text-xs font-bold text-[#EAB308] uppercase tracking-wider">Sunday (Weekend)</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5">3:00 p.m. – 5:00 p.m.</p>
              </div>
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-100 p-3 rounded-xl text-xs text-amber-800 leading-relaxed">
              <strong>⚠️ Parking Location:</strong> Weekday morning buses and Sunday evening buses park at the <strong>Entrance Gate</strong>. Weekday evening buses park at the <strong>Exit Gate</strong>.
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50">
            <h3 className="font-bold text-gray-800 text-base mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
              <span>💳</span> Fare & Bus Pass Rules
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
                <span className="text-gray-600">Valley Road ➔ Athi River</span>
                <span className="font-bold text-gray-800">200 Ksh</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
                <span className="text-gray-600">Athi ➔ Past Syokimau (to VR)</span>
                <span className="font-bold text-gray-800">200 Ksh</span>
              </div>
              <div className="flex justify-between items-center text-sm pb-1">
                <span className="text-gray-600">Athi ➔ Syokimau (or before)</span>
                <span className="font-bold text-gray-800">150 Ksh</span>
              </div>
            </div>

            <div className="mt-4 bg-blue-50 border border-blue-100 p-3 rounded-xl text-xs text-blue-800 leading-relaxed">
              <strong>📢 Bus Pass Validity:</strong> Bus Passes are strictly valid **ONLY** on the <strong>6:30 a.m.</strong> bus departing from Valley Road and the <strong>5:00 p.m.</strong> bus departing from Athi River.
            </div>
          </div>

        </div>
      )}

      {/* Subtle Role Switch Footer (For MVP testing) */}
      <div className="text-center mt-6">
        <button 
          onClick={() => setIsCoordinator(!isCoordinator)}
          className="text-xs text-gray-400 underline hover:text-gray-600 transition font-semibold"
        >
          {isCoordinator ? "Exit Coordinator Panel" : "Switch to Coordinator Portal"}
        </button>
      </div>
    </div>
  );
}