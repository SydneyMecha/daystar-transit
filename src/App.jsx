import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// Import Modular Components
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

  // Filter and SORT buses (Buses closest to Athi River are placed first)
  const visibleBuses = isCoordinator 
    ? buses 
    : buses.filter(b => b.is_active).sort((a, b) => {
        const stageA = stages.find(s => s.id === a.current_stage_id);
        const stageB = stages.find(s => s.id === b.current_stage_id);
        if (!stageA || !stageB) return 0;

        const remainingA = a.direction.startsWith("Valley Road") 
          ? (21 - stageA.sequence_order) 
          : (stageA.sequence_order - 1);

        const remainingB = b.direction.startsWith("Valley Road") 
          ? (21 - stageB.sequence_order) 
          : (stageB.sequence_order - 1);

        return remainingA - remainingB; // Sort closest first
      });

  const currentBus = visibleBuses[currentBusIndex] || null;

  useEffect(() => {
    if (currentBusIndex >= visibleBuses.length && visibleBuses.length > 0) {
      setCurrentBusIndex(0);
    }
  }, [visibleBuses, currentBusIndex]);

  useEffect(() => {
    fetchInitialData();

    // Subscribe to DB updates in real-time
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
      // UPDATE: Intercept announcement changes and trigger native notification if marked as push
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, (payload) => {
        fetchAnnouncement();
        
        // If a new announcement is inserted and has send_push enabled, trigger a native device alert
        if (
          payload.eventType === 'INSERT' && 
          payload.new.is_active && 
          payload.new.send_push
        ) {
          sendSystemNotification("Daystar Transit Alert", payload.new.message);
        }
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
      cutoffTime = `${todayStr}T19:00:00`;
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

  // SYSTEM NOTIFICATIONS TRIGGER
  const sendSystemNotification = (title, body) => {
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/logo.png" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body, icon: "/logo.png" });
        }
      });
    }
  };

  // AUTOMATED GPS TRACKING & GEOFENCING WITH ANTI-SPOOFING
  const startGpsTracking = (busId) => {
    if (watchIdRef.current) return;

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      setTrackingBusId(null);
      return;
    }

    // Trigger Notification permission prompt
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
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
            sendSystemNotification("Transit Tracker Error", "Location tracking lost. Please keep your browser open.");
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
    return true; // Bypass active. Anyone can start tracking.
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

        // 1. Build updated bus JSONB object independently
        const passedStages = { ...targetBus.passed_stages };
        passedStages[stage.id] = timeString;

        // Optimistically update database
        await supabase.from('buses').update({ 
          current_stage_id: stage.id,
          passed_stages: passedStages
        }).eq('id', busId);

        // Auto-stop tracking if the bus reaches the final destination
        if (i === ordered.length - 1) {
          // Clear watch FIRST to prevent duplicate alerts
          if (watchIdRef.current) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          setTrackingBusId(null);
          sendSystemNotification("Arrived!", "🎉 You have arrived at your destination! Tracking has stopped.");
          alert("🎉 You have arrived at your destination! Tracking has stopped.");
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

  // COORDINATOR ACTIONS (Optimistic state updates fully implemented)
  const handleUpdateStage = async (stageId) => {
    if (!currentBus) return;
    if (currentBus.tracking_mode === 'auto') return;

    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();

    // 1. Build local isolated passed times JSONB map
    const passedStages = { ...currentBus.passed_stages };
    passedStages[stageId] = timeString;

    // OPTIMISTICALLY update buses locally for zero-lag response
    setBuses(prevBuses => prevBuses.map(b => 
      b.id === currentBus.id ? { ...b, current_stage_id: stageId, passed_stages: passedStages } : b
    ));

    const { error: busError } = await supabase
      .from('buses')
      .update({ 
        current_stage_id: stageId,
        passed_stages: passedStages
      })
      .eq('id', currentBus.id);

    if (busError) console.error("Error moving bus:", busError);
  };

  const handleToggleFull = async () => {
    if (!currentBus) return;

    setBuses(prevBuses => prevBuses.map(b => 
      b.id === currentBus.id ? { ...b, is_full: !b.is_full } : b
    ));

    const { error } = await supabase
      .from('buses')
      .update({ is_full: !currentBus.is_full })
      .eq('id', currentBus.id);

    if (error) console.error("Error toggling capacity status:", error);
  };

  const handleUpdateDirection = async (newDirection) => {
    if (!currentBus) return;
    const defaultStageId = newDirection.startsWith("Valley Road") ? 1 : stages.length;

    setBuses(prevBuses => prevBuses.map(b => 
      b.id === currentBus.id ? { ...b, direction: newDirection, current_stage_id: defaultStageId, is_full: false, passed_stages: {} } : b
    ));

    const { error: busError } = await supabase
      .from('buses')
      .update({ 
        direction: newDirection,
        current_stage_id: defaultStageId,
        is_full: false,
        passed_stages: {} // Reset JSONB timeline for new trip
      })
      .eq('id', currentBus.id);

    if (busError) {
      console.error("Error updating direction:", busError);
    }
  };

  const handleToggleActive = async () => {
    if (!currentBus) return;

    setBuses(prevBuses => prevBuses.map(b => 
      b.id === currentBus.id ? { ...b, is_active: !b.is_active } : b
    ));

    const { error } = await supabase
      .from('buses')
      .update({ is_active: !currentBus.is_active })
      .eq('id', currentBus.id);

    if (error) console.error("Error toggling active status:", error);
  };

  const handleUpdateTrackingMode = async (mode) => {
    if (!currentBus) return;

    setBuses(prevBuses => prevBuses.map(b => 
      b.id === currentBus.id ? { ...b, tracking_mode: mode } : b
    ));

    const { error } = await supabase
      .from('buses')
      .update({ tracking_mode: mode })
      .eq('id', currentBus.id);

    if (error) console.error("Error updating tracking mode:", error);
  };

  const handleClearWaitlistManual = async () => {
    const confirmClear = window.confirm("Are you sure you want to clear the entire passenger waitlist now?");
    if (!confirmClear) return;

    setWaitCounts({});

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
      <AnnouncementBanner announcement={announcement} />

      {activeTab === "tracker" ? (
        /* ==================== TAB 1: LIVE TRACKER ==================== */
        <>
          {isCoordinator ? (
            /* ================= COORDINATOR CONTROL PANEL ================= */
            <CoordinatorPanel 
              buses={buses}
              currentBusIndex={currentBusIndex}
              setCurrentBusIndex={setCurrentBusIndex}
              currentBus={currentBus}
              handleUpdateDirection={handleUpdateDirection}
              handleToggleActive={handleToggleActive}
              handleUpdateTrackingMode={handleUpdateTrackingMode}
            />
          ) : (
            /* ================= PASSENGER SYSTEM VIEW ================= */
            <HeaderCard 
              currentBus={currentBus}
              currentBusIndex={currentBusIndex}
              visibleBusesLength={visibleBuses.length}
              setCurrentBusIndex={setCurrentBusIndex}
              trackingBusId={trackingBusId}
              handleToggleTracking={setTrackingBusId}
            />
          )}

          {/* Dynamic Timeline Section */}
          <Timeline 
            orderedStagesList={orderedStagesList}
            currentStageIndex={currentStageIndex}
            activeDirectionCounts={activeDirectionCounts}
            isCoordinator={isCoordinator}
            currentBus={currentBus}
            handleUpdateStage={handleUpdateStage}
          />

          {/* Bottom Action Area */}
          <ActionArea 
            isCoordinator={isCoordinator}
            currentBus={currentBus}
            userState={userState}
            setUserState={setUserState}
            selectedStop={selectedStop}
            setSelectedStop={setSelectedStop}
            orderedStagesList={orderedStagesList}
            currentStageIndex={currentStageIndex}
            handleMarkAsWaiting={handleMarkAsWaiting}
            handleCancel={handleCancel}
            handleBoarded={handleBoarded}
            handleClearWaitlistManual={handleClearWaitlistManual}
            handleToggleFull={handleToggleFull}
          />
        </>
      ) : (
        /* ==================== TAB 2: STATIC SCHEDULE ==================== */
        <ScheduleTab />
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