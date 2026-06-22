import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

import AnnouncementBanner from './components/AnnouncementBanner';
import HeaderCard from './components/HeaderCard';
import CoordinatorPanel from './components/CoordinatorPanel';
import Timeline from './components/Timeline';
import ActionArea from './components/ActionArea';
import ScheduleTab from './components/ScheduleTab';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [buses, setBuses] = useState([]);
  const [currentBusIndex, setCurrentBusIndex] = useState(0);
  const [stages, setStages] = useState([]);
  const [waitCounts, setWaitCounts] = useState({});
  const [announcement, setAnnouncement] = useState(null);
  
  // App Navigation & Roles
  const [activeTab, setActiveTab] = useState("tracker");
  const [isCoordinator, setIsCoordinator] = useState(false);

  // Student interaction states (Safely parsed from LocalStorage strings)
  const [selectedStop, setSelectedStop] = useState(() => {
    const stop = localStorage.getItem('transit_selected_stop');
    return (stop && stop !== 'null' && stop !== 'undefined') ? stop : "Valley Road Campus";
  });

  const [userState, setUserState] = useState(() => {
    const state = localStorage.getItem('transit_user_state');
    return (state && state !== 'null' && state !== 'undefined') ? state : "idle";
  });

  const [waitingRecordId, setWaitingRecordId] = useState(() => {
    const id = localStorage.getItem('transit_waiting_record_id');
    return (id && id !== 'null' && id !== 'undefined') ? id : null;
  });

  // GPS Crowdsourced Tracker State
  const [trackingBusId, setTrackingBusId] = useState(() => {
    const id = localStorage.getItem('transit_tracking_bus_id');
    return (id && id !== 'null' && id !== 'undefined') ? parseInt(id) : null;
  });
  const watchIdRef = useRef(null);

  // Filter active buses for passenger view
  const visibleBuses = isCoordinator ? buses : buses.filter(b => b.is_active);
  const currentBus = visibleBuses[currentBusIndex] || null;

  useEffect(() => {
    if (currentBusIndex >= visibleBuses.length && visibleBuses.length > 0) {
      setCurrentBusIndex(0);
    }
  }, [visibleBuses, currentBusIndex]);

  useEffect(() => {
    fetchInitialData();

    // Subscribe to DB updates
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchAnnouncement();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dbSubscription);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Handle background GPS loop when "Track this Bus" is active
  useEffect(() => {
    if (trackingBusId) {
      localStorage.setItem('transit_tracking_bus_id', trackingBusId);
      startGpsTracking(trackingBusId);
    } else {
      localStorage.removeItem('transit_tracking_bus_id');
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
  }, [trackingBusId, buses, stages]);

  useEffect(() => {
    if (userState) localStorage.setItem('transit_user_state', userState);
    if (waitingRecordId) localStorage.setItem('transit_waiting_record_id', waitingRecordId);
    else localStorage.removeItem('transit_waiting_record_id');
    if (selectedStop) localStorage.setItem('transit_selected_stop', selectedStop);
  }, [userState, waitingRecordId, selectedStop]);

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
    await clearOldWaitlistRecords(); // Perform 9am / 7pm cleanup first
    await Promise.all([
      fetchBusesData(),
      fetchStagesData(),
      fetchWaitCounts(),
      fetchAnnouncement()
    ]);
    setLoading(false);
  };

  const fetchAnnouncement = async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) setAnnouncement(null);
    else setAnnouncement(data);
  };

  const clearOldWaitlistRecords = async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().split('T')[0];

    let cutoffTime = null;
    if (currentHour >= 9 && currentHour < 19) {
      cutoffTime = `${todayStr}T09:00:00`;
    } else if (currentHour >= 19 || currentHour < 9) {
      cutoffTime = `${todayStr}T20:00:00`;
    }

    if (cutoffTime) {
      await supabase
        .from('wait_list')
        .update({ status: 'expired' })
        .eq('status', 'waiting')
        .lt('created_at', cutoffTime);
    }
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

  // AUTOMATED GPS TRACKING & GEOFENCING WITH ANTI-SPOOFING
  const startGpsTracking = (busId) => {
    if (watchIdRef.current) return;

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      setTrackingBusId(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // 1. Evaluate distance verification (Anti-spoofing)
        const isEligible = evaluateTrackEligibility(busId, latitude, longitude);
        if (!isEligible) {
          setTrackingBusId(null);
          return;
        }

        // 2. Start watching position if eligible
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            evaluateGeofenceArrival(busId, lat, lng);
          },
          (err) => {
            console.error("Tracking watch error:", err);
            alert("Location tracking lost. Please keep your browser open and GPS active.");
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
      },
      (err) => {
        alert("Permission Denied: Please enable Location Permissions in your phone settings to track this bus.");
        setTrackingBusId(null);
      }
    );
  };

  // Anti-Spoofing: Verifies user is physically close to the last reported bus stage
  const evaluateTrackEligibility = (busId, userLat, userLng) => {
    const targetBus = buses.find(b => b.id === busId);
    if (!targetBus) return false;

    // Find the coordinates of the bus's last reported stage
    const lastReportedStage = stages.find(s => s.id === targetBus.current_stage_id);
    if (!lastReportedStage || !lastReportedStage.latitude) return true; // Fallback to trust if database stage lacks coords

    const distance = calculateDistance(userLat, userLng, lastReportedStage.latitude, lastReportedStage.longitude);

    if (distance > 1000) { // If student is more than 1 kilometer away from the actual bus location
      alert("Permission Denied: You are too far from this bus's current location to track it.");
      return false;
    }
    return true;
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  const evaluateGeofenceArrival = async (busId, userLat, userLng) => {
    const targetBus = buses.find(b => b.id === busId);
    if (!targetBus || targetBus.tracking_mode !== 'auto') return;

    const isReverse = targetBus.direction.startsWith("Athi River");
    const ordered = isReverse ? [...stages].reverse() : stages;
    const currentIdx = ordered.findIndex(s => s.id === targetBus.current_stage_id);

    for (let i = currentIdx + 1; i < ordered.length; i++) {
      const stage = ordered[i];
      if (!stage || !stage.latitude || !stage.longitude) continue;

      const distance = calculateDistance(userLat, userLng, stage.latitude, stage.longitude);

      if (distance < 300) { // Within 300 meters
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();

        await supabase.from('buses').update({ current_stage_id: stage.id }).eq('id', busId);
        await supabase.from('stages').update({ time_passed: timeString }).eq('id', stage.id);

        // Auto-stop tracking if the bus reaches the final destination
        if (i === ordered.length - 1) {
          alert("🎉 You have arrived at your destination! Tracking has stopped.");
          setTrackingBusId(null);
        }
        break;
      }
    }
  };

  // STUDENT ACTIONS
  const handleMarkAsWaiting = async () => {
    const direction = currentBus ? currentBus.direction : 'Valley Road ➔ Athi River';

    const { data, error } = await supabase
      .from('wait_list')
      .insert([{ 
        selected_stage: selectedStop, 
        status: 'waiting',
        direction: direction 
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
    if (currentBus.tracking_mode === 'auto') return;

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
    const defaultStageId = newDirection.startsWith("Valley Road") ? 1 : stages.length;

    const { error: busError } = await supabase
      .from('buses')
      .update({ 
        direction: newDirection,
        current_stage_id: defaultStageId,
        is_full: false
      })
      .eq('id', currentBus.id);

    if (busError) {
      console.error("Error updating direction:", busError);
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

  const handleUpdateTrackingMode = async (mode) => {
    if (!currentBus) return;
    const { error } = await supabase
      .from('buses')
      .update({ tracking_mode: mode })
      .eq('id', currentBus.id);

    if (error) console.error("Error updating tracking mode:", error);
  };

  const handleClearWaitlistManual = async () => {
    const confirmClear = window.confirm("Are you sure you want to clear the entire passenger waitlist now?");
    if (!confirmClear) return;

    const { error } = await supabase
      .from('wait_list')
      .update({ status: 'expired' })
      .eq('status', 'waiting');

    if (error) console.error("Error clearing waitlist:", error);
    else alert("Passenger waitlist successfully cleared.");
  };

  const getOrderedStages = () => {
    if (!currentBus) return stages;
    const isReverse = currentBus.direction.startsWith("Athi River");
    return isReverse ? [...stages].reverse() : stages;
  };

  useEffect(() => {
    const ordered = getOrderedStages();
    if (currentBus) {
      const available = ordered.filter((s, idx) => idx >= currentStageIndex);
      if (available.length > 0 && (!selectedStop || !available.some(s => s.name === selectedStop))) {
        setSelectedStop(available[0].name);
      }
    } else {
      if (!selectedStop && ordered.length > 0) {
        setSelectedStop(ordered[0].name);
      }
    }
  }, [currentBus, stages]);

  const orderedStagesList = getOrderedStages();
  const currentStageIndex = orderedStagesList.findIndex(s => s.id === currentBus?.current_stage_id);
  const activeDirectionCounts = currentBus ? (waitCounts[currentBus.direction] || {}) : waitCounts['Valley Road ➔ Athi River'] || {};

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#F7F7F7] flex flex-col justify-between p-4 shadow-md pb-8">
      
      {/* Role Toggle Header Indicator */}
      <div className="text-center mb-3">
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 bg-gray-200/50 px-3 py-1 rounded-full flex items-center justify-center gap-1.5 w-max mx-auto">
          {isCoordinator ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Coordinator Mode
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 14l9-5-9-5-9 5 9 5z" />
                <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
              </svg>
              Passenger Mode
            </>
          )}
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
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Bus Schedule
        </button>
      </div>

      {/* DYNAMIC ANNOUNCEMENT BANNER */}
      {announcement && activeTab === "tracker" && (
        <div className="bg-amber-100 border border-amber-200 rounded-2xl p-3 text-amber-800 leading-relaxed text-xs font-semibold mb-4 flex items-start gap-2 shadow-sm animate-pulse">
          <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <div>{announcement.message}</div>
        </div>
      )}

      {activeTab === "tracker" ? (
        /* ==================== TAB 1: LIVE TRACKER ==================== */
        <>
          {isCoordinator ? (
            /* ================= COORDINATOR CONTROL PANEL ================= */
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
          ) : (
            /* ================= PASSENGER SYSTEM VIEW ================= */
            <>
              {visibleBuses.length === 0 ? (
                /* FALLBACK HEADER IF NO BUSES ARE LIVE */
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm mb-4 text-center">
                  <svg className="w-8 h-8 text-red-500 mb-2 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h3 className="font-bold text-red-700 text-sm">No Buses in Transit</h3>
                  <p className="text-[11px] text-red-400 mt-1">Please refer to the Bus Schedule tab for static departure times.</p>
                </div>
              ) : (
                /* ACTIVE BUS VISUAL SLIDER (PASSENGER CARD) */
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
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                    </svg>
                    {currentBus.type}
                  </span>

                  {/* PASSENGER GPS TRACKING ENABLER */}
                  {currentBus.tracking_mode === 'auto' && (
                    <div className="mt-4 pt-3 border-t border-gray-100 flex justify-center">
                      <button
                        onClick={() => setTrackingBusId(trackingBusId === currentBus.id ? null : currentBus.id)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                          trackingBusId === currentBus.id
                            ? "bg-red-100 text-red-600 border border-red-200"
                            : "bg-sky-100 text-sky-600 border border-sky-200 hover:bg-sky-200"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${trackingBusId === currentBus.id ? "bg-red-500 animate-ping" : "bg-sky-500"}`}></span>
                        {trackingBusId === currentBus.id ? "Stop My Tracking" : "I'm on this bus (Share GPS)"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Dynamic Pagination Dots */}
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

          {/* Route Direction Title Card */}
          {currentBus && (
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center font-semibold text-gray-800 mb-6 border border-gray-100/50 relative">
              {currentBus.direction}
              {currentBus.is_full && (
                <div className="mt-1 text-xs text-red-500 font-bold animate-pulse">⚠️ BUS REPORTED FULL</div>
              )}
            </div>
          )}

          {/* 3. Timeline Section (Always visible by default!) */}
          <div className="flex-1 px-4 relative mb-6">
            <div className="absolute left-[29px] top-4 bottom-4 w-[2px] bg-gray-200 -z-0"></div>

            <div className="flex flex-col gap-6 relative z-10">
              {orderedStagesList.map((stage, idx) => {
                const isPassed = currentBus ? idx < currentStageIndex : false;
                const isCurrent = currentBus ? idx === currentStageIndex : false;
                const currentWaitCount = activeDirectionCounts[stage.name] || 0;

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
            {isCoordinator && currentBus ? (
              /* Coordinator Bottom Actions */
              <div className="flex flex-col gap-3 w-full">
                
                {/* Toggle Capacity Button */}
                <button 
                  onClick={handleToggleFull}
                  className={`w-full py-4 font-bold rounded-2xl transition active:scale-[0.98] text-center shadow-md ${
                    currentBus.is_full 
                      ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/10" 
                      : "bg-white border border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  {currentBus.is_full ? "Mark As Available" : "Mark As Full"}
                </button>

                {/* Clear Waitlist Button */}
                <button
                  onClick={handleClearWaitlistManual}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition text-white font-bold rounded-2xl shadow-md text-center"
                >
                  🧹 Clear Active Waitlist
                </button>

              </div>
            ) : (
              /* Student Controls (or Coordinator when no bus online) */
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
      ) : (
        /* ==================== TAB 2: STATIC SCHEDULE ==================== */
        <div className="flex-1 flex flex-col gap-5 overflow-y-auto max-h-[75vh] px-1 pb-4">
          
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/50">
            <h3 className="font-bold text-gray-800 text-base mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Valley Road Campus ➔ Main Campus
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
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Main Campus ➔ Valley Road Campus
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
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Fare & Bus Pass Rules
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

      {/* Subtle Role Switch Footer */}
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