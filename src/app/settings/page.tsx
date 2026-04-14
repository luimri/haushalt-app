'use client'

import { useEffect, useRef, useState, CSSProperties } from 'react'
import BottomNav from '@/components/BottomNav'
import {
  getRooms,
  addRoom,
  updateRoom,
  getArchivedTasks,
  updateTask,
  resetAllData,
  Room,
  Task,
} from '@/lib/tasks'

// ─── design tokens ───────────────────────────────────────────────────────────
const CARD: CSSProperties = {
  background: '#EDE7DF',
  boxShadow: '6px 6px 14px #C8C2BA, -4px -4px 10px #F8F2EA',
  borderRadius: 24,
  overflow: 'hidden',
}

const SECTION_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#B8A89E',
  WebkitTextFillColor: '#B8A89E',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 10,
  fontFamily: 'Nunito, system-ui, sans-serif',
}

const SEPARATOR: CSSProperties = {
  height: '0.5px',
  background: '#D8D2CA',
  margin: '0 16px',
}

const INSET: CSSProperties = {
  background: '#E4DED6',
  boxShadow: 'inset 4px 4px 8px #C8C2BA, inset -2px -2px 5px #F0EBE3',
  border: 'none',
  borderRadius: 14,
  padding: '12px 16px',
  fontFamily: 'Nunito, system-ui, sans-serif',
  fontSize: 15,
  color: '#7A6E68',
  WebkitTextFillColor: '#7A6E68',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
  display: 'block',
}

const BTN_PRIMARY: CSSProperties = {
  background: '#EDE7DF',
  boxShadow: '3px 3px 7px #C8C2BA, -2px -2px 5px #F8F2EA',
  border: 'none',
  borderRadius: 14,
  padding: '13px 0',
  width: '100%',
  fontFamily: 'Nunito, system-ui, sans-serif',
  fontSize: 15,
  fontWeight: 700,
  color: '#C4856E',
  WebkitTextFillColor: '#C4856E',
  cursor: 'pointer',
}

const SHEET: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  maxWidth: 430,
  margin: '0 auto',
  background: '#EDE7DF',
  borderRadius: '28px 28px 0 0',
  boxShadow: '0 -6px 24px #C0B8B0',
  zIndex: 201,
  maxHeight: '90vh',
  overflowY: 'auto',
  animation: 'slideUp 0.3s ease',
}

const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(61,53,48,0.4)',
  zIndex: 200,
}

const ROOM_COLORS = [
  '#D8E6EF', '#EFE4D2', '#E4DCEF', '#D8EBDF',
  '#E8E4DC', '#F0E4EF', '#EFE8D8', '#E4EBF0',
]

// ─── Toggle ──────────────────────────────────────────────────────────────────
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
        position: 'relative',
        transition: 'background 0.25s ease',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 25 : 3,
        width: 22, height: 22, borderRadius: '50%',
        background: value ? '#FFFFFF' : '#EDE7DF',
        boxShadow: value
          ? '0 2px 6px rgba(196,133,110,0.5)'
          : '2px 2px 5px #C8C2BA, -1px -1px 3px #F8F2EA',
        transition: 'left 0.25s ease',
      }} />
    </div>
  )
}

// ─── Drag handle ─────────────────────────────────────────────────────────────
function Handle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: '#C8C2BA' }} />
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────
function Row({
  left,
  right,
  onClick,
  destructive = false,
}: {
  left: React.ReactNode
  right?: React.ReactNode
  onClick?: () => void
  destructive?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        cursor: onClick ? 'pointer' : 'default',
        gap: 12,
      }}
    >
      <span style={{
        fontFamily: 'Nunito, system-ui, sans-serif',
        fontSize: 15,
        fontWeight: 600,
        color: destructive ? '#C4856E' : '#5C4F46',
        WebkitTextFillColor: destructive ? '#C4856E' : '#5C4F46',
        flex: 1,
      }}>
        {left}
      </span>
      {right}
    </div>
  )
}

// ─── Room sheet ──────────────────────────────────────────────────────────────
function RoomSheet({
  room,
  maxOrder,
  onClose,
  onSaved,
  onDeleted,
}: {
  room: Room | null
  maxOrder: number
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(room?.name ?? '')
  const [color, setColor] = useState(room?.color ?? ROOM_COLORS[0])
  const [saving, setSaving] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)

  // True if the current color isn't one of the preset swatches
  const isCustomColor = !ROOM_COLORS.includes(color)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (room) {
        await updateRoom(room.id, { name: name.trim(), color })
      } else {
        const key = name.trim().toLowerCase().replace(/\s+/g, '_')
        await addRoom({ key, name: name.trim(), color, sort_order: maxOrder + 1 })
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function deleteRoom() {
    if (!room) return
    const confirmed = window.confirm('Raum wirklich löschen? Aufgaben in diesem Raum bleiben erhalten.')
    if (!confirmed) return
    await updateRoom(room.id, { is_active: false })
    onDeleted()
    onClose()
  }

  return (
    <>
      <div onClick={onClose} style={OVERLAY} />
      <div onClick={e => e.stopPropagation()} style={SHEET}>
        <Handle />
        <div style={{ padding: '8px 20px 32px' }}>
          <p style={{
            fontFamily: 'Nunito, system-ui, sans-serif',
            fontSize: 18,
            fontWeight: 700,
            color: '#3D3530',
            WebkitTextFillColor: '#3D3530',
            marginBottom: 20,
          }}>
            {room ? 'Raum bearbeiten' : 'Neuer Raum'}
          </p>

          <p style={{ ...SECTION_LABEL, marginBottom: 8 }}>Name</p>
          <input
            style={INSET}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z. B. Wohnzimmer"
            autoFocus
          />

          <p style={{ ...SECTION_LABEL, marginTop: 20, marginBottom: 10 }}>Farbe</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ROOM_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: c,
                  cursor: 'pointer',
                  boxShadow: color === c
                    ? '0 0 0 3px #EDE7DF, 0 0 0 5px #C4856E'
                    : '2px 2px 6px #C8C2BA, -1px -1px 4px #F8F2EA',
                  transition: 'box-shadow 0.2s ease',
                }}
              />
            ))}

            {/* Custom colour picker swatch */}
            <div
              style={{
                position: 'relative',
                width: 36,
                height: 36,
                borderRadius: '50%',
                cursor: 'pointer',
                flexShrink: 0,
                background: isCustomColor
                  ? color
                  : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                boxShadow: isCustomColor
                  ? '0 0 0 3px #EDE7DF, 0 0 0 5px #C4856E'
                  : '2px 2px 6px #C8C2BA, -1px -1px 4px #F8F2EA',
                transition: 'box-shadow 0.2s ease',
                overflow: 'hidden',
              }}
              onClick={() => colorInputRef.current?.click()}
            >
              {isCustomColor ? (
                /* Checkmark when custom colour is active */
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <polyline points="2,7 6,11 12,3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : (
                /* Pencil icon */
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.25)',
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </div>
              )}
              <input
                ref={colorInputRef}
                type="color"
                value={isCustomColor ? color : '#EDE7DF'}
                onChange={e => setColor(e.target.value)}
                style={{
                  position: 'absolute', inset: 0,
                  opacity: 0, width: '100%', height: '100%',
                  cursor: 'pointer', border: 'none', padding: 0,
                }}
              />
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving || !name.trim()}
            style={{
              ...BTN_PRIMARY,
              marginTop: 28,
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            Speichern
          </button>

          {room && (
            <button
              onClick={deleteRoom}
              style={{
                ...BTN_PRIMARY,
                marginTop: 12,
                fontWeight: 400,
                color: '#C4856E',
                WebkitTextFillColor: '#C4856E',
              }}
            >
              Raum löschen
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Archive sheet ────────────────────────────────────────────────────────────
function ArchiveSheet({ onClose, onRestored }: { onClose: () => void; onRestored: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getArchivedTasks().then(setTasks).finally(() => setLoading(false))
  }, [])

  async function restore(taskId: string) {
    await updateTask(taskId, { is_active: true, scheduled_end: null })
    setTasks(prev => prev.filter(t => t.id !== taskId))
    onRestored()
  }

  // Group by room
  const grouped: Record<string, Task[]> = {}
  for (const t of tasks) {
    if (!grouped[t.room]) grouped[t.room] = []
    grouped[t.room].push(t)
  }

  return (
    <>
      <div onClick={onClose} style={OVERLAY} />
      <div style={SHEET}>
        <Handle />
        <div style={{ padding: '8px 20px 32px' }}>
          <p style={{
            fontFamily: 'Nunito, system-ui, sans-serif',
            fontSize: 18,
            fontWeight: 700,
            color: '#3D3530',
            WebkitTextFillColor: '#3D3530',
            marginBottom: 20,
          }}>
            Archiv
          </p>

          {loading && (
            <p style={{ fontFamily: 'Nunito, system-ui, sans-serif', color: '#9B928A', WebkitTextFillColor: '#9B928A', fontSize: 14 }}>
              Lädt…
            </p>
          )}

          {!loading && tasks.length === 0 && (
            <p style={{ fontFamily: 'Nunito, system-ui, sans-serif', color: '#9B928A', WebkitTextFillColor: '#9B928A', fontSize: 14 }}>
              Keine archivierten Aufgaben.
            </p>
          )}

          {Object.entries(grouped).map(([room, roomTasks]) => (
            <div key={room} style={{ marginBottom: 24 }}>
              <p style={{ ...SECTION_LABEL }}>{room}</p>
              <div style={CARD}>
                {roomTasks.map((t, i) => (
                  <div key={t.id}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                    }}>
                      <span style={{
                        fontFamily: 'Nunito, system-ui, sans-serif',
                        fontSize: 14,
                        color: '#5C4F46',
                        WebkitTextFillColor: '#5C4F46',
                        flex: 1,
                      }}>
                        {t.name}
                      </span>
                      <button
                        onClick={() => restore(t.id)}
                        style={{
                          background: '#EDE7DF',
                          boxShadow: '2px 2px 5px #C8C2BA, -1px -1px 4px #F8F2EA',
                          border: 'none',
                          borderRadius: 10,
                          padding: '6px 14px',
                          fontFamily: 'Nunito, system-ui, sans-serif',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#C4856E',
                          WebkitTextFillColor: '#C4856E',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        Wiederherstellen
                      </button>
                    </div>
                    {i < roomTasks.length - 1 && <div style={SEPARATOR} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Reset confirm sheet ──────────────────────────────────────────────────────
function ResetSheet({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await resetAllData()
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={OVERLAY} />
      <div style={SHEET}>
        <Handle />
        <div style={{ padding: '8px 20px 32px' }}>
          {done ? (
            <>
              <p style={{
                fontFamily: 'Nunito, system-ui, sans-serif',
                fontSize: 18,
                fontWeight: 700,
                color: '#3D3530',
                WebkitTextFillColor: '#3D3530',
                marginBottom: 12,
              }}>
                Erledigt
              </p>
              <p style={{
                fontFamily: 'Nunito, system-ui, sans-serif',
                fontSize: 14,
                color: '#9B928A',
                WebkitTextFillColor: '#9B928A',
                marginBottom: 24,
              }}>
                Alle Verlaufs­daten wurden gelöscht.
              </p>
              <button onClick={onClose} style={BTN_PRIMARY}>Schließen</button>
            </>
          ) : (
            <>
              <p style={{
                fontFamily: 'Nunito, system-ui, sans-serif',
                fontSize: 18,
                fontWeight: 700,
                color: '#3D3530',
                WebkitTextFillColor: '#3D3530',
                marginBottom: 12,
              }}>
                Daten zurücksetzen
              </p>
              <p style={{
                fontFamily: 'Nunito, system-ui, sans-serif',
                fontSize: 14,
                color: '#9B928A',
                WebkitTextFillColor: '#9B928A',
                marginBottom: 28,
                lineHeight: 1.5,
              }}>
                Alle Erledigungen und Sitzungen werden unwiderruflich gelöscht. Aufgaben bleiben erhalten.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={onClose}
                  style={{
                    ...BTN_PRIMARY,
                    color: '#9B928A',
                    WebkitTextFillColor: '#9B928A',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirm}
                  disabled={busy}
                  style={{
                    ...BTN_PRIMARY,
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  Löschen
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomSheet, setRoomSheet] = useState<{ open: boolean; room: Room | null }>({
    open: false,
    room: null,
  })
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [weekStart, setWeekStart] = useState<'mo' | 'so'>('mo')

  useEffect(() => {
    getRooms().then(setRooms)
    setNotificationsEnabled(localStorage.getItem('notifications_enabled') === 'true')
    setWeekStart((localStorage.getItem('week_start') as 'mo' | 'so') ?? 'mo')
  }, [])

  function reloadRooms() {
    getRooms().then(setRooms)
  }

  async function toggleNotifications(v: boolean) {
    if (v) {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
    }
    setNotificationsEnabled(v)
    localStorage.setItem('notifications_enabled', String(v))
  }

  function cycleWeekStart() {
    const next = weekStart === 'mo' ? 'so' : 'mo'
    setWeekStart(next)
    localStorage.setItem('week_start', next)
  }

  const maxOrder = rooms.reduce((m, r) => Math.max(m, r.sort_order), 0)

  return (
    <div style={{ minHeight: '100vh', padding: '28px 16px 88px' }}>
      <h1 style={{
        fontFamily: 'Nunito, system-ui, sans-serif',
        fontSize: 26,
        fontWeight: 800,
        color: '#3D3530',
        WebkitTextFillColor: '#3D3530',
        margin: '0 0 28px 4px',
      }}>
        Einstellungen
      </h1>

      {/* ── SECTION 1: Räume ─────────────────────────────────────────── */}
      <p style={SECTION_LABEL}>Räume</p>
      <div style={{ ...CARD, marginBottom: 28 }}>
        {rooms.map((room, i) => (
          <div key={room.id}>
            <Row
              left={
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: room.color,
                    flexShrink: 0,
                    display: 'inline-block',
                    boxShadow: '1px 1px 3px #C8C2BA',
                  }} />
                  {room.name}
                </span>
              }
              right={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke="#B8A89E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              onClick={() => setRoomSheet({ open: true, room })}
            />
            {i < rooms.length - 1 && <div style={SEPARATOR} />}
          </div>
        ))}

        {rooms.length > 0 && <div style={SEPARATOR} />}

        <Row
          left="Neuen Raum hinzufügen"
          right={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#C4856E" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          }
          onClick={() => setRoomSheet({ open: true, room: null })}
        />
      </div>

      {/* ── SECTION 2: Archiv ────────────────────────────────────────── */}
      <p style={SECTION_LABEL}>Archiv</p>
      <div style={{ ...CARD, marginBottom: 28 }}>
        <Row
          left="Archivierte Aufgaben"
          right={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="#B8A89E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          onClick={() => setArchiveOpen(true)}
        />
      </div>

      {/* ── SECTION 3: App-Einstellungen ─────────────────────────────── */}
      <p style={SECTION_LABEL}>App-Einstellungen</p>
      <div style={CARD}>
        <Row
          left="Erinnerungen"
          right={<Toggle value={notificationsEnabled} onChange={toggleNotifications} />}
        />
        <div style={SEPARATOR} />
        <Row
          left="Wochenstart"
          right={
            <button
              onClick={cycleWeekStart}
              style={{
                background: '#E4DED6',
                boxShadow: 'inset 2px 2px 5px #C8C2BA, inset -1px -1px 3px #F0EBE3',
                border: 'none',
                borderRadius: 10,
                padding: '6px 14px',
                fontFamily: 'Nunito, system-ui, sans-serif',
                fontSize: 13,
                fontWeight: 700,
                color: '#7A6E68',
                WebkitTextFillColor: '#7A6E68',
                cursor: 'pointer',
                minWidth: 52,
                textAlign: 'center',
              }}
            >
              {weekStart === 'mo' ? 'Mo' : 'So'}
            </button>
          }
        />
        <div style={SEPARATOR} />
        <Row
          left="Daten zurücksetzen"
          right={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="#C4856E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          onClick={() => setResetOpen(true)}
          destructive
        />
      </div>

      {/* ── Sheets ───────────────────────────────────────────────────── */}
      {roomSheet.open && (
        <RoomSheet
          room={roomSheet.room}
          maxOrder={maxOrder}
          onClose={() => setRoomSheet({ open: false, room: null })}
          onSaved={reloadRooms}
          onDeleted={reloadRooms}
        />
      )}

      {archiveOpen && (
        <ArchiveSheet
          onClose={() => setArchiveOpen(false)}
          onRestored={() => {}}
        />
      )}

      {resetOpen && (
        <ResetSheet onClose={() => setResetOpen(false)} />
      )}

      <BottomNav />
    </div>
  )
}
