import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from './Toast'
import {
  Plus, Edit2, Check, Download, Upload, Grid, Image as ImageIcon,
  Undo, Trash2, X, Search, Settings, AlertCircle, Lightbulb,
} from 'lucide-react'
import { api } from '../api'
import type { HaInstance, HaEntityFull, HaFloorplan, HaFloorplanEntity, FloorplanAction } from '../types'
import { HaFloorplanCanvas } from './HaFloorplanCanvas'
import { LS_FLOORPLAN_ACTIVE, LS_FLOORPLAN_SNAP } from '../constants'

// ── Icon presets ──────────────────────────────────────────────────────────────

const INDOOR_ICONS = ['🏠', '🔝', '🏗️', '🛏️', '🚿', '🍳', '📺', '🏋️', '🧺', '📚']
const OUTDOOR_ICONS = ['🌳', '🚗', '🏊', '🌿', '🔧', '🏡', '🌻', '🔌']

// ── AddFloorplanModal ─────────────────────────────────────────────────────────

interface AddFloorplanModalProps {
  onClose: () => void
  onSaved: () => Promise<void>
}

function AddFloorplanModal({ onClose, onSaved }: AddFloorplanModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'indoor' | 'outdoor'>('indoor')
  const [icon, setIcon] = useState('🏠')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const icons = type === 'indoor' ? INDOOR_ICONS : OUTDOOR_ICONS

  const handleSave = async () => {
    if (!name.trim()) { setError('Name erforderlich'); return }
    setSaving(true)
    setError('')
    try {
      await api.ha.floorplans.create({ name: name.trim(), type, level, icon, orientation: 'landscape' })
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass" style={{
        width: 380, borderRadius: 'var(--radius-lg)', padding: 24,
        border: '1px solid var(--glass-border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-display)' }}>Neue Etage</h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: 6 }}><X size={16} /></button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Name</label>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="z.B. Erdgeschoss"
            autoFocus
            style={{ width: '100%' }}
          />
        </div>

        {/* Type */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Typ</label>
          <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', overflow: 'hidden', width: 'fit-content' }}>
            {(['indoor', 'outdoor'] as const).map(t => (
              <button
                key={t}
                onClick={() => {
                  setType(t)
                  setIcon(t === 'indoor' ? INDOOR_ICONS[0]! : OUTDOOR_ICONS[0]!)
                }}
                style={{
                  padding: '5px 14px', border: 'none', cursor: 'pointer', fontSize: 12,
                  background: type === t ? 'var(--accent-subtle)' : 'transparent',
                  color: type === t ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: type === t ? 600 : 400,
                }}
              >
                {t === 'indoor' ? '🏠 Indoor' : '🌳 Outdoor'}
              </button>
            ))}
          </div>
        </div>

        {/* Icon */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Icon</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {icons.map(i => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                style={{
                  fontSize: 20, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${icon === i ? 'var(--accent)' : 'var(--glass-border)'}`,
                  background: icon === i ? 'var(--accent-subtle)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {/* Level */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Ebene (−2 bis 10)</label>
          <input
            className="input"
            type="number"
            min={-2}
            max={10}
            value={level}
            onChange={e => setLevel(Number(e.target.value))}
            style={{ width: 100 }}
          />
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--status-offline)', fontSize: 12, marginBottom: 12 }}>
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ gap: 6 }}>
            {saving ? 'Speichern…' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EntityBrowserPanel ────────────────────────────────────────────────────────

interface EntityBrowserPanelProps {
  entityStates: Record<string, HaEntityFull>
  activeEntities: HaFloorplanEntity[]
  placingEntity: HaEntityFull | null
  onSelect: (entity: HaEntityFull | null) => void
}

const DOMAIN_TABS = ['Alle', 'Lights', 'Switches', 'Climate', 'Covers', 'Sensors', 'Persons', 'Other'] as const
type DomainTab = (typeof DOMAIN_TABS)[number]

function domainToTab(domain: string): DomainTab {
  switch (domain) {
    case 'light': return 'Lights'
    case 'switch': case 'input_boolean': case 'automation': case 'fan': return 'Switches'
    case 'climate': return 'Climate'
    case 'cover': return 'Covers'
    case 'sensor': case 'binary_sensor': return 'Sensors'
    case 'person': case 'device_tracker': return 'Persons'
    default: return 'Other'
  }
}

function EntityBrowserPanel({ entityStates, activeEntities, placingEntity, onSelect }: EntityBrowserPanelProps) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<DomainTab>('Alle')
  const placedEntityIds = new Set(activeEntities.map(e => e.entity_id))

  const entities = Object.values(entityStates)
    .filter(e => {
      const domain = e.entity_id.split('.')[0] ?? ''
      if (tab !== 'Alle' && domainToTab(domain) !== tab) return false
      if (search) {
        const q = search.toLowerCase()
        const name = (e.attributes.friendly_name ?? e.entity_id).toLowerCase()
        return name.includes(q) || e.entity_id.includes(q)
      }
      return true
    })
    .sort((a, b) => {
      const nameA = a.attributes.friendly_name ?? a.entity_id
      const nameB = b.attributes.friendly_name ?? b.entity_id
      return nameA.localeCompare(nameB)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
        Entities
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          style={{ width: '100%', paddingLeft: 26, fontSize: 12 }}
        />
      </div>

      {/* Domain tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {DOMAIN_TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '2px 7px', borderRadius: 'var(--radius-sm)', fontSize: 10,
              border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--glass-border)'}`,
              background: tab === t ? 'var(--accent-subtle)' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Entity list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entities.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Keine Entities</p>
        )}
        {entities.map(entity => {
          const isPlaced = placedEntityIds.has(entity.entity_id)
          const isPlacing = placingEntity?.entity_id === entity.entity_id
          const name = entity.attributes.friendly_name ?? entity.entity_id.split('.').slice(1).join('.')

          return (
            <button
              key={entity.entity_id}
              onClick={() => onSelect(isPlacing ? null : entity)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 'var(--radius-sm)', textAlign: 'left',
                border: `1px solid ${isPlacing ? 'var(--accent)' : 'var(--glass-border)'}`,
                background: isPlacing ? 'var(--accent-subtle)' : 'transparent',
                cursor: 'pointer',
                opacity: entity.state === 'unavailable' ? 0.5 : 1,
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entity.entity_id}
                </div>
              </div>
              {isPlaced && (
                <div style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} title="Bereits platziert" />
              )}
            </button>
          )
        })}
      </div>

      {placingEntity && (
        <button
          className="btn btn-ghost"
          onClick={() => onSelect(null)}
          style={{ gap: 6, fontSize: 11, width: '100%', justifyContent: 'center' }}
        >
          <X size={11} /> Platzierung abbrechen
        </button>
      )}
    </div>
  )
}

// ── FloorplanSettingsPopover ──────────────────────────────────────────────────

interface FloorplanSettingsProps {
  floorplan: HaFloorplan
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onUpdated: (fp: HaFloorplan) => void
  onDeleted: (id: string) => void
  onRemoveAllEntities: () => Promise<void>
  onExportThis: () => void
}

function FloorplanSettingsPopover({ floorplan, anchorRef, onClose, onUpdated, onDeleted, onRemoveAllEntities, onExportThis }: FloorplanSettingsProps) {
  const popRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(floorplan.name)
  const [icon, setIcon] = useState(floorplan.icon)
  const [type, setType] = useState<'indoor' | 'outdoor'>(floorplan.type as 'indoor' | 'outdoor')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, anchorRef])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await api.ha.floorplans.update(floorplan.id, { name, icon, type })
      onUpdated(updated)
      onClose()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await api.ha.floorplans.delete(floorplan.id)
    onDeleted(floorplan.id)
    onClose()
  }

  const icons = type === 'indoor' ? INDOOR_ICONS : OUTDOOR_ICONS

  return (
    <div
      ref={popRef}
      className="glass"
      style={{
        position: 'absolute', right: 0, top: '100%', marginTop: 4,
        width: 280, zIndex: 200,
        borderRadius: 'var(--radius-md)', padding: 16,
        border: '1px solid var(--glass-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      {/* Name */}
      <div style={{ marginBottom: 10 }}>
        <input
          className="input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          style={{ width: '100%', fontSize: 12 }}
        />
      </div>

      {/* Icon */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {icons.map(i => (
          <button
            key={i}
            onClick={() => setIcon(i)}
            style={{
              fontSize: 16, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${icon === i ? 'var(--accent)' : 'var(--glass-border)'}`,
              background: icon === i ? 'var(--accent-subtle)' : 'transparent', cursor: 'pointer',
            }}
          >
            {i}
          </button>
        ))}
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginBottom: 12, fontSize: 12 }}>
        {saving ? 'Speichern…' : 'Speichern'}
      </button>

      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className="btn btn-ghost" onClick={onExportThis} style={{ gap: 6, fontSize: 11, justifyContent: 'flex-start' }}>
          <Download size={11} /> Exportieren
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => setConfirmClear(true)}
          style={{ gap: 6, fontSize: 11, justifyContent: 'flex-start', color: 'var(--status-offline)' }}
        >
          <Trash2 size={11} /> Alle Entities entfernen
        </button>
        {confirmClear && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 10, justifyContent: 'center', color: 'var(--status-offline)' }}
              onClick={() => { onRemoveAllEntities().catch(() => {}); setConfirmClear(false); onClose() }}>
              Ja, entfernen
            </button>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 10, justifyContent: 'center' }} onClick={() => setConfirmClear(false)}>
              Abbrechen
            </button>
          </div>
        )}
        <button
          className="btn btn-ghost"
          onClick={() => setConfirmDelete(true)}
          style={{ gap: 6, fontSize: 11, justifyContent: 'flex-start', color: 'var(--status-offline)' }}
        >
          <Trash2 size={11} /> Etage löschen
        </button>
        {confirmDelete && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 10, justifyContent: 'center', color: 'var(--status-offline)' }}
              onClick={handleDelete}>
              Ja, löschen
            </button>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 10, justifyContent: 'center' }} onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface HaFloorplanProps {
  instances: HaInstance[]
  entityStates: Record<string, HaEntityFull>
  onShowHistory?: (entity: HaEntityFull, instanceId: string) => void
}

export function HaFloorplan({ instances, entityStates, onShowHistory }: HaFloorplanProps) {
  const { toast } = useToast()
  const [floorplans, setFloorplans] = useState<HaFloorplan[]>([])
  const [entities, setEntities] = useState<Record<string, HaFloorplanEntity[]>>({})
  const [activeFloorplanId, setActiveFloorplanId] = useState<string | null>(
    () => localStorage.getItem(LS_FLOORPLAN_ACTIVE)
  )
  const [editMode, setEditMode] = useState(false)
  const [placingEntity, setPlacingEntity] = useState<HaEntityFull | null>(null)
  const [undoStack, setUndoStack] = useState<FloorplanAction[]>([])
  const [snapToGrid, setSnapToGrid] = useState(() => localStorage.getItem(LS_FLOORPLAN_SNAP) === 'true')
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLightsOffConfirm, setShowLightsOffConfirm] = useState(false)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const loadFloorplans = useCallback(async () => {
    const fps = await api.ha.floorplans.list()
    setFloorplans(fps)
    if (fps.length > 0) {
      const hasActive = fps.some(fp => fp.id === activeFloorplanId)
      if (!hasActive) {
        const first = fps[0]!
        setActiveFloorplanId(first.id)
        localStorage.setItem(LS_FLOORPLAN_ACTIVE, first.id)
      }
    } else {
      setActiveFloorplanId(null)
    }
  }, [activeFloorplanId])

  const loadEntities = useCallback(async (floorplanId: string) => {
    const ents = await api.ha.floorplans.entities.list(floorplanId)
    setEntities(prev => ({ ...prev, [floorplanId]: ents }))
  }, [])

  useEffect(() => {
    loadFloorplans().catch(() => {})
  }, [])

  useEffect(() => {
    if (activeFloorplanId) {
      loadEntities(activeFloorplanId).catch(() => {})
    }
  }, [activeFloorplanId])

  // Reset undo/placement when switching floorplans
  useEffect(() => {
    setUndoStack([])
    setPlacingEntity(null)
    setSelectedMarker(null)
    setShowSettings(false)
  }, [activeFloorplanId])

  const activeFloorplan = floorplans.find(fp => fp.id === activeFloorplanId) ?? null
  const activeEntities = activeFloorplanId ? (entities[activeFloorplanId] ?? []) : []

  // Light entity IDs on this floorplan
  const lightEntityIds = activeEntities
    .filter(e => e.entity_id.startsWith('light.'))
    .map(e => e.entity_id)

  const selectFloorplan = (id: string) => {
    setActiveFloorplanId(id)
    localStorage.setItem(LS_FLOORPLAN_ACTIVE, id)
    setEditMode(false)
  }

  // Place entity
  const handlePlace = useCallback(async (posX: number, posY: number) => {
    if (!placingEntity || !activeFloorplanId) return
    try {
      const placed = await api.ha.floorplans.entities.add(activeFloorplanId, {
        entity_id: placingEntity.entity_id,
        pos_x: posX,
        pos_y: posY,
        display_size: 'medium',
        show_label: false,
      })
      setEntities(prev => ({
        ...prev,
        [activeFloorplanId]: [...(prev[activeFloorplanId] ?? []), placed],
      }))
      setUndoStack(prev => [...prev.slice(-19), { type: 'place', entity: placed }])
    } catch { /* ignore */ }
    setPlacingEntity(null)
  }, [placingEntity, activeFloorplanId])

  // Move entity
  const handleMove = useCallback(async (placedId: string, newX: number, newY: number) => {
    if (!activeFloorplanId) return
    const current = (entities[activeFloorplanId] ?? []).find(e => e.id === placedId)
    if (!current) return
    const from = { x: current.pos_x, y: current.pos_y }
    // Optimistic update
    setEntities(prev => ({
      ...prev,
      [activeFloorplanId]: (prev[activeFloorplanId] ?? []).map(e =>
        e.id === placedId ? { ...e, pos_x: newX, pos_y: newY } : e
      ),
    }))
    try {
      await api.ha.floorplans.entities.update(activeFloorplanId, placedId, { pos_x: newX, pos_y: newY })
      setUndoStack(prev => [...prev.slice(-19), { type: 'move', entityId: placedId, from, to: { x: newX, y: newY } }])
    } catch { /* ignore */ }
  }, [activeFloorplanId, entities])

  // Remove entity
  const handleRemove = useCallback(async (placedId: string) => {
    if (!activeFloorplanId) return
    const entity = (entities[activeFloorplanId] ?? []).find(e => e.id === placedId)
    if (!entity) return
    setEntities(prev => ({
      ...prev,
      [activeFloorplanId]: (prev[activeFloorplanId] ?? []).filter(e => e.id !== placedId),
    }))
    try {
      await api.ha.floorplans.entities.remove(activeFloorplanId, placedId)
      setUndoStack(prev => [...prev.slice(-19), { type: 'remove', entity }])
    } catch {
      // Restore on error
      setEntities(prev => ({
        ...prev,
        [activeFloorplanId]: [...(prev[activeFloorplanId] ?? []), entity],
      }))
    }
  }, [activeFloorplanId, entities])

  // Undo
  const handleUndo = useCallback(async () => {
    const action = undoStack[undoStack.length - 1]
    if (!action || !activeFloorplanId) return
    setUndoStack(prev => prev.slice(0, -1))
    switch (action.type) {
      case 'place':
        setEntities(prev => ({
          ...prev,
          [activeFloorplanId]: (prev[activeFloorplanId] ?? []).filter(e => e.id !== action.entity.id),
        }))
        await api.ha.floorplans.entities.remove(activeFloorplanId, action.entity.id).catch(() => {})
        break
      case 'move':
        setEntities(prev => ({
          ...prev,
          [activeFloorplanId]: (prev[activeFloorplanId] ?? []).map(e =>
            e.id === action.entityId ? { ...e, pos_x: action.from.x, pos_y: action.from.y } : e
          ),
        }))
        await api.ha.floorplans.entities.update(activeFloorplanId, action.entityId, { pos_x: action.from.x, pos_y: action.from.y }).catch(() => {})
        break
      case 'remove':
        try {
          const placed = await api.ha.floorplans.entities.add(activeFloorplanId, {
            entity_id: action.entity.entity_id,
            pos_x: action.entity.pos_x,
            pos_y: action.entity.pos_y,
            display_size: action.entity.display_size,
            show_label: action.entity.show_label,
          })
          setEntities(prev => ({
            ...prev,
            [activeFloorplanId]: [...(prev[activeFloorplanId] ?? []), placed],
          }))
        } catch { /* ignore */ }
        break
      case 'resize':
        setEntities(prev => ({
          ...prev,
          [activeFloorplanId]: (prev[activeFloorplanId] ?? []).map(e =>
            e.id === action.entityId ? { ...e, display_size: action.from as HaFloorplanEntity['display_size'] } : e
          ),
        }))
        await api.ha.floorplans.entities.update(activeFloorplanId, action.entityId, { display_size: action.from }).catch(() => {})
        break
    }
  }, [undoStack, activeFloorplanId])

  // Keyboard shortcuts
  useEffect(() => {
    if (!editMode) return
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarker) {
        handleRemove(selectedMarker).catch(() => {})
        setSelectedMarker(null)
      }
      if (e.key === 'Escape') {
        setPlacingEntity(null)
        setSelectedMarker(null)
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        handleUndo().catch(() => {})
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editMode, selectedMarker, handleRemove, handleUndo])

  // Export
  const handleExport = async () => {
    try {
      const data = await api.ha.floorplans.export()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `heldash-floorplan-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  // Import
  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as { floorplans: HaFloorplan[]; entities: Record<string, HaFloorplanEntity[]> }
      const result = await api.ha.floorplans.import(data)
      await loadFloorplans()
      toast({ message: `${result.imported} Etagen importiert, ${result.skipped} übersprungen. Bilder müssen erneut hochgeladen werden.`, type: 'success', duration: 6000 })
    } catch { /* ignore */ }
  }

  // All lights off
  const handleAllLightsOff = async () => {
    if (!activeFloorplanId) return
    const firstInstance = instances[0]
    if (!firstInstance) return
    for (const entityId of lightEntityIds) {
      await api.ha.instances.call(firstInstance.id, 'light', 'turn_off', entityId).catch(() => {})
    }
  }

  // Image upload
  const handleImageUpload = async (file: File) => {
    if (!activeFloorplanId) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1] ?? dataUrl
      const contentType = file.type
      try {
        await api.ha.floorplans.uploadImage(activeFloorplanId, base64, contentType)
        await loadFloorplans()
      } catch { /* ignore */ }
    }
    reader.readAsDataURL(file)
  }

  // Remove all entities from active floorplan
  const handleRemoveAllEntities = async () => {
    if (!activeFloorplanId) return
    const ents = entities[activeFloorplanId] ?? []
    for (const e of ents) {
      await api.ha.floorplans.entities.remove(activeFloorplanId, e.id).catch(() => {})
    }
    setEntities(prev => ({ ...prev, [activeFloorplanId]: [] }))
  }

  if (instances.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: 14 }}>Keine Home Assistant Instanz konfiguriert.</p>
      </div>
    )
  }

  const sortedFloorplans = [...floorplans].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

  return (
    <div>
      {/* Floor navigation tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {sortedFloorplans.map(fp => (
          <button
            key={fp.id}
            onClick={() => selectFloorplan(fp.id)}
            style={{
              padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid',
              cursor: 'pointer',
              background: fp.id === activeFloorplanId ? 'var(--accent-subtle)' : 'transparent',
              color: fp.id === activeFloorplanId ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: fp.id === activeFloorplanId
                ? 'hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.3)'
                : 'var(--glass-border)',
              fontSize: 13, fontWeight: fp.id === activeFloorplanId ? 600 : 400,
              transition: 'all var(--transition-fast)',
            }}
          >
            {fp.icon} {fp.name}
          </button>
        ))}
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--glass-border)', cursor: 'pointer',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Plus size={12} /> Etage
        </button>

        {/* Import button (always visible) */}
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-ghost"
          onClick={handleExport}
          style={{ gap: 6, fontSize: 12 }}
        >
          <Download size={12} /> Export
        </button>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
        }}>
          <Upload size={12} /> Import
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleImport(file).catch(() => {})
            if (importRef.current) importRef.current.value = ''
          }} />
        </label>
      </div>

      {/* No floorplans empty state */}
      {floorplans.length === 0 && (
        <div className="glass" style={{
          textAlign: 'center', padding: '48px 24px',
          borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)',
          border: '1px solid var(--glass-border)',
        }}>
          <p style={{ fontSize: 14, marginBottom: 16 }}>Noch kein Grundriss angelegt.</p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ gap: 6 }}>
            <Plus size={14} /> Ersten Grundriss anlegen
          </button>
        </div>
      )}

      {/* Active floorplan */}
      {activeFloorplan && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Entity browser (edit mode) */}
          {editMode && (
            <div className="glass" style={{
              width: 220, flexShrink: 0, borderRadius: 'var(--radius-lg)',
              padding: 12, height: 480, border: '1px solid var(--glass-border)',
            }}>
              <EntityBrowserPanel
                entityStates={entityStates}
                activeEntities={activeEntities}
                placingEntity={placingEntity}
                onSelect={setPlacingEntity}
              />
            </div>
          )}

          {/* Canvas + toolbar */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Edit toolbar */}
            {editMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    const next = !snapToGrid
                    setSnapToGrid(next)
                    localStorage.setItem(LS_FLOORPLAN_SNAP, String(next))
                  }}
                  style={{ gap: 6, fontSize: 12, color: snapToGrid ? 'var(--accent)' : undefined, borderColor: snapToGrid ? 'var(--accent)' : undefined }}
                >
                  <Grid size={12} /> Snap{snapToGrid ? ' ✓' : ''}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => handleUndo().catch(() => {})}
                  disabled={undoStack.length === 0}
                  style={{ gap: 6, fontSize: 12 }}
                >
                  <Undo size={12} /> Rückgängig
                </button>
                <div style={{ flex: 1 }} />
                {/* Image upload */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                }}>
                  <ImageIcon size={12} />
                  {activeFloorplan.image_url ? 'Bild ändern' : 'Bild hochladen'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(file).catch(() => {})
                    e.target.value = ''
                  }} />
                </label>
                {/* Settings popover */}
                <div style={{ position: 'relative' }}>
                  <button
                    ref={settingsBtnRef}
                    className="btn btn-ghost"
                    onClick={() => setShowSettings(s => !s)}
                    style={{ padding: '6px 10px' }}
                  >
                    <Settings size={14} />
                  </button>
                  {showSettings && (
                    <FloorplanSettingsPopover
                      floorplan={activeFloorplan}
                      anchorRef={settingsBtnRef}
                      onClose={() => setShowSettings(false)}
                      onUpdated={updated => {
                        setFloorplans(prev => prev.map(fp => fp.id === updated.id ? updated : fp))
                      }}
                      onDeleted={id => {
                        setFloorplans(prev => prev.filter(fp => fp.id !== id))
                        setActiveFloorplanId(null)
                        setEditMode(false)
                      }}
                      onRemoveAllEntities={handleRemoveAllEntities}
                      onExportThis={handleExport}
                    />
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => { setEditMode(false); setPlacingEntity(null); setSelectedMarker(null) }}
                  style={{ gap: 6, fontSize: 12 }}
                >
                  <Check size={12} /> Fertig
                </button>
              </div>
            )}

            <HaFloorplanCanvas
              floorplan={activeFloorplan}
              placedEntities={activeEntities}
              entityStates={entityStates}
              editMode={editMode}
              placingEntity={placingEntity}
              snapToGrid={snapToGrid}
              selectedMarker={selectedMarker}
              onSelectMarker={setSelectedMarker}
              onPlace={handlePlace}
              onMove={handleMove}
              instances={instances}
              onShowHistory={onShowHistory}
            />

            {/* View mode bottom bar */}
            {!editMode && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setEditMode(true)}
                  style={{ gap: 6, fontSize: 12 }}
                >
                  <Edit2 size={12} /> Bearbeiten
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* "Alle Lichter aus" FAB */}
      {!editMode && lightEntityIds.length > 0 && (
        <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 100 }}>
          {showLightsOffConfirm && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 0 }}
                onClick={() => setShowLightsOffConfirm(false)}
                onKeyDown={e => { if (e.key === 'Escape') setShowLightsOffConfirm(false) }}
                role="button"
                tabIndex={-1}
                aria-label="Abbrechen"
              />
              <div className="glass" style={{
                position: 'absolute', bottom: 'calc(100% + 10px)', right: 0,
                zIndex: 1, padding: '14px 16px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--glass-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  Alle Lichter in &ldquo;{activeFloorplan?.name ?? 'dieser Etage'}&rdquo; ausschalten?
                </span>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '5px 12px' }}
                    onClick={() => setShowLightsOffConfirm(false)}
                  >
                    Abbrechen
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: 12, padding: '5px 12px' }}
                    onClick={() => { setShowLightsOffConfirm(false); handleAllLightsOff().catch(() => {}) }}
                  >
                    Ausschalten
                  </button>
                </div>
              </div>
            </>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => setShowLightsOffConfirm(true)}
            style={{
              borderRadius: 'var(--radius-xl)', padding: '10px 18px',
              background: 'var(--surface-2)', backdropFilter: 'blur(12px)',
              border: '1px solid var(--glass-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              gap: 8, fontSize: 13,
            }}
          >
            <Lightbulb size={14} /> Alle Lichter aus
          </button>
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddFloorplanModal
          onClose={() => setShowAddModal(false)}
          onSaved={async () => {
            setShowAddModal(false)
            await loadFloorplans()
          }}
        />
      )}
    </div>
  )
}
