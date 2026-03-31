import { useEffect, useState, useCallback, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, rectSortingStrategy,
} from '@dnd-kit/sortable'
import {
  Plus, Trash2, Pencil, X, Check, Loader, TestTube2,
  Search, ChevronDown, ChevronRight, Home, Sun, Zap, ZapOff, Flame, BatteryCharging, Settings, Bell, Play, ToggleLeft, ToggleRight,
} from 'lucide-react'

import { useHaStore } from '../store/useHaStore'
import { useStore } from '../store/useStore'
import { api } from '../api'
import type { HaEntityFull, HaPanel, HaInstance, HaArea } from '../types'
import { HaPanelCard } from './HaPanelCard'
import { HaFloorplan } from '../components/HaFloorplan'
import { HaGpsTab } from '../components/HaGpsTab'
import { HaAlertsManager } from '../components/HaAlertsManager'
import { HaEntityHistory } from '../components/HaEntityHistory'
import { LS_HA_VIEW_MODE } from '../constants'

// ── Domain helpers ────────────────────────────────────────────────────────────

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
    light: 'Lights', switch: 'Switches', sensor: 'Sensors', binary_sensor: 'Binary Sensors',
    climate: 'Climate', cover: 'Covers', media_player: 'Media Players', input_boolean: 'Input Booleans',
    automation: 'Automations', person: 'Persons', device_tracker: 'Device Trackers',
    fan: 'Fans', lock: 'Locks', scene: 'Scenes', script: 'Scripts', camera: 'Cameras',
    alarm_control_panel: 'Alarms', input_select: 'Input Selects', counter: 'Counters',
    timer: 'Timers', weather: 'Weather',
  }
  return labels[domain] ?? domain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatState(entity: HaEntityFull): string {
  const unit = entity.attributes.unit_of_measurement
  return entity.state + (unit ? ` ${unit}` : '')
}

// ── Domain filter tab helpers ──────────────────────────────────────────────────

type BrowserTab = 'All' | 'Lights' | 'Climate' | 'Media' | 'Covers' | 'Switches' | 'Sensors' | 'Scripts' | 'Scenes' | 'Locks' | 'Alarme' | 'Other'

const BROWSER_TABS: BrowserTab[] = ['All', 'Lights', 'Climate', 'Media', 'Covers', 'Switches', 'Sensors', 'Scripts', 'Scenes', 'Locks', 'Alarme', 'Other']

function domainToTab(domain: string): BrowserTab {
  switch (domain) {
    case 'light': return 'Lights'
    case 'climate': return 'Climate'
    case 'media_player': return 'Media'
    case 'cover': return 'Covers'
    case 'switch': case 'input_boolean': case 'automation': case 'fan': return 'Switches'
    case 'sensor': case 'binary_sensor': return 'Sensors'
    case 'script': return 'Scripts'
    case 'scene': return 'Scenes'
    case 'lock': return 'Locks'
    case 'alarm_control_panel': return 'Alarme'
    default: return 'Other'
  }
}

// ── Instance Form Modal ───────────────────────────────────────────────────────

interface InstanceFormProps {
  instance?: HaInstance | null
  onClose: () => void
  onSaved: () => void
}

function InstanceFormModal({ instance, onClose, onSaved }: InstanceFormProps) {
  const { createInstance, updateInstance } = useHaStore()
  const [name, setName] = useState(instance?.name ?? '')
  const [url, setUrl] = useState(instance?.url ?? '')
  const [token, setToken] = useState('')
  const [enabled, setEnabled] = useState(instance?.enabled ?? true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const isEdit = !!instance

  const handleTest = async () => {
    if (!instance) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.ha.instances.test(instance.id)
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return setError('Name is required')
    if (!url.trim()) return setError('URL is required')
    if (!isEdit && !token.trim()) return setError('Token is required')
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        const data: Record<string, unknown> = { name, url, enabled }
        if (token.trim()) data.token = token.trim()
        await updateInstance(instance.id, data as Parameters<typeof updateInstance>[1])
      } else {
        await createInstance({ name, url, token, enabled })
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          borderRadius: 'var(--radius-xl)',
          padding: '40px 40px 36px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
          {isEdit ? 'Edit Instance' : 'Add HA Instance'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28 }}>
          {isEdit ? 'Update your Home Assistant instance settings.' : 'Connect a Home Assistant instance to your dashboard.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Home Assistant" style={{ fontSize: 14, padding: '10px 12px' }} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">URL</label>
            <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://homeassistant.local:8123" style={{ fontSize: 14, padding: '10px 12px' }} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Long-Lived Access Token{' '}
              {isEdit && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(leave blank to keep existing)</span>}
            </label>
            <input
              className="form-input"
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={isEdit ? '••••••••••••• (unchanged)' : 'HA long-lived access token'}
              style={{ fontSize: 14, padding: '10px 12px' }}
            />
          </div>

          <label className="form-toggle" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Enabled</span>
          </label>

          {isEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost" onClick={handleTest} disabled={testing} style={{ gap: 6 }}>
                <TestTube2 size={14} />
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              {testResult && (
                <span style={{ fontSize: 12, color: testResult.ok ? 'var(--status-online)' : 'var(--status-offline)' }}>
                  {testResult.ok ? '● Connected' : `● ${testResult.error ?? 'Failed'}`}
                </span>
              )}
            </div>
          )}

          {error && <div className="setup-error">{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              {saving
                ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Saving…</>
                : <><Check size={15} /> {isEdit ? 'Save Changes' : 'Add Instance'}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Manage Instances Modal ─────────────────────────────────────────────────────

interface ManageInstancesModalProps {
  instances: HaInstance[]
  onClose: () => void
  onAdd: () => void
  onEdit: (inst: HaInstance) => void
  onDelete: (id: string) => void
}

function ManageInstancesModal({ instances, onClose, onAdd, onEdit, onDelete }: ManageInstancesModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          borderRadius: 'var(--radius-xl)',
          padding: '32px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, color: 'var(--text-primary)' }}>
          Manage Instances
        </h2>

        {instances.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>No instances configured yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {instances.map(inst => (
              <div
                key={inst.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-2)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{inst.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.url}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: inst.enabled ? 'var(--status-online)' : 'var(--text-muted)' }}>
                  {inst.enabled ? '● on' : '● off'}
                </span>
                <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => onEdit(inst)} data-tooltip="Edit">
                  <Pencil size={13} />
                </button>
                <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28, color: 'var(--status-offline)' }} onClick={() => onDelete(inst.id)} data-tooltip="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary" onClick={onAdd} style={{ width: '100%', gap: 6, justifyContent: 'center' }}>
          <Plus size={14} /> Add Instance
        </button>
      </div>
    </div>
  )
}

// ── Edit Panel Modal ──────────────────────────────────────────────────────────

function EditPanelModal({ panel, onClose }: { panel: HaPanel; onClose: () => void }) {
  const { updatePanel } = useHaStore()
  const [label, setLabel] = useState(panel.label ?? '')
  const [areaId, setAreaId] = useState<string | null>(panel.area_id ?? null)
  const [areas, setAreas] = useState<HaArea[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.ha.instances.areas(panel.instance_id)
      .then(data => setAreas(data))
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePanel(panel.id, { label: label.trim() || undefined, area_id: areaId })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400,
          borderRadius: 'var(--radius-xl)',
          padding: '40px 40px 36px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
          Edit Panel
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28, fontFamily: 'var(--font-mono)' }}>
          {panel.entity_id}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Custom Label</label>
            <input
              className="form-input"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Leave blank to use friendly_name"
              autoFocus
              style={{ fontSize: 14, padding: '10px 12px' }}
            />
          </div>

          {areas.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Raum</label>
              <select
                className="form-input"
                value={areaId ?? ''}
                onChange={e => setAreaId(e.target.value || null)}
                style={{ fontSize: 14, padding: '10px 12px' }}
              >
                <option value="">Kein Raum</option>
                {areas.map(a => (
                  <option key={a.area_id} value={a.area_id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              <Check size={15} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Entity Browser Modal ──────────────────────────────────────────────────────

interface EntityBrowserProps {
  instances: HaInstance[]
  panels: HaPanel[]
  onClose: () => void
  onAdd: (instanceId: string, entityId: string) => Promise<void>
}

function EntityBrowserModal({ instances, panels, onClose, onAdd }: EntityBrowserProps) {
  const [selectedInstance, setSelectedInstance] = useState<string>(instances[0]?.id ?? '')
  const [entities, setEntities] = useState<HaEntityFull[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<BrowserTab>('All')

  const loadEntities = useCallback(async (instanceId: string) => {
    if (!instanceId) return
    setLoading(true)
    setError('')
    setActiveTab('All')
    try {
      const data = await api.ha.instances.states(instanceId)
      const sorted = [...data].sort((a, b) => a.entity_id.localeCompare(b.entity_id))
      setEntities(sorted)
      // Auto-expand first few domains
      const domains = new Set(sorted.map(e => getDomain(e.entity_id)))
      setExpanded(new Set([...domains].slice(0, 3)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load entities')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedInstance) loadEntities(selectedInstance)
  }, [selectedInstance, loadEntities])

  const existingSet = new Set(panels.filter(p => p.instance_id === selectedInstance).map(p => p.entity_id))

  const matchesSearch = (e: HaEntityFull) =>
    !search || e.entity_id.toLowerCase().includes(search.toLowerCase())
      || (e.attributes.friendly_name ?? '').toLowerCase().includes(search.toLowerCase())

  const tabCounts = BROWSER_TABS.reduce<Record<BrowserTab, number>>((acc, tab) => {
    acc[tab] = tab === 'All'
      ? entities.filter(matchesSearch).length
      : entities.filter(e => domainToTab(getDomain(e.entity_id)) === tab && matchesSearch(e)).length
    return acc
  }, {} as Record<BrowserTab, number>)

  const filtered = entities.filter(e => {
    if (!matchesSearch(e)) return false
    if (activeTab === 'All') return true
    return domainToTab(getDomain(e.entity_id)) === activeTab
  })

  const byDomain = filtered.reduce<Record<string, HaEntityFull[]>>((acc, e) => {
    const d = getDomain(e.entity_id)
    if (!acc[d]) acc[d] = []
    acc[d].push(e)
    return acc
  }, {})

  const handleAdd = async (e: HaEntityFull) => {
    setAdding(e.entity_id)
    try {
      await onAdd(selectedInstance, e.entity_id)
    } finally {
      setAdding(null)
    }
  }

  const toggleDomain = (domain: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, minWidth: Math.min(640, (typeof window !== 'undefined' ? window.innerWidth : 640) - 32), maxHeight: '82vh',
          borderRadius: 'var(--radius-xl)',
          padding: '32px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
            Add Entity Panel
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Select entities to pin as panels on your dashboard.
          </p>
        </div>

        {instances.length > 1 && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Instance</label>
            <select className="form-input" value={selectedInstance} onChange={e => setSelectedInstance(e.target.value)} style={{ fontSize: 14, padding: '10px 12px' }}>
              {instances.filter(i => i.enabled).map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            style={{ paddingLeft: 34, fontSize: 14, padding: '10px 12px 10px 34px' }}
            placeholder="Search entities…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Domain filter tabs */}
        <div className="tabs" style={{ overflowX: 'auto', flexShrink: 0, flexWrap: 'wrap' }}>
          {BROWSER_TABS.filter(tab => tab === 'All' || tabCounts[tab] > 0).map(tab => (
            <button
              key={tab}
              className={`tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tabCounts[tab] > 0 && (
                <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>{tabCounts[tab]}</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
            </div>
          )}
          {error && <p style={{ color: 'var(--status-offline)', fontSize: 13 }}>{error}</p>}
          {!loading && !error && Object.entries(byDomain).sort(([a], [b]) => a.localeCompare(b)).map(([domain, domainEntities]) => (
            <div key={domain}>
              <button
                onClick={() => toggleDomain(domain)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, letterSpacing: '0.8px',
                  textTransform: 'uppercase', padding: '6px 4px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {expanded.has(domain) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {domainLabel(domain)} ({domainEntities.length})
              </button>
              {expanded.has(domain) && domainEntities.map(entity => {
                const isAdded = existingSet.has(entity.entity_id)
                const isLoading = adding === entity.entity_id
                return (
                  <div
                    key={entity.entity_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)', opacity: isAdded ? 0.5 : 1,
                      background: isAdded ? 'rgba(var(--accent-rgb),0.04)' : undefined,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entity.attributes.friendly_name ?? entity.entity_id}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entity.entity_id}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: stateColor(entity.state), fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {formatState(entity)}
                    </span>
                    <button
                      className="btn btn-ghost btn-icon"
                      style={{ flexShrink: 0, width: 24, height: 24 }}
                      disabled={isAdded || isLoading}
                      onClick={() => handleAdd(entity)}
                      data-tooltip={isAdded ? 'Already added' : 'Add panel'}
                    >
                      {isLoading ? <Loader size={12} /> : <Plus size={12} />}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Energy Panel Components ───────────────────────────────────────────────────

function CircularGauge({ value, size = 56 }: { value: number; size?: number }) {
  const r = size * 0.38
  const circumference = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(1, value / 100)) * circumference
  const cx = size / 2, cy = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--glass-border)" strokeWidth={size * 0.09} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#10b981" strokeWidth={size * 0.09}
        strokeDasharray={`${dash} ${circumference}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round" />
      <text x={cx} y={cy + size * 0.08} textAnchor="middle" fontSize={size * 0.2} fontWeight="bold"
        fill="var(--text-primary)">{value}%</text>
    </svg>
  )
}

function EnergyBarChart({ data }: { data: EnergyData }) {
  const cd = data.chart_data
  if (!cd || !cd.labels.length) return null
  const svgW = 600, chartH = 120, labelH = 20, totalH = chartH + labelH
  const n = cd.labels.length
  const barW = Math.max(2, (svgW / n) * 0.7)
  const maxVal = Math.max(...cd.consumption, ...cd.solar, 0.001)
  const showEvery = Math.max(1, Math.floor(n / 8))
  return (
    <svg viewBox={`0 0 ${svgW} ${totalH}`} style={{ width: '100%', height: 140 }}>
      {cd.labels.map((label, i) => {
        const x = (i / n) * svgW + (svgW / n - barW) / 2
        const consH = (cd.consumption[i] ?? 0) / maxVal * chartH
        const solH = Math.min((cd.solar[i] ?? 0), (cd.consumption[i] ?? 0)) / maxVal * chartH
        const retH = (cd.grid_return[i] ?? 0) / maxVal * chartH
        return (
          <g key={i}>
            {consH > 0 && (
              <rect x={x} y={chartH - consH} width={barW} height={consH} fill="var(--accent)" opacity={0.6}>
                <title>{label}: {(cd.consumption[i] ?? 0).toFixed(2)} kWh</title>
              </rect>
            )}
            {solH > 0 && (
              <rect x={x} y={chartH - solH} width={barW} height={solH} fill="#f59e0b" opacity={0.85}>
                <title>{label}: {(cd.solar[i] ?? 0).toFixed(2)} kWh solar</title>
              </rect>
            )}
            {retH > 0 && (
              <rect x={x} y={chartH - retH} width={barW / 2} height={retH} fill="#10b981" opacity={0.8}>
                <title>{label}: {(cd.grid_return[i] ?? 0).toFixed(2)} kWh returned</title>
              </rect>
            )}
            {i % showEvery === 0 && (
              <text x={x + barW / 2} y={totalH - 4} fontSize="9" textAnchor="middle" fill="var(--text-muted)">
                {label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function EnergyPanel({ panel, onRemove, onEdit }: { panel: HaPanel; onRemove: () => void; onEdit: () => void }) {
  const { energyData, loadEnergy } = useHaStore()
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const data = energyData[`${panel.instance_id}:${period}`]

  // Load on mount
  useEffect(() => {
    setLoading(true)
    loadEnergy(panel.instance_id, 'day').catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handlePeriod = useCallback((p: 'day' | 'week' | 'month') => {
    setPeriod(p)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      loadEnergy(panel.instance_id, p).catch(() => {}).finally(() => setLoading(false))
    }, 500)
  }, [panel.instance_id, loadEnergy])

  const hasSolar = (data?.solar_production ?? 0) > 0
  const hasReturn = (data?.grid_return ?? 0) > 0
  const hasGas = (data?.gas_consumption ?? 0) > 0
  const hasBattery = (data?.battery_charge ?? 0) > 0

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 20, position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={15} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
            {panel.label || 'Energy Dashboard'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Period selector */}
          {(['day', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => handlePeriod(p)}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {p === 'day' ? 'Today' : p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
          {loading && <div className="spinner" style={{ width: 13, height: 13, borderWidth: 2, marginLeft: 4 }} />}
          <button className="btn btn-ghost btn-icon" style={{ width: 26, height: 26 }} onClick={onEdit}>
            <Pencil size={12} />
          </button>
          <button className="btn btn-ghost btn-icon" style={{ width: 26, height: 26, color: 'var(--status-offline)' }} onClick={onRemove}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!data && loading ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, margin: '0 auto' }} />
        </div>
      ) : !data ? null : !data.configured ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>
          Energy not configured in Home Assistant
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={15} style={{ color: 'var(--accent)' }} />
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Grid Consumption</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {(data.grid_consumption ?? 0).toFixed(2)}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>kWh</span>
                </div>
              </div>
            </div>

            {hasSolar && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sun size={15} style={{ color: '#f59e0b' }} />
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Solar Production</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>
                    {(data.solar_production ?? 0).toFixed(2)}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>kWh</span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CircularGauge value={data.self_sufficiency ?? 0} size={56} />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Self-Sufficiency</div>
            </div>

            {hasReturn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ZapOff size={15} style={{ color: '#10b981' }} />
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Grid Return</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>
                    {(data.grid_return ?? 0).toFixed(2)}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>kWh</span>
                  </div>
                </div>
              </div>
            )}

            {hasGas && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Flame size={15} style={{ color: '#f87171' }} />
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gas</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171' }}>
                    {(data.gas_consumption ?? 0).toFixed(3)}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>m³</span>
                  </div>
                </div>
              </div>
            )}

            {hasBattery && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BatteryCharging size={15} style={{ color: 'var(--accent)' }} />
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Battery</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {(data.battery_charge ?? 0).toFixed(2)}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>kWh</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chart */}
          {data.chart_data && data.chart_data.labels.length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'var(--accent)', opacity: 0.6, borderRadius: 2, display: 'inline-block' }} />
                  Consumption
                </span>
                {hasSolar && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: '#f59e0b', borderRadius: 2, display: 'inline-block' }} />
                    Solar
                  </span>
                )}
                {hasReturn && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: '#10b981', borderRadius: 2, display: 'inline-block' }} />
                    Return
                  </span>
                )}
              </div>
              <EnergyBarChart data={data} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Add Energy Panel Modal ─────────────────────────────────────────────────────

function AddEnergyPanelModal({ instances, panels, onClose, onAdd }: {
  instances: HaInstance[]
  panels: HaPanel[]
  onClose: () => void
  onAdd: (instanceId: string) => Promise<void>
}) {
  const [selected, setSelected] = useState(instances[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hasEnergyPanel = (instanceId: string) =>
    panels.some(p => p.instance_id === instanceId && p.panel_type === 'energy')

  const handleAdd = async () => {
    if (!selected) return setError('Select an instance')
    if (hasEnergyPanel(selected)) return setError('Energy panel already added for this instance')
    setSaving(true)
    setError('')
    try {
      await onAdd(selected)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add panel')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400,
          borderRadius: 'var(--radius-xl)',
          padding: '40px 40px 36px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, color: 'var(--text-primary)' }}>
          Add Energy Dashboard
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">HA Instance</label>
            <select className="form-input" value={selected} onChange={e => setSelected(e.target.value)}>
              {instances.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name}{hasEnergyPanel(i.id) ? ' (already added)' : ''}
                </option>
              ))}
            </select>
          </div>
          {error && <div className="setup-error">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving} style={{ flex: 1, gap: 6, justifyContent: 'center' }}>
              {saving
                ? <><div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Adding…</>
                : <><Check size={14} /> Add Panel</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Room Section (grouped view) ───────────────────────────────────────────────

interface RoomSectionProps {
  areaId: string | null
  areaName: string
  panels: HaPanel[]
  stateMap: Record<string, Record<string, HaEntityFull>>
  onRemove: (id: string) => void
  onEdit: (panel: HaPanel) => void
  onReorder: (ids: string[]) => void
  onShowHistory?: (entity: HaEntityFull, instanceId: string) => void
  isAdmin?: boolean
}

function RoomSection({ areaId, areaName, panels, stateMap, onRemove, onEdit, onReorder, onShowHistory, isAdmin }: RoomSectionProps) {
  const storageKey = `ha_room_${areaId ?? 'unassigned'}`

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return false
    const saved = sessionStorage.getItem(storageKey)
    if (saved !== null) return saved === 'true'
    return panels.length > 6
  })

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const isMobile = windowWidth < 768
  const isCollapsed = isMobile && collapsed

  const toggle = () => {
    if (!isMobile) return
    const next = !collapsed
    setCollapsed(next)
    sessionStorage.setItem(storageKey, String(next))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = panels.findIndex(p => p.id === active.id)
    const newIdx = panels.findIndex(p => p.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = [...panels]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)
    onReorder(reordered.map(p => p.id))
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        className="section-header"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: isMobile ? 'pointer' : 'default',
          userSelect: 'none',
          marginBottom: 12,
        }}
        onClick={toggle}
      >
        {isMobile && (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
        <Home size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
          {areaName}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({panels.length})</span>
      </div>
      {!isCollapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={panels.map(p => p.id)} strategy={rectSortingStrategy}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {panels.map(panel => {
                const entity = stateMap[panel.instance_id]?.[panel.entity_id]
                return (
                  <HaPanelCard
                    key={panel.id}
                    panel={panel}
                    entity={entity}
                    instanceId={panel.instance_id}
                    onRemove={() => onRemove(panel.id)}
                    onEdit={() => onEdit(panel)}
                    onShowHistory={onShowHistory ? (e) => onShowHistory(e, panel.instance_id) : undefined}
                    isAdmin={isAdmin}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface HaPageProps {
  showAddInstance?: boolean
  onAddInstanceClose?: () => void
  showAddPanel?: boolean
  onAddPanelClose?: () => void
}

export function HaPage({ showAddInstance, onAddInstanceClose, showAddPanel, onAddPanelClose }: HaPageProps = {}) {
  const {
    instances, panels, stateMap, areas,
    loadInstances, loadPanels, loadStates, updateEntityState, loadAreas,
    addPanel, updatePanel, removePanel, reorderPanels, reorderRoomPanels,
    deleteInstance,
  } = useHaStore()
  const { isAdmin } = useStore()

  const [showInstanceForm, setShowInstanceForm] = useState(false)
  const [editInstance, setEditInstance] = useState<HaInstance | null>(null)
  const [showBrowser, setShowBrowser] = useState(false)

  // Sync external add-instance trigger
  useEffect(() => {
    if (showAddInstance) {
      setShowInstanceForm(true)
      onAddInstanceClose?.()
    }
  }, [showAddInstance])

  // Sync external add-panel trigger (open browser to add panel)
  useEffect(() => {
    if (showAddPanel) {
      setShowBrowser(true)
      onAddPanelClose?.()
    }
  }, [showAddPanel])
  const [showEnergyPicker, setShowEnergyPicker] = useState(false)
  const [editPanel, setEditPanel] = useState<HaPanel | null>(null)
  const [showManageModal, setShowManageModal] = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [historyEntity, setHistoryEntity] = useState<HaEntityFull | null>(null)
  const [historyInstanceId, setHistoryInstanceId] = useState<string | null>(null)
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'panels' | 'hausübersicht' | 'gps' | 'szenarien' | 'automationen'>('panels')
  const [scenes, setScenes] = useState<HaEntityFull[]>([])
  const [scenesLoading, setScenesLoading] = useState(false)
  const [scenesSearch, setScenesSearch] = useState('')
  const [sceneBusy, setSceneBusy] = useState<string | null>(null)
  const [automations, setAutomations] = useState<HaEntityFull[]>([])
  const [automationsLoading, setAutomationsLoading] = useState(false)
  const [automationsSearch, setAutomationsSearch] = useState('')
  const [automationBusy, setAutomationBusy] = useState<Record<string, 'toggle' | 'trigger'>>({})
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>(() =>
    (localStorage.getItem(LS_HA_VIEW_MODE) as 'flat' | 'grouped' | null) ?? 'flat'
  )

  // Load initial data
  useEffect(() => {
    loadInstances().catch(() => {})
    loadPanels().catch(() => {})
  }, [])

  // Set initial active instance once instances load
  useEffect(() => {
    const first = instances.find(i => i.enabled)
    if (activeInstanceId === null && first) setActiveInstanceId(first.id)
  }, [instances.length])

  // Load areas when active instance changes (always, so the toggle can appear)
  useEffect(() => {
    if (activeInstanceId) {
      loadAreas(activeInstanceId).catch(() => {})
    }
  }, [activeInstanceId])

  // Also reload areas when switching to grouped view if not yet loaded
  useEffect(() => {
    if (viewMode === 'grouped' && activeInstanceId && !(activeInstanceId in areas)) {
      loadAreas(activeInstanceId).catch(() => {})
    }
  }, [viewMode, activeInstanceId])

  // If areas loaded and empty → force flat view and persist
  const activeAreas = activeInstanceId ? (areas[activeInstanceId] ?? []) : []
  const areasLoaded = activeInstanceId != null && activeInstanceId in areas
  useEffect(() => {
    if (viewMode === 'grouped' && areasLoaded && activeAreas.length === 0) {
      setViewMode('flat')
      localStorage.setItem(LS_HA_VIEW_MODE, 'flat')
    }
  }, [areasLoaded, activeAreas.length])

  // Subscribe to real-time state updates for all instances referenced in panels.
  // On mount: fetch initial bulk state snapshot, then open SSE stream from the
  // backend HA WebSocket bridge. Cleans up EventSources on unmount / panel change.
  const instanceIds = [...new Set(panels.map(p => p.instance_id))]
  const instanceIdsKey = instanceIds.join(',')

  useEffect(() => {
    if (!instanceIdsKey) return
    const ids = instanceIdsKey.split(',')
    const sources: EventSource[] = []

    // Initial bulk load so cards aren't empty while WS connects
    ids.forEach(id => loadStates(id).catch(() => {}))

    // Open SSE stream per instance (backend bridges HA WebSocket → SSE)
    for (const instanceId of ids) {
      const es = new EventSource(`/api/ha/instances/${instanceId}/stream`)
      es.onmessage = (e: MessageEvent) => {
        try {
          const { entity_id, state } = JSON.parse(e.data as string) as {
            entity_id: string
            state: HaEntityFull
          }
          updateEntityState(instanceId, entity_id, state)
        } catch { /* ignore malformed event */ }
      }
      sources.push(es)
    }

    return () => sources.forEach(es => es.close())
  }, [instanceIdsKey])

  // Load scenes when Szenarien tab is active
  useEffect(() => {
    if (activeTab !== 'szenarien' || !activeInstanceId) return
    setScenesLoading(true)
    api.ha.scenes(activeInstanceId)
      .then(data => setScenes(data))
      .catch(() => {})
      .finally(() => setScenesLoading(false))
  }, [activeTab, activeInstanceId])

  // Load automations when Automationen tab is active
  useEffect(() => {
    if (activeTab !== 'automationen' || !activeInstanceId) return
    setAutomationsLoading(true)
    api.ha.automations(activeInstanceId)
      .then(data => setAutomations(data))
      .catch(() => {})
      .finally(() => setAutomationsLoading(false))
  }, [activeTab, activeInstanceId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const enabledInstances = instances.filter(i => i.enabled)
  const visiblePanels = activeInstanceId ? panels.filter(p => p.instance_id === activeInstanceId) : panels
  // Flatten all instance state maps for floorplan (entity_id → HaEntityFull)
  const allEntityStates = Object.values(stateMap).reduce<Record<string, HaEntityFull>>(
    (acc, m) => ({ ...acc, ...m }),
    {}
  )
  const energyPanels = visiblePanels.filter(p => p.panel_type === 'energy')
  const regularPanels = visiblePanels.filter(p => p.panel_type !== 'energy')

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = regularPanels.findIndex(p => p.id === active.id)
    const newIdx = regularPanels.findIndex(p => p.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = [...regularPanels]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)
    reorderPanels(reordered.map(p => p.id)).catch(() => {})
  }

  const handleAddPanel = async (instanceId: string, entityId: string) => {
    const panel = await addPanel(instanceId, entityId)
    // Background: auto-detect entity area and patch if found
    api.ha.instances.entityArea(instanceId, entityId)
      .then(({ area_id }) => {
        if (area_id) {
          updatePanel(panel.id, { area_id }).catch(() => {})
        }
      })
      .catch(() => {})
  }

  const handleAddEnergyPanel = async (instanceId: string) => {
    await addPanel(instanceId, '__energy__', undefined, 'energy')
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Home size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Home Assistant
          </h1>
          {/* Instance selector */}
          {enabledInstances.length === 1 && (
            <span style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--glass-border)', color: 'var(--text-secondary)',
              background: 'var(--surface-2)',
            }}>
              {enabledInstances[0].name}
            </span>
          )}
          {enabledInstances.length > 1 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {enabledInstances.map(inst => (
                <button
                  key={inst.id}
                  onClick={() => setActiveInstanceId(inst.id)}
                  style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    cursor: 'pointer',
                    background: activeInstanceId === inst.id ? 'var(--accent-subtle)' : 'transparent',
                    color: activeInstanceId === inst.id ? 'var(--accent)' : 'var(--text-secondary)',
                    borderColor: activeInstanceId === inst.id
                      ? 'hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.3)'
                      : 'var(--glass-border)',
                    fontWeight: activeInstanceId === inst.id ? 600 : 400,
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {inst.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View mode toggle — only shown on Panels tab when areas are available */}
          {activeTab === 'panels' && enabledInstances.length > 0 && activeAreas.length > 0 && (
            <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
              {(['flat', 'grouped'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => {
                    setViewMode(mode)
                    localStorage.setItem(LS_HA_VIEW_MODE, mode)
                    if (mode === 'grouped' && activeInstanceId && !(activeInstanceId in areas)) {
                      loadAreas(activeInstanceId).catch(() => {})
                    }
                  }}
                  style={{
                    fontSize: 12, padding: '4px 12px', border: 'none', cursor: 'pointer',
                    background: viewMode === mode ? 'var(--accent-subtle)' : 'transparent',
                    color: viewMode === mode ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: viewMode === mode ? 600 : 400,
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {mode === 'flat' ? 'Flach' : 'Nach Raum'}
                </button>
              ))}
            </div>
          )}
          {activeTab === 'panels' && enabledInstances.length > 0 && viewMode === 'grouped' && areasLoaded && activeAreas.length === 0 && (
            <span className="badge badge-neutral" style={{ fontSize: 11 }}>
              Räume in Home Assistant nicht konfiguriert
            </span>
          )}
          {enabledInstances.length > 0 && (
            <>
              <button className="btn btn-ghost" onClick={() => setShowEnergyPicker(true)} style={{ gap: 6 }}>
                <Zap size={15} />
                Energy
              </button>
              <button className="btn btn-ghost" onClick={() => setShowBrowser(true)} style={{ gap: 6 }}>
                <Plus size={15} />
                Add Panel
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAlerts(prev => !prev)} style={{ gap: 6, position: 'relative' }}>
                <Bell size={15} />
                Alerts
              </button>
            </>
          )}
          {isAdmin && (
            <>
              <button className="btn btn-ghost" onClick={() => setShowManageModal(true)} style={{ gap: 6 }}>
                <Settings size={14} />
                Manage
              </button>
              <button className="btn btn-primary" onClick={() => { setEditInstance(null); setShowInstanceForm(true) }} style={{ gap: 6 }}>
                <Plus size={15} />
                Add Instance
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      {instances.length > 0 && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--glass-border)' }}>
          {(['panels', 'hausübersicht', 'gps', 'szenarien', 'automationen'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 20px', border: 'none', borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer', fontSize: 13, background: 'transparent',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab ? 600 : 400,
                marginBottom: -1, transition: 'all var(--transition-fast)',
              }}
            >
              {tab === 'panels' ? 'Panels'
                : tab === 'hausübersicht' ? '🗺 Hausübersicht'
                : tab === 'gps' ? '📍 GPS'
                : tab === 'szenarien' ? '🎭 Szenarien'
                : '⚡ Automationen'}
            </button>
          ))}
        </div>
      )}

      {/* Hausübersicht tab */}
      {instances.length > 0 && activeTab === 'hausübersicht' && (
        <HaFloorplan
          instances={enabledInstances}
          entityStates={allEntityStates}
          onShowHistory={(e, instId) => { setHistoryEntity(e); setHistoryInstanceId(instId) }}
        />
      )}

      {/* GPS tab */}
      {instances.length > 0 && activeTab === 'gps' && (
        <HaGpsTab instanceId={activeInstanceId} />
      )}

      {/* Szenarien tab */}
      {instances.length > 0 && activeTab === 'szenarien' && (
        <div>
          <div style={{ marginBottom: 16, position: 'relative', maxWidth: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 34, fontSize: 13 }}
              placeholder="Szenarien suchen…"
              value={scenesSearch}
              onChange={e => setScenesSearch(e.target.value)}
            />
          </div>
          {scenesLoading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, margin: '0 auto' }} />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {scenes
                .filter(s => !scenesSearch.trim() ||
                  s.entity_id.toLowerCase().includes(scenesSearch.toLowerCase()) ||
                  (s.attributes.friendly_name ?? '').toLowerCase().includes(scenesSearch.toLowerCase())
                )
                .map(scene => {
                  const domain = scene.entity_id.split('.')[0] ?? ''
                  const name = (scene.attributes.friendly_name as string | undefined) ?? scene.entity_id
                  const isRunning = sceneBusy === scene.entity_id
                  return (
                    <div key={scene.entity_id} className="widget-card glass" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                          padding: '1px 6px', borderRadius: 4,
                          background: domain === 'scene' ? 'rgba(var(--accent-rgb),0.15)' : 'var(--surface-3)',
                          color: domain === 'scene' ? 'var(--accent)' : 'var(--text-secondary)',
                        }}>
                          {domain === 'scene' ? 'Szene' : 'Script'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </div>
                      <button
                        className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center', gap: 6, fontSize: 12 }}
                        disabled={isRunning}
                        onClick={async () => {
                          setSceneBusy(scene.entity_id)
                          try {
                            await api.ha.instances.call(activeInstanceId!, domain, 'turn_on', scene.entity_id)
                          } catch { /* ignore */ } finally {
                            setTimeout(() => setSceneBusy(null), 2000)
                          }
                        }}
                      >
                        {isRunning ? <Loader size={12} className="spin" /> : <Play size={12} />}
                        {isRunning ? 'Ausgeführt!' : 'Ausführen'}
                      </button>
                    </div>
                  )
                })}
              {scenes.length === 0 && !scenesLoading && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, gridColumn: '1/-1' }}>
                  Keine Szenarien oder Scripts gefunden.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Automationen tab */}
      {instances.length > 0 && activeTab === 'automationen' && (
        <div>
          <div style={{ marginBottom: 16, position: 'relative', maxWidth: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 34, fontSize: 13 }}
              placeholder="Automationen suchen…"
              value={automationsSearch}
              onChange={e => setAutomationsSearch(e.target.value)}
            />
          </div>
          {automationsLoading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, margin: '0 auto' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {automations
                .filter(a => !automationsSearch.trim() ||
                  a.entity_id.toLowerCase().includes(automationsSearch.toLowerCase()) ||
                  ((a.attributes.friendly_name as string | undefined) ?? '').toLowerCase().includes(automationsSearch.toLowerCase())
                )
                .map(automation => {
                  const name = (automation.attributes.friendly_name as string | undefined) ?? automation.entity_id
                  const isEnabled = automation.state === 'on'
                  const isToggling = automationBusy[automation.entity_id] === 'toggle'
                  const isTriggering = automationBusy[automation.entity_id] === 'trigger'
                  return (
                    <div
                      key={automation.entity_id}
                      className="glass"
                      style={{
                        padding: '12px 16px', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--glass-border)',
                        display: 'flex', alignItems: 'center', gap: 12,
                        opacity: isEnabled ? 1 : 0.5,
                        transition: 'opacity var(--transition-fast)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {automation.entity_id}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost"
                        style={{ gap: 6, fontSize: 12, padding: '4px 10px', flexShrink: 0 }}
                        disabled={isTriggering || isToggling}
                        title="Auslösen"
                        onClick={async () => {
                          setAutomationBusy(prev => ({ ...prev, [automation.entity_id]: 'trigger' }))
                          try {
                            await api.ha.automationTrigger(activeInstanceId!, automation.entity_id)
                          } catch { /* ignore */ } finally {
                            setAutomationBusy(prev => { const n = { ...prev }; delete n[automation.entity_id]; return n })
                          }
                        }}
                      >
                        {isTriggering ? <Loader size={12} className="spin" /> : <Play size={12} />}
                        Auslösen
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ gap: 6, fontSize: 12, padding: '4px 10px', flexShrink: 0, color: isEnabled ? 'var(--status-online)' : 'var(--text-muted)' }}
                        disabled={isToggling || isTriggering}
                        title={isEnabled ? 'Deaktivieren' : 'Aktivieren'}
                        onClick={async () => {
                          setAutomationBusy(prev => ({ ...prev, [automation.entity_id]: 'toggle' }))
                          try {
                            await api.ha.automationToggle(activeInstanceId!, automation.entity_id)
                            setAutomations(prev => prev.map(a =>
                              a.entity_id === automation.entity_id
                                ? { ...a, state: isEnabled ? 'off' : 'on' }
                                : a
                            ))
                          } catch { /* ignore */ } finally {
                            setAutomationBusy(prev => { const n = { ...prev }; delete n[automation.entity_id]; return n })
                          }
                        }}
                      >
                        {isToggling
                          ? <Loader size={12} className="spin" />
                          : isEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {isEnabled ? 'An' : 'Aus'}
                      </button>
                    </div>
                  )
                })}
              {automations.length === 0 && !automationsLoading && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  Keine Automationen gefunden.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {instances.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <Home size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
          {isAdmin ? (
            <>
              <p style={{ fontSize: 14, marginBottom: 12 }}>No Home Assistant instances configured.</p>
              <button className="btn btn-primary" onClick={() => { setEditInstance(null); setShowInstanceForm(true) }} style={{ gap: 6 }}>
                <Plus size={14} />Add Instance
              </button>
            </>
          ) : (
            <p style={{ fontSize: 14 }}>No Home Assistant instances available.</p>
          )}
        </div>
      )}

      {/* Panels tab content */}
      {activeTab === 'panels' && instances.length > 0 && visiblePanels.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 14, marginBottom: 12 }}>No panels added yet.</p>
          {enabledInstances.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowBrowser(true)} style={{ gap: 6 }}>
              <Plus size={14} />Add Panel
            </button>
          )}
        </div>
      )}

      {/* Energy Panels (full-width, non-sortable) */}
      {activeTab === 'panels' && energyPanels.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {energyPanels.map(panel => (
            <EnergyPanel
              key={panel.id}
              panel={panel}
              onRemove={() => removePanel(panel.id)}
              onEdit={() => setEditPanel(panel)}
            />
          ))}
        </div>
      )}

      {/* Flat DnD Panel Grid */}
      {activeTab === 'panels' && regularPanels.length > 0 && viewMode === 'flat' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={regularPanels.map(p => p.id)} strategy={rectSortingStrategy}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16,
            }}>
              {regularPanels.map(panel => {
                const entity = stateMap[panel.instance_id]?.[panel.entity_id]
                return (
                  <HaPanelCard
                    key={panel.id}
                    panel={panel}
                    entity={entity}
                    instanceId={panel.instance_id}
                    onRemove={() => removePanel(panel.id)}
                    onEdit={() => setEditPanel(panel)}
                    onShowHistory={e => { setHistoryEntity(e); setHistoryInstanceId(panel.instance_id) }}
                    isAdmin={isAdmin}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Grouped by Room view */}
      {activeTab === 'panels' && regularPanels.length > 0 && viewMode === 'grouped' && activeAreas.length > 0 && (() => {
        const areaSet = new Set(activeAreas.map(a => a.area_id))
        const knownRooms = activeAreas
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(area => ({
            ...area,
            panels: regularPanels.filter(p => p.area_id === area.area_id).sort((a, b) => a.position - b.position),
          }))
          .filter(r => r.panels.length > 0)
        const noRoomPanels = regularPanels
          .filter(p => !p.area_id || !areaSet.has(p.area_id))
          .sort((a, b) => a.position - b.position)
        return (
          <div>
            {knownRooms.map(room => (
              <RoomSection
                key={room.area_id}
                areaId={room.area_id}
                areaName={room.name}
                panels={room.panels}
                stateMap={stateMap}
                onRemove={id => removePanel(id)}
                onEdit={panel => setEditPanel(panel)}
                onReorder={ids => reorderRoomPanels(ids).catch(() => {})}
                onShowHistory={(e, instId) => { setHistoryEntity(e); setHistoryInstanceId(instId) }}
                isAdmin={isAdmin}
              />
            ))}
            {noRoomPanels.length > 0 && (
              <RoomSection
                key="unassigned"
                areaId={null}
                areaName="Ohne Raum"
                panels={noRoomPanels}
                stateMap={stateMap}
                onRemove={id => removePanel(id)}
                onEdit={panel => setEditPanel(panel)}
                onReorder={ids => reorderRoomPanels(ids).catch(() => {})}
                onShowHistory={(e, instId) => { setHistoryEntity(e); setHistoryInstanceId(instId) }}
                isAdmin={isAdmin}
              />
            )}
          </div>
        )
      })()}

      {/* Alerts slide-in panel */}
      {showAlerts && (
        <HaAlertsManager
          onClose={() => setShowAlerts(false)}
          stateMap={stateMap}
          instanceId={activeInstanceId}
        />
      )}

      {/* Modals */}
      {showInstanceForm && (
        <InstanceFormModal
          instance={editInstance}
          onClose={() => { setShowInstanceForm(false); setEditInstance(null) }}
          onSaved={() => loadInstances().catch(() => {})}
        />
      )}

      {showBrowser && (
        <EntityBrowserModal
          instances={enabledInstances}
          panels={panels}
          onClose={() => setShowBrowser(false)}
          onAdd={handleAddPanel}
        />
      )}

      {showEnergyPicker && (
        <AddEnergyPanelModal
          instances={enabledInstances}
          panels={panels}
          onClose={() => setShowEnergyPicker(false)}
          onAdd={handleAddEnergyPanel}
        />
      )}

      {editPanel && (
        <EditPanelModal
          panel={editPanel}
          onClose={() => setEditPanel(null)}
        />
      )}

      {showManageModal && (
        <ManageInstancesModal
          instances={instances}
          onClose={() => setShowManageModal(false)}
          onAdd={() => { setShowManageModal(false); setEditInstance(null); setShowInstanceForm(true) }}
          onEdit={inst => { setShowManageModal(false); setEditInstance(inst); setShowInstanceForm(true) }}
          onDelete={id => deleteInstance(id)}
        />
      )}

      {historyEntity && historyInstanceId && (
        <HaEntityHistory
          entity={historyEntity}
          instanceId={historyInstanceId}
          onClose={() => { setHistoryEntity(null); setHistoryInstanceId(null) }}
        />
      )}
    </div>
  )
}
