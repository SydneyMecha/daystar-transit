import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// Import Modular Components
import AnnouncementBanner from './components/AnnouncementBanner';
import HeaderCard from './components/HeaderCard';
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

  // GPS Crowdsourced Tracker State (FIXED: Removed parseInt to support UUID strings safely)
  const [trackingBusId, setTrackingBusId] = useState(() => {
    const id = localStorage.getItem('transit_tracking_bus_id');
    return (id && id !== 'null' && id !== 'undefined') ? id : null;
  });
  const watchIdRef = useRef(null);

  // CLUSTERING ALGORITHM: Group active student tracking sessions by (bus_type + current_stage_id)
  const getMergedActiveBuses = () => {
    const nowStr = new Date(Date.now() - 120000).toISOString(); // 2 minutes stale timeout
    const active = buses.filter(s => s.updated_at >= nowStr);

    const merged = [];
    active.forEach(session => {
      const existing = merged.find(b => b.bus_type === session.bus_type && b.current_stage_id === session.current_stage_id);
      
      if (existing) {
        existing.passed_stages = { ...existing.passed_stages, ...session.passed_stages };
      } else {
        merged.push({
          id: session.id, // Primary session ID
          bus_type: session.bus_type,
          direction: session.direction,
          current_stage_id: session.current_stage_id,
          passed_stages: session.passed_stages,
          is_full: session.is_full
        });
      }
    });

    // SORT CARDS: Closest to Athi River (highest index in route direction) appears first
    return merged.sort((a, b) => {
      const stageA = stages.find(s => s.id === a.current_stage_id);
      const stageB = stages.find(s => s.id === b.current_stage_id);
      if (!stageA || !stageB) return 0;
      
      const isReverseA = a.direction.startsWith("Athi River");
      const orderedA = isReverseA ? [...stages].reverse() : stages;
      const idxA = orderedA.findIndex(s => s.id === a.current_stage_id);

      const isReverseB = b.direction.startsWith("Athi River");
      const orderedB = isReverseB ? [...stages].reverse() : stages;
      const idxB = orderedB.findIndex(s => s.id === b.current_stage_id);

      return idxB - idxA; // Closest first
    });
  };

  const visibleBuses = getMergedActiveBuses();
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracking_sessions' }, () => {
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
    await clearOldWaitlistRecords(); // Perform shift-based cleanup
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
    
    let cutoffTime = null;
    if (currentHour >= 9 && currentHour < 19) {
      const boundaryDate = new Date();
      boundaryDate.setHours(9, 0, 0, 0); 
      cutoffTime = boundaryDate.toISOString();
    } else {
      const boundaryDate = new Date();
      if (currentHour < 9) {
        boundaryDate.setDate(boundaryDate.getDate() - 1);
      }
      boundaryDate.setHours(19, 0, 0, 0); 
      cutoffTime = boundaryDate.toISOString();
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
      .from('tracking_sessions')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) console.error("Error fetching tracking sessions:", error);
    else setBuses(data || []);
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

  // SYSTEM NOTIFICATIONS
  const sendSystemNotification = (title, body) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/logo.png" });
    }
  };

  // AUTOMATED GPS TRACKING & GEOFENCING
  const startGpsTracking = (sessionId) => {
    if (watchIdRef.current) return;

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      setTrackingBusId(null);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        evaluateGeofenceArrival(sessionId, lat, lng);
      },
      (err) => {
        console.error("Tracking watch error:", err);
        sendSystemNotification("Transit Tracker Error", "Location tracking lost. Please keep your browser open.");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
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

  const evaluateGeofenceArrival = async (sessionId, userLat, userLng) => {
    const targetSession = sessions.find(s => s.id === sessionId);
    if (!targetSession) return;

    const isReverse = targetSession.direction.startsWith("Athi River");
    const ordered = isReverse ? [...stages].reverse() : stages;
    const currentIdx = ordered.findIndex(s => s.id === targetSession.current_stage_id);

    for (let i = currentIdx + 1; i < ordered.length; i++) {
      const stage = ordered[i];
      if (!stage || !stage.latitude || !stage.longitude) continue;

      const distance = calculateDistance(userLat, userLng, stage.latitude, stage.longitude);

      if (distance < 300) { // Within 300 meters
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();

        const passedStages = { ...targetSession.passed_stages };
        passedStages[stage.id] = timeString;

        // Push update of student's active tracking session to database
        await supabase
          .from('tracking_sessions')
          .update({ 
            current_stage_id: stage.id,
            passed_stages: passedStages,
            updated_at: new Date().toISOString()
          })
          .eq('id', sessionId);

        if (i === ordered.length - 1) {
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

  // Anti-Spoofing: Bypassed on trust for MVP / Testing purposes
  const evaluateTrackEligibility = (busId, userLat, userLng) => {
    return true; 
  };

  // STUDENT ACTIONS
  const handleMarkAsWaiting = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

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

  // NEW DYNAMIC SESSIONS CONTROLLER (P2P Activation - FIXED state setters)
  const handleStartTrackingSession = async (busType, direction) => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    const defaultStageId = direction.startsWith("Valley Road") ? 1 : stages.length;

    const { data, error } = await supabase
      .from('tracking_sessions')
      .insert([{
        bus_type: busType,
        direction: direction,
        current_stage_id: defaultStageId,
        passed_stages: {},
        is_full: false
      }])
      .select()
      .single();

    if (error) {
      console.error("Error starting tracking session:", error);
    } else {
      setTrackingBusId(data.id); // FIXED: Corrected state setter variable name
    }
  };

  const handleStopTrackingSession = () => {
    setTrackingBusId(null); // FIXED: Corrected state setter variable name
  };

  const handleToggleFullSession = async () => {
    if (!currentBus) return;
    const { error } = await supabase
      .from('tracking_sessions')
      .update({ is_full: !currentBus.is_full })
      .eq('id', currentBus.id);

    if (error) console.error("Error toggling capacity status:", error);
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
          🎓 Passenger Mode
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
          <HeaderCard 
            currentBus={currentBus}
            currentBusIndex={currentBusIndex}
            visibleBusesLength={visibleBuses.length}
            setCurrentBusIndex={setCurrentBusIndex}
            trackingBusId={trackingBusId}
            onOpenTrackingModal={handleStartTrackingSession} // FIXED: Passes correct global function
            handleStopTracking={handleStopTrackingSession}
          />

          {/* Dynamic Timeline Section */}
          <Timeline 
            orderedStagesList={orderedStagesList}
            currentStageIndex={currentStageIndex}
            activeDirectionCounts={activeDirectionCounts}
            isCoordinator={false}
            currentBus={currentBus}
            handleUpdateStage={() => {}}
          />

          {/* Bottom Action Area */}
          <ActionArea 
            isCoordinator={false}
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
            handleClearWaitlistManual={() => {}}
            handleToggleFull={handleToggleFullSession}
          />
        </>
      ) : (
        /* ==================== TAB 2: STATIC SCHEDULE ==================== */
        <ScheduleTab />
      )}
    </div>
  );
}