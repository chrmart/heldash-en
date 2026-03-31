import React, { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Pencil, Trash2, Loader, ToggleLeft, ToggleRight,
  Thermometer, Droplets, Zap, Wind, Eye, Activity, Gauge,
  SkipBack, Play, Pause, SkipForward, ChevronUp, ChevronDown,
  Lock, Unlock, Shield, X, Clock,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHaStore } from '../store/useHaStore'
import { useStore } from '../store/useStore'
import { formatTemperature } from '../utils'
import type { HaPanel, HaEntityFull } from '../types'

// ── Relative time ──────────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return new Date(iso).toLocaleDateString()
}

function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => formatRelativeTime(iso))
  useEffect(() => {
    setLabel(formatRelativeTime(iso))
    const id = setInterval(() => setLabel(formatRelativeTime(iso)), 60_000)
    return () => clearInterval(id)
  }, [iso])
  return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Updated {label}</span>
}

// ── Domain helpers ─────────────────────────────────────────────────────────────

function getDomain(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

function stateColor(state: string): string {
  if (['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(state)) return 'var(--status-online)'
  if (['off', 'closed', 'locked', 'paused', 'idle', 'standby', 'unavailable', 'unknown'].includes(state)) return 'var(--text-muted)'
  return 'var(--text-primary)'
}

function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    light: 'Light', switch: 'Switch', sensor: 'Sensor', binary_sensor: 'Binary Sensor',
    climate: 'Climate', cover: 'Cover', media_player: 'Media Player', input_boolean: 'Input Boolean',
    automation: 'Automation', fan: 'Fan', lock: 'Lock', scene: 'Scene', script: 'Script',
  }
  return labels[domain] ?? domain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Optimistic update helper ───────────────────────────────────────────────────

function buildOptimistic(
  entity: HaEntityFull,
  patchState?: string,
  patchAttrs?: Partial<HaEntityFull['attributes']>,
): HaEntityFull {
  const now = new Date().toISOString()
  return {
    ...entity,
    state: patchState ?? entity.state,
    attributes: patchAttrs ? { ...entity.attributes, ...patchAttrs } : entity.attributes,
    last_updated: now,
    last_changed: patchState != null && patchState !== entity.state ? now : entity.last_changed,
  }
}

// ── Shared card shell ──────────────────────────────────────────────────────────

interface ShellProps {
  panel: HaPanel
  entity: HaEntityFull | undefined
  onEdit: () => void
  onRemove: () => void
  onShowHistory?: (entity: HaEntityFull) => void
  isAdmin?: boolean
  dragHandleProps: { attributes: object; listeners: object | undefined }
  children: React.ReactNode
}

function PanelCardShell({ panel, entity, onEdit, onRemove, onShowHistory, isAdmin, dragHandleProps, children }: ShellProps) {
  const { t } = useTranslation()
  const domain = getDomain(panel.entity_id)
  const label = panel.label || entity?.attributes.friendly_name || panel.entity_id

  return (
    <div className="widget-card glass">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div
          {...(dragHandleProps.attributes as React.HTMLAttributes<HTMLDivElement>)}
          {...(dragHandleProps.listeners as React.HTMLAttributes<HTMLDivElement>)}
          style={{ cursor: 'grab', color: 'var(--text-muted)', opacity: 0, transition: 'opacity var(--transition-fast)', flexShrink: 0, marginTop: 2 }}
          className="drag-handle"
        >
          <GripVertical size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {domainLabel(domain)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, opacity: 0, transition: 'opacity var(--transition-fast)' }} className="card-actions">
          {isAdmin && entity && onShowHistory && (
            <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22 }} onClick={() => onShowHistory(entity)} data-tooltip={t('ha.history.title')}>
              <Clock size={11} />
            </button>
          )}
          <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22 }} onClick={onEdit} data-tooltip="Edit label">
            <Pencil size={11} />
          </button>
          <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22, color: 'var(--status-offline)' }} onClick={onRemove} data-tooltip="Remove panel">
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Domain content */}
      {children}

      {/* Footer timestamp */}
      {entity && (
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <RelativeTime iso={entity.last_updated} />
        </div>
      )}
    </div>
  )
}

// ── Toggle button helper ───────────────────────────────────────────────────────

function ToggleBtn({ isOn, busy, onToggle }: { isOn: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={busy ? undefined : onToggle}
      style={{ background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', color: isOn ? 'var(--status-online)' : 'var(--text-muted)', flexShrink: 0 }}
      data-tooltip={isOn ? 'Turn off' : 'Turn on'}
    >
      {busy
        ? <Loader size={22} className="spin" />
        : isOn ? <ToggleRight size={28} /> : <ToggleLeft size={28} />
      }
    </button>
  )
}

// ── Light card ─────────────────────────────────────────────────────────────────
// Bug B: toggle always visible regardless of on/off state
// Bug C: localBrightness / localColorTemp cleared only after service call +
//        optimistic update, preventing WS events from causing slider flicker

function LightCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService, updateEntityState } = useHaStore()
  const [busy, setBusy] = useState(false)
  const [localBrightness, setLocalBrightness] = useState<number | null>(null)
  const [localColorTemp, setLocalColorTemp] = useState<number | null>(null)
  const [isDraggingBrightness, setIsDraggingBrightness] = useState(false)
  const [isDraggingColorTemp, setIsDraggingColorTemp] = useState(false)
  const brightRef = useRef<ReturnType<typeof setTimeout>>()
  const tempRef = useRef<ReturnType<typeof setTimeout>>()

  const isOn = entity.state === 'on'
  const brightness = entity.attributes.brightness
  const colorTemp = entity.attributes.color_temp
  const minK = entity.attributes.min_color_temp_kelvin ?? 2700
  const maxK = entity.attributes.max_color_temp_kelvin ?? 6500

  // Bug B: always use turn_on / turn_off explicitly (never light.toggle)
  const toggle = async () => {
    setBusy(true)
    const nextState = isOn ? 'off' : 'on'
    try {
      await callService(instanceId, 'light', isOn ? 'turn_off' : 'turn_on', panel.entity_id)
      // Bug A: optimistic update — WS event will confirm shortly
      updateEntityState(instanceId, entity.entity_id, buildOptimistic(entity, nextState))
    } finally {
      setBusy(false)
    }
  }

  // Bug C: clear local state only after service + optimistic update are applied
  const handleBrightness = (val: number) => {
    setLocalBrightness(val)
    setIsDraggingBrightness(true)
    clearTimeout(brightRef.current)
    brightRef.current = setTimeout(async () => {
      try {
        await callService(instanceId, 'light', 'turn_on', panel.entity_id, { brightness: val })
        updateEntityState(instanceId, entity.entity_id,
          buildOptimistic(entity, 'on', { brightness: val }))
      } finally {
        setLocalBrightness(null)
        setIsDraggingBrightness(false)
      }
    }, 300)
  }

  const handleColorTemp = (val: number) => {
    setLocalColorTemp(val)
    setIsDraggingColorTemp(true)
    clearTimeout(tempRef.current)
    tempRef.current = setTimeout(async () => {
      const mired = Math.round(1_000_000 / val)
      try {
        await callService(instanceId, 'light', 'turn_on', panel.entity_id, { color_temp_kelvin: val })
        updateEntityState(instanceId, entity.entity_id,
          buildOptimistic(entity, 'on', { color_temp: mired }))
      } finally {
        setLocalColorTemp(null)
        setIsDraggingColorTemp(false)
      }
    }, 300)
  }

  // While dragging use local value; otherwise use entity value
  const displayBrightness = (isDraggingBrightness || localBrightness !== null) ? localBrightness : brightness
  const colorTempK = colorTemp !== undefined ? Math.round(1_000_000 / colorTemp) : undefined
  const displayColorTempK = (isDraggingColorTemp || localColorTemp !== null) ? localColorTemp : colorTempK

  return (
    <div>
      {/* Bug B: toggle is always rendered (visible when on AND off) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stateColor(entity.state) }}>
          {entity.state}
        </span>
        <ToggleBtn isOn={isOn} busy={busy} onToggle={toggle} />
      </div>
      {/* Bug B: sliders only when light is on */}
      {isOn && displayBrightness !== undefined && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Brightness {Math.round(((displayBrightness ?? 0) / 255) * 100)}%
          </div>
          <input
            type="range" className="ha-slider" min={0} max={255}
            value={displayBrightness ?? 0}
            onChange={e => handleBrightness(Number(e.target.value))}
            onPointerUp={() => setIsDraggingBrightness(false)}
          />
        </div>
      )}
      {isOn && displayColorTempK !== undefined && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Color Temp</div>
          <input
            type="range" className="ha-slider" min={minK} max={maxK}
            value={displayColorTempK ?? minK}
            onChange={e => handleColorTemp(Number(e.target.value))}
            onPointerUp={() => setIsDraggingColorTemp(false)}
          />
        </div>
      )}
    </div>
  )
}

// ── Climate card ───────────────────────────────────────────────────────────────

function ClimateCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService, updateEntityState } = useHaStore()
  const { settings } = useStore()
  const tempUnit = settings?.temp_unit ?? 'celsius'
  const attrs = entity.attributes
  const current = attrs.current_temperature
  const target = attrs.temperature
  const rawUnit = (attrs.unit_of_measurement as string | undefined) ?? '°C'
  const fmtTemp = (val: number | undefined) => val !== undefined ? formatTemperature(val, rawUnit, tempUnit) : null
  const currentFmt = fmtTemp(current as number | undefined)
  const targetFmt = fmtTemp(target as number | undefined)
  const displayUnit = currentFmt?.unit ?? targetFmt?.unit ?? rawUnit
  const hvacMode = attrs.hvac_mode ?? entity.state
  const hvacModes = attrs.hvac_modes ?? []
  const minTemp = attrs.min_temp ?? 7
  const maxTemp = attrs.max_temp ?? 35

  const setTemp = async (delta: number) => {
    const newTemp = Math.min(maxTemp, Math.max(minTemp, (target ?? current ?? 20) + delta))
    try {
      await callService(instanceId, 'climate', 'set_temperature', panel.entity_id, { temperature: newTemp })
      updateEntityState(instanceId, entity.entity_id,
        buildOptimistic(entity, undefined, { temperature: newTemp }))
    } catch { /* ignore */ }
  }

  const setMode = async (mode: string) => {
    try {
      await callService(instanceId, 'climate', 'set_hvac_mode', panel.entity_id, { hvac_mode: mode })
      updateEntityState(instanceId, entity.entity_id,
        buildOptimistic(entity, mode, { hvac_mode: mode }))
    } catch { /* ignore */ }
  }

  return (
    <div>
      {current !== undefined && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          Current: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentFmt ? `${currentFmt.value}${displayUnit}` : `${current}${rawUnit}`}</span>
        </div>
      )}
      {target !== undefined && (
        <div className="ha-climate-temp">
          <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => setTemp(-0.5)}>
            <ChevronDown size={14} />
          </button>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {targetFmt ? `${targetFmt.value}${displayUnit}` : `${target}${rawUnit}`}
          </span>
          <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => setTemp(0.5)}>
            <ChevronUp size={14} />
          </button>
        </div>
      )}
      {hvacModes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {hvacModes.map(mode => (
            <button
              key={mode}
              className="ha-tab-btn"
              style={{ fontSize: 10, padding: '2px 8px', ...(mode === hvacMode ? { background: 'var(--accent)', color: 'var(--bg-primary)', borderColor: 'var(--accent)' } : {}) }}
              onClick={() => setMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      )}
      {hvacModes.length === 0 && (
        <div style={{ fontSize: 13, color: stateColor(entity.state), marginTop: 4 }}>{hvacMode}</div>
      )}
    </div>
  )
}

// ── Media player card ──────────────────────────────────────────────────────────

function MediaPlayerCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService, updateEntityState } = useHaStore()
  const attrs = entity.attributes
  const volRef = useRef<ReturnType<typeof setTimeout>>()

  const isPlaying = entity.state === 'playing'
  const volume = attrs.volume_level

  const call = async (svc: string, data?: Record<string, unknown>) => {
    try {
      await callService(instanceId, 'media_player', svc, panel.entity_id, data)
      if (svc === 'media_play_pause') {
        const nextState = entity.state === 'playing' ? 'paused' : 'playing'
        updateEntityState(instanceId, entity.entity_id, buildOptimistic(entity, nextState))
      }
    } catch { /* ignore */ }
  }

  const handleVolume = (val: number) => {
    clearTimeout(volRef.current)
    volRef.current = setTimeout(async () => {
      try {
        await callService(instanceId, 'media_player', 'volume_set', panel.entity_id, { volume_level: val })
        updateEntityState(instanceId, entity.entity_id,
          buildOptimistic(entity, undefined, { volume_level: val }))
      } catch { /* ignore */ }
    }, 300)
  }

  const pictureSrc = attrs.entity_picture?.startsWith('http') ? attrs.entity_picture : undefined

  return (
    <div>
      {pictureSrc && (
        <img src={pictureSrc} alt="album art" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 8 }} />
      )}
      {(attrs.media_title || attrs.media_artist) && (
        <div style={{ marginBottom: 8 }}>
          {attrs.media_title && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attrs.media_title}
            </div>
          )}
          {attrs.media_artist && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attrs.media_artist}
            </div>
          )}
        </div>
      )}
      {!attrs.media_title && !attrs.media_artist && (
        <div style={{ fontSize: 13, color: stateColor(entity.state), marginBottom: 8 }}>{entity.state}</div>
      )}
      <div className="ha-media-controls">
        <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => call('media_previous_track')}>
          <SkipBack size={13} />
        </button>
        <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => call('media_play_pause')}>
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => call('media_next_track')}>
          <SkipForward size={13} />
        </button>
      </div>
      {volume !== undefined && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Volume {Math.round(volume * 100)}%
          </div>
          <input
            type="range" className="ha-slider" min={0} max={1} step={0.01}
            defaultValue={volume}
            onChange={e => handleVolume(Number(e.target.value))}
          />
        </div>
      )}
      {attrs.source_list && attrs.source_list.length > 0 && (
        <select
          className="form-input"
          style={{ fontSize: 11, padding: '4px 8px', marginTop: 8 }}
          value={attrs.source ?? ''}
          onChange={e => call('select_source', { source: e.target.value })}
        >
          <option value="" disabled>Source</option>
          {attrs.source_list.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  )
}

// ── Cover card ─────────────────────────────────────────────────────────────────

const COVER_OPTIMISTIC_STATE: Record<string, string> = {
  open_cover: 'opening',
  close_cover: 'closing',
  stop_cover: 'idle',
}

function CoverCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService, updateEntityState } = useHaStore()
  const posRef = useRef<ReturnType<typeof setTimeout>>()
  const isOpen = entity.state === 'open'
  const isClosed = entity.state === 'closed'
  const pos = entity.attributes.current_position

  const call = async (svc: string, data?: Record<string, unknown>) => {
    try {
      await callService(instanceId, 'cover', svc, panel.entity_id, data)
      const nextState = COVER_OPTIMISTIC_STATE[svc]
      if (nextState) {
        updateEntityState(instanceId, entity.entity_id, buildOptimistic(entity, nextState))
      }
    } catch { /* ignore */ }
  }

  const handlePosition = (val: number) => {
    clearTimeout(posRef.current)
    posRef.current = setTimeout(async () => {
      try {
        await callService(instanceId, 'cover', 'set_cover_position', panel.entity_id, { position: val })
        updateEntityState(instanceId, entity.entity_id,
          buildOptimistic(entity, undefined, { current_position: val }))
      } catch { /* ignore */ }
    }, 300)
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: stateColor(entity.state), marginBottom: 8 }}>{entity.state}</div>
      <div className="ha-cover-buttons">
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} disabled={isOpen} onClick={() => call('open_cover')}>Open</button>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => call('stop_cover')}>Stop</button>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} disabled={isClosed} onClick={() => call('close_cover')}>Close</button>
      </div>
      {pos !== undefined && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Position {pos}%</div>
          <input
            type="range" className="ha-slider" min={0} max={100}
            defaultValue={pos}
            onChange={e => handlePosition(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}

// ── Sensor card ────────────────────────────────────────────────────────────────

function SensorIcon({ deviceClass }: { deviceClass: string | undefined }) {
  const icons: Record<string, React.ReactNode> = {
    temperature: <Thermometer size={18} />,
    humidity: <Droplets size={18} />,
    power: <Zap size={18} />,
    wind_speed: <Wind size={18} />,
    illuminance: <Eye size={18} />,
    signal_strength: <Activity size={18} />,
    pressure: <Gauge size={18} />,
  }
  return <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{icons[deviceClass ?? ''] ?? <Activity size={18} />}</span>
}

function SensorCard({ entity }: { entity: HaEntityFull }) {
  const { settings } = useStore()
  const tempUnit = settings?.temp_unit ?? 'celsius'
  const rawUnit = entity.attributes.unit_of_measurement
  const isBinary = getDomain(entity.entity_id) === 'binary_sensor'
  const isOn = entity.state === 'on'
  const isTempSensor = entity.attributes.device_class === 'temperature' || rawUnit === '°C'
  const { value: displayValue, unit: displayUnit } = isTempSensor && rawUnit
    ? formatTemperature(entity.state, rawUnit as string, tempUnit)
    : { value: entity.state, unit: (rawUnit ?? '') as string }

  if (isBinary) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-sm)',
          background: isOn ? 'rgba(var(--accent-rgb),0.15)' : 'var(--surface-2)',
          color: isOn ? 'var(--status-online)' : 'var(--text-muted)',
        }}>
          {entity.state}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <SensorIcon deviceClass={entity.attributes.device_class} />
      <div>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {displayValue}
        </span>
        {displayUnit && <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 3 }}>{displayUnit}</span>}
      </div>
    </div>
  )
}

// ── Script / Scene card ────────────────────────────────────────────────────────

function ScriptSceneCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService, updateEntityState } = useHaStore()
  const [busy, setBusy] = useState(false)
  const domain = getDomain(panel.entity_id)
  const isScript = domain === 'script'

  const run = async () => {
    setBusy(true)
    try {
      await callService(instanceId, domain, 'turn_on', panel.entity_id)
      updateEntityState(instanceId, entity.entity_id, buildOptimistic(entity))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{entity.state}</span>
      <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 12px', gap: 4 }} onClick={run} disabled={busy}>
        {busy ? <Loader size={12} className="spin" /> : null}
        {isScript ? 'Run' : 'Activate'}
      </button>
    </div>
  )
}

// ── PIN Modal ─────────────────────────────────────────────────────────────────

interface PinModalProps {
  title: string
  onConfirm: (pin: string) => void
  onClose: () => void
}

function PinModal({ title, onConfirm, onClose }: PinModalProps) {
  const [pin, setPin] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleDigit = (d: string) => {
    if (pin.length < 8) setPin(p => p + d)
  }
  const handleDelete = () => setPin(p => p.slice(0, -1))
  const handleConfirm = () => {
    if (pin.length === 0) return
    onConfirm(pin)
    setPin('')
  }

  return (
    <div className="pin-modal-overlay" onClick={onClose}>
      <div className="pin-modal" onClick={e => e.stopPropagation()}>
        <div className="pin-modal-header">
          <span>{title}</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="pin-dots">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <div key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />
          ))}
        </div>
        <div className="pin-pad">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
            <button
              key={i}
              className={`pin-key${key === '' ? ' pin-key-empty' : ''}`}
              disabled={key === ''}
              onClick={() => {
                if (key === '⌫') handleDelete()
                else if (key !== '') handleDigit(key)
              }}
            >{key}</button>
          ))}
        </div>
        <button className="btn btn-primary pin-confirm" onClick={handleConfirm} disabled={pin.length === 0}>
          Bestätigen
        </button>
      </div>
    </div>
  )
}

// ── Lock card ─────────────────────────────────────────────────────────────────

interface LockCardProps {
  entity: HaEntityFull
  panel: HaPanel
  instanceId: string
  onCall: (domain: string, service: string, entityId: string, serviceData?: Record<string, unknown>) => Promise<void>
}

function LockCard({ entity, panel, onCall }: LockCardProps) {
  const [showPin, setShowPin] = useState(false)
  const [pendingAction, setPendingAction] = useState<'lock' | 'unlock' | null>(null)
  const [busy, setBusy] = useState(false)

  const isLocked = entity.state === 'locked'
  const isUnlocked = entity.state === 'unlocked'

  const handleToggle = () => {
    setPendingAction(isLocked ? 'unlock' : 'lock')
    setShowPin(true)
  }

  const handlePinConfirm = async (pin: string) => {
    setShowPin(false)
    if (!pendingAction) return
    setBusy(true)
    try {
      await onCall('lock', pendingAction, panel.entity_id, { code: pin })
    } finally {
      setBusy(false)
      setPendingAction(null)
    }
  }

  const stateLabel = isLocked ? 'Gesperrt' : isUnlocked ? 'Entsperrt' : 'Unbekannt'
  const stateColor = isLocked ? 'var(--status-offline)' : isUnlocked ? 'var(--status-online)' : 'var(--text-muted)'

  return (
    <div className="lock-card">
      <div className="lock-icon" style={{ color: stateColor }}>
        {isLocked ? <Lock size={48} /> : <Unlock size={48} />}
      </div>
      <div className="lock-state-badge" style={{ color: stateColor }}>{stateLabel}</div>
      <button className="btn btn-primary" onClick={handleToggle} disabled={busy}>
        {busy ? <Loader size={14} className="spin" /> : (isLocked ? 'Entsperren' : 'Sperren')}
      </button>
      {showPin && (
        <PinModal
          title={`Schloss ${(entity.attributes.friendly_name as string | undefined) ?? entity.entity_id} ${pendingAction === 'unlock' ? 'entsperren' : 'sperren'}`}
          onConfirm={handlePinConfirm}
          onClose={() => { setShowPin(false); setPendingAction(null) }}
        />
      )}
    </div>
  )
}

// ── Alarm card ─────────────────────────────────────────────────────────────────

type AlarmState = 'disarmed' | 'armed_home' | 'armed_away' | 'armed_night' | 'armed_vacation' | 'pending' | 'triggered' | 'arming' | string

interface AlarmCardProps {
  entity: HaEntityFull
  panel: HaPanel
  instanceId: string
  onCall: (domain: string, service: string, entityId: string, serviceData?: Record<string, unknown>) => Promise<void>
}

function AlarmCard({ entity, panel, onCall }: AlarmCardProps) {
  const [showPin, setShowPin] = useState(false)
  const [pendingService, setPendingService] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const state = entity.state as AlarmState

  const stateLabel: Record<string, string> = {
    disarmed: 'Deaktiviert',
    armed_home: 'Scharf (Zuhause)',
    armed_away: 'Scharf (Abwesend)',
    armed_night: 'Scharf (Nacht)',
    armed_vacation: 'Scharf (Urlaub)',
    pending: 'Ausstehend',
    triggered: 'AUSGELÖST',
    arming: 'Wird scharf...',
  }

  const stateColorMap: Record<string, string> = {
    disarmed: 'var(--status-online)',
    armed_home: 'var(--color-warning, #f59e0b)',
    armed_away: 'var(--status-offline)',
    armed_night: 'var(--color-warning, #f59e0b)',
    armed_vacation: 'var(--status-offline)',
    pending: 'var(--color-warning, #f59e0b)',
    triggered: 'var(--status-offline)',
    arming: 'var(--color-warning, #f59e0b)',
  }

  const color = stateColorMap[state] ?? 'var(--text-muted)'
  const label = stateLabel[state] ?? state

  const triggerAction = (service: string) => {
    setPendingService(service)
    setShowPin(true)
  }

  const handlePinConfirm = async (pin: string) => {
    setShowPin(false)
    if (!pendingService) return
    setBusy(true)
    try {
      await onCall('alarm_control_panel', pendingService, panel.entity_id, { code: pin })
    } finally {
      setBusy(false)
      setPendingService(null)
    }
  }

  return (
    <div className="alarm-card">
      <div className="alarm-state-icon" style={{ color }}>
        <Shield size={48} className={state === 'triggered' || state === 'pending' ? 'pulse' : ''} />
      </div>
      <div className="alarm-state-label" style={{ color }}>{label}</div>
      <div className="alarm-actions">
        {state === 'disarmed' && (
          <>
            <button className="btn btn-sm" onClick={() => triggerAction('alarm_arm_home')} disabled={busy}>Zuhause</button>
            <button className="btn btn-sm" onClick={() => triggerAction('alarm_arm_away')} disabled={busy}>Abwesend</button>
            <button className="btn btn-sm" onClick={() => triggerAction('alarm_arm_night')} disabled={busy}>Nacht</button>
          </>
        )}
        {(state.startsWith('armed_') || state === 'triggered') && (
          <button className="btn btn-primary" onClick={() => triggerAction('alarm_disarm')} disabled={busy}>Deaktivieren</button>
        )}
      </div>
      {showPin && (
        <PinModal
          title={`Alarm ${pendingService === 'alarm_disarm' ? 'disarm' : 'arm'}`}
          onConfirm={handlePinConfirm}
          onClose={() => { setShowPin(false); setPendingService(null) }}
        />
      )}
    </div>
  )
}

// ── Generic card (switch / input_boolean / automation / fan / lock / fallback) ─

const TOGGLE_DOMAINS = new Set(['switch', 'input_boolean', 'automation', 'fan', 'light', 'media_player'])
const TOGGLE_MAP: Record<string, [string, string]> = { cover: ['cover', 'toggle'], lock: ['lock', 'toggle'] }
// Domains where state is 'on'/'off' — safe for optimistic toggle
const ON_OFF_DOMAINS = new Set(['switch', 'input_boolean', 'automation', 'fan'])

function GenericCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService, updateEntityState } = useHaStore()
  const [busy, setBusy] = useState(false)

  const domain = getDomain(panel.entity_id)
  const isOn = ['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(entity.state)
  const toggleable = TOGGLE_DOMAINS.has(domain) || domain in TOGGLE_MAP

  const getToggle = (): [string, string] => {
    if (domain in TOGGLE_MAP) return TOGGLE_MAP[domain]!
    return [domain, isOn ? 'turn_off' : 'turn_on']
  }

  const toggle = async () => {
    const [d, svc] = getToggle()
    setBusy(true)
    try {
      await callService(instanceId, d, svc, panel.entity_id)
      // Apply optimistic state only for domains with clear on/off semantics
      if (ON_OFF_DOMAINS.has(domain)) {
        updateEntityState(instanceId, entity.entity_id,
          buildOptimistic(entity, isOn ? 'off' : 'on'))
      }
    } finally {
      setBusy(false)
    }
  }

  const unit = entity.attributes.unit_of_measurement as string | undefined

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stateColor(entity.state) }}>
          {entity.state}
        </span>
        {unit && <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
      </div>
      {toggleable && <ToggleBtn isOn={isOn} busy={busy} onToggle={toggle} />}
    </div>
  )
}

// ── Public export: HaPanelCard ─────────────────────────────────────────────────

export interface HaPanelCardProps {
  panel: HaPanel
  entity: HaEntityFull | undefined
  instanceId: string
  onEdit: () => void
  onRemove: () => void
  onShowHistory?: (entity: HaEntityFull) => void
  isAdmin?: boolean
}

// t() available via useTranslation in sub-components
export function HaPanelCard({ panel, entity, instanceId, onEdit, onRemove, onShowHistory, isAdmin }: HaPanelCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: panel.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const domain = getDomain(panel.entity_id)

  const { callService } = useHaStore()

  const handleCall = async (domain: string, service: string, entityId: string, serviceData?: Record<string, unknown>) => {
    await callService(instanceId, domain, service, entityId, serviceData)
  }

  const renderContent = () => {
    if (!entity) {
      return <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</div>
    }
    switch (domain) {
      case 'light':
        return <LightCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'climate':
        return <ClimateCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'media_player':
        return <MediaPlayerCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'cover':
        return <CoverCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'sensor':
      case 'binary_sensor':
        return <SensorCard entity={entity} />
      case 'script':
      case 'scene':
        return <ScriptSceneCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'lock':
        return <LockCard entity={entity} panel={panel} instanceId={instanceId} onCall={handleCall} />
      case 'alarm_control_panel':
        return <AlarmCard entity={entity} panel={panel} instanceId={instanceId} onCall={handleCall} />
      default:
        return <GenericCard panel={panel} entity={entity} instanceId={instanceId} />
    }
  }

  return (
    <div ref={setNodeRef} style={style}>
      <PanelCardShell
        panel={panel}
        entity={entity}
        onEdit={onEdit}
        onRemove={onRemove}
        onShowHistory={onShowHistory}
        isAdmin={isAdmin}
        dragHandleProps={{ attributes, listeners }}
      >
        {renderContent()}
      </PanelCardShell>
    </div>
  )
}
