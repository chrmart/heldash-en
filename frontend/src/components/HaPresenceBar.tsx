import { useState, useEffect, useRef } from 'react'
import { Map, Info } from 'lucide-react'
import type { HaEntityFull } from '../types'
import { LS_FLOORPLAN_GPS } from '../constants'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
  return colors[Math.abs(hash) % colors.length] ?? '#06b6d4'
}

function getPersonState(entity: HaEntityFull): { label: string; color: string } {
  const state = entity.state
  if (state === 'home') return { label: 'Zuhause', color: '#22c55e' }
  if (state === 'not_home') return { label: 'Unterwegs', color: 'var(--text-muted)' }
  // state might be a zone name
  return { label: state, color: 'var(--accent)' }
}

interface PersonWithGps {
  entity: HaEntityFull
  lat: number
  lng: number
  name: string
}

// ── GPS Map ───────────────────────────────────────────────────────────────────

interface GpsMapProps {
  persons: HaEntityFull[]
}

function GpsMap({ persons }: GpsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState<boolean | null>(null) // null=loading
  const mapInstanceRef = useRef<unknown>(null)
  const markersRef = useRef<unknown[]>([])

  const personsWithGps: PersonWithGps[] = persons
    .filter(p => {
      const lat = p.attributes.latitude
      const lng = p.attributes.longitude
      return typeof lat === 'number' && typeof lng === 'number'
    })
    .map(p => ({
      entity: p,
      lat: p.attributes.latitude as number,
      lng: p.attributes.longitude as number,
      name: (p.attributes.friendly_name as string | undefined) ?? p.entity_id.split('.')[1] ?? p.entity_id,
    }))

  useEffect(() => {
    if (!mapRef.current || personsWithGps.length === 0) {
      setAvailable(personsWithGps.length === 0 ? false : null)
      return
    }

    let cancelled = false

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default

        // Inject leaflet CSS via CDN link element if not already present
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link')
          link.id = 'leaflet-css'
          link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          document.head.appendChild(link)
        }

        if (cancelled || !mapRef.current) return

        // Fix default icon path issue with webpack/vite
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

        // Add person markers
        const bounds: [number, number][] = []
        const newMarkers: unknown[] = []

        for (const p of personsWithGps) {
          bounds.push([p.lat, p.lng])
          const color = nameToColor(p.name)
          const initials = getInitials(p.name)
          const icon = L.divIcon({
            html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${initials}</div>`,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          })
          const marker = L.marker([p.lat, p.lng], { icon })
            .addTo(map)
            .bindPopup(p.name)
          newMarkers.push(marker)
        }

        markersRef.current = newMarkers

        if (bounds.length > 0) {
          if (bounds.length === 1) {
            map.setView(bounds[0]!, 14)
          } else {
            map.fitBounds(bounds as [number, number][], { padding: [40, 40] })
          }
        }

        setAvailable(true)
      } catch {
        if (!cancelled) setAvailable(false)
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
  }, [personsWithGps.map(p => `${p.lat},${p.lng}`).join('|')])

  if (personsWithGps.length === 0) {
    return (
      <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
        Keine GPS-Daten verfügbar
      </div>
    )
  }

  if (available === false) {
    return (
      <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Info size={12} /> GPS-Karte nicht verfügbar
      </div>
    )
  }

  return (
    <div>
      <div ref={mapRef} style={{ height: 200, width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden' }} />
      {available === true && (
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
          GPS-Daten werden nur lokal angezeigt — keine Übertragung an Dritte
        </p>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface HaPresenceBarProps {
  persons: HaEntityFull[]
}

export function HaPresenceBar({ persons }: HaPresenceBarProps) {
  const [gpsEnabled, setGpsEnabled] = useState(
    () => localStorage.getItem(LS_FLOORPLAN_GPS) === 'true'
  )
  const [highlightedPerson, setHighlightedPerson] = useState<string | null>(null)

  const toggleGps = () => {
    const next = !gpsEnabled
    setGpsEnabled(next)
    localStorage.setItem(LS_FLOORPLAN_GPS, String(next))
  }

  if (persons.length === 0) return null

  return (
    <div
      className="glass"
      style={{
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        marginBottom: 12,
        border: '1px solid var(--glass-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Person pills */}
        {persons.map(person => {
          const name = (person.attributes.friendly_name as string | undefined) ?? person.entity_id.split('.')[1] ?? person.entity_id
          const { label, color } = getPersonState(person)
          const initials = getInitials(name)
          const avatarColor = nameToColor(name)
          const isHighlighted = highlightedPerson === person.entity_id

          return (
            <button
              key={person.entity_id}
              onClick={() => setHighlightedPerson(isHighlighted ? null : person.entity_id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 10px 4px 6px',
                borderRadius: 'var(--radius-xl)',
                border: `1px solid ${isHighlighted ? avatarColor : 'var(--glass-border)'}`,
                background: isHighlighted ? `${avatarColor}22` : 'transparent',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: avatarColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff',
                flexShrink: 0,
              }}>
                {initials}
              </div>
              {/* Name + state */}
              <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{name}</span>
              <span style={{ fontSize: 11, color }}>
                {person.state === 'home' ? '🏠' : person.state === 'not_home' ? '🚗' : '📍'} {label}
              </span>
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        {/* GPS toggle */}
        <button
          className="btn btn-ghost"
          onClick={toggleGps}
          style={{ gap: 6, fontSize: 11, padding: '4px 10px' }}
          title={gpsEnabled ? 'GPS-Karte ausblenden' : 'GPS-Karte anzeigen'}
        >
          <Map size={12} />
          {gpsEnabled ? 'GPS aus' : 'GPS-Karte'}
        </button>
      </div>

      {/* GPS Map */}
      {gpsEnabled && (
        <div style={{ marginTop: 12 }}>
          <GpsMap persons={persons} />
        </div>
      )}
    </div>
  )
}
