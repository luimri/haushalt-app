'use client';

import { useState } from 'react';
import type { Task, Room } from '@/lib/tasks';

const ROOM_FALLBACK: Room[] = [
  { id: 'bad',          key: 'bad',          name: 'Bad',          color: '#D8E6EF', sort_order: 1, is_active: true },
  { id: 'flur',         key: 'flur',         name: 'Flur',         color: '#E8E4DC', sort_order: 2, is_active: true },
  { id: 'küche',        key: 'küche',        name: 'Küche',        color: '#EFE4D2', sort_order: 3, is_active: true },
  { id: 'wohnzimmer',   key: 'wohnzimmer',   name: 'Wohnzimmer',   color: '#E4DCEF', sort_order: 4, is_active: true },
  { id: 'schlafzimmer', key: 'schlafzimmer', name: 'Schlafzimmer', color: '#D8EBDF', sort_order: 5, is_active: true },
];

const FREQ_OPTIONS = [
  { value: 'täglich',           label: 'Täglich' },
  { value: '2x wöchentlich',    label: '2× Wöchentlich' },
  { value: 'wöchentlich',       label: 'Wöchentlich' },
  { value: 'alle 2 wochen',     label: 'Alle 2 Wochen' },
  { value: 'monatlich',         label: 'Monatlich' },
  { value: 'benutzerdefiniert', label: 'Benutzerdefiniert' },
];

const PRIORITY_OPTIONS = [
  { key: 'hoch',    label: 'Hoch',    bg: '#FDECEA', color: '#C0392B' },
  { key: 'mittel',  label: 'Mittel',  bg: '#FAEEDA', color: '#D4A056' },
  { key: 'niedrig', label: 'Niedrig', bg: '#EAF3DE', color: '#7DAF78' },
] as const;

const EFFORT_OPTIONS = [
  { key: 'schnell', label: 'Schnell (<5 Min)',  defaultMinutes: 3  },
  { key: 'mittel',  label: 'Mittel (5–15 Min)', defaultMinutes: 10 },
  { key: 'lang',    label: 'Lang (15+ Min)',     defaultMinutes: 20 },
] as const;

const DAYS = [
  { key: 'mo', label: 'Mo' },
  { key: 'di', label: 'Di' },
  { key: 'mi', label: 'Mi' },
  { key: 'do', label: 'Do' },
  { key: 'fr', label: 'Fr' },
  { key: 'sa', label: 'Sa' },
  { key: 'so', label: 'So' },
] as const;

type EffortKey = typeof EFFORT_OPTIONS[number]['key'];

type Props = {
  mode: 'add' | 'edit';
  initialData?: Partial<Task>;
  defaultRoom?: string;
  rooms?: Room[];
  onSave: (task: Partial<Task>) => void;
  onClose: () => void;
};

function minutesToEffortKey(minutes: number): EffortKey {
  if (minutes < 5)   return 'schnell';
  if (minutes <= 15) return 'mittel';
  return 'lang';
}

function parseCustomDays(freq: string): Set<string> {
  return freq.includes(',') ? new Set(freq.split(',').filter(Boolean)) : new Set();
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 50, height: 28, borderRadius: 14, cursor: 'pointer', flexShrink: 0,
        background: value ? '#C4856E' : '#EDE7DF',
        boxShadow: value
          ? '0 2px 8px rgba(196,133,110,0.4)'
          : 'inset 3px 3px 6px #C8C2BA, inset -2px -2px 4px #F8F2EA',
        position: 'relative', transition: 'background 0.25s ease',
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: value ? 25 : 3,
        width: 22, height: 22, borderRadius: '50%',
        background: value ? '#FFFFFF' : '#EDE7DF',
        boxShadow: value
          ? '0 2px 6px rgba(196,133,110,0.5)'
          : '2px 2px 5px #C8C2BA, -1px -1px 3px #F8F2EA',
        transition: 'left 0.25s ease',
      }} />
    </div>
  );
}

export default function TaskSheet({ mode, initialData, defaultRoom, rooms = ROOM_FALLBACK, onSave, onClose }: Props) {
  const initFreq     = initialData?.frequency ?? 'wöchentlich';
  const initIsCustom = initFreq.includes(',');

  const [name,           setName]           = useState(initialData?.name ?? '');
  const [room,           setRoom]           = useState(initialData?.room ?? defaultRoom ?? 'bad');
  const [priority,       setPriority]       = useState(initialData?.priority ?? 'mittel');
  const [effortMinutes,  setEffortMinutes]  = useState(initialData?.effort_minutes ?? 10);
  const [frequency,      setFrequency]      = useState(initIsCustom ? 'benutzerdefiniert' : initFreq);
  const [customDays,     setCustomDays]     = useState<Set<string>>(() => parseCustomDays(initFreq));
  const [isOneTime,      setIsOneTime]      = useState(initialData?.is_one_time ?? false);
  const [isLimited,      setIsLimited]      = useState(!!(initialData?.scheduled_start || initialData?.scheduled_end));
  const [scheduledStart, setScheduledStart] = useState(initialData?.scheduled_start ?? '');
  const [scheduledEnd,   setScheduledEnd]   = useState(initialData?.scheduled_end   ?? '');

  const effortKey    = minutesToEffortKey(effortMinutes);
  const isCustomFreq = frequency === 'benutzerdefiniert';
  const canSave      = name.trim().length > 0;

  function handleEffortCategory(key: EffortKey) {
    setEffortMinutes(EFFORT_OPTIONS.find(e => e.key === key)!.defaultMinutes);
  }

  function toggleDay(key: string) {
    setCustomDays(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleSave() {
    if (!canSave) return;
    const savedFrequency = isCustomFreq
      ? (customDays.size > 0 ? Array.from(customDays).join(',') : 'wöchentlich')
      : frequency;
    onSave({
      name:            name.trim(),
      room,
      priority,
      effort_minutes:  effortMinutes,
      frequency:       savedFrequency,
      is_one_time:     isOneTime,
      is_active:       true,
      scheduled_start: isLimited && scheduledStart ? scheduledStart : null,
      scheduled_end:   isLimited && scheduledEnd   ? scheduledEnd   : null,
    });
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#B8A89E',
    textTransform: 'uppercase', letterSpacing: '0.09em',
    margin: '0 0 8px', display: 'block',
  };

  // The key fix: WebkitTextFillColor overrides browser native input color on Chrome/Safari
  const inputColor = '#7A6E68';
  const insetStyle: React.CSSProperties = {
    background: '#E4DED6',
    boxShadow: 'inset 4px 4px 8px #C8C2BA, inset -2px -2px 5px #F0EBE3',
    border: 'none',
    borderRadius: 14,
    padding: '12px 16px',
    fontFamily: 'Nunito, sans-serif',
    fontSize: 15,
    color: inputColor,
    WebkitTextFillColor: inputColor,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    display: 'block',
  };

  const pillStyle = (active: boolean, activeBg?: string, activeColor?: string): React.CSSProperties => ({
    flexShrink: 0,
    borderRadius: 20,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: active ? 700 : 600,
    fontFamily: 'Nunito, sans-serif',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none' as const,
    background: active ? (activeBg ?? '#C4856E') : '#EDE7DF',
    color:      active ? (activeColor ?? '#FFFFFF') : '#9B7E6E',
    WebkitTextFillColor: active ? (activeColor ?? '#FFFFFF') : '#9B7E6E',
    boxShadow:  active
      ? activeBg
        ? '2px 2px 6px #C0B8AE, -1px -1px 4px #F8F2EA'
        : '0 4px 14px rgba(196,133,110,0.40)'
      : '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA',
    transition: 'all 0.18s ease',
  });

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(61,53,48,0.4)', zIndex: 200 }}
      />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxWidth: 430, margin: '0 auto',
        background: '#EDE7DF',
        borderRadius: '28px 28px 0 0',
        boxShadow: '0 -6px 24px #C0B8B0',
        zIndex: 201,
        maxHeight: '90vh',
        overflowY: 'auto',
        animation: 'slideUp 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#C8C2BA' }} />
        </div>

        <div style={{ padding: '8px 20px 48px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#3D3530', WebkitTextFillColor: '#3D3530', margin: '0 0 20px', fontFamily: 'Nunito, sans-serif' }}>
            {mode === 'add' ? 'Aufgabe hinzufügen' : 'Aufgabe bearbeiten'}
          </h2>

          {/* Name */}
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Aufgabe benennen…"
            style={{ ...insetStyle, marginBottom: 18 }}
          />

          {/* Room */}
          <span style={labelStyle}>Raum</span>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', marginBottom: 18 }}>
            {rooms.map(r => (
              <div key={r.key} onClick={() => setRoom(r.key)} style={pillStyle(room === r.key, r.color, '#3D3530')}>
                {r.name}
              </div>
            ))}
          </div>

          {/* Priority */}
          <span style={labelStyle}>Priorität</span>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {PRIORITY_OPTIONS.map(p => (
              <div key={p.key} onClick={() => setPriority(p.key)} style={pillStyle(priority === p.key, p.bg, p.color)}>
                {p.label}
              </div>
            ))}
          </div>

          {/* Effort */}
          <span style={labelStyle}>Aufwand</span>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {EFFORT_OPTIONS.map(e => (
              <div key={e.key} onClick={() => handleEffortCategory(e.key)} style={pillStyle(effortKey === e.key)}>
                {e.label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <span style={{ fontSize: 12, color: '#9B928A', WebkitTextFillColor: '#9B928A', fontWeight: 400, fontFamily: 'Nunito, sans-serif', flexShrink: 0 }}>
              Minuten genau:
            </span>
            <input
              type="number"
              min={1}
              value={effortMinutes}
              onChange={e => setEffortMinutes(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ ...insetStyle, width: 70, borderRadius: 10, padding: '8px 10px', fontSize: 14, textAlign: 'center' }}
            />
          </div>

          {/* One-time toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, color: '#7A6E68', WebkitTextFillColor: '#7A6E68', fontWeight: 400, fontFamily: 'Nunito, sans-serif' }}>
              Einmalige Aufgabe
            </span>
            <Toggle value={isOneTime} onChange={setIsOneTime} />
          </div>

          {/* Date range toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, color: '#7A6E68', WebkitTextFillColor: '#7A6E68', fontWeight: 400, fontFamily: 'Nunito, sans-serif' }}>
              Zeitraum begrenzen
            </span>
            <Toggle value={isLimited} onChange={setIsLimited} />
          </div>

          {isLimited && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: '#B8A89E', WebkitTextFillColor: '#B8A89E', fontWeight: 400, fontFamily: 'Nunito, sans-serif', display: 'block', marginBottom: 4 }}>Von:</span>
                <input type="date" value={scheduledStart ?? ''} onChange={e => setScheduledStart(e.target.value)}
                  style={{ ...insetStyle, padding: '10px 12px', fontSize: 14 }} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: '#B8A89E', WebkitTextFillColor: '#B8A89E', fontWeight: 400, fontFamily: 'Nunito, sans-serif', display: 'block', marginBottom: 4 }}>Bis:</span>
                <input type="date" value={scheduledEnd ?? ''} onChange={e => setScheduledEnd(e.target.value)}
                  style={{ ...insetStyle, padding: '10px 12px', fontSize: 14 }} />
              </div>
            </div>
          )}

          {/* Frequency */}
          {!isOneTime && (
            <div style={{ marginBottom: 24 }}>
              <span style={labelStyle}>Häufigkeit</span>
              <div style={{ position: 'relative', marginBottom: isCustomFreq ? 12 : 0 }}>
                <select
                  value={frequency}
                  onChange={e => setFrequency(e.target.value)}
                  style={{
                    ...insetStyle,
                    padding: '12px 40px 12px 16px',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {FREQ_OPTIONS.map(f => (
                    <option key={f.value} value={f.value} style={{ color: '#3D3530', background: '#EDE7DF' }}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="#9B928A" strokeWidth="2.2" strokeLinecap="round"
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </div>

              {isCustomFreq && (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                  {DAYS.map(d => {
                    const active = customDays.has(d.key);
                    return (
                      <div key={d.key} onClick={() => toggleDay(d.key)} style={{
                        width: 36, height: 36, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0,
                        fontSize: 12, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: active ? '#FFFFFF' : '#9B7E6E',
                        WebkitTextFillColor: active ? '#FFFFFF' : '#9B7E6E',
                        background: active ? '#C4856E' : '#EDE7DF',
                        boxShadow: active ? '0 2px 8px #E8C4A8' : '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA',
                        transition: 'all 0.18s ease',
                        userSelect: 'none',
                      }}>
                        {d.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Save */}
          <div
            onClick={handleSave}
            style={{
              background: canSave ? '#C4856E' : '#D4C8C0',
              borderRadius: 16, padding: '14px 0',
              textAlign: 'center',
              cursor: canSave ? 'pointer' : 'not-allowed',
              boxShadow: canSave ? '0 4px 18px rgba(196,133,110,0.40)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', fontWeight: 400, fontSize: 15, fontFamily: 'Nunito, sans-serif' }}>
              Speichern
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
