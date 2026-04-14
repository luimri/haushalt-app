'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import {
  getSuggestedTasks,
  getTasksWithStatus,
  getActivityByDay,
  getRooms,
  createSession,
  completeTask,
  uncompleteTask,
  completeSession,
  type TaskWithStatus,
  type Room,
} from '@/lib/tasks';

const ROOM_FALLBACK: Room[] = [
  { id: 'bad',          key: 'bad',          name: 'Bad',          color: '#D8E6EF', sort_order: 1, is_active: true },
  { id: 'flur',         key: 'flur',         name: 'Flur',         color: '#E8E4DC', sort_order: 2, is_active: true },
  { id: 'küche',        key: 'küche',        name: 'Küche',        color: '#EFE4D2', sort_order: 3, is_active: true },
  { id: 'wohnzimmer',   key: 'wohnzimmer',   name: 'Wohnzimmer',   color: '#E4DCEF', sort_order: 4, is_active: true },
  { id: 'schlafzimmer', key: 'schlafzimmer', name: 'Schlafzimmer', color: '#D8EBDF', sort_order: 5, is_active: true },
];

// ─── Design tokens ───────────────────────────────────────────────────────────

const URGENCY_COLOR = { rot: '#C4856E', gelb: '#D4A056', grün: '#7DAF78' } as const;

// ─── Completion ring constants ────────────────────────────────────────────────

const COMP_R    = 50;
const COMP_CIRC = 2 * Math.PI * COMP_R; // ≈ 314.2

// ─── Motivating phrases ───────────────────────────────────────────────────────

const PHRASES = [
  "Das war's für heute. 🌿",
  "Gut gemacht. 🌿",
  "Schön erledigt. 🌿",
  "Dein Zuhause dankt dir. 🌿",
  "Eine Sitzung reicher. 🌿",
];

// ─── Timer ring constants ─────────────────────────────────────────────────────

const SZ  = 200;           // SVG width/height
const CR  = 82;            // ring radius
const SW  = 7;             // stroke width
const CIRC = 2 * Math.PI * CR;
const INSET = Math.ceil(SZ / 2 - CR + SW / 2) + 2; // distance from SVG edge to ring's inner edge

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roomKey(room: string) {
  return room.toLowerCase().trim();
}

function roomColor(rooms: Room[], room: string): string {
  return rooms.find(r => r.key === roomKey(room))?.color ?? '#EDE7DF';
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UrgencyDot({ urgency, size = 8 }: { urgency: keyof typeof URGENCY_COLOR; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: URGENCY_COLOR[urgency],
    }} />
  );
}

function RoomPill({ room, rooms }: { room: string; rooms: Room[] }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color: '#7A726C',
      background: roomColor(rooms, room), borderRadius: 8, padding: '2px 7px',
      flexShrink: 0,
    }}>
      {rooms.find(r => r.key === roomKey(room))?.name ?? room}
    </span>
  );
}

function Checkbox({
  checked, onToggle, size = 28, accent = false,
}: {
  checked: boolean; onToggle: () => void; size?: number; accent?: boolean;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        cursor: 'pointer',
        background: checked ? (accent ? '#C4856E' : '#7DAF78') : '#EDE7DF',
        boxShadow: checked
          ? (accent ? '0 2px 8px #E8C4A8' : '0 2px 8px #90C48A')
          : '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s ease',
      }}
    >
      {checked && (
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 14 14" fill="none">
          <polyline points="2,7 6,11 12,3" stroke="#FAF7F2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// ─── Session content ──────────────────────────────────────────────────────────

function SessionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const minutes    = Math.max(1, parseInt(searchParams.get('minutes') ?? '30', 10));
  const isOneTask  = searchParams.get('oneTask') === 'true';
  const presetSessionId = searchParams.get('sessionId');

  // ── Data ──
  const [allTasks,  setAllTasks]  = useState<TaskWithStatus[]>([]);
  const [suggested, setSuggested] = useState<TaskWithStatus[]>([]);
  const [rooms,     setRooms]     = useState<Room[]>(ROOM_FALLBACK);
  const [loading,   setLoading]   = useState(true);

  // ── Selection state ──
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set());
  const [footerShake,    setFooterShake]    = useState(false);

  // ── Active session state ──
  const [active,       setActive]       = useState(false);
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [sessionTasks, setSessionTasks] = useState<TaskWithStatus[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [remaining,    setRemaining]    = useState(minutes * 60);
  const [paused,       setPaused]       = useState(false);
  const intervalRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTime         = useRef<number>(0);
  const pauseStartRef            = useRef<number>(0);
  const totalPausedMsRef         = useRef<number>(0);
  const didAutoCompleteRef       = useRef(false);
  const completedTasksForOverlay = useRef<TaskWithStatus[]>([]);
  // Stable refs for use in event listeners (avoid stale closures)
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // ── Completion overlay state ──
  const [showComplete,      setShowComplete]      = useState(false);
  const [completeDone,      setCompleteDone]      = useState(false);
  const [completionRatio,   setCompletionRatio]   = useState(0);
  const [completionElapsed, setCompletionElapsed] = useState(0);
  const [completionCount,   setCompletionCount]   = useState(0);
  const [activity,          setActivity]          = useState<boolean[]>(Array(7).fill(false));
  const [ringVisible,       setRingVisible]       = useState(false);
  const compRingRef = useRef<SVGCircleElement>(null);
  const [phrase,            setPhrase]            = useState('');

  // ── Initial load: fetch tasks + suggestions, pre-select suggestions ──
  const loadTasks = useCallback(async () => {
    // Fast-path: oneTask mode — session already created, skip selection
    if (isOneTask && presetSessionId) {
      const all = await getTasksWithStatus();
      const { data } = await (await import('@/lib/supabase')).supabase
        .from('sessions').select('task_ids').eq('id', presetSessionId).single();
      const taskIds: string[] = data?.task_ids ?? [];
      const tasks = all.filter(t => taskIds.includes(t.id));
      setSessionTasks(tasks);
      setSessionId(presetSessionId);
      setRemaining(minutes * 60);
      sessionStartTime.current = Date.now();
      totalPausedMsRef.current = 0;
      didAutoCompleteRef.current = false;
      completedTasksForOverlay.current = [];
      setActive(true);
      setLoading(false);
      return;
    }
    const [all, sugg, liveRooms] = await Promise.all([
      getTasksWithStatus(),
      getSuggestedTasks(minutes),
      getRooms().catch(() => null),
    ]);
    setAllTasks(all);
    setSuggested(sugg);
    if (liveRooms) setRooms(liveRooms);
    setSelectedIds(new Set(sugg.map(t => t.id)));
    setLoading(false);
  }, [minutes, isOneTask, presetSessionId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // ── Focus re-fetch: refresh allTasks when navigating back (preserves user's selection) ──
  const refreshTasks = useCallback(async () => {
    if (activeRef.current) return; // never disrupt a running session
    const all = await getTasksWithStatus();
    setAllTasks(all);
  }, []);

  useEffect(() => {
    window.addEventListener('focus', refreshTasks);
    return () => window.removeEventListener('focus', refreshTasks);
  }, [refreshTasks]);

  // Fetch activity data and drive ring animation when overlay opens
  useEffect(() => {
    if (!showComplete) {
      setRingVisible(false); // reset for next session
      return;
    }
    getActivityByDay().then(setActivity).catch(() => {});
    const t2 = setTimeout(() => {
      if (compRingRef.current) {
        const el = compRingRef.current;
        const fullCirc = 2 * Math.PI * CR;
        const targetOffset = fullCirc * (1 - completionRatio);
        // Set initial position while still invisible
        el.style.transition = 'none';
        el.style.strokeDasharray = String(fullCirc);
        el.style.strokeDashoffset = String(fullCirc);
        el.getBoundingClientRect();
        // Now make visible and animate to target
        el.style.opacity = '1';
        el.style.strokeLinecap = 'round';
        el.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(0.4,0,0.2,1)';
        el.style.strokeDashoffset = String(targetOffset);
      }
    }, 300);
    const t1 = setTimeout(() => setRingVisible(true), 320);
    // ring fix applied
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [showComplete, completionRatio]);

  useEffect(() => {
    if (showComplete) {
      const t = setTimeout(() => setCompleteDone(true), 2500);
      return () => clearTimeout(t);
    } else {
      setCompleteDone(false);
    }
  }, [showComplete]);

  // ── Timer (wall-clock — survives tab hidden / sleep) ──
  useEffect(() => {
    if (!active) return;

    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      pauseStartRef.current = Date.now(); // record when pause started
      return;
    }

    // Resuming or starting: commit accumulated pause duration
    if (pauseStartRef.current > 0) {
      totalPausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
    }

    const tick = () => {
      const elapsedMs    = Date.now() - sessionStartTime.current - totalPausedMsRef.current;
      const newRemaining = Math.max(0, minutes * 60 - Math.floor(elapsedMs / 1000));
      setRemaining(newRemaining);
    };
    tick(); // snap immediately on start/resume so display is instant
    intervalRef.current = setInterval(tick, 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, paused, minutes]);

  // Snap remaining immediately when tab becomes visible (catches up after sleep/switch)
  useEffect(() => {
    function onVisibilityChange() {
      if (!activeRef.current || pausedRef.current) return;
      const elapsedMs    = Date.now() - sessionStartTime.current - totalPausedMsRef.current;
      const newRemaining = Math.max(0, minutes * 60 - Math.floor(elapsedMs / 1000));
      setRemaining(newRemaining);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [minutes]);

  // ── Handlers ──
  function toggleTask(id: string) {
    // Selecting: enforce max 4, shake footer if limit already hit
    if (!selectedIds.has(id) && selectedIds.size >= 4) {
      setFooterShake(true);
      setTimeout(() => setFooterShake(false), 400);
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleRoom(room: string) {
    setCollapsedRooms(prev => {
      const next = new Set(prev);
      next.has(room) ? next.delete(room) : next.add(room);
      return next;
    });
  }

  async function startSession() {
    const taskIds = Array.from(selectedIds);
    const id = await createSession(minutes, taskIds);
    setSessionId(id);
    setSessionTasks(allTasks.filter(t => selectedIds.has(t.id)));
    setRemaining(minutes * 60);
    sessionStartTime.current         = Date.now();
    totalPausedMsRef.current         = 0;
    pauseStartRef.current            = 0;
    didAutoCompleteRef.current       = false;
    completedTasksForOverlay.current = [];
    setActive(true);
  }

  async function handleToggleTask(taskId: string) {
    if (completedIds.has(taskId)) {
      setCompletedIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
      completedTasksForOverlay.current = completedTasksForOverlay.current.filter(t => t.id !== taskId);
      await uncompleteTask(taskId);
      localStorage.setItem('tasks_updated', Date.now().toString());
    } else {
      setCompletedIds(prev => new Set([...prev, taskId]));
      const task = sessionTasks.find(t => t.id === taskId);
      if (task && !completedTasksForOverlay.current.some(t => t.id === taskId)) {
        completedTasksForOverlay.current = [...completedTasksForOverlay.current, task];
      }
      await completeTask(taskId);
      localStorage.setItem('tasks_updated', Date.now().toString());
    }
  }

  const handleEndSession = useCallback(async () => {
    if (showComplete) return; // guard against double-trigger
    if (sessionId) await completeSession(sessionId);
    router.refresh();
    if (completedIds.size === 0) {
      router.push('/');
      return;
    }
    // Account for any currently-active pause duration
    const pausedSoFar = pauseStartRef.current > 0 ? Date.now() - pauseStartRef.current : 0;
    const elapsed     = (Date.now() - sessionStartTime.current - totalPausedMsRef.current - pausedSoFar) / 1000;
    const ratio       = Math.min(elapsed / (minutes * 60), 1.0);
    setCompletionElapsed(elapsed);
    setCompletionRatio(ratio);
    setCompletionCount(completedIds.size);
    setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    setShowComplete(true);
  }, [showComplete, sessionId, router, minutes, completedIds]);

  // Auto-complete when the wall-clock timer runs out
  useEffect(() => {
    if (active && !showComplete && remaining === 0 && !didAutoCompleteRef.current) {
      didAutoCompleteRef.current = true;
      handleEndSession();
    }
  }, [remaining, active, showComplete, handleEndSession]);

  // ── Derived ──
  const selectedList = allTasks.filter(t => selectedIds.has(t.id));
  const totalMins    = selectedList.reduce((s, t) => s + t.effort, 0);

  const tasksByRoom: Record<string, TaskWithStatus[]> = {};
  for (const t of allTasks) {
    const k = roomKey(t.room);
    (tasksByRoom[k] ??= []).push(t);
  }
  const presentRooms = rooms.map(r => r.key).filter(r => tasksByRoom[r]);

  const ringRatio = remaining / (minutes * 60); // 1 = full, 0 = empty
  const innerSz   = SZ - INSET * 2;

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#EDE7DF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#B8A89E', fontSize: 14 }}>Laden…</span>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STATE 2 — Active session
  // ════════════════════════════════════════════════════════════════════════════

  if (active) {
    return (
      <>
        <div style={{ minHeight: '100vh', background: '#EDE7DF', paddingTop: 30, paddingBottom: 100, paddingLeft: 16, paddingRight: 16 }}>

          {/* Header */}
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#3D3530', margin: 0 }}>Sitzung läuft</h1>
            <p style={{ fontSize: 13, color: '#9B928A', margin: '4px 0 0' }}>
              {minutes} Min · {sessionTasks.length} {sessionTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}
            </p>
          </div>

          {/* Timer card */}
          <div style={{ background: '#EDE7DF', borderRadius: 24, boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA', padding: '28px 18px 22px', marginBottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Ring */}
            <div style={{ position: 'relative', width: SZ, height: SZ, marginBottom: 20 }}>
              <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ position: 'absolute', top: 0, left: 0, zIndex: 2 }}>
                <defs>
                  <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%"   stopColor="#C4856E" />
                    <stop offset="50%"  stopColor="#D4A56E" />
                    <stop offset="100%" stopColor="#B87C8A" />
                  </linearGradient>
                </defs>
                {/* Track */}
                <circle cx={SZ / 2} cy={SZ / 2} r={CR} fill="none" stroke="#DDD7CF" strokeWidth={SW} />
                {/* Progress — depletes clockwise as time runs out */}
                <circle
                  cx={SZ / 2} cy={SZ / 2} r={CR}
                  fill="none"
                  stroke="url(#timerGrad)"
                  strokeWidth={SW}
                  strokeLinecap="round"
                  strokeDasharray={`${CIRC * ringRatio} ${CIRC}`}
                  transform={`rotate(-90 ${SZ / 2} ${SZ / 2})`}
                  style={{ transition: 'stroke-dasharray 0.9s linear' }}
                />
              </svg>
              {/* Inner circle */}
              <div style={{
                position: 'absolute', top: INSET, left: INSET,
                width: innerSz, height: innerSz, borderRadius: '50%',
                background: '#EDE7DF',
                boxShadow: 'inset 3px 3px 8px #C8C2BA, inset -2px -2px 6px #F8F2EA',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 42, fontWeight: 700, color: '#3D3530', lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>
                  {fmt(remaining)}
                </span>
                <span style={{ fontSize: 11, color: '#B8A89E', marginTop: 5 }}>verbleibend</span>
              </div>
            </div>

            {/* Pause / Resume */}
            <div
              onClick={() => setPaused(p => !p)}
              style={{
                background: '#EDE7DF', borderRadius: 16, padding: '12px 32px', cursor: 'pointer',
                boxShadow: paused
                  ? 'inset 3px 3px 8px #C8C2BA, inset -2px -2px 6px #F8F2EA'
                  : '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              {paused ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#9B7E6E"><polygon points="5,3 19,12 5,21" /></svg>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#9B7E6E' }}>Weiter</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9B7E6E" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="6" y1="4" x2="6" y2="20" /><line x1="18" y1="4" x2="18" y2="20" />
                  </svg>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#9B7E6E' }}>Pause</span>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ background: '#EDE7DF', borderRadius: 24, boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA', padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#B8A89E', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Fortschritt</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#3D3530' }}>
                {completedIds.size} von {sessionTasks.length} erledigt
              </span>
            </div>
            <div style={{ height: 8, background: '#DDD7CF', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${sessionTasks.length > 0 ? (completedIds.size / sessionTasks.length) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #C4856E, #D4A56E)',
                borderRadius: 4,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

          {/* Task list */}
          <div style={{ background: '#EDE7DF', borderRadius: 24, boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA', padding: '16px 18px', marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#B8A89E', textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 12px' }}>
              Aufgaben
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {sessionTasks.map((task, i) => {
                const done = completedIds.has(task.id);
                return (
                  <div key={task.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Checkbox
                        checked={done}
                        onToggle={() => handleToggleTask(task.id)}
                        size={32}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: 14, fontWeight: 600, display: 'block',
                          color: done ? '#B8A89E' : '#3D3530',
                          textDecoration: done ? 'line-through' : 'none',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          marginBottom: 4,
                        }}>
                          {task.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <RoomPill room={task.room} rooms={rooms} />
                          <span style={{ fontSize: 11, color: '#B8A89E' }}>{task.effort} Min</span>
                        </div>
                      </div>
                    </div>
                    {i < sessionTasks.length - 1 && (
                      <div style={{ height: 1, background: '#DDD7CF', margin: '12px 0 12px 44px' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* End session */}
          <div
            onClick={handleEndSession}
            style={{ background: '#C4856E', borderRadius: 16, padding: '14px 0', textAlign: 'center', cursor: 'pointer', boxShadow: '0 4px 18px #E8C4A8' }}
          >
            <span style={{ color: '#FFFFFF', fontWeight: 400, fontSize: 15 }}>Sitzung beenden</span>
          </div>

        </div>
        <BottomNav sessionActive />

        {/* ── Completion overlay ───────────────────────────────────────────── */}
        {showComplete && (() => {
          const targetOffset = CIRC * (1 - completionRatio);
          const elapsedMins  = Math.max(1, Math.round(completionElapsed / 60));
          const now          = new Date();
          const todayIdx     = (now.getDay() + 6) % 7;

          return (
            <div style={{
              position: 'fixed', inset: 0, background: '#EDE7DF', zIndex: 300,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '48px 24px',
            }}>

              {/* 1 — Ring + checkmark stamp */}
              <div style={{ position: 'relative', width: SZ, height: SZ, marginBottom: 28 }}>
                <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ position: 'absolute', top: 0, left: 0, zIndex: 2 }}>
                  <defs>
                    <linearGradient id="compRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%"   stopColor="#7DAF78" />
                      <stop offset="50%"  stopColor="#A8C5A0" />
                      <stop offset="100%" stopColor="#7DAF78" />
                    </linearGradient>
                  </defs>
                  <circle cx={SZ/2} cy={SZ/2} r={CR} fill="none" stroke="#DDD7CF" strokeWidth={SW} />
                  <circle
                    ref={compRingRef}
                    cx={SZ/2} cy={SZ/2} r={CR}
                    fill="none"
                    stroke="url(#compRingGrad)"
                    strokeWidth={SW}
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    transform={`rotate(-90 ${SZ/2} ${SZ/2})`}
                    style={{ opacity: ringVisible ? 1 : 0 }}
                  />
                </svg>
                {/* Inner inset circle */}
                <div style={{
                  position: 'absolute',
                  top: INSET, left: INSET,
                  width: innerSz, height: innerSz,
                  borderRadius: '50%', background: '#EDE7DF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1,
                }}>
                  <svg
                    width="34" height="34" viewBox="0 0 34 34" fill="none"
                    style={{ opacity: 0, animation: 'compFadeIn 350ms ease 1.6s both', flexShrink: 0 }}
                  >
                    <polyline
                      points="6,17 14,25 28,9"
                      stroke="#7DAF78" strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {/* 2 — Task count */}
              <div style={{ fontSize: 36, fontWeight: 800, color: '#3D3530', marginBottom: 6, lineHeight: 1 }}>
                {completionCount} {completionCount === 1 ? 'Aufgabe' : 'Aufgaben'}
              </div>

              {/* 3 — Elapsed time */}
              <div style={{ fontSize: 16, color: '#9B928A', marginBottom: 10, fontWeight: 400 }}>
                erledigt in {elapsedMins} {elapsedMins === 1 ? 'Minute' : 'Minuten'}
              </div>

              {/* 4 — Motivating phrase */}
              <div style={{ fontSize: 13, color: '#B8A89E', marginBottom: 20, fontWeight: 400 }}>
                {phrase}
              </div>

              {/* 4b — Completed task list (staggered animation) */}
              {completedTasksForOverlay.current.length > 0 && (
                <div style={{ width: '100%', marginBottom: 32 }}>
                  {completedTasksForOverlay.current.slice(0, 4).map((task, i) => {
                    const rowDelay    = 300 + i * 150;
                    const checkDelay  = rowDelay + 400;
                    const strikeDelay = checkDelay + 300;
                    return (
                      <div key={task.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                        opacity: 0,
                        animation: `compTaskFadeUp 200ms ease ${rowDelay}ms both`,
                      }}>
                        {/* Checkmark circle */}
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          background: '#A8C5A0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transform: 'scale(0)',
                          animation: `taskCheck 300ms cubic-bezier(0.34,1.56,0.64,1) ${checkDelay}ms both`,
                        }}>
                          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                            <polyline points="2,7 6,11 12,3" stroke="#FAF7F2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        {/* Task name + strikethrough */}
                        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                          <span style={{
                            fontSize: 13, color: '#3D3530', fontWeight: 500,
                            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {task.name}
                          </span>
                          <div style={{
                            position: 'absolute', top: '50%', left: 0,
                            height: 1.5, background: '#B8A89E',
                            width: 0,
                            animation: `compStrikethrough 300ms ease ${strikeDelay}ms both`,
                          }} />
                        </div>
                        {/* Room pill */}
                        <RoomPill room={task.room} rooms={rooms} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 5 — Week dots */}
              <div style={{ marginBottom: 44, width: '100%' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#9B928A', textTransform: 'uppercase', letterSpacing: '0.09em', textAlign: 'center', margin: '0 0 14px' }}>
                  DIESE WOCHE
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 4, paddingRight: 4 }}>
                  {(['Mo','Di','Mi','Do','Fr','Sa','So'] as const).map((label, i) => {
                    const isFuture = i > todayIdx;
                    const isToday  = i === todayIdx;
                    const done     = activity[i];
                    return (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: isFuture ? 0.45 : 1 }}>
                        <span style={{ fontSize: 10, color: '#9B928A' }}>{label}</span>
                        {isToday ? (
                          // Two-layer: grey base visible immediately, green stamps in at step 4
                          <div style={{ position: 'relative', width: 34, height: 34 }}>
                            <div style={{
                              width: 34, height: 34, borderRadius: '50%',
                              background: '#EDE7DF', border: '1px solid #D8D0C6',
                              boxShadow: 'inset 2px 2px 5px #C8C2BA, inset -1px -1px 3px #F8F2EA',
                            }} />
                            {/* Step 4 — green dot stamps in at 2400ms with bounce */}
                            <div style={{
                              position: 'absolute', inset: 0, borderRadius: '50%',
                              background: '#A8C5A0',
                              boxShadow: '2px 2px 5px #90AE88, -1px -1px 3px #C0DDB8',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transform: 'scale(0)',
                              animation: 'compDotStamp 0.5s ease-out 2.4s both',
                            }}>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <polyline points="2,7 6,11 12,3" stroke="#FAF7F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%',
                            background: done ? '#A8C5A0' : '#EDE7DF',
                            border: done ? 'none' : '1px solid #D8D0C6',
                            boxShadow: done
                              ? '2px 2px 5px #90AE88, -1px -1px 3px #C0DDB8'
                              : 'inset 2px 2px 5px #C8C2BA, inset -1px -1px 3px #F8F2EA',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {done && (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <polyline points="2,7 6,11 12,3" stroke="#FAF7F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 6 — Fertig button */}
              <div
                onClick={() => { if (!completeDone) return; setShowComplete(false); router.push('/'); }}
                style={{
                  position: 'relative', zIndex: 10,
                  width: '100%', background: '#EDE7DF',
                  borderRadius: 20, padding: '16px 0',
                  textAlign: 'center', cursor: 'pointer',
                  boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA',
                  opacity: completeDone ? 1 : 0.4,
                  transition: 'opacity 0.3s ease',
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 700, color: '#9B7E6E' }}>Fertig</span>
              </div>
            </div>
          );
        })()}
      </>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STATE 1 — Task selection sheet
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <>
      <div style={{ minHeight: '100vh', background: '#EDE7DF' }}>

        {/* Sheet handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#D8D0C6' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px 20px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#3D3530', margin: 0 }}>Sitzung starten</h1>
          <div style={{ background: '#C4856E', borderRadius: 20, padding: '5px 14px', boxShadow: '0 2px 8px #E8C4A8' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{minutes} Min</span>
          </div>
        </div>

        <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 140, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Section 1: Empfohlen ─────────────────────────────────────── */}
          <div style={{ background: '#EDE7DF', borderRadius: 24, boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA', padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#B8A89E', textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 14px' }}>
              Empfohlen für heute
            </p>

            {suggested.length === 0 ? (
              <p style={{ fontSize: 13, color: '#B8A89E', margin: 0 }}>Keine Vorschläge für diese Dauer.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {suggested.map((task, i) => {
                  const sel = selectedIds.has(task.id);
                  return (
                    <div key={task.id}>
                      <div
                        onClick={() => toggleTask(task.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', paddingTop: i === 0 ? 0 : 0 }}
                      >
                        <UrgencyDot urgency={task.urgency} size={9} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{
                              fontSize: 14, fontWeight: 600,
                              color: task.urgency === 'grün' ? '#B8A89E' : '#3D3530',
                            }}>
                              {task.name}
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: '#C4856E',
                              background: 'rgba(196,133,110,0.13)', borderRadius: 8, padding: '2px 7px',
                              letterSpacing: '0.05em', textTransform: 'uppercase',
                            }}>
                              Empfohlen
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <RoomPill room={task.room} rooms={rooms} />
                            <span style={{ fontSize: 11, color: '#B8A89E' }}>{task.effort} Min</span>
                          </div>
                        </div>
                        <Checkbox checked={sel} onToggle={() => toggleTask(task.id)} size={28} accent />
                      </div>
                      {i < suggested.length - 1 && (
                        <div style={{ height: 1, background: '#DDD7CF', margin: '12px 0 12px 21px' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Section 2: All tasks by room ─────────────────────────────── */}
          <div style={{ background: '#EDE7DF', borderRadius: 24, boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA', padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#B8A89E', textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 14px' }}>
              Alle Aufgaben
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {presentRooms.map((room, ri) => {
                const tasks     = tasksByRoom[room];
                const collapsed = collapsedRooms.has(room);
                const rColor    = roomColor(rooms, room);
                const selCount  = tasks.filter(t => selectedIds.has(t.id)).length;

                return (
                  <div key={room}>
                    {ri > 0 && <div style={{ height: 1, background: '#DDD7CF', margin: '10px 0' }} />}

                    {/* Room header */}
                    <div
                      onClick={() => toggleRoom(room)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: collapsed ? 0 : 10 }}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: rColor, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#3D3530' }}>
                        {rooms.find(r => r.key === room)?.name ?? capitalize(room)}
                      </span>
                      <span style={{ fontSize: 11, color: '#B8A89E' }}>{selCount}/{tasks.length}</span>
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="#B8A89E" strokeWidth="2" strokeLinecap="round"
                        style={{ flexShrink: 0, transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                      >
                        <polyline points="6,9 12,15 18,9" />
                      </svg>
                    </div>

                    {/* Task rows */}
                    {!collapsed && (
                      <div style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {tasks.map((task, ti) => {
                          const sel = selectedIds.has(task.id);
                          return (
                            <div key={task.id}>
                              <div
                                onClick={() => toggleTask(task.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                              >
                                <UrgencyDot urgency={task.urgency} size={7} />
                                <span style={{
                                  flex: 1, fontSize: 13, fontWeight: 500,
                                  color: task.urgency === 'grün' ? '#B8A89E' : '#3D3530',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {task.name}
                                </span>
                                <span style={{ fontSize: 11, color: '#B8A89E', flexShrink: 0 }}>
                                  <span style={{ color: task.priority === 'hoch' ? '#C0392B' : task.priority === 'mittel' ? '#D4A056' : '#7DAF78' }}>
                                    {task.priority === 'hoch' ? 'Hoch' : task.priority === 'mittel' ? 'Mittel' : 'Niedrig'}
                                  </span>
                                  {' · '}{task.effort} Min
                                </span>
                                <Checkbox checked={sel} onToggle={() => toggleTask(task.id)} size={24} accent />
                              </div>
                              {ti < tasks.length - 1 && (
                                <div style={{ height: 1, background: '#DDD7CF', margin: '10px 0 10px 17px' }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Fixed footer ────────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 64, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: '#EDE7DF',
        padding: '12px 18px',
        boxShadow: '0 -6px 20px rgba(200,194,186,0.55)',
        zIndex: 40,
        animation: footerShake ? 'shake 0.35s ease' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#3D3530' }}>
              {selectedIds.size} {selectedIds.size === 1 ? 'Aufgabe' : 'Aufgaben'}
            </span>
            <span style={{ fontSize: 13, color: '#B8A89E' }}> · {totalMins} Min</span>
          </div>
          <div
            onClick={selectedIds.size > 0 ? startSession : undefined}
            style={{
              background: selectedIds.size > 0 ? '#C4856E' : '#C8C2BA',
              borderRadius: 16, padding: '13px 28px',
              cursor: selectedIds.size > 0 ? 'pointer' : 'default',
              boxShadow: selectedIds.size > 0 ? '0 4px 18px #E8C4A8' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ color: '#FFFFFF', fontWeight: 400, fontSize: 15 }}>Los geht&apos;s</span>
          </div>
        </div>
      </div>

      <BottomNav />
    </>
  );
}

// ─── Page wrapper with Suspense (required by useSearchParams) ─────────────────

export default function SessionPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#EDE7DF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#B8A89E', fontSize: 14 }}>Laden…</span>
      </div>
    }>
      <SessionContent />
    </Suspense>
  );
}
