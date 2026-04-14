'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import TaskSheet from '@/components/TaskSheet';
import {
  getTasksWithStatus,
  getOneTimeTasks,
  getRooms,
  completeTask,
  uncompleteTask,
  deleteTask,
  addTask,
  updateTask,
  type Task,
  type TaskWithStatus,
  type OneTimeTask,
  type Urgency,
  type Room,
} from '@/lib/tasks';

const ROOM_FALLBACK: Room[] = [
  { id: 'bad',          key: 'bad',          name: 'Bad',          color: '#D8E6EF', sort_order: 1, is_active: true },
  { id: 'flur',         key: 'flur',         name: 'Flur',         color: '#E8E4DC', sort_order: 2, is_active: true },
  { id: 'küche',        key: 'küche',        name: 'Küche',        color: '#EFE4D2', sort_order: 3, is_active: true },
  { id: 'wohnzimmer',   key: 'wohnzimmer',   name: 'Wohnzimmer',   color: '#E4DCEF', sort_order: 4, is_active: true },
  { id: 'schlafzimmer', key: 'schlafzimmer', name: 'Schlafzimmer', color: '#D8EBDF', sort_order: 5, is_active: true },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const URGENCY_COLOR: Record<Urgency, string> = {
  rot:  '#C4856E',
  gelb: '#D4A056',
  grün: '#7DAF78',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Filter = string;

type SheetState = {
  mode: 'add' | 'edit';
  task?: TaskWithStatus;
  defaultRoom?: string;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function rk(room: string): string {
  return room.toLowerCase().trim();
}

function daysSince(dateStr: string | null): string {
  if (!dateStr) return 'Noch nie erledigt';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days <= 0) return 'Heute erledigt';
  if (days === 1) return 'Gestern erledigt';
  return `Seit ${days} Tagen`;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonSection({ tint }: { tint: string }) {
  return (
    <div style={{ borderRadius: 18, overflow: 'hidden', boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA' }}>
      <div style={{
        height: 70,
        background: `linear-gradient(90deg, ${tint} 25%, #EDE7DF 50%, ${tint} 75%) 0 0 / 200% 100%`,
        animation: 'shimmer 1.6s ease-in-out infinite',
      }} />
    </div>
  );
}

// ─── SwipeRow ─────────────────────────────────────────────────────────────────

type SwipeRowProps = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  borderTop?: string;
  children: React.ReactNode;
};

function SwipeRow({ isOpen, onOpen, onClose, onEdit, onDelete, borderTop, children }: SwipeRowProps) {
  const rowRef  = useRef<HTMLDivElement>(null);
  const startX  = useRef(0);
  const startY  = useRef(0);
  const tracking = useRef(false);
  const OPEN_OFFSET = -120;
  const SNAP = 60;

  // Sync CSS whenever isOpen changes from outside (e.g. another row opened)
  useEffect(() => {
    if (!rowRef.current) return;
    rowRef.current.style.transition = 'transform 0.25s ease';
    rowRef.current.style.transform  = isOpen ? `translateX(${OPEN_OFFSET}px)` : 'translateX(0)';
  }, [isOpen]);

  function onTouchStart(e: React.TouchEvent) {
    startX.current   = e.touches[0].clientX;
    startY.current   = e.touches[0].clientY;
    tracking.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!tracking.current || !rowRef.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    // Cancel swipe if vertical scroll dominates
    if (Math.abs(dy) > Math.abs(dx) + 5) { tracking.current = false; return; }
    const base   = isOpen ? OPEN_OFFSET : 0;
    const offset = Math.max(OPEN_OFFSET, Math.min(0, base + dx));
    rowRef.current.style.transition = 'none';
    rowRef.current.style.transform  = `translateX(${offset}px)`;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!tracking.current || !rowRef.current) return;
    tracking.current = false;
    const dx = e.changedTouches[0].clientX - startX.current;
    rowRef.current.style.transition = 'transform 0.25s ease';
    if (isOpen) {
      if (dx > SNAP) { rowRef.current.style.transform = 'translateX(0)'; onClose(); }
      else rowRef.current.style.transform = `translateX(${OPEN_OFFSET}px)`;
    } else {
      if (dx < -SNAP) { rowRef.current.style.transform = `translateX(${OPEN_OFFSET}px)`; onOpen(); }
      else rowRef.current.style.transform = 'translateX(0)';
    }
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderTop }}>
      {/* Action buttons revealed behind the sliding row */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', width: 120 }}>
        {/* Edit — amber */}
        <div
          onClick={onEdit}
          style={{
            width: 60, background: '#D4A056', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* <img src="/icons/edit.png" width="22" height="22" alt="" /> */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </div>
        {/* Delete — terracotta */}
        <div
          onClick={onDelete}
          style={{
            width: 60, background: '#C4856E', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* <img src="/icons/delete.png" width="22" height="22" alt="" /> */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </div>
      </div>

      {/* Slideable row content */}
      <div
        ref={rowRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ position: 'relative', zIndex: 1, background: '#F2ECE5' }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TasksPageInner() {
  const searchParams = useSearchParams();
  const [tasks,       setTasks]       = useState<TaskWithStatus[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState<Filter>(() => {
    const room = searchParams.get('room');
    const fp   = searchParams.get('filter');
    if (fp === 'einmalig') return 'einmalig';
    if (room) return room;
    return 'alle';
  });
  // Map<taskId, true=locally completed | false=locally uncompleted>
  // absent entry → use server urgency (grün counts as done)
  const [localState,  setLocalState]  = useState<Map<string, boolean>>(new Map());
  // Bad & Küche expanded by default — all others start collapsed
  const [collapsed,   setCollapsed]   = useState<Set<string>>(
    new Set(['flur', 'wohnzimmer', 'schlafzimmer'])
  );
  const [oneTimeTasks,     setOneTimeTasks]     = useState<OneTimeTask[]>([]);
  const [oneTimeCollapsed, setOneTimeCollapsed] = useState(true);
  const [rooms,       setRooms]       = useState<Room[]>(ROOM_FALLBACK);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [sheet,       setSheet]       = useState<SheetState | null>(null);

  useEffect(() => {
    getTasksWithStatus().then(data => { setTasks(data); setLoading(false); });
    getRooms().then(setRooms).catch(() => {});
    getOneTimeTasks().then(data => {
      // Sort once on load: incomplete first, complete last. Never re-sorted after.
      const initial = [...data].sort((a, b) => {
        const aDone = a.completed_at !== null ? 1 : 0;
        const bDone = b.completed_at !== null ? 1 : 0;
        return aDone - bDone;
      });
      setOneTimeTasks(initial);
    });
  }, []);

  function isDone(task: TaskWithStatus): boolean {
    const local = localState.get(task.id);
    if (local !== undefined) return local;
    return task.urgency === 'grün';
  }

  function currentUrgency(task: TaskWithStatus): Urgency {
    if (localState.get(task.id) === true) return 'grün';
    return task.urgency;
  }

  async function handleToggle(task: TaskWithStatus) {
    const done = isDone(task);
    const wasLocallyCompleted = localState.get(task.id) === true;

    if (!done) {
      setLocalState(prev => { const n = new Map(prev); n.set(task.id, true); return n; });
      await completeTask(task.id);
      localStorage.setItem('tasks_updated', Date.now().toString());
    } else {
      setLocalState(prev => { const n = new Map(prev); n.set(task.id, false); return n; });
      await uncompleteTask(task.id);
      localStorage.setItem('tasks_updated', Date.now().toString());

      if (wasLocallyCompleted) {
        setLocalState(prev => { const n = new Map(prev); n.delete(task.id); return n; });
      } else {
        const updated = await getTasksWithStatus();
        setTasks(updated);
        setLocalState(prev => { const n = new Map(prev); n.delete(task.id); return n; });
      }
    }
  }

  function isOneTimeDone(task: OneTimeTask): boolean {
    const local = localState.get(task.id);
    if (local !== undefined) return local;
    return task.completed_at !== null;
  }

  async function handleOneTimeToggle(task: OneTimeTask) {
    const done = isOneTimeDone(task);
    if (!done) {
      setLocalState(prev => { const n = new Map(prev); n.set(task.id, true); return n; });
      await completeTask(task.id);
      localStorage.setItem('tasks_updated', Date.now().toString());
    } else {
      setLocalState(prev => { const n = new Map(prev); n.set(task.id, false); return n; });
      await uncompleteTask(task.id);
      localStorage.setItem('tasks_updated', Date.now().toString());
    }
  }

  async function handleDelete(task: TaskWithStatus) {
    // Optimistic: remove immediately
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setOpenSwipeId(null);
    await deleteTask(task.id);
  }

  async function handleSheetSave(data: Partial<Task>) {
    if (sheet?.mode === 'add') {
      await addTask({
        name:             data.name             ?? '',
        room:             data.room             ?? 'bad',
        priority:         data.priority         ?? 'mittel',
        effort_minutes:   data.effort_minutes   ?? 10,
        frequency:        data.frequency        ?? 'wöchentlich',
        is_one_time:      data.is_one_time      ?? false,
        is_active:        true,
        scheduled_start:  data.scheduled_start  ?? null,
        scheduled_end:    data.scheduled_end    ?? null,
      });
    } else if (sheet?.mode === 'edit' && sheet.task) {
      await updateTask(sheet.task.id, data);
    }
    const updated = await getTasksWithStatus();
    setTasks(updated);
    setSheet(null);
  }

  function toggleCollapse(room: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(room) ? next.delete(room) : next.add(room);
      return next;
    });
  }

  // ── Room lookup maps (derived from live rooms) ──
  const roomColorMap: Record<string, string> = Object.fromEntries(rooms.map(r => [r.key, r.color]));
  const roomNameMap:  Record<string, string> = Object.fromEntries(rooms.map(r => [r.key, r.name]));

  // ── Group all tasks by room key ──
  const byRoom: Record<string, TaskWithStatus[]> = {};
  for (const t of tasks) {
    const k = rk(t.room);
    (byRoom[k] ??= []).push(t);
  }

  // ── Determine visible rooms per filter ──
  const visibleRooms = rooms.map(r => r.key).filter(room => {
    if (!byRoom[room]) return false;
    if (filter === 'alle') return true;
    if (filter === 'dringend') return byRoom[room].some(t => t.urgency === 'rot' && t.priority === 'hoch');
    return filter === room;
  });

  function rowsFor(room: string): TaskWithStatus[] {
    const all = byRoom[room] ?? [];
    if (filter === 'dringend') return all.filter(t => t.urgency === 'rot' && t.priority === 'hoch');
    return all;
  }

  // ── Filter pill definitions ──
  const pills: { key: string; label: string }[] = [
    { key: 'alle',     label: 'Alle'     },
    { key: 'dringend', label: 'Dringend' },
    ...rooms.map(r => ({ key: r.key, label: r.name })),
    { key: 'einmalig', label: 'Einmalig' },
  ];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{
        minHeight: '100vh', background: '#EDE7DF',
        paddingTop: 30, paddingBottom: 100, paddingLeft: 16, paddingRight: 16,
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#3D3530', margin: 0 }}>Aufgaben</h1>
            <p style={{ fontSize: 14, color: '#9B928A', margin: '4px 0 0' }}>Alle Räume auf einen Blick</p>
          </div>
          <div
            onClick={() => setSheet({ mode: 'add' })}
            style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: '#C4856E',
              boxShadow: '0 4px 18px rgba(196,133,110,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
        </div>

        {/* ── Filter pills ────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 8,
          overflowX: 'auto', paddingBottom: 6, marginBottom: 20,
          scrollbarWidth: 'none',
        }}>
          {pills.map(({ key, label }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  flexShrink: 0,
                  border: 'none', borderRadius: 20,
                  padding: '8px 16px',
                  fontSize: 13, fontWeight: active ? 700 : 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                  background: active ? '#C4856E' : '#EDE7DF',
                  color:      active ? '#FFFFFF' : '#9B928A',
                  boxShadow:  active
                    ? '0 4px 14px rgba(196,133,110,0.40)'
                    : '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Room sections ───────────────────────────────────────────────── */}
        {filter !== 'einmalig' && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {loading ? (
            rooms.slice(0, 3).map(r => (
              <SkeletonSection key={r.key} tint={r.color} />
            ))

          ) : visibleRooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: 14, color: '#B8A89E', margin: 0 }}>
                {filter === 'dringend'
                  ? 'Keine dringenden Aufgaben — alles im grünen Bereich!'
                  : 'Keine Aufgaben gefunden.'}
              </p>
            </div>

          ) : (
            visibleRooms.map(room => {
              const allRoomTasks = byRoom[room] ?? [];
              const visible      = rowsFor(room);
              const isCollapsed  = collapsed.has(room);
              const rColor       = roomColorMap[room] ?? '#EDE7DF';
              const redCount     = allRoomTasks.filter(t => currentUrgency(t) === 'rot').length;

              return (
                <div
                  key={room}
                  style={{
                    borderRadius: 18,
                    boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA',
                    overflow: 'hidden',
                  }}
                >
                  {/* ── Room header ───────────────────────────────────────── */}
                  <div
                    onClick={() => toggleCollapse(room)}
                    style={{
                      background: rColor,
                      padding: '14px 16px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {/* Left: name + dots */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#3D3530' }}>
                        {roomNameMap[room] ?? room}
                      </span>
                      <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
                        {allRoomTasks.map(t => (
                          <div
                            key={t.id}
                            style={{
                              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                              background: URGENCY_COLOR[currentUrgency(t)],
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Right: summary + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {redCount > 0 ? (
                        <span style={{ fontSize: 12, color: '#9B7E6E' }}>
                          {redCount} dringend
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#7DAF78' }}>
                          alles okay
                        </span>
                      )}
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="#9B928A" strokeWidth="2.2" strokeLinecap="round"
                        style={{
                          flexShrink: 0,
                          transition: 'transform 0.22s ease',
                          transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        }}
                      >
                        <polyline points="6,9 12,15 18,9" />
                      </svg>
                    </div>
                  </div>

                  {/* ── Task rows ─────────────────────────────────────────── */}
                  {!isCollapsed && (
                    <div style={{ background: '#F2ECE5' }}>
                      {visible.length === 0 ? (
                        <div style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: 13, color: '#B8A89E' }}>Keine Aufgaben sichtbar.</span>
                        </div>
                      ) : (
                        visible.map((task, i) => {
                          const urgency = currentUrgency(task);
                          const done    = isDone(task);

                          return (
                            <SwipeRow
                              key={task.id}
                              isOpen={openSwipeId === task.id}
                              onOpen={() => setOpenSwipeId(task.id)}
                              onClose={() => setOpenSwipeId(null)}
                              onEdit={() => { setSheet({ mode: 'edit', task }); setOpenSwipeId(null); }}
                              onDelete={() => handleDelete(task)}
                              borderTop={i > 0 ? '0.5px solid #DDD7CF' : undefined}
                            >
                              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                                {/* Urgency strip */}
                                <div style={{
                                  width: 3, flexShrink: 0,
                                  background: URGENCY_COLOR[urgency],
                                }} />

                                {/* Row content */}
                                <div style={{
                                  flex: 1,
                                  padding: '12px 14px 12px 12px',
                                  display: 'flex', alignItems: 'center', gap: 10,
                                }}>
                                  {/* Text */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{
                                      fontSize: 14, fontWeight: 600, display: 'block',
                                      color: done ? '#B8A89E' : '#3D3530',
                                      textDecoration: done ? 'line-through' : 'none',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                      {task.name}
                                    </span>
                                    <span style={{
                                      fontSize: 11, color: '#B8A89E', marginTop: 2, display: 'block',
                                    }}>
                                      <span style={{ color: task.priority === 'hoch' ? '#C0392B' : task.priority === 'mittel' ? '#D4A056' : '#7DAF78' }}>
                                        {task.priority === 'hoch' ? 'Hoch' : task.priority === 'mittel' ? 'Mittel' : 'Niedrig'}
                                      </span>
                                      {' · '}{daysSince(task.last_completed_at)} · {task.frequency}
                                    </span>
                                  </div>

                                  {/* Effort */}
                                  <span style={{
                                    fontSize: 11, color: '#B8A89E',
                                    flexShrink: 0, whiteSpace: 'nowrap',
                                  }}>
                                    {task.effort_minutes} Min
                                  </span>

                                  {/* Checkbox */}
                                  <div
                                    onClick={() => handleToggle(task)}
                                    style={{
                                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                      cursor: 'pointer',
                                      background: done ? '#7DAF78' : '#F2ECE5',
                                      boxShadow: done
                                        ? '0 2px 8px rgba(125,175,120,0.50)'
                                        : 'inset 3px 3px 6px #C4BEB6, inset -2px -2px 4px #FAF4EC',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'all 0.2s ease',
                                    }}
                                  >
                                    {done && (
                                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                        <polyline
                                          points="2,7 6,11 12,3"
                                          stroke="#FAF7F2" strokeWidth="2.2"
                                          strokeLinecap="round" strokeLinejoin="round"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </SwipeRow>
                          );
                        })
                      )}

                      {/* ── Add task row ─────────────────────────────────── */}
                      {filter !== 'dringend' && (
                        <div
                          onClick={() => setSheet({ mode: 'add', defaultRoom: room })}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 8, padding: '12px 16px',
                            borderTop: '0.5px dashed #D4CEC6',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: '#C4856E', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round">
                              <line x1="12" y1="5" x2="12" y2="19"/>
                              <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                          </div>
                          <span style={{ fontSize: 13, color: '#C4856E', fontWeight: 600 }}>
                            Aufgabe hinzufügen
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>}

        {/* ── One-time tasks section ──────────────────────────────────────── */}
        {filter !== 'dringend' && !loading && (() => {
          const filtered = filter === 'alle' || filter === 'einmalig'
            ? oneTimeTasks
            : oneTimeTasks.filter(t => rk(t.room) === filter);
          if (filtered.length === 0) return null;

          const doneCount = filtered.filter(t => isOneTimeDone(t)).length;

          return (
            <>
              {/* External section label */}
              <div style={{ marginTop: 24, marginBottom: 8, paddingLeft: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#B8A89E', letterSpacing: '0.08em' }}>
                  EINMALIGE AUFGABEN
                </span>
              </div>

              {/* Card */}
              <div style={{
                borderRadius: 18,
                boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA',
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div
                  onClick={() => setOneTimeCollapsed(c => !c)}
                  style={{
                    background: '#EDE7DF',
                    padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer',
                  }}
                >
                  {/* Clipboard-check icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9B928A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="9" y="2" width="6" height="4" rx="1"/>
                    <path d="M9 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2h-2"/>
                    <polyline points="9,12 11,14 15,10"/>
                  </svg>

                  {/* Label */}
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#3D3530' }}>
                    Einmalige Aufgaben
                  </span>

                  {/* Count + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: '#9B928A' }}>
                      {doneCount} von {filtered.length} erledigt
                    </span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="#9B928A" strokeWidth="2.2" strokeLinecap="round"
                      style={{
                        flexShrink: 0,
                        transition: 'transform 0.22s ease',
                        transform: oneTimeCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      }}
                    >
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
                  </div>
                </div>

                {/* Task rows */}
                {!oneTimeCollapsed && (
                  <div style={{ background: '#F2ECE5' }}>
                    {filtered.map((task, i) => {
                      const done = isOneTimeDone(task);
                      const roomColor = roomColorMap[rk(task.room)] ?? '#EDE7DF';
                      return (
                        <div
                          key={task.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '12px 14px 12px 14px',
                            borderTop: i > 0 ? '0.5px solid #DDD7CF' : undefined,
                          }}
                        >
                          {/* Square checkbox */}
                          <div
                            onClick={() => handleOneTimeToggle(task)}
                            style={{
                              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                              cursor: 'pointer',
                              background: done ? '#A8C5A0' : '#F2ECE5',
                              boxShadow: done
                                ? '0 2px 6px rgba(168,197,160,0.50)'
                                : 'inset 3px 3px 6px #C4BEB6, inset -2px -2px 4px #FAF4EC',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {done && (
                              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                                <polyline
                                  points="2,7 6,11 12,3"
                                  stroke="#FAF7F2" strokeWidth="2.2"
                                  strokeLinecap="round" strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>

                          {/* Text */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                              fontSize: 14, fontWeight: 600, display: 'block',
                              color: done ? '#B8A89E' : '#3D3530',
                              textDecoration: done ? 'line-through' : 'none',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {task.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              {/* Room pill */}
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: '#6B6058',
                                background: roomColor,
                                borderRadius: 4, padding: '1px 6px',
                                whiteSpace: 'nowrap',
                              }}>
                                {roomNameMap[rk(task.room)] ?? task.room}
                              </span>
                              <span style={{ fontSize: 11, color: '#B8A89E' }}>
                                {task.effort_minutes} Min
                              </span>
                            </div>
                          </div>

                          {/* Erledigt label for completed tasks */}
                          {done && (
                            <span style={{ fontSize: 11, color: '#B8A89E', flexShrink: 0 }}>
                              Erledigt
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      <BottomNav />

      {/* ── Task Sheet ──────────────────────────────────────────────────────── */}
      {sheet && (
        <TaskSheet
          mode={sheet.mode}
          initialData={sheet.task}
          defaultRoom={sheet.defaultRoom}
          rooms={rooms}
          onSave={handleSheetSave}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksPageInner />
    </Suspense>
  );
}
