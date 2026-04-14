'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getTasksWithStatus, getActivityByDay, getOneTimeTasks, getSuggestedTasks, createSession, getRooms, type TaskWithStatus, type OneTimeTask, type Room } from '@/lib/tasks';

const ROOM_FALLBACK: Room[] = [
  { id: 'bad',          key: 'bad',          name: 'Bad',          color: '#D8E6EF', sort_order: 1, is_active: true },
  { id: 'flur',         key: 'flur',         name: 'Flur',         color: '#E8E4DC', sort_order: 2, is_active: true },
  { id: 'küche',        key: 'küche',        name: 'Küche',        color: '#EFE4D2', sort_order: 3, is_active: true },
  { id: 'wohnzimmer',   key: 'wohnzimmer',   name: 'Wohnzimmer',   color: '#E4DCEF', sort_order: 4, is_active: true },
  { id: 'schlafzimmer', key: 'schlafzimmer', name: 'Schlafzimmer', color: '#D8EBDF', sort_order: 5, is_active: true },
];

type TimeOption = number | 'custom';
const DEFAULT_OPTIONS: TimeOption[] = [30, 15, 45, 'custom'];

export default function HeutePage() {
  const router = useRouter();
  const [options, setOptions] = useState<TimeOption[]>(DEFAULT_OPTIONS);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerH, setPickerH] = useState(0);
  const [pickerM, setPickerM] = useState(20);

  // ── Live data ──
  const [tasks,         setTasks]         = useState<TaskWithStatus[]>([]);
  const [activity,      setActivity]      = useState<boolean[]>(Array(7).fill(false));
  const [oneTimeTasks,  setOneTimeTasks]  = useState<OneTimeTask[]>([]);
  const [rooms,         setRooms]         = useState<Room[]>(ROOM_FALLBACK);
  const [oneTaskLoading, setOneTaskLoading] = useState(false);

  const handleOneTask = async () => {
    setOneTaskLoading(true);
    try {
      const suggested = await getSuggestedTasks(15);
      if (suggested.length === 0) {
        setOneTaskLoading(false);
        return;
      }
      const task = suggested[0];
      
      const sessionId = await createSession(15, [task.id]);
      router.push(`/session?minutes=15&sessionId=${sessionId}&oneTask=true`);
    } catch (e) {
      console.error(e);
      setOneTaskLoading(false);
    }
  };

  const fetchData = useCallback(async () => {
    // Run independently so one failure doesn't block the other
    getTasksWithStatus()
      .then(setTasks)
      .catch(err => console.error('[fetchData] tasks:', err));
    getActivityByDay()
      .then(setActivity)
      .catch(err => console.error('[fetchData] activity:', err));
    getOneTimeTasks()
      .then(setOneTimeTasks)
      .catch(err => console.error('[fetchData] oneTimeTasks:', err));
    getRooms()
      .then(setRooms)
      .catch(err => console.error('[fetchData] rooms:', err));
  }, []);

  useEffect(() => {
    fetchData();
    window.addEventListener('focus', fetchData);

    function onStorage(e: StorageEvent) {
      if (e.key === 'tasks_updated') fetchData();
    }
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('focus', fetchData);
      window.removeEventListener('storage', onStorage);
    };
  }, [fetchData]);

  const swap = (smallIdx: number) => {
    setOptions(prev => {
      const next = [...prev];
      [next[0], next[smallIdx + 1]] = [next[smallIdx + 1], next[0]];
      return next;
    });
  };

  const big = options[0];
  const smalls = options.slice(1);

  function bigMinutes(): number {
    if (big === 'custom') return pickerH * 60 + pickerM;
    return big;
  }

  const BigCircle = () => (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C4856E" />
            <stop offset="50%" stopColor="#D4A56E" />
            <stop offset="100%" stopColor="#B87C8A" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r="44" fill="none" stroke="#DDD7CF" strokeWidth="3" />
        <circle
          cx="48" cy="48" r="44"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="240 36"
          transform="rotate(-90 48 48)"
        />
      </svg>
      <div style={{
        position: 'absolute', top: 7, left: 7, right: 7, bottom: 7,
        borderRadius: '50%',
        background: '#EDE7DF',
        boxShadow: '3px 3px 8px #C8C2BA, -2px -2px 6px #F8F2EA',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        {big === 'custom' ? (
          <>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#3D3530', lineHeight: 1 }}>
              {pickerH > 0 ? `${pickerH}h${String(pickerM).padStart(2,'0')}` : `${pickerM}`}
            </span>
            <span style={{ fontSize: 10, color: '#B8A89E', marginTop: 2 }}>Min</span>
            <span
              onClick={() => setShowPicker(true)}
              style={{ fontSize: 9, color: '#C4A898', marginTop: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#C4A898" strokeWidth="2.5" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              ändern
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#3D3530', lineHeight: 1 }}>{String(big)}</span>
            <span style={{ fontSize: 10, color: '#B8A89E', marginTop: 2 }}>Min</span>
          </>
        )}
      </div>
    </div>
  );

  const SmallCircle = ({ opt, idx }: { opt: TimeOption; idx: number }) => {
    const isCustom = opt === 'custom';
    return (
      <div
        onClick={() => { swap(idx); if (isCustom) setShowPicker(true); }}
        style={{
          position: 'relative',
          width: isCustom ? 50 : 54,
          height: isCustom ? 50 : 54,
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <svg width={isCustom ? 50 : 54} height={isCustom ? 50 : 54}
          viewBox={isCustom ? '0 0 50 50' : '0 0 54 54'}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <circle
            cx={isCustom ? 25 : 27} cy={isCustom ? 25 : 27} r={isCustom ? 22 : 24}
            fill="none" stroke="#D8D0C6" strokeWidth="1.5"
            strokeDasharray={isCustom ? '4 3' : undefined}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: 5, left: 5, right: 5, bottom: 5,
          borderRadius: '50%',
          background: '#EDE7DF',
          boxShadow: '2px 2px 6px #C8C2BA, -1px -1px 4px #F8F2EA',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          {isCustom ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9B7E6E" strokeWidth="2.5" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#6B5E57', lineHeight: 1 }}>{String(opt)}</span>
              <span style={{ fontSize: 9, color: '#B8A49E', marginTop: 1 }}>Min</span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div style={{ minHeight: '100vh', background: '#EDE7DF', paddingTop: 30, paddingBottom: 88, paddingLeft: 18, paddingRight: 18 }}>

        {/* Greeting + calendar widget */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#3D3530', margin: 0 }}>Hallo 🌿</h1>
            <p style={{ fontSize: 14, color: '#9B928A', margin: '4px 0 0', fontWeight: 400 }}>Bereit für eine Putzeinheit?</p>
          </div>
          {/* Calendar widget */}
          <div style={{
            width: 52, height: 56, borderRadius: 14, flexShrink: 0,
            boxShadow: '4px 4px 10px #C8C2BA, -3px -3px 8px #F8F2EA',
            overflow: 'hidden',
          }}>
            {/* Month strip */}
            <div style={{
              height: 18, background: '#C4856E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.08em' }}>
                {new Date().toLocaleDateString('de-DE', { month: 'short' }).toUpperCase().replace(/\.$/, '')}
              </span>
            </div>
            {/* Day number */}
            <div style={{
              flex: 1, background: '#EDE7DF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 38,
            }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#3D3530', lineHeight: 1 }}>
                {new Date().getDate()}
              </span>
            </div>
          </div>
        </div>

        {/* Timer Card */}
        <div style={{ background: '#EDE7DF', borderRadius: 24, boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA', padding: '20px 18px', marginBottom: 16 }}>
          <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#B8A89E', letterSpacing: '0.11em', textTransform: 'uppercase', margin: '0 0 18px' }}>
            Sitzung starten
          </p>

          {/* Timer row — big left, 2x2 grid right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
            <BigCircle />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <SmallCircle opt={smalls[0]} idx={0} />
                <SmallCircle opt={smalls[1]} idx={1} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <SmallCircle opt={smalls[2]} idx={2} />
              </div>
            </div>
          </div>

          {/* Sitzung beginnen */}
          <div
            onClick={() => router.push(`/session?minutes=${bigMinutes()}`)}
            style={{ background: '#C4856E', borderRadius: 16, padding: '14px 0', textAlign: 'center', cursor: 'pointer', boxShadow: '0 4px 18px #E8C4A8', marginBottom: 10 }}
          >
            <span style={{ color: '#FFFFFF', fontWeight: 400, fontSize: 15, letterSpacing: '0.02em' }}>Sitzung beginnen</span>
          </div>

          {/* Nur eine Sache */}
          <div
            onClick={handleOneTask}
            style={{ background: '#EDE7DF', borderRadius: 16, padding: '12px 0', textAlign: 'center', cursor: oneTaskLoading ? 'wait' : 'pointer', boxShadow: '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA', opacity: oneTaskLoading ? 0.6 : 1 }}
          >
            <span style={{ color: '#9B7E6E', fontWeight: 400, fontSize: 14 }}>
              {oneTaskLoading ? 'Laden…' : 'Nur eine Sache'}
            </span>
          </div>
        </div>

        {/* Week stamps — live session data */}
        <div style={{ background: '#EDE7DF', borderRadius: 24, boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA', padding: '16px 18px', marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#9B928A', textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 12px' }}>Diese Woche</p>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {(['Mo','Di','Mi','Do','Fr','Sa','So'] as const).map((label, i) => {
              // i=0 Monday … i=6 Sunday
              const now      = new Date();
              const todayIdx = (now.getDay() + 6) % 7; // 0=Mon…6=Sun
              const isFuture = i > todayIdx;
              const isToday  = i === todayIdx;

              const done      = activity[i];            // true if session or ≥3 completions that day
              const todayNone = isToday && !done;

              return (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: isFuture ? 0.55 : 1 }}>
                  <span style={{ fontSize: 10, color: '#9B928A' }}>{label}</span>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: done ? '#A8C5A0' : todayNone ? '#C4856E' : '#EDE7DF',
                    border: done || todayNone ? 'none' : '1px solid #D8D0C6',
                    boxShadow: done
                      ? '2px 2px 5px #90AE88, -1px -1px 3px #C0DDB8'
                      : todayNone
                      ? '2px 2px 5px #A87060, -1px -1px 3px #D4957E'
                      : 'inset 2px 2px 5px #C8C2BA, inset -1px -1px 3px #F8F2EA',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done     && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,7 6,11 12,3" stroke="#FAF7F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    {todayNone && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FAF7F2' }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Neglect alert */}
        {(() => {
          const neglectedCount = tasks.filter(t => t.urgency === 'rot').length;
          if (neglectedCount === 0) return null;
          return (
            <div style={{
              background: '#EDE7DF',
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
              boxShadow: '3px 3px 8px #C8C2BA, -2px -2px 5px #F8F2EA',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C4856E', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#7A5A48', fontFamily: 'Nunito, sans-serif' }}>
                {neglectedCount} {neglectedCount === 1 ? 'Aufgabe' : 'Aufgaben'} seit über 2 Wochen offen
              </span>
            </div>
          );
        })()}

        {/* Room cards — live urgency data */}
        <p style={{ fontSize: 10, fontWeight: 700, color: '#B8A89E', textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 10px' }}>Räume</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {rooms.map(room => {
            const roomTasks = tasks.filter(t => t.room.toLowerCase().trim() === room.key);
            const open      = roomTasks.filter(t => t.urgency !== 'grün').length;
            return (
              <div
                key={room.key}
                onClick={() => router.push(`/tasks?room=${room.key}`)}
                style={{ background: room.color, borderRadius: 18, padding: '14px 14px 12px', boxShadow: '4px 4px 10px #C8C2BA, -3px -3px 8px #F8F2EA', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#3D3530', marginBottom: 3 }}>{room.name}</div>
                <div style={{ fontSize: 11, color: '#7A726C' }}>
                  {roomTasks.length} {roomTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} · {open} offen
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                  {roomTasks.map(t => (
                    <div key={t.id} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: t.urgency === 'grün' ? '#7DAF78' : t.urgency === 'gelb' ? '#D4A056' : '#C4856E',
                    }} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Einmalig card */}
          {(() => {
            const doneCount = oneTimeTasks.filter(t => t.completed_at !== null).length;
            return (
              <div
                onClick={() => router.push('/tasks?filter=einmalig')}
                style={{ background: '#F0E4EF', borderRadius: 18, padding: '14px 14px 12px', boxShadow: '4px 4px 10px #C8C2BA, -3px -3px 8px #F8F2EA', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#3D3530', marginBottom: 3 }}>Einmalig</div>
                <div style={{ fontSize: 11, color: '#7A726C' }}>
                  {oneTimeTasks.length} {oneTimeTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} · {doneCount} erledigt
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                  {oneTimeTasks.map(t => (
                    <div key={t.id} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: t.completed_at !== null ? '#A8C5A0' : '#C4B8C0',
                    }} />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

      </div>

      {/* Custom time picker overlay */}
      {showPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(237,231,223,0.92)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#EDE7DF', borderRadius: 28, padding: '24px 20px', boxShadow: '8px 8px 20px #C8C2BA, -5px -5px 14px #F8F2EA', width: 260 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#B8A89E', textTransform: 'uppercase', letterSpacing: '0.09em', textAlign: 'center', marginBottom: 20 }}>Zeit einstellen</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {/* Hours */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 10, color: '#B8A89E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Std</p>
                <div onClick={() => setPickerH(h => Math.min(2, h + 1))} style={{ width: 36, height: 36, borderRadius: '50%', background: '#EDE7DF', boxShadow: '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B7E6E" strokeWidth="2.5" strokeLinecap="round"><polyline points="18,15 12,9 6,15"/></svg>
                </div>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#EDE7DF', boxShadow: 'inset 3px 3px 8px #C8C2BA, inset -2px -2px 6px #F8F2EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: '#3D3530' }}>{String(pickerH).padStart(2,'0')}</span>
                </div>
                <div onClick={() => setPickerH(h => Math.max(0, h - 1))} style={{ width: 36, height: 36, borderRadius: '50%', background: '#EDE7DF', boxShadow: '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B7E6E" strokeWidth="2.5" strokeLinecap="round"><polyline points="6,9 12,15 18,9"/></svg>
                </div>
              </div>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#C4B8B0', marginTop: 28 }}>:</span>
              {/* Minutes */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 10, color: '#B8A89E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Min</p>
                <div onClick={() => setPickerM(m => (m + 5) % 60)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#EDE7DF', boxShadow: '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B7E6E" strokeWidth="2.5" strokeLinecap="round"><polyline points="18,15 12,9 6,15"/></svg>
                </div>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#EDE7DF', boxShadow: 'inset 3px 3px 8px #C8C2BA, inset -2px -2px 6px #F8F2EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: '#3D3530' }}>{String(pickerM).padStart(2,'0')}</span>
                </div>
                <div onClick={() => setPickerM(m => m - 5 < 0 ? 55 : m - 5)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#EDE7DF', boxShadow: '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B7E6E" strokeWidth="2.5" strokeLinecap="round"><polyline points="6,9 12,15 18,9"/></svg>
                </div>
              </div>
            </div>
            <div onClick={() => setShowPicker(false)} style={{ background: '#C4856E', borderRadius: 14, padding: 13, textAlign: 'center', cursor: 'pointer', boxShadow: '0 4px 14px #E8C4A8', marginTop: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 400, color: '#FFFFFF' }}>Speichern</span>
            </div>
            <p onClick={() => setShowPicker(false)} style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: '#B8A89E', cursor: 'pointer' }}>Abbrechen</p>
          </div>
        </div>
      )}

      <BottomNav />
    </>
  );
}
