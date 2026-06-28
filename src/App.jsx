import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

import AnnouncementBanner from './components/AnnouncementBanner';
import HeaderCard from './components/HeaderCard';
import Timeline from './components/Timeline';
import ActionArea from './components/ActionArea';
import ScheduleTab from './components/ScheduleTab';

// Cross-compatible mobile UUID generator
const generateSafeUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [buses, setBuses] = useState([]);
  const [currentBusIndex, setCurrentBusIndex] = useState(0);
  const [stages, setStages] = useState([]);
  const [waitCounts, setWaitCounts] = useState({});
  const [announcement, setAnnouncement] = useState(null);
  const [whatsAppBusSelection, setWhatsAppBusSelection] = useState("Daystar Bus");
  
  // Real-time On-Screen GPS Staging Debugger
  const [liveCoords, setLiveCoords] = useState({ lat: null, lng: null, status: "Offline" });

  // App Navigation & Roles
  const [activeTab, setActiveTab] = useState("tracker");
  const [isCoordinator, setIsCoordinator] = useState(false);

  // Dynamic WhatsApp Modal States (stages dropdown + custom text input)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppStageSelection, setWhatsAppStageSelection] = useState("Valley Road Campus");
  const [customStageText, setCustomStageText] = useState("");

  // DEVICE-LOCKED SESSION ID (Self-healing UUID)
  const [myClientId] = useState(() => {
    const savedId = localStorage.getItem('transit_client_id');
    if (savedId && savedId !== 'null' && savedId !== 'undefined' && savedId.length === 36) {
      return savedId;
    }
    const newId = generateSafeUUID();
    localStorage.setItem('transit_client_id', newId);
    return newId;
  });

  // Student interaction states
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
    return (id && id !== 'null' && id !== 'undefined') ? id : null;
  });
  const [trackingBusType, setTrackingBusType] = useState(() => {
    return localStorage.getItem('transit_tracking_bus_type') || null;
  });

  const intervalIdRef = useRef(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err =>
        console.error('SW registration failed:', err)
      );
    }
  }, []);

  // ============================================
  // ON-DEVICE DEBUG CONSOLE (temporary testing tool)
  // Visible only with ?debug=1 in the URL — never shown to normal users.
  // Remove this whole block once background/notification testing is done.
  // ============================================
  useEffect(() => {
    const isDebugMode = new URLSearchParams(window.location.search).get('debug') === '1';
    if (!isDebugMode) return;

    // Avoid loading it twice if this effect re-runs
    if (window.eruda) return;

    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/eruda";
    script.onload = () => {
      window.eruda.init();
      console.log("🐛 Debug console loaded — drag the floating icon to move it.");
    };
    document.body.appendChild(script);
  }, []);

  // CLUSTERING ALGORITHM: Group active student tracking sessions by (bus_type + current_stage_id)
  const getMergedActiveBuses = () => {
    const nowStr = new Date(Date.now() - 1200000).toISOString(); // 20 minutes stale timeout
    const active = buses.filter(s => s.updated_at >= nowStr);

    const merged = [];
    active.forEach(session => {
      const existing = merged.find(b => b.bus_type === session.bus_type && Number(b.current_stage_id) === Number(session.current_stage_id));
      
      if (existing) {
        existing.passed_stages = { ...existing.passed_stages, ...session.passed_stages };
        existing.tracker_count += 1;
      } else {
        merged.push({
          id: session.id,
          bus_type: session.bus_type,
          direction: session.direction,
          current_stage_id: session.current_stage_id,
          passed_stages: session.passed_stages,
          is_full: session.is_full,
          tracker_count: 1
        });
      }
    });

    // SORT CARDS: Closest to Athi River (highest index in route direction) appears first
    return merged.sort((a, b) => {
      const stageA = stages.find(s => Number(s.id) === Number(a.current_stage_id));
      const stageB = stages.find(s => Number(s.id) === Number(b.current_stage_id));
      if (!stageA || !stageB) return 0;
      
      const isReverseA = a.direction.startsWith("Athi River");
      const orderedA = isReverseA ? [...stages].reverse() : stages;
      const idxA = orderedA.findIndex(s => Number(s.id) === Number(a.current_stage_id));

      const isReverseB = b.direction.startsWith("Athi River");
      const orderedB = isReverseB ? [...stages].reverse() : stages;
      const idxB = orderedB.findIndex(s => Number(s.id) === Number(b.current_stage_id));

      return idxB - idxA;
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
      stopGpsTrackingInterval();
    };
  }, []);

  // Handle active GPS interval triggers
  useEffect(() => {
    if (trackingBusId) {
      localStorage.setItem('transit_tracking_bus_id', trackingBusId);
      if (trackingBusType) localStorage.setItem('transit_tracking_bus_type', trackingBusType);
      startGpsTrackingInterval();
    } else {
      localStorage.removeItem('transit_tracking_bus_id');
      localStorage.removeItem('transit_tracking_bus_type');
      stopGpsTrackingInterval();
      setLiveCoords({ lat: null, lng: null, status: "Offline" });
    }
  }, [trackingBusId, trackingBusType, buses, stages]);

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
    await clearOldWaitlistRecords();
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
      .select('*');
    
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
  const sendSystemNotification = async (title, body) => {
    if (!("Notification" in window)) {
      console.warn("Notifications unsupported on this browser.");
      return false;
    }
    if (Notification.permission !== "granted") {
      console.warn(`Notification skipped — permission is "${Notification.permission}".`);
      return false;
    }
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, { body, icon: "/logo.png" });
        console.log("✅ Notification shown via service worker");
        return true;
      } else {
        // Fallback for browsers without SW support (rare, mostly older desktop)
        new Notification(title, { body, icon: "/logo.png" });
        return true;
      }
    } catch (err) {
      console.error("Notification failed to fire:", err);
      return false;
    }
  };

  // SURFACE NOTIFICATION STATUS
  const [notificationStatus, setNotificationStatus] = useState("default");

  useEffect(() => {
    if (!("Notification" in window)) setNotificationStatus("unsupported");
    else setNotificationStatus(Notification.permission);
  }, []);

  // RELIABLE 10-SECOND GPS PULLING LOOP
  const startGpsTrackingInterval = () => {
    if (intervalIdRef.current) return;

    setLiveCoords(prev => ({ ...prev, status: "Initiating lock..." }));
    requestWakeLock();
    pullCurrentLocation();

    intervalIdRef.current = setInterval(() => {
      pullCurrentLocation();
    }, 10000);
  };

  const stopGpsTrackingInterval = () => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    releaseWakeLock(); 
  };

  const pullCurrentLocation = (isRetry = false) => {
    if (!navigator.geolocation) return;
    console.log(`📡 Requesting GPS position${isRetry ? ' (retry, relaxed accuracy)' : ''}...`);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log(`✅ GPS got: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`);
        setLiveCoords({ lat: latitude.toFixed(5), lng: longitude.toFixed(5), status: `Active (±${Math.round(accuracy)}m)` });
        evaluateGeofenceArrival(myClientId, latitude, longitude);
      },
      (err) => {
        console.error("GPS pulling error:", err);
        if (err.code === 3 && !isRetry) {
          // Timeout — retry once with relaxed settings instead of just giving up
          navigator.geolocation.getCurrentPosition(
            (position) => pullCurrentLocation.successHandler?.(position), // see note below
            (retryErr) => {
              console.error("GPS retry also failed:", retryErr);
              setLiveCoords(prev => ({ ...prev, status: `Error: ${retryErr.message}` }));
            },
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 }
          );
        } else {
          setLiveCoords(prev => ({ ...prev, status: `Error: ${err.message}` }));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
    const targetSession = buses.find(s => s.id === sessionId);
    if (!targetSession) return;

    const isReverse = targetSession.direction.startsWith("Athi River");
    const ordered = isReverse ? [...stages].reverse() : stages;
    
    // Wrap id comparisons in Number() to prevent database String-to-Number equality blocks
    const currentIdx = ordered.findIndex(s => Number(s.id) === Number(targetSession.current_stage_id));

    for (let i = currentIdx + 1; i < ordered.length; i++) {
      const stage = ordered[i];
      if (!stage || !stage.latitude || !stage.longitude) continue;

      const distance = calculateDistance(userLat, userLng, stage.latitude, stage.longitude);

      if (distance < 300) {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();

        const passedStages = { ...targetSession.passed_stages };
        passedStages[stage.id] = timeString;

        // Push update of our specific device tracking session to database
        const { error } = await supabase
          .from('tracking_sessions')
          .update({ 
            current_stage_id: stage.id,
            passed_stages: passedStages,
            updated_at: new Date().toISOString()
          })
          .eq('id', sessionId);

        if (i === ordered.length - 1) {
          stopGpsTrackingInterval();
          setTrackingBusId(null);
          setTrackingBusType(null);
          
          sendSystemNotification("Arrived!", "🎉 You have arrived at your destination! Tracking has stopped.");
        }
        break;
      }
    }
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

    if (error) {
      console.error("Error joining queue:", error);
      alert("Error joining queue: " + error.message);
    } else {
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

  // NEW DYNAMIC SESSIONS CONTROLLER
  const handleStartTrackingSession = async (busType, direction) => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    const defaultStageId = direction.startsWith("Valley Road") ? 1 : stages.length;

    const { data, error } = await supabase
      .from('tracking_sessions')
      .upsert([{
        id: myClientId, 
        bus_type: busType,
        direction: direction,
        current_stage_id: defaultStageId,
        passed_stages: {},
        is_full: false,
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error("Error starting tracking session:", error);
      alert("Database Write Error: " + error.message); 
    } else {
      // OPTIMISTIC UPDATE: Update buses locally for immediate modal/GPS startup sync
      setBuses(prevBuses => {
        const filtered = prevBuses.filter(b => b.id !== data.id);
        return [...filtered, data];
      });
      setTrackingBusId(data.id); 
      setTrackingBusType(data.bus_type);
    }
  };

  const handleStopTrackingSession = async () => {
    const { error } = await supabase
      .from('tracking_sessions')
      .delete()
      .eq('id', myClientId);

    if (error) {
      console.error("Error stopping session:", error);
    } else {
      setTrackingBusId(null); 
      setTrackingBusType(null);
    }
  };

  const handleToggleFullSession = async () => {
    if (!currentBus) return;
    const { error } = await supabase
      .from('tracking_sessions')
      .update({ is_full: !currentBus.is_full })
      .eq('id', currentBus.id);

    if (error) console.error("Error toggling capacity status:", error);
  };

  const handleShareToWhatsApp = () => {
    const finalStage = customStageText.trim() ? customStageText.trim() : whatsAppStageSelection;
    const appUrl = window.location.origin;
    const busBrand = whatsAppBusSelection;

    const curatedText = `I’m currently waiting at *${finalStage}*.\n\nIf anyone is on the *${busBrand}*, please open this link and click 'Share GPS' so we know how close you are! 🙏\n\nLink: ${appUrl}`;

    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      window.location.href = `whatsapp://send?text=${encodeURIComponent(curatedText)}`;
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(curatedText)}`, '_blank');
    }

    setShowWhatsAppModal(false);
    setCustomStageText("");
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
  const currentStageIndex = orderedStagesList.findIndex(s => Number(s.id) === Number(currentBus?.current_stage_id));
  const activeDirectionCounts = currentBus ? (waitCounts[currentBus.direction] || {}) : waitCounts['Valley Road ➔ Athi River'] || {};

  // Stop the screen from auto-locking while tracking
  const wakeLockRef = useRef(null);

  const requestWakeLock = async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch (err) {
      console.warn("Wake Lock request failed:", err.message);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  const hiddenTimerRef = useRef(null);
  const wasPausedRef = useRef(false);

  // Detect tab-switch / minimize / lock screen, and alert on it
  useEffect(() => {
  const handleVisibilityChange = () => {
    const hidden = document.visibilityState === "hidden";
    console.log(`👁️ Visibility changed → ${hidden ? "HIDDEN" : "VISIBLE"} (trackingBusId: ${trackingBusId})`);

    if (!trackingBusId) return;

    if (hidden) {
      // Don't notify immediately — wait to see if they come right back
      hiddenTimerRef.current = setTimeout(() => {
        setLiveCoords(prev => ({ ...prev, status: "Paused — tab not active" }));
        sendSystemNotification(
          "⚠️ Location sharing paused",
          "You switched away or locked your screen. Reopen this tab to keep sharing your GPS."
        );
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        wasPausedRef.current = true;
      }, 10000); // only fires if still hidden after 10s
    } else {
      // Cancel the pending "paused" notification if they came back quickly
      if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }

      requestWakeLock();
      pullCurrentLocation();

      // Only send a "you're back" notification if we'd actually told them they were paused
      if (wasPausedRef.current) {
        setLiveCoords(prev => ({ ...prev, status: "Resuming..." }));
        sendSystemNotification("📍 You're back", "Location sharing has resumed.");
        wasPausedRef.current = false;
      }
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
  };
}, [trackingBusId]);

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#F7F7F7] flex flex-col justify-between p-4 shadow-md pb-8 relative">
      
      {/* Role Toggle Header Indicator */}
      <div className="text-center mb-3">
        <span className="text-[12px] tracking-wider font-bold text-gray-500 bg-gray-200/50 px-3 py-1 rounded-full flex items-center justify-center gap-1.5 w-max mx-auto">
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

      {/* SURFACE NOTIFICATON STATUS */}
      {notificationStatus !== "granted" && trackingBusId && (
        <p className="text-[11px] text-amber-600 text-center mt-1">
          {notificationStatus === "unsupported"
            ? "🔕 Alerts aren't supported on this browser — keep this tab open and visible."
            : "🔕 Notifications are off. Enable them to get arrival/background alerts."}
        </p>
      )}

      {activeTab === "tracker" ? (
        /* ==================== TAB 1: LIVE TRACKER ==================== */
        <>
          <HeaderCard 
            currentBus={currentBus}
            currentBusIndex={currentBusIndex}
            visibleBusesLength={visibleBuses.length}
            setCurrentBusIndex={setCurrentBusIndex}
            trackingBusId={trackingBusId}
            trackingBusType={trackingBusType} 
            onOpenTrackingModal={handleStartTrackingSession} 
            handleStopTracking={handleStopTrackingSession}
            onOpenWhatsAppModal={() => {
              const defaultStageName = currentBus ? (stages.find(s => Number(s.id) === Number(currentBus?.current_stage_id))?.name) : stages[0]?.name;
              setWhatsAppStageSelection(defaultStageName || "Valley Road Campus");
              setShowWhatsAppModal(true);
            }}
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

      {/* DYNAMIC WHATSAPP STAGE SELECTOR MODAL OVERLAY */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-xl border border-gray-100 flex flex-col gap-4">
            
            {/* Header Icon & Text */}
            <div className="text-center">
              <h4 className="font-bold text-gray-800 text-base mb-1">Set Your Location</h4>
              <p className="text-xs text-gray-400 leading-relaxed max-w-[280px] mx-auto">
                Select or type where you are waiting so riders on board know who is asking for GPS tracking.
              </p>
            </div>
            
            <div className="flex flex-col gap-4 text-left my-2">
              <div>
                <label className="text-[12px] font-bold tracking-wider text-gray-400 block mb-1.5">Select your stage</label>
                <select 
                  value={whatsAppStageSelection} 
                  onChange={(e) => setWhatsAppStageSelection(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 p-3.5 rounded-2xl outline-none font-bold text-gray-700 text-xs cursor-pointer focus:border-sky-400 focus:bg-white transition-all"
                >
                  {stages.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-bold tracking-wider text-gray-400 block mb-1.5">Or type your stage</label>
                <input 
                  type="text" 
                  value={customStageText}
                  onChange={(e) => setCustomStageText(e.target.value)}
                  placeholder="Pickup point"
                  className="w-full bg-gray-50 border border-gray-200 p-3.5 rounded-2xl outline-none font-semibold text-gray-700 text-xs placeholder-gray-400 focus:border-sky-400 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-[12px] font-bold tracking-wider text-gray-400 block mb-1.5">Which bus are you waiting for?</label>
                <select 
                  value={whatsAppBusSelection} 
                  onChange={(e) => setWhatsAppBusSelection(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 p-3.5 rounded-2xl outline-none font-bold text-gray-700 text-xs cursor-pointer focus:border-sky-400 focus:bg-white transition-all"
                >
                  <option value="Daystar Bus">Daystar Bus (Bus Pass)</option>
                  <option value="Jambostar Bus">Jambostar Bus (Cash)</option>
                </select>
              </div>
            </div>

            {/* Bottom Buttons Action Row */}
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowWhatsAppModal(false); setCustomStageText(""); }}
                className="flex-1 py-3.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-2xl text-xs transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleShareToWhatsApp}
                className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 transition active:scale-[0.98]"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.042-4.03-3.582 8-9-8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Share on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}