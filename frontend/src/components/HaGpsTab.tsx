import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react'
import { api } from '../api'
import type { HaPersonEnriched } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
  return colors[Math.abs(hash) % colors.length] ?? '#06b6d4'
}

function formatLastUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function stateLabel(state: string): { text: string; color: string } {
  if (state === 'home') return { text: 'Zuhause', color: '#22c55e' }
  if (state === 'not_home') return { text: 'Unterwegs', color: '#94a3b8' }
  return { text: state, color: 'var(--accent)' }
}

// ── Map ───────────────────────────────────────────────────────────────────────

interface GpsFullMapProps {
  persons: HaPersonEnriched[]
}

function GpsFullMap({ persons }: GpsFullMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<unknown>(null)
  const markersRef = useRef<unknown[]>([])

  const personsWithCoords = persons.filter(
    p => typeof p.latitude === 'number' && typeof p.longitude === 'number'
  )

  // Destroy + recreate map when persons list changes
  const personsKey = personsWithCoords
    .map(p => `${p.entity_id}:${p.latitude},${p.longitude}`)
    .join('|')

  useEffect(() => {
    if (!mapRef.current) return
    let cancelled = false

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default

        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link')
          link.id = 'leaflet-css'
          link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          document.head.appendChild(link)
        }

        if (cancelled || !mapRef.current) return

        // Destroy existing instance
        if (mapInstanceRef.current) {
          const old = mapInstanceRef.current as { remove: () => void }
          try { old.remove() } catch { /* ignore */ }
          mapInstanceRef.current = null
        }

        delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        })

        const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(map)

        mapInstanceRef.current = map

        const bounds: [number, number][] = []
        const newMarkers: unknown[] = []

        for (const p of personsWithCoords) {
          const lat = p.latitude as number
          const lng = p.longitude as number
          bounds.push([lat, lng])
          const color = nameToColor(p.name)
          const initials = getInitials(p.name)
          const { text: statusText, color: statusColor } = stateLabel(p.state)

          const icon = L.divIcon({
            html: `<div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)">${initials}</div>`,
            className: '',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          })

          const batteryLine = p.battery_level !== null
            ? `<div style="font-size:12px;color:#888;margin-top:2px">🔋 Akku: ${p.battery_level}%</div>`
            : ''
          const sourceLine = p.source
            ? `<div style="font-size:12px;color:#888;margin-top:2px">📡 ${p.source}</div>`
            : ''
          const timeLine = `<div style="font-size:11px;color:#aaa;margin-top:2px">⏱ ${formatLastUpdated(p.last_updated)}</div>`
          const badge = `<span style="display:inline-block;margin-top:6px;background:${statusColor};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${statusText}</span>`

          const popupHtml = `
            <div style="font-family:system-ui,sans-serif;min-width:160px;padding:2px 0">
              <div style="font-size:14px;font-weight:700;color:#111;margin-bottom:4px">${p.name}</div>
              ${sourceLine}
              ${batteryLine}
              ${timeLine}
              <div>${badge}</div>
            </div>
          `

          const marker = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindPopup(popupHtml)
          newMarkers.push(marker)
        }

        markersRef.current = newMarkers

        if (bounds.length === 1) {
          map.setView(bounds[0]!, 14)
        } else if (bounds.length > 1) {
          map.fitBounds(bounds as [number, number][], { padding: [40, 40] })
        } else {
          map.setView([51.505, -0.09], 4)
        }
      } catch {
        if (!cancelled) {/* map unavailable, div stays empty */}
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        const m = mapInstanceRef.current as { remove: () => void }
        try { m.remove() } catch { /* ignore */ }
        mapInstanceRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personsKey])

  if (personsWithCoords.length === 0) {
    return (
      <div className="glass" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        height: 360, borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)', fontSize: 14,
        border: '1px solid var(--glass-border)',
      }}>
        <MapPin size={18} style={{ opacity: 0.4 }} />
        Keine GPS-Daten für die ausgewählten Personen verfügbar
      </div>
    )
  }

  return (
    <div>
      <div
        ref={mapRef}
        style={{ height: 'calc(100vh - 340px)', minHeight: 360, width: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
      />
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
        GPS-Daten werden nur lokal angezeigt — keine Übertragung an Dritte
      </p>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface HaGpsTabProps {
  instanceId: string | null
}

export function HaGpsTab({ instanceId }: HaGpsTabProps) {
  const [persons, setPersons] = useState<HaPersonEnriched[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectorOpen, setSelectorOpen] = useState(false)

  useEffect(() => {
    if (!instanceId) return
    setLoading(true)
    api.ha.instances.persons(instanceId)
      .then(data => {
        setPersons(data)
        setSelectedIds(new Set(data.map(p => p.entity_id)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [instanceId])

  const selectedPersons = persons.filter(p => selectedIds.has(p.entity_id))

  const togglePerson = (entityId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(entityId)) next.delete(entityId)
      else next.add(entityId)
      return next
    })
  }

  if (!instanceId) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: 14 }}>Keine HA-Instanz ausgewählt.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, margin: '0 auto' }} />
      </div>
    )
  }

  if (persons.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
        <MapPin size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
        <p style={{ fontSize: 14 }}>Keine person.*-Entitäten in Home Assistant gefunden.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Collapsible person selector */}
      <div className="glass" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
        <button
          onClick={() => setSelectorOpen(prev => !prev)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 14px', background: 'transparent', border: 'none',
            cursor: 'pointer', color: 'var(--text-secondary)',
          }}
        >
          {selectorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Personen ({selectedIds.size}/{persons.length} ausgewählt)
          </span>
        </button>

        {selectorOpen && (
          <div style={{ padding: '0 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {persons.map(p => {
              const color = nameToColor(p.name)
              const isSelected = selectedIds.has(p.entity_id)
              const { text: statusText } = stateLabel(p.state)
              return (
                <button
                  key={p.entity_id}
                  onClick={() => togglePerson(p.entity_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 12px 5px 6px',
                    borderRadius: 'var(--radius-xl)',
                    border: `1px solid ${isSelected ? color : 'var(--glass-border)'}`,
                    background: isSelected ? `${color}22` : 'transparent',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>
                    {getInitials(p.name)}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{statusText}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Map */}
      <GpsFullMap persons={selectedPersons} />
    </div>
  )
}
