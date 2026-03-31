import { useRef, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Lightbulb, Power, Thermometer, ChevronUp, ChevronDown, Play,
  HelpCircle, ZoomIn, ZoomOut, RotateCcw,
  Activity, Wind, PersonStanding,
} from 'lucide-react'
import type { HaFloorplan, HaFloorplanEntity, HaEntityFull, HaInstance } from '../types'
import { api } from '../api'
import { useStore } from '../store/useStore'
import { formatTemperature } from '../utils'

// ── Domain helpers ────────────────────────────────────────────────────────────

function getDomain(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

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

// ── Size constants ────────────────────────────────────────────────────────────

const SIZE_MAP = { small: 24, medium: 32, large: 40 } as const
const MIN_TAP = 44

// ── Entity Marker ─────────────────────────────────────────────────────────────

interface MarkerProps {
  placed: HaFloorplanEntity
  entity: HaEntityFull | undefined
  editMode: boolean
  isSelected: boolean
  zoom: number
  onSelect: (id: string) => void
  onDragStart: (id: string, e: React.MouseEvent | React.TouchEvent) => void
  onClick: (id: string, rect: DOMRect) => void
  onContextMenu?: (id: string, x: number, y: number) => void
}

function EntityMarker({ placed, entity, editMode, isSelected, zoom, onSelect, onDragStart, onClick, onContextMenu }: MarkerProps) {
  const markerRef = useRef<HTMLDivElement>(null)
  const { settings } = useStore()
  const tempUnit = settings?.temp_unit ?? 'celsius'
  const domain = getDomain(placed.entity_id)
  const state = entity?.state ?? 'unavailable'
  const isUnavailable = state === 'unavailable' || !entity
  const isOn = ['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(state)
  const size = SIZE_MAP[placed.display_size as keyof typeof SIZE_MAP] ?? SIZE_MAP.medium
  const tapSize = Math.max(size, MIN_TAP)
  const showLabel = placed.show_label && zoom >= 0.7

  // Domain-specific color
  let bgColor = 'var(--surface-3)'
  let textColor = 'var(--text-primary)'
  let borderStyle = '2px solid var(--glass-border)'
  let pulse = false

  if (isUnavailable) {
    bgColor = 'transparent'
    borderStyle = '2px dashed var(--status-offline)'
    textColor = 'var(--status-offline)'
  } else if (domain === 'light') {
    if (isOn) {
      bgColor = 'hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.85)'
      textColor = '#fff'
      pulse = true
    } else {
      bgColor = 'var(--surface-3)'
    }
  } else if (domain === 'switch' || domain === 'input_boolean') {
    bgColor = isOn ? 'rgba(34,197,94,0.85)' : 'var(--surface-3)'
    textColor = isOn ? '#fff' : 'var(--text-primary)'
  } else if (domain === 'binary_sensor') {
    bgColor = isOn ? 'rgba(249,115,22,0.85)' : 'var(--surface-3)'
    textColor = isOn ? '#fff' : 'var(--text-primary)'
    if (isOn) pulse = true
  } else if (domain === 'climate') {
    const temp = entity?.attributes.current_temperature
    const mode = entity?.attributes.hvac_mode ?? state
    bgColor = mode === 'heat' ? 'rgba(239,68,68,0.8)' : mode === 'cool' ? 'rgba(59,130,246,0.8)' : 'var(--surface-3)'
    textColor = '#fff'
  } else if (domain === 'person' || domain === 'device_tracker') {
    const displayName = entity?.attributes.friendly_name ?? placed.entity_id.split('.')[1] ?? ''
    bgColor = isOn ? 'rgba(34,197,94,0.2)' : 'var(--surface-3)'
    borderStyle = `2px solid ${isOn ? '#22c55e' : 'var(--glass-border)'}`
    textColor = nameToColor(displayName)
  } else if (domain === 'cover') {
    bgColor = isOn ? 'var(--accent-subtle)' : 'var(--surface-3)'
  } else if (domain === 'scene' || domain === 'script') {
    bgColor = 'var(--surface-3)'
  }

  if (isSelected && editMode) {
    borderStyle = '2px solid var(--accent)'
  }

  // Icon
  let icon: React.ReactNode
  const iSize = Math.round(size * 0.55)

  if (isUnavailable) {
    icon = <HelpCircle size={iSize} />
  } else if (domain === 'light') {
    icon = <Lightbulb size={iSize} />
  } else if (domain === 'switch' || domain === 'input_boolean' || domain === 'automation') {
    icon = <Power size={iSize} />
  } else if (domain === 'climate') {
    const temp = entity?.attributes.current_temperature
    icon = temp !== undefined ? (
      <span style={{ fontSize: Math.max(9, iSize - 4), fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {(() => { const f = formatTemperature(temp as number, '°C', tempUnit); return `${f.value}${f.unit}` })()}
      </span>
    ) : <Thermometer size={iSize} />
  } else if (domain === 'cover') {
    icon = isOn ? <ChevronUp size={iSize} /> : <ChevronDown size={iSize} />
  } else if (domain === 'binary_sensor') {
    icon = <Activity size={iSize} />
  } else if (domain === 'sensor') {
    const val = entity?.state ?? '?'
    const unit = entity?.attributes.unit_of_measurement ?? ''
    icon = (
      <span style={{ fontSize: Math.max(8, iSize - 6), fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center', lineHeight: 1 }}>
        {val.length > 5 ? val.slice(0, 5) : val}{unit ? `\n${unit}` : ''}
      </span>
    )
  } else if (domain === 'person' || domain === 'device_tracker') {
    const displayName = entity?.attributes.friendly_name ?? placed.entity_id.split('.')[1] ?? '?'
    icon = (
      <span style={{ fontSize: Math.max(8, iSize - 4), fontWeight: 700, color: nameToColor(displayName) }}>
        {getInitials(displayName)}
      </span>
    )
  } else if (domain === 'scene' || domain === 'script') {
    icon = <Play size={iSize} />
  } else if (domain === 'fan') {
    icon = <Wind size={iSize} />
  } else {
    icon = <PersonStanding size={iSize} />
  }

  const friendlyName = entity?.attributes.friendly_name ?? placed.entity_id.split('.').slice(1).join('.')
  const labelText = friendlyName.length > 12 ? friendlyName.slice(0, 12) + '…' : friendlyName

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editMode) return
    e.stopPropagation()
    onSelect(placed.id)
    onDragStart(placed.id, e)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!editMode) return
    e.stopPropagation()
    onSelect(placed.id)
    onDragStart(placed.id, e)
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (editMode) {
      onSelect(placed.id)
      return
    }
    if (markerRef.current) {
      onClick(placed.id, markerRef.current.getBoundingClientRect())
    }
  }

  return (
    <div
      ref={markerRef}
      style={{
        position: 'absolute',
        left: `${placed.pos_x}%`,
        top: `${placed.pos_y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: isSelected ? 10 : 5,
        cursor: editMode ? 'grab' : 'pointer',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      onContextMenu={e => {
        e.preventDefault()
        e.stopPropagation()
        if (onContextMenu) onContextMenu(placed.id, e.clientX, e.clientY)
      }}
    >
      {/* Tap target */}
      <div style={{
        width: tapSize,
        height: tapSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {/* Marker circle */}
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: bgColor,
            border: borderStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: textColor,
            boxShadow: isSelected ? '0 0 0 3px var(--accent)' : pulse ? '0 0 8px 2px hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.6)' : 'none',
            animation: pulse ? 'fp-pulse 2s ease-in-out infinite' : 'none',
            transition: 'all var(--transition-base)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {icon}
        </div>
      </div>
      {/* Label */}
      {showLabel && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 4,
          fontSize: Math.max(9, 11 / zoom),
          color: 'var(--text-primary)',
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          padding: '2px 6px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {labelText}
        </div>
      )}
    </div>
  )
}

// ── Quick-Control Popover ─────────────────────────────────────────────────────

interface PopoverProps {
  placedId: string
  placed: HaFloorplanEntity
  entity: HaEntityFull | undefined
  anchorRect: DOMRect
  instanceId: string
  onClose: () => void
}

function QuickControlPopover({ placed, entity, anchorRect, instanceId, onClose }: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const { settings } = useStore()
  const tempUnit = settings?.temp_unit ?? 'celsius'
  const domain = getDomain(placed.entity_id)
  const state = entity?.state ?? 'unavailable'
  const isOn = ['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(state)
  const [busy, setBusy] = useState(false)
  const [brightness, setBrightness] = useState<number>(
    typeof entity?.attributes.brightness === 'number' ? Math.round((entity.attributes.brightness / 255) * 100) : 50
  )
  const [colorTemp, setColorTemp] = useState<number>(
    typeof entity?.attributes.color_temp === 'number' ? entity.attributes.color_temp : 300
  )

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Position popover near anchor, within viewport
  const vw = window.innerWidth
  const vh = window.innerHeight
  const popW = 220
  const popH = 180
  let left = anchorRect.right + 8
  let top = anchorRect.top
  if (left + popW > vw - 8) left = anchorRect.left - popW - 8
  if (left < 8) left = 8
  if (top + popH > vh - 8) top = vh - popH - 8
  if (top < 8) top = 8

  const callService = async (service: string, serviceData?: Record<string, unknown>) => {
    setBusy(true)
    try {
      await api.ha.instances.call(instanceId, domain, service, placed.entity_id, serviceData)
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  const friendlyName = entity?.attributes.friendly_name ?? placed.entity_id.split('.').slice(1).join('.')

  return (
    <div
      ref={popRef}
      className="glass"
      style={{
        position: 'fixed',
        left,
        top,
        width: popW,
        zIndex: 1000,
        borderRadius: 'var(--radius-md)',
        padding: 16,
        border: '1px solid var(--glass-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {friendlyName}
      </div>
      {!entity && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Entity nicht verfügbar</p>
      )}
      {entity && (
        <>
          {/* Light controls */}
          {domain === 'light' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className={`btn btn-${isOn ? 'ghost' : 'primary'}`}
                disabled={busy}
                onClick={() => callService(isOn ? 'turn_off' : 'turn_on')}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Power size={13} /> {isOn ? 'Ausschalten' : 'Einschalten'}
              </button>
              {isOn && (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Helligkeit: {brightness}%</div>
                    <input
                      type="range" min={1} max={100} value={brightness}
                      onChange={e => setBrightness(Number(e.target.value))}
                      onMouseUp={() => callService('turn_on', { brightness: Math.round(brightness / 100 * 255) })}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                  </div>
                  {entity.attributes.color_temp !== undefined && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Farbtemp</div>
                      <input
                        type="range"
                        min={(entity.attributes.min_color_temp_kelvin as number | undefined) ?? 2700}
                        max={(entity.attributes.max_color_temp_kelvin as number | undefined) ?? 6500}
                        value={colorTemp}
                        onChange={e => setColorTemp(Number(e.target.value))}
                        onMouseUp={() => callService('turn_on', { color_temp_kelvin: colorTemp })}
                        style={{ width: '100%', accentColor: '#f59e0b' }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Switch / input_boolean */}
          {(domain === 'switch' || domain === 'input_boolean') && (
            <button
              className={`btn btn-${isOn ? 'ghost' : 'primary'}`}
              disabled={busy}
              onClick={() => callService(isOn ? 'turn_off' : 'turn_on')}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Power size={13} /> {isOn ? 'Ausschalten' : 'Einschalten'}
            </button>
          )}

          {/* Cover */}
          {domain === 'cover' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 11 }} onClick={() => callService('open_cover')} disabled={busy}>
                <ChevronUp size={12} /> Öffnen
              </button>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 11 }} onClick={() => callService('stop_cover')} disabled={busy}>
                ■ Stop
              </button>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 11 }} onClick={() => callService('close_cover')} disabled={busy}>
                <ChevronDown size={12} /> Schließen
              </button>
            </div>
          )}

          {/* Scene / script */}
          {(domain === 'scene' || domain === 'script') && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => callService(domain === 'scene' ? 'turn_on' : 'turn_on')}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Play size={13} />{t('ha.floorplan.run')}
            </button>
          )}

          {/* Climate */}
          {domain === 'climate' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                {t('ha.floorplan.mode')}: {state} · {entity.attributes.current_temperature}° {t('ha.floorplan.current')}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                <button className="btn btn-ghost" style={{ padding: '4px 12px' }}
                  onClick={() => callService('set_temperature', { temperature: (entity.attributes.temperature as number ?? 20) - 0.5 })}
                  disabled={busy}>−</button>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{entity.attributes.temperature !== undefined ? (() => { const f = formatTemperature(entity.attributes.temperature as number, '°C', tempUnit); return f.value + f.unit })() : '—'}</span>
                <button className="btn btn-ghost" style={{ padding: '4px 12px' }}
                  onClick={() => callService('set_temperature', { temperature: (entity.attributes.temperature as number ?? 20) + 0.5 })}
                  disabled={busy}>+</button>
              </div>
            </div>
          )}

          {/* Sensor / person / other: read-only */}
          {(domain === 'sensor' || domain === 'binary_sensor' || domain === 'person' || domain === 'device_tracker') && (
            <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
              {(() => { const ru = entity.attributes.unit_of_measurement as string | undefined; const isTemp = entity.attributes.device_class === 'temperature' || ru === '°C'; if (isTemp && ru) { const f = formatTemperature(entity.state, ru, tempUnit); return f.value + f.unit } return entity.state + (ru ? ` ${ru}` : '') })()}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Canvas Component ─────────────────────────────────────────────────────

interface HaFloorplanCanvasProps {
  floorplan: HaFloorplan
  placedEntities: HaFloorplanEntity[]
  entityStates: Record<string, HaEntityFull>
  editMode: boolean
  placingEntity: HaEntityFull | null
  snapToGrid: boolean
  selectedMarker: string | null
  onSelectMarker: (id: string | null) => void
  onPlace: (posX: number, posY: number) => void
  onMove: (entityId: string, newX: number, newY: number) => Promise<void>
  instances: HaInstance[]
  onShowHistory?: (entity: HaEntityFull, instanceId: string) => void
}

export function HaFloorplanCanvas({
  floorplan,
  placedEntities,
  entityStates,
  editMode,
  placingEntity,
  snapToGrid,
  selectedMarker,
  onSelectMarker,
  onPlace,
  onMove,
  instances,
  onShowHistory,
}: HaFloorplanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const draggingRef = useRef<{ markerId: string; startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const panningRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const pinchRef = useRef<{ dist: number; startZoom: number } | null>(null)
  const [popover, setPopover] = useState<{ placedId: string; rect: DOMRect } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ placedId: string; x: number; y: number } | null>(null)
  // Local drag position override — avoids calling onMove on every mousemove
  const [localDragPos, setLocalDragPos] = useState<Record<string, { posX: number; posY: number }>>({})
  const localDragPosRef = useRef<Record<string, { posX: number; posY: number }>>({})
  const snapToGridRef = useRef(snapToGrid)
  useEffect(() => { snapToGridRef.current = snapToGrid }, [snapToGrid])

  const isPortrait = floorplan.orientation === 'portrait'

  // Reset zoom/pan when floorplan changes
  useEffect(() => {
    setZoom(1)
    setPanX(0)
    setPanY(0)
    setPopover(null)
  }, [floorplan.id])

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '=' || e.key === '+') setZoom(z => Math.min(3, z + 0.2))
      if (e.key === '-') setZoom(z => Math.max(0.5, z - 0.2))
      if (e.key === '0') { setZoom(1); setPanX(0); setPanY(0) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setZoom(z => Math.max(0.5, Math.min(3, z + delta)))
  }, [])

  // Calculate % position from mouse event on container
  const getCanvasPos = useCallback((clientX: number, clientY: number): { posX: number; posY: number } => {
    const container = containerRef.current
    if (!container) return { posX: 50, posY: 50 }
    const rect = container.getBoundingClientRect()
    const W = rect.width
    const H = rect.height
    const cx = W / 2
    const cy = H / 2
    const rx = clientX - rect.left
    const ry = clientY - rect.top
    const x = cx + (rx - cx - panX) / zoom
    const y = cy + (ry - cy - panY) / zoom
    return {
      posX: Math.max(0, Math.min(100, (x / W) * 100)),
      posY: Math.max(0, Math.min(100, (y / H) * 100)),
    }
  }, [zoom, panX, panY])

  // Canvas click: place entity or deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (draggingRef.current) return
    if (panningRef.current) return
    setContextMenu(null)
    if (placingEntity && editMode) {
      const { posX, posY } = getCanvasPos(e.clientX, e.clientY)
      const snapped = snapToGrid ? {
        posX: Math.round(posX / 5) * 5,
        posY: Math.round(posY / 5) * 5,
      } : { posX, posY }
      onPlace(snapped.posX, snapped.posY)
      return
    }
    if (editMode) onSelectMarker(null)
    setPopover(null)
  }, [placingEntity, editMode, getCanvasPos, onPlace, onSelectMarker, snapToGrid])

  // Desktop pan start
  const handleMouseDownCanvas = useCallback((e: React.MouseEvent) => {
    if (placingEntity) return
    if ((e.target as HTMLElement).closest('[data-marker]')) return
    panningRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY }
  }, [placingEntity, panX, panY])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingRef.current) {
      const { markerId, startX, startY, startPosX, startPosY } = draggingRef.current
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const dx = (e.clientX - startX) / zoom
      const dy = (e.clientY - startY) / zoom
      const newPosX = Math.max(0, Math.min(100, startPosX + (dx / rect.width) * 100))
      const newPosY = Math.max(0, Math.min(100, startPosY + (dy / rect.height) * 100))
      const sg = snapToGridRef.current
      const pos = sg ? {
        posX: Math.round(newPosX / 5) * 5,
        posY: Math.round(newPosY / 5) * 5,
      } : { posX: newPosX, posY: newPosY }
      // Update local drag position for smooth visual (no API call on move)
      localDragPosRef.current = { ...localDragPosRef.current, [markerId]: pos }
      setLocalDragPos({ ...localDragPosRef.current })
      return
    }
    if (panningRef.current) {
      const dx = e.clientX - panningRef.current.startX
      const dy = e.clientY - panningRef.current.startY
      setPanX(panningRef.current.startPanX + dx)
      setPanY(panningRef.current.startPanY + dy)
    }
  }, [zoom])

  const handleMouseUp = useCallback(() => {
    // Persist final drag position via onMove on mouseup only
    if (draggingRef.current) {
      const { markerId } = draggingRef.current
      const finalPos = localDragPosRef.current[markerId]
      if (finalPos) {
        onMove(markerId, finalPos.posX, finalPos.posY).catch(() => {})
        const next = { ...localDragPosRef.current }
        delete next[markerId]
        localDragPosRef.current = next
        setLocalDragPos(next)
      }
    }
    draggingRef.current = null
    panningRef.current = null
  }, [onMove])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // Touch pan/pinch/drag
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const dx = e.touches[0]!.clientX - e.touches[1]!.clientX
      const dy = e.touches[0]!.clientY - e.touches[1]!.clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = dist / pinchRef.current.dist
      setZoom(z => Math.max(0.5, Math.min(3, pinchRef.current!.startZoom * scale)))
    } else if (e.touches.length === 1) {
      if (draggingRef.current) {
        e.preventDefault()
        const { markerId, startX, startY, startPosX, startPosY } = draggingRef.current
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const touch = e.touches[0]!
        const dx = (touch.clientX - startX) / zoom
        const dy = (touch.clientY - startY) / zoom
        const newPosX = Math.max(0, Math.min(100, startPosX + (dx / rect.width) * 100))
        const newPosY = Math.max(0, Math.min(100, startPosY + (dy / rect.height) * 100))
        const sg = snapToGridRef.current
        const pos = sg ? {
          posX: Math.round(newPosX / 5) * 5,
          posY: Math.round(newPosY / 5) * 5,
        } : { posX: newPosX, posY: newPosY }
        localDragPosRef.current = { ...localDragPosRef.current, [markerId]: pos }
        setLocalDragPos({ ...localDragPosRef.current })
      } else if (panningRef.current) {
        const dx = e.touches[0]!.clientX - panningRef.current.startX
        const dy = e.touches[0]!.clientY - panningRef.current.startY
        setPanX(panningRef.current.startPanX + dx)
        setPanY(panningRef.current.startPanY + dy)
      }
    }
  }, [zoom])

  const handleTouchEnd = useCallback(() => {
    if (draggingRef.current) {
      const { markerId } = draggingRef.current
      const finalPos = localDragPosRef.current[markerId]
      if (finalPos) {
        onMove(markerId, finalPos.posX, finalPos.posY).catch(() => {})
        const next = { ...localDragPosRef.current }
        delete next[markerId]
        localDragPosRef.current = next
        setLocalDragPos(next)
      }
    }
    draggingRef.current = null
    panningRef.current = null
    pinchRef.current = null
  }, [onMove])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)
    return () => {
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchMove, handleTouchEnd])

  const handleMarkerDragStart = useCallback((markerId: string, e: React.MouseEvent | React.TouchEvent) => {
    if (!editMode) return
    const placed = placedEntities.find(p => p.id === markerId)
    if (!placed) return
    if ('touches' in e) {
      panningRef.current = null
      draggingRef.current = {
        markerId,
        startX: e.touches[0]!.clientX,
        startY: e.touches[0]!.clientY,
        startPosX: placed.pos_x,
        startPosY: placed.pos_y,
      }
    } else {
      panningRef.current = null
      draggingRef.current = {
        markerId,
        startX: e.clientX,
        startY: e.clientY,
        startPosX: placed.pos_x,
        startPosY: placed.pos_y,
      }
    }
  }, [editMode, placedEntities])

  const handleMarkerClick = useCallback((placedId: string, rect: DOMRect) => {
    setContextMenu(null)
    setPopover({ placedId, rect })
  }, [])

  const handleMarkerContextMenu = useCallback((placedId: string, x: number, y: number) => {
    setPopover(null)
    setContextMenu({ placedId, x, y })
  }, [])

  const cursor = placingEntity ? 'crosshair' : panningRef.current ? 'grabbing' : 'grab'
  const hasImage = Boolean(floorplan.image_url)
  const hasEntities = placedEntities.length > 0

  const firstInstance = instances[0]

  return (
    <div style={{ position: 'relative' }}>
      {/* Canvas container */}
      <div
        ref={containerRef}
        className="glass"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: isPortrait ? '9/16' : '16/9',
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)',
          cursor,
          userSelect: 'none',
          border: '1px solid var(--glass-border)',
        }}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDownCanvas}
        onTouchStart={e => {
          if (e.touches.length === 2) {
            const dx = e.touches[0]!.clientX - e.touches[1]!.clientX
            const dy = e.touches[0]!.clientY - e.touches[1]!.clientY
            pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), startZoom: zoom }
          } else if (e.touches.length === 1 && !placingEntity) {
            panningRef.current = { startX: e.touches[0]!.clientX, startY: e.touches[0]!.clientY, startPanX: panX, startPanY: panY }
          }
        }}
      >
        {/* Inner transformed content */}
        <div
          ref={innerRef}
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: 'center',
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transition: panningRef.current ? 'none' : 'transform 0.05s ease-out',
          }}
        >
          {/* Background image */}
          {hasImage && (
            <img
              src={floorplan.image_url!}
              alt={floorplan.name}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
              draggable={false}
            />
          )}

          {/* Dot grid (no image) */}
          {!hasImage && (
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle, var(--text-muted) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              opacity: 0.3,
              pointerEvents: 'none',
            }} />
          )}

          {/* Entity markers */}
          {placedEntities.map(placed => {
            const dragPos = localDragPos[placed.id]
            const effectivePlaced = dragPos
              ? { ...placed, pos_x: dragPos.posX, pos_y: dragPos.posY }
              : placed
            return (
              <EntityMarker
                key={placed.id}
                placed={effectivePlaced}
                entity={entityStates[placed.entity_id]}
                editMode={editMode}
                isSelected={selectedMarker === placed.id}
                zoom={zoom}
                onSelect={onSelectMarker}
                onDragStart={handleMarkerDragStart}
                onClick={handleMarkerClick}
                onContextMenu={handleMarkerContextMenu}
              />
            )
          })}
        </div>

        {/* Empty state overlay */}
        {!hasImage && !hasEntities && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>{floorplan.icon}</div>
            {editMode ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '0 24px' }}>
                Lade ein Grundriss-Bild hoch und platziere Entities
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '0 24px' }}>
                Im Bearbeitungsmodus Entities platzieren
              </p>
            )}
          </div>
        )}

        {/* Placing entity hint */}
        {placingEntity && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--accent)', color: '#fff', fontSize: 12, padding: '4px 12px',
            borderRadius: 'var(--radius-sm)', pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            Klicke um {placingEntity.attributes.friendly_name ?? placingEntity.entity_id} zu platzieren
          </div>
        )}
      </div>

      {/* Zoom controls (top-right, outside transform) */}
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 20 }}>
        <button
          className="btn btn-ghost"
          onClick={e => { e.stopPropagation(); setZoom(z => Math.min(3, z + 0.25)) }}
          style={{ padding: '4px 8px', minWidth: 'unset' }}
          title="Zoom in"
        ><ZoomIn size={14} /></button>
        <button
          className="btn btn-ghost"
          onClick={e => { e.stopPropagation(); setZoom(z => Math.max(0.5, z - 0.25)) }}
          style={{ padding: '4px 8px', minWidth: 'unset' }}
          title="Zoom out"
        ><ZoomOut size={14} /></button>
        <button
          className="btn btn-ghost"
          onClick={e => { e.stopPropagation(); setZoom(1); setPanX(0); setPanY(0) }}
          style={{ padding: '4px 8px', minWidth: 'unset' }}
          title="Zoom zurücksetzen"
        ><RotateCcw size={14} /></button>
      </div>

      {/* Quick-control popover */}
      {popover && firstInstance && (() => {
        const placed = placedEntities.find(p => p.id === popover.placedId)
        if (!placed) return null
        return (
          <QuickControlPopover
            key={popover.placedId}
            placedId={popover.placedId}
            placed={placed}
            entity={entityStates[placed.entity_id]}
            anchorRect={popover.rect}
            instanceId={firstInstance.id}
            onClose={() => setPopover(null)}
          />
        )
      })()}

      {/* Right-click context menu */}
      {contextMenu && firstInstance && (() => {
        const placed = placedEntities.find(p => p.id === contextMenu.placedId)
        if (!placed) return null
        const entity = entityStates[placed.entity_id]
        if (!entity || !onShowHistory) return null
        return (
          <div
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 9999,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              minWidth: 160,
              overflow: 'hidden',
            }}
          >
            <button
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 14px', fontSize: 13, color: 'var(--text-primary)',
              }}
              onClick={() => {
                setContextMenu(null)
                onShowHistory(entity, firstInstance.id)
              }}
            >
              Verlauf anzeigen
            </button>
          </div>
        )
      })()}
    </div>
  )
}
