import { useEffect, useRef, useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import { useWidgetStore } from '../store/useWidgetStore'
import { useDockerStore } from '../store/useDockerStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { useStore } from '../store/useStore'
import { useHaStore } from '../store/useHaStore'
import { useArrStore } from '../store/useArrStore'
import { Trash2, Pencil, X, Check, Plus, Minus, LayoutDashboard, Shield, ShieldOff, Upload, Container, Play, Square, RotateCcw, Zap, Sun, ZapOff, Flame, BatteryCharging, Calendar, Film, Tv } from 'lucide-react'
import type { Widget, ServerStatusConfig, AdGuardHomeConfig, CustomButtonConfig, HomeAssistantConfig, NginxPMConfig, HomeAssistantEnergyConfig, ServerStats, AdGuardStats, HaEntityState, NpmStats, EnergyData, CalendarWidgetConfig, CalendarEntry } from '../types'
import { normalizeUrl, containerCounts } from '../utils'

// ── Energy Widget compact view ─────────────────────────────────────────────────

function SmallCircularGauge({ value, size = 36 }: { value: number; size?: number }) {
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
      <text x={cx} y={cy + size * 0.09} textAnchor="middle" fontSize={size * 0.22} fontWeight="bold"
        fill="var(--text-primary)">{value}%</text>
    </svg>
  )
}

export function HaEnergyWidgetView({ stats }: { stats: EnergyData }) {
  if (stats.error && !stats.configured) {
    return <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{stats.error}</div>
  }
  if (!stats.configured) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Energy not configured in Home Assistant</div>
  }
  const hasSolar = (stats.solar_production ?? 0) > 0
  const hasReturn = (stats.grid_return ?? 0) > 0
  const hasGas = (stats.gas_consumption ?? 0) > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {hasSolar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sun size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>
            {(stats.solar_production ?? 0).toFixed(1)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>kWh solar</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Zap size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{(stats.grid_consumption ?? 0).toFixed(1)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>kWh grid</span>
      </div>
      {hasReturn && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ZapOff size={13} style={{ color: '#10b981', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>{(stats.grid_return ?? 0).toFixed(1)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>kWh return</span>
        </div>
      )}
      {hasGas && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Flame size={13} style={{ color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>{(stats.gas_consumption ?? 0).toFixed(3)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>m³ gas</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SmallCircularGauge value={stats.self_sufficiency ?? 0} size={36} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.period_label ?? 'Today'}</span>
      </div>
    </div>
  )
}

// ── Calendar widget content ────────────────────────────────────────────────────

function formatCalendarDate(dateStr: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const d = new Date(dateStr + 'T00:00:00')
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function CalendarWidgetContent({ entries, compact = false }: { entries: CalendarEntry[]; compact?: boolean }) {
  if (compact) {
    const upcoming = entries.slice(0, 3)
    const more = entries.length - upcoming.length
    if (upcoming.length === 0) {
      return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nothing upcoming</span>
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {upcoming.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', minWidth: 52, flexShrink: 0 }}>{formatCalendarDate(e.date)}</span>
            {e.instanceType === 'radarr'
              ? <Film size={10} style={{ color: '#60a5fa', flexShrink: 0 }} />
              : <Tv size={10} style={{ color: '#a78bfa', flexShrink: 0 }} />}
            <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.title}{e.type === 'episode' && e.season_number != null ? ` S${String(e.season_number).padStart(2, '0')}E${String(e.episode_number ?? 0).padStart(2, '0')}` : ''}
            </span>
          </div>
        ))}
        {more > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{more} more</span>}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 0', color: 'var(--text-muted)' }}>
        <Calendar size={24} style={{ opacity: 0.4 }} />
        <span style={{ fontSize: 12 }}>Nothing upcoming</span>
      </div>
    )
  }

  // Group by date
  const grouped: { date: string; items: CalendarEntry[] }[] = []
  for (const entry of entries) {
    const last = grouped[grouped.length - 1]
    if (last && last.date === entry.date) {
      last.items.push(entry)
    } else {
      grouped.push({ date: entry.date, items: [entry] })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 320, overflowY: 'auto' }}>
      {grouped.map(group => (
        <div key={group.date}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '8px 0 4px', borderBottom: '1px solid var(--glass-border)', marginBottom: 4 }}>
            {formatCalendarDate(group.date)}
          </div>
          {group.items.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: 4, background: e.instanceType === 'radarr' ? 'rgba(96,165,250,0.12)' : 'rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {e.instanceType === 'radarr'
                  ? <Film size={12} style={{ color: '#60a5fa' }} />
                  : <Tv size={12} style={{ color: '#a78bfa' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.title}
                </div>
                {e.type === 'episode' && e.season_number != null && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    S{String(e.season_number).padStart(2, '0')}E{String(e.episode_number ?? 0).padStart(2, '0')}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, color: e.instanceType === 'radarr' ? '#60a5fa' : '#a78bfa', fontWeight: 600, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                {e.instanceName}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Widget icon — URL-matched service icon or custom icon_url ─────────────────
function WidgetIcon({ widget, size = 32 }: { widget: Pick<Widget, 'type' | 'config' | 'icon_url'>; size?: number }) {
  const { services } = useStore()

  if (widget.type === 'docker_overview') {
    if (widget.icon_url) {
      return <img src={widget.icon_url} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
    }
    return <Container size={size * 0.8} style={{ color: 'var(--accent)', flexShrink: 0 }} />
  }

  let iconUrl: string | null = null
  let iconEmoji: string | null = null

  if (widget.type === 'adguard_home' || widget.type === 'pihole' || widget.type === 'home_assistant' || widget.type === 'nginx_pm') {
    const cfg = widget.config as { url?: string }
    const widgetUrl = normalizeUrl(cfg.url ?? '')
    const match = widgetUrl
      ? services.find(s => normalizeUrl(s.url) === widgetUrl || (s.check_url && normalizeUrl(s.check_url) === widgetUrl))
      : undefined
    iconUrl = match?.icon_url ?? widget.icon_url ?? null
    iconEmoji = match?.icon ?? null
  } else {
    iconUrl = widget.icon_url ?? null
  }

  if (iconUrl) {
    return <img src={iconUrl} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
  }
  if (iconEmoji) {
    return <span style={{ fontSize: size * 0.7, lineHeight: 1, flexShrink: 0 }}>{iconEmoji}</span>
  }
  return null
}

// ── Docker Overview widget content ────────────────────────────────────────────
export function DockerOverviewContent({ isAdmin }: { isAdmin: boolean }) {
  const { containers, loadContainers, loadAllStats, controlContainer } = useDockerStore()
  const [selectedId, setSelectedId] = useState('')
  const [controlling, setControlling] = useState(false)
  const [ctrlError, setCtrlError] = useState('')

  useEffect(() => {
    loadContainers()
    loadAllStats()
    const t = setInterval(() => { loadContainers(); loadAllStats() }, 30_000)
    return () => clearInterval(t)
  }, [])

  const { running, stopped, restarting } = containerCounts(containers)

  const selectedContainer = containers.find(c => c.id === selectedId) ?? null

  const handleControl = async (action: 'start' | 'stop' | 'restart') => {
    if (!selectedId) return
    setCtrlError('')
    setControlling(true)
    try {
      await controlContainer(selectedId, action)
      await loadContainers()
    } catch (e: unknown) {
      setCtrlError((e as Error).message)
    } finally {
      setControlling(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Count grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {[
          { label: 'Total',      value: containers.length, color: 'var(--accent)' },
          { label: 'Running',    value: running,    color: 'var(--status-online)' },
          { label: 'Stopped',    value: stopped,    color: 'var(--text-muted)' },
          { label: 'Restarting', value: restarting, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 'var(--radius-sm)', border: `1px solid ${color}22`, background: `${color}0a` }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color, lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2, letterSpacing: '0.3px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Container selector + controls — admin only */}
      {isAdmin && containers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            className="form-input"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px' }}
          >
            <option value="">Select container…</option>
            {[...containers].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.state})</option>
            ))}
          </select>
          {selectedId && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => handleControl('start')}
                disabled={controlling || selectedContainer?.state === 'running'}
                style={{ flex: 1, gap: 3, fontSize: 11, padding: '4px 6px', color: (!controlling && selectedContainer?.state !== 'running') ? 'var(--status-online)' : undefined, borderColor: (!controlling && selectedContainer?.state !== 'running') ? 'rgba(34,197,94,0.35)' : undefined }}>
                {controlling ? <div className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} /> : <Play size={10} />} Start
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleControl('stop')}
                disabled={controlling || selectedContainer?.state !== 'running'}
                style={{ flex: 1, gap: 3, fontSize: 11, padding: '4px 6px', color: (!controlling && selectedContainer?.state === 'running') ? 'var(--status-offline)' : undefined, borderColor: (!controlling && selectedContainer?.state === 'running') ? 'rgba(239,68,68,0.35)' : undefined }}>
                {controlling ? <div className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} /> : <Square size={10} />} Stop
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleControl('restart')}
                disabled={controlling}
                style={{ flex: 1, gap: 3, fontSize: 11, padding: '4px 6px', color: !controlling ? '#f59e0b' : undefined, borderColor: !controlling ? 'rgba(245,158,11,0.35)' : undefined }}>
                {controlling ? <div className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} /> : <RotateCcw size={10} />} Restart
              </button>
            </div>
          )}
          {ctrlError && (
            <div style={{ fontSize: 11, color: 'var(--status-offline)' }}>{ctrlError}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Disk config row ───────────────────────────────────────────────────────────
function DiskRow({
  disk,
  onChange,
  onRemove,
}: {
  disk: { path: string; name: string }
  onChange: (d: { path: string; name: string }) => void
  onRemove: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        className="form-input"
        placeholder="Name (e.g. Data)"
        value={disk.name}
        onChange={e => onChange({ ...disk, name: e.target.value })}
        style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '5px 8px' }}
      />
      <input
        className="form-input"
        placeholder="Path (e.g. /data)"
        value={disk.path}
        onChange={e => onChange({ ...disk, path: e.target.value })}
        style={{ flex: 2, minWidth: 0, fontSize: 13, padding: '5px 8px' }}
      />
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm"
        onClick={onRemove}
        style={{ flexShrink: 0, padding: '4px', width: 28, height: 28 }}
      >
        <Minus size={12} />
      </button>
    </div>
  )
}

// ── Entity row (Home Assistant) ───────────────────────────────────────────────
function EntityRow({
  entity,
  onChange,
  onRemove,
}: {
  entity: { entity_id: string; label: string }
  onChange: (e: { entity_id: string; label: string }) => void
  onRemove: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        className="form-input"
        placeholder="Label (e.g. Living Room)"
        value={entity.label}
        onChange={e => onChange({ ...entity, label: e.target.value })}
        style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '5px 8px' }}
      />
      <input
        className="form-input"
        placeholder="entity_id (e.g. light.living_room)"
        value={entity.entity_id}
        onChange={e => onChange({ ...entity, entity_id: e.target.value })}
        style={{ flex: 2, minWidth: 0, fontSize: 13, padding: '5px 8px' }}
      />
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onRemove} style={{ flexShrink: 0, padding: '4px', width: 28, height: 28 }}>
        <Minus size={12} />
      </button>
    </div>
  )
}

// ── Home Assistant entity state view ─────────────────────────────────────────
export function HaStatsView({
  entities,
  widgetId,
  isAdmin,
}: {
  entities: HaEntityState[]
  widgetId: string
  isAdmin: boolean
}) {
  const { haToggle } = useWidgetStore()
  const [toggling, setToggling] = useState<string | null>(null)

  if (entities.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>No entities configured.</div>
  }

  const handleToggle = async (entityId: string, currentState: string) => {
    setToggling(entityId)
    try { await haToggle(widgetId, entityId, currentState) }
    finally { setToggling(null) }
  }

  const toggleableDomains = ['switch', 'light', 'input_boolean', 'automation', 'fan']

  const stateColor = (state: string): string | undefined => {
    if (['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(state)) return 'var(--status-online)'
    if (['off', 'closed', 'locked', 'paused', 'idle', 'standby'].includes(state)) return 'var(--text-muted)'
    if (['unavailable', 'unknown'].includes(state)) return 'var(--text-muted)'
    return undefined
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entities.map(e => {
        const domain = e.entity_id.split('.')[0]
        const isToggleable = toggleableDomains.includes(domain)
        const isOn = e.state === 'on'
        const isUnavailable = e.state === 'unavailable' || e.state === 'unknown'
        const displayLabel = e.label || e.friendly_name || e.entity_id
        return (
          <div key={e.entity_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{displayLabel}</span>
            {isUnavailable ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>unavailable</span>
            ) : e.unit ? (
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                {e.state} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.unit}</span>
              </span>
            ) : isToggleable ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleToggle(e.entity_id, e.state)}
                disabled={toggling === e.entity_id}
                style={{ fontSize: 11, padding: '2px 10px', gap: 4, color: isOn ? 'var(--status-online)' : 'var(--text-muted)', borderColor: isOn ? 'rgba(34,197,94,0.35)' : undefined, minWidth: 54 }}
              >
                {toggling === e.entity_id
                  ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                  : isOn ? 'On' : 'Off'
                }
              </button>
            ) : (
              <span style={{ fontSize: 11, color: stateColor(e.state) ?? 'var(--text-secondary)' }}>{e.state}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Custom buttons view ───────────────────────────────────────────────────────
export function CustomButtonsView({ widget }: { widget: Widget }) {
  const { triggerButton } = useWidgetStore()
  const config = widget.config as CustomButtonConfig
  const [triggering, setTriggering] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, 'ok' | 'err'>>({})

  if (!config.buttons?.length) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>No buttons configured.</div>
  }

  const handleTrigger = async (buttonId: string) => {
    if (triggering) return
    setTriggering(buttonId)
    try {
      await triggerButton(widget.id, buttonId)
      setResults(r => ({ ...r, [buttonId]: 'ok' }))
      setTimeout(() => setResults(r => { const n = { ...r }; delete n[buttonId]; return n }), 2000)
    } catch {
      setResults(r => ({ ...r, [buttonId]: 'err' }))
      setTimeout(() => setResults(r => { const n = { ...r }; delete n[buttonId]; return n }), 3000)
    } finally {
      setTriggering(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {config.buttons.map(btn => (
        <button
          key={btn.id}
          className="btn btn-ghost btn-sm"
          onClick={() => handleTrigger(btn.id)}
          disabled={triggering === btn.id}
          style={{
            gap: 6, justifyContent: 'flex-start', fontSize: 13, padding: '7px 10px',
            color: results[btn.id] === 'ok' ? 'var(--status-online)' : results[btn.id] === 'err' ? 'var(--status-offline)' : undefined,
            borderColor: results[btn.id] === 'ok' ? 'rgba(34,197,94,0.35)' : results[btn.id] === 'err' ? 'rgba(239,68,68,0.35)' : undefined,
          }}
        >
          {triggering === btn.id
            ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
            : <Zap size={12} style={{ flexShrink: 0 }} />
          }
          <span style={{ flex: 1, textAlign: 'left' }}>{btn.label}</span>
          {results[btn.id] === 'ok' && <Check size={11} />}
          {results[btn.id] === 'err' && <X size={11} />}
        </button>
      ))}
    </div>
  )
}

// ── Widget form (create or edit) ───────────────────────────────────────────────
function WidgetForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Widget
  onSave: (data: { name: string; type: string; config: object; display_location: 'topbar' | 'sidebar' | 'none'; iconData?: { data: string; contentType: string } | null }) => Promise<void>
  onCancel: () => void
}) {
  const isEdit = !!initial
  type WidgetFormType = 'server_status' | 'adguard_home' | 'docker_overview' | 'custom_button' | 'home_assistant' | 'pihole' | 'nginx_pm' | 'home_assistant_energy' | 'calendar'
  const [type, setType] = useState<WidgetFormType>(
    (initial?.type as WidgetFormType) ?? 'server_status'
  )
  const { instances: haInstances, loadInstances: loadHaInstances } = useHaStore()
  const { instances: arrInstances, loadInstances: loadArrInstances } = useArrStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [displayLocation, setDisplayLocation] = useState<'topbar' | 'sidebar' | 'none'>(
    (initial?.display_location ?? 'none') as 'topbar' | 'sidebar' | 'none'
  )

  // server_status config
  const [disks, setDisks] = useState<{ path: string; name: string }[]>(
    initial?.type === 'server_status' ? (initial.config as ServerStatusConfig).disks ?? [] : []
  )

  // adguard_home config
  const existingAdGuard = initial?.type === 'adguard_home' ? (initial.config as AdGuardHomeConfig) : null
  const [agUrl, setAgUrl] = useState(existingAdGuard?.url ?? '')
  const [agUsername, setAgUsername] = useState(existingAdGuard?.username ?? '')
  const [agPassword, setAgPassword] = useState('')  // blank = keep existing on edit

  // custom_button config
  const [buttons, setButtons] = useState<{ id: string; label: string; url: string; method: 'GET' | 'POST' }[]>(
    initial?.type === 'custom_button' ? (initial.config as CustomButtonConfig).buttons ?? [] : []
  )

  // home_assistant config
  const existingHa = initial?.type === 'home_assistant' ? (initial.config as HomeAssistantConfig) : null
  const [haUrl, setHaUrl] = useState(existingHa?.url ?? '')
  const [haToken, setHaToken] = useState('')  // blank = keep existing on edit
  const [haEntities, setHaEntities] = useState<{ entity_id: string; label: string }[]>(existingHa?.entities ?? [])

  // pihole config
  const existingPihole = initial?.type === 'pihole' ? (initial.config as { url?: string }) : null
  const [phUrl, setPhUrl] = useState(existingPihole?.url ?? '')
  const [phPassword, setPhPassword] = useState('')  // blank = keep existing on edit

  // nginx_pm config
  const existingNpm = initial?.type === 'nginx_pm' ? (initial.config as NginxPMConfig) : null
  const [npmUrl, setNpmUrl] = useState(existingNpm?.url ?? '')
  const [npmUsername, setNpmUsername] = useState(existingNpm?.username ?? '')
  const [npmPassword, setNpmPassword] = useState('')  // blank = keep existing on edit

  // home_assistant_energy config
  const existingEnergy = initial?.type === 'home_assistant_energy' ? (initial.config as HomeAssistantEnergyConfig) : null
  const [energyInstanceId, setEnergyInstanceId] = useState(existingEnergy?.instance_id ?? '')
  const [energyPeriod, setEnergyPeriod] = useState<'day' | 'week' | 'month'>(existingEnergy?.period ?? 'day')

  // calendar config
  const existingCal = initial?.type === 'calendar' ? (initial.config as CalendarWidgetConfig) : null
  const [calInstanceIds, setCalInstanceIds] = useState<string[]>(existingCal?.instance_ids ?? [])
  const [calDaysAhead, setCalDaysAhead] = useState(existingCal?.days_ahead ?? 14)

  // icon
  const [pendingIcon, setPendingIcon] = useState<{ data: string; contentType: string; preview: string } | null>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleIconFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      const [header, data] = dataUrl.split(',')
      const contentType = header.split(':')[1].split(';')[0]
      setPendingIcon({ data, contentType, preview: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  // Load HA instances when energy type is selected; ARR instances for calendar
  useEffect(() => {
    if (type === 'home_assistant_energy') loadHaInstances().catch(() => {})
    if (type === 'calendar') loadArrInstances().catch(() => {})
  }, [type])

  // Update default name when type changes (only on create)
  const getDefaultNameForType = (t: WidgetFormType): string => {
    if (t === 'adguard_home') return 'AdGuard Home'
    if (t === 'docker_overview') return 'Docker Overview'
    if (t === 'custom_button') return 'Quick Actions'
    if (t === 'home_assistant') return 'Home Assistant'
    if (t === 'pihole') return 'Pi-hole'
    if (t === 'nginx_pm') return 'Nginx Proxy Manager'
    if (t === 'home_assistant_energy') return 'HA Energy'
    if (t === 'calendar') return 'Upcoming'
    return 'Server Status'
  }

  const handleTypeChange = (t: WidgetFormType) => {
    setType(t)
    if (!isEdit && !name) {
      setName(getDefaultNameForType(t))
    }
  }

  const handleSave = async () => {
    setError('')
    if (!name.trim()) return setError('Name is required')

    let config: object
    if (type === 'server_status') {
      config = { disks }
    } else if (type === 'docker_overview') {
      config = {}
    } else if (type === 'custom_button') {
      config = { buttons }
    } else if (type === 'home_assistant') {
      if (!haUrl.trim()) return setError('URL is required')
      if (!isEdit && !haToken) return setError('Token is required')
      config = { url: haUrl.trim(), entities: haEntities, ...(haToken ? { token: haToken } : {}) }
    } else if (type === 'pihole') {
      if (!phUrl.trim()) return setError('URL is required')
      if (!isEdit && !phPassword) return setError('Password is required')
      config = { url: phUrl.trim(), ...(phPassword ? { password: phPassword } : {}) }
    } else if (type === 'nginx_pm') {
      if (!npmUrl.trim()) return setError('URL is required')
      if (!npmUsername.trim()) return setError('Username is required')
      if (!isEdit && !npmPassword) return setError('Password is required')
      config = { url: npmUrl.trim(), username: npmUsername.trim(), ...(npmPassword ? { password: npmPassword } : {}) }
    } else if (type === 'home_assistant_energy') {
      if (!energyInstanceId) return setError('HA Instance is required')
      config = { instance_id: energyInstanceId, period: energyPeriod }
    } else if (type === 'calendar') {
      if (calInstanceIds.length === 0) return setError('Select at least one Radarr/Sonarr instance')
      const days = Math.max(1, Math.min(30, calDaysAhead))
      config = { instance_ids: calInstanceIds, days_ahead: days }
    } else {
      if (!agUrl.trim()) return setError('URL is required')
      if (!agUsername.trim()) return setError('Username is required')
      if (!isEdit && !agPassword) return setError('Password is required')
      config = { url: agUrl.trim(), username: agUsername.trim(), ...(agPassword ? { password: agPassword } : {}) }
    }

    setSaving(true)
    try {
      await onSave({ name: name.trim(), type, config, display_location: displayLocation, iconData: pendingIcon ? { data: pendingIcon.data, contentType: pendingIcon.contentType } : null })
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const addDisk = () => setDisks(d => [...d, { name: '', path: '' }])
  const updateDisk = (i: number, disk: { name: string; path: string }) =>
    setDisks(d => d.map((x, idx) => idx === i ? disk : x))
  const removeDisk = (i: number) => setDisks(d => d.filter((_, idx) => idx !== i))

  const addButton = () => setButtons(b => [...b, { id: Math.random().toString(36).slice(2), label: '', url: '', method: 'POST' as const }])
  const updateButton = (i: number, btn: { id: string; label: string; url: string; method: 'GET' | 'POST' }) =>
    setButtons(b => b.map((x, idx) => idx === i ? btn : x))
  const removeButton = (i: number) => setButtons(b => b.filter((_, idx) => idx !== i))

  const addEntity = () => setHaEntities(e => [...e, { entity_id: '', label: '' }])
  const updateEntity = (i: number, entity: { entity_id: string; label: string }) =>
    setHaEntities(e => e.map((x, idx) => idx === i ? entity : x))
  const removeEntity = (i: number) => setHaEntities(e => e.filter((_, idx) => idx !== i))

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        {isEdit ? 'Edit Widget' : 'New Widget'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Type selector — only on create */}
        {!isEdit && (
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>Type</label>
            <select
              className="form-input"
              value={type}
              onChange={e => handleTypeChange(e.target.value as WidgetFormType)}
            >
              <option value="adguard_home">AdGuard Home</option>
              <option value="calendar">Calendar</option>
              <option value="custom_button">Custom Buttons</option>
              <option value="docker_overview">Docker Overview</option>
              <option value="home_assistant">Home Assistant</option>
              <option value="home_assistant_energy">HA Energy</option>
              <option value="nginx_pm">Nginx Proxy Manager</option>
              <option value="pihole">Pi-hole</option>
              <option value="server_status">Server Status</option>
            </select>
          </div>
        )}

        <div>
          <label className="form-label" style={{ fontSize: 11 }}>Name</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={type === 'adguard_home' ? 'AdGuard Home' : type === 'docker_overview' ? 'Docker Overview' : 'Server Status'}
          />
        </div>

        {/* Icon */}
        {true && (
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>
              Icon
              {type === 'adguard_home' && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(auto-matched from app URL, or upload custom)</span>}
              {type === 'docker_overview' && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(custom icon, or leave blank for default)</span>}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(pendingIcon?.preview ?? (isEdit ? initial?.icon_url : null)) && (
                <img
                  src={pendingIcon?.preview ?? initial?.icon_url ?? ''}
                  alt=""
                  style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--glass-border)' }}
                />
              )}
              <input
                ref={iconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleIconFile(f) }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => iconInputRef.current?.click()}
                style={{ gap: 4, fontSize: 12 }}
              >
                <Upload size={12} /> {pendingIcon || (isEdit && initial?.icon_url) ? 'Change Icon' : 'Upload Icon'}
              </button>
              {(pendingIcon || (isEdit && initial?.icon_url)) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPendingIcon(null)}
                  style={{ fontSize: 12, color: 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="form-label" style={{ fontSize: 11 }}>Display Location</label>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
            {(['topbar', 'sidebar', 'none'] as const).map(loc => (
              <button
                key={loc}
                type="button"
                onClick={() => setDisplayLocation(loc)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  fontWeight: displayLocation === loc ? 600 : 400,
                  background: displayLocation === loc ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                  color: displayLocation === loc ? 'var(--accent)' : 'var(--text-secondary)',
                  border: displayLocation === loc ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  textTransform: 'capitalize',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {loc === 'topbar' && '📊'}
                {loc === 'sidebar' && '📌'}
                {loc === 'none' && '✕'}
                {' '}{loc}
              </button>
            ))}
          </div>
        </div>

        {/* server_status config */}
        {type === 'server_status' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ fontSize: 11, margin: 0 }}>Disks</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addDisk} style={{ gap: 4, fontSize: 11, padding: '3px 8px' }}>
                <Plus size={11} /> Add Disk
              </button>
            </div>
            {disks.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No disks configured. Click "Add Disk" to add one.</span>
            )}
            {disks.map((d, i) => (
              <DiskRow key={i} disk={d} onChange={disk => updateDisk(i, disk)} onRemove={() => removeDisk(i)} />
            ))}
          </div>
        )}

        {/* adguard_home config */}
        {type === 'adguard_home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>AdGuard Home URL</label>
              <input
                className="form-input"
                value={agUrl}
                onChange={e => setAgUrl(e.target.value)}
                placeholder="http://192.168.1.1:80"
                style={{ fontSize: 13 }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Username</label>
              <input
                className="form-input"
                value={agUsername}
                onChange={e => setAgUsername(e.target.value)}
                placeholder="admin"
                autoComplete="off"
                style={{ fontSize: 13 }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>
                Password{isEdit && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(leave blank to keep existing)</span>}
              </label>
              <input
                className="form-input"
                type="password"
                value={agPassword}
                onChange={e => setAgPassword(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Password'}
                autoComplete="new-password"
                style={{ fontSize: 13 }}
              />
            </div>
          </div>
        )}

        {/* custom_button config */}
        {type === 'custom_button' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ fontSize: 11, margin: 0 }}>Buttons</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addButton} style={{ gap: 4, fontSize: 11, padding: '3px 8px' }}>
                <Plus size={11} /> Add Button
              </button>
            </div>
            {buttons.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No buttons yet. Click "Add Button".</span>
            )}
            {buttons.map((btn, i) => (
              <div key={btn.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="form-input" placeholder="Label" value={btn.label} onChange={e => updateButton(i, { ...btn, label: e.target.value })} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '5px 8px' }} />
                <input className="form-input" placeholder="URL" value={btn.url} onChange={e => updateButton(i, { ...btn, url: e.target.value })} style={{ flex: 2, minWidth: 0, fontSize: 13, padding: '5px 8px' }} />
                <select className="form-input" value={btn.method} onChange={e => updateButton(i, { ...btn, method: e.target.value as 'GET' | 'POST' })} style={{ width: 72, fontSize: 12, padding: '5px 6px' }}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeButton(i)} style={{ flexShrink: 0, padding: '4px', width: 28, height: 28 }}><Minus size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {/* home_assistant config */}
        {type === 'home_assistant' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Home Assistant URL</label>
              <input className="form-input" value={haUrl} onChange={e => setHaUrl(e.target.value)} placeholder="http://homeassistant.local:8123" style={{ fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>
                Long-Lived Access Token{isEdit && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(leave blank to keep existing)</span>}
              </label>
              <input className="form-input" type="password" value={haToken} onChange={e => setHaToken(e.target.value)} placeholder={isEdit ? '••••••••' : 'Token from HA Profile → Long-Lived Access Tokens'} autoComplete="new-password" style={{ fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ fontSize: 11, margin: 0 }}>Entities</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addEntity} style={{ gap: 4, fontSize: 11, padding: '3px 8px' }}>
                <Plus size={11} /> Add Entity
              </button>
            </div>
            {haEntities.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No entities yet. Click "Add Entity".</span>
            )}
            {haEntities.map((e, i) => (
              <EntityRow key={i} entity={e} onChange={entity => updateEntity(i, entity)} onRemove={() => removeEntity(i)} />
            ))}
          </div>
        )}

        {/* pihole config */}
        {type === 'pihole' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Pi-hole URL</label>
              <input className="form-input" value={phUrl} onChange={e => setPhUrl(e.target.value)} placeholder="http://192.168.1.1" style={{ fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>
                Admin Password{isEdit && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(leave blank to keep existing)</span>}
              </label>
              <input className="form-input" type="password" value={phPassword} onChange={e => setPhPassword(e.target.value)} placeholder={isEdit ? '••••••••' : 'Pi-hole admin password'} autoComplete="new-password" style={{ fontSize: 13 }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Requires Pi-hole v6+</p>
          </div>
        )}

        {/* home_assistant_energy config */}
        {type === 'home_assistant_energy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>HA Instance</label>
              <select className="form-input" value={energyInstanceId} onChange={e => setEnergyInstanceId(e.target.value)} style={{ fontSize: 13 }}>
                <option value="">— Select instance —</option>
                {haInstances.filter(i => i.enabled).map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Default Period</label>
              <select className="form-input" value={energyPeriod} onChange={e => setEnergyPeriod(e.target.value as 'day' | 'week' | 'month')} style={{ fontSize: 13 }}>
                <option value="day">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>
          </div>
        )}

        {/* nginx_pm config */}
        {type === 'nginx_pm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Nginx Proxy Manager URL</label>
              <input className="form-input" value={npmUrl} onChange={e => setNpmUrl(e.target.value)} placeholder="http://npm.local:81" style={{ fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Username / Email</label>
              <input className="form-input" value={npmUsername} onChange={e => setNpmUsername(e.target.value)} placeholder="admin@example.com" autoComplete="off" style={{ fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>
                Password{isEdit && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(leave blank to keep existing)</span>}
              </label>
              <input className="form-input" type="password" value={npmPassword} onChange={e => setNpmPassword(e.target.value)} placeholder={isEdit ? '••••••••' : 'Password'} autoComplete="new-password" style={{ fontSize: 13 }} />
            </div>
          </div>
        )}

        {/* calendar config */}
        {type === 'calendar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Radarr / Sonarr Instances</label>
              {arrInstances.filter(i => i.enabled && (i.type === 'radarr' || i.type === 'sonarr')).length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No Radarr/Sonarr instances found.</span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {arrInstances.filter(i => i.enabled && (i.type === 'radarr' || i.type === 'sonarr')).map(inst => (
                  <label key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={calInstanceIds.includes(inst.id)}
                      onChange={e => {
                        if (e.target.checked) setCalInstanceIds(ids => [...ids, inst.id])
                        else setCalInstanceIds(ids => ids.filter(id => id !== inst.id))
                      }}
                    />
                    <span style={{ color: inst.type === 'radarr' ? '#60a5fa' : '#a78bfa', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      {inst.type === 'radarr' ? 'R' : 'S'}
                    </span>
                    {inst.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Days Ahead (1–30)</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={30}
                value={calDaysAhead}
                onChange={e => setCalDaysAhead(Math.max(1, Math.min(30, parseInt(e.target.value) || 14)))}
                style={{ fontSize: 13, width: 80 }}
              />
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ gap: 4 }}>
          <Check size={12} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ gap: 4 }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

// ── Widget card ───────────────────────────────────────────────────────────────
function WidgetCard({
  widget,
  onEdit,
  onDelete,
  onToggleDashboard,
  isOnDashboard,
}: {
  widget: Widget
  onEdit: () => void
  onDelete: () => void
  onToggleDashboard: () => void
  isOnDashboard: boolean
}) {
  const { isAdmin } = useStore()
  const { stats, setAdGuardProtection, setPiholeProtection } = useWidgetStore()
  const s = stats[widget.id]
  const [toggling, setToggling] = useState(false)

  const handleProtectionToggle = async () => {
    if (!isAdmin || widget.type !== 'adguard_home' || !s) return
    const ag = s as AdGuardStats
    setToggling(true)
    try {
      await setAdGuardProtection(widget.id, !ag.protection_enabled)
    } finally {
      setToggling(false)
    }
  }

  const handlePiholeToggle = async () => {
    if (!isAdmin || widget.type !== 'pihole' || !s) return
    const ph = s as AdGuardStats
    setToggling(true)
    try {
      await setPiholeProtection(widget.id, !ph.protection_enabled)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <WidgetIcon widget={widget} size={32} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{widget.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
              <span>{{ adguard_home: 'AdGuard Home', docker_overview: 'Docker Overview', custom_button: 'Custom Buttons', home_assistant: 'Home Assistant', home_assistant_energy: 'HA Energy', pihole: 'Pi-hole', nginx_pm: 'Nginx Proxy Manager', calendar: 'Calendar' }[widget.type] ?? 'Server Status'}</span>
              {widget.display_location === 'topbar' && <span style={{ color: 'var(--accent)' }}>· Topbar</span>}
              {widget.display_location === 'sidebar' && <span style={{ color: 'var(--accent)' }}>· Sidebar</span>}
            </div>
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} data-tooltip="Edit" style={{ padding: '4px', width: 28, height: 28 }}>
              <Pencil size={12} />
            </button>
            <button className="btn btn-danger btn-icon btn-sm" onClick={onDelete} data-tooltip="Delete" style={{ padding: '4px', width: 28, height: 28 }}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Stats preview — branched by widget type */}
      {widget.type === 'docker_overview' ? (
        <DockerOverviewContent isAdmin={isAdmin} />
      ) : widget.type === 'custom_button' ? (
        <CustomButtonsView widget={widget} />
      ) : widget.type === 'server_status' ? (
        s ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              const ss = s as ServerStats
              return (
                <>
                  <StatBar label="CPU" value={ss.cpu.load >= 0 ? ss.cpu.load : null} unit="%" />
                  <StatBar label="RAM" value={ss.ram.total > 0 ? Math.round((ss.ram.used / ss.ram.total) * 100) : null} unit="%" extra={ss.ram.total > 0 ? `${(ss.ram.used / 1024).toFixed(1)} / ${(ss.ram.total / 1024).toFixed(1)} GB` : undefined} />
                  {ss.disks.map(d => (
                    d.error === 'not_mounted'
                      ? <div key={d.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.name}</span>
                          <span className="badge-error" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>Not mounted</span>
                        </div>
                      : d.duplicate
                        ? <div key={d.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.name}</span>
                            <span className="badge-warning" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>Duplicate of {d.duplicateOf}</span>
                          </div>
                        : <StatBar key={d.path} label={d.name} value={d.total > 0 ? Math.round((d.used / d.total) * 100) : null} unit="%" extra={d.total > 0 ? `${(d.used / 1024).toFixed(0)} / ${(d.total / 1024).toFixed(0)} GB` : undefined} />
                  ))}
                </>
              )
            })()}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading stats…</div>
        )
      ) : widget.type === 'pihole' ? (
        s ? (
          <AdGuardStatsView
            stats={s as AdGuardStats}
            isAdmin={isAdmin}
            toggling={toggling}
            onToggle={handlePiholeToggle}
          />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading stats…</div>
        )
      ) : widget.type === 'home_assistant' ? (
        s ? (
          <HaStatsView entities={s as HaEntityState[]} widgetId={widget.id} isAdmin={isAdmin} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading states…</div>
        )
      ) : widget.type === 'nginx_pm' ? (
        s ? (
          <NginxPMStatsView stats={s as NpmStats & { error?: string }} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading stats…</div>
        )
      ) : widget.type === 'home_assistant_energy' ? (
        s ? (
          <HaEnergyWidgetView stats={s as EnergyData} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading stats…</div>
        )
      ) : widget.type === 'calendar' ? (
        s ? (
          <CalendarWidgetContent entries={s as CalendarEntry[]} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading calendar…</div>
        )
      ) : (
        // adguard_home
        s ? (
          <AdGuardStatsView
            stats={s as AdGuardStats}
            isAdmin={isAdmin}
            toggling={toggling}
            onToggle={handleProtectionToggle}
          />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading stats…</div>
        )
      )}

      {/* Dashboard toggle — admin only */}
      {isAdmin && (
        <button
          className={isOnDashboard ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          onClick={onToggleDashboard}
          style={{ gap: 4, fontSize: 12, alignSelf: 'flex-start' }}
        >
          <LayoutDashboard size={12} />
          {isOnDashboard ? 'On Dashboard' : 'Add to Dashboard'}
        </button>
      )}
    </div>
  )
}

// ── AdGuard stats view (shared between WidgetCard and DashboardWidgetCard) ────
export function AdGuardStatsView({
  stats,
  isAdmin,
  toggling,
  onToggle,
}: {
  stats: AdGuardStats
  isAdmin: boolean
  toggling: boolean
  onToggle: () => void
}) {
  const isError = stats.total_queries === -1
  if (isError) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Unreachable</div>
  }
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
        <AdGuardStat label="Total" value={fmt(stats.total_queries)} />
        <AdGuardStat label="Blocked" value={fmt(stats.blocked_queries)} />
        <AdGuardStat label="Rate" value={`${stats.blocked_percent}%`} highlight />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {stats.protection_enabled
            ? <Shield size={13} style={{ color: 'var(--status-online)' }} />
            : <ShieldOff size={13} style={{ color: 'var(--text-muted)' }} />
          }
          <span style={{ fontSize: 12, color: stats.protection_enabled ? 'var(--status-online)' : 'var(--text-muted)' }}>
            {stats.protection_enabled ? 'Protected' : 'Paused'}
          </span>
        </div>
        {isAdmin && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onToggle}
            disabled={toggling}
            style={{ fontSize: 11, padding: '3px 10px', gap: 4 }}
          >
            {toggling
              ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              : stats.protection_enabled ? <ShieldOff size={11} /> : <Shield size={11} />
            }
            {stats.protection_enabled ? 'Pause' : 'Enable'}
          </button>
        )}
      </div>
    </div>
  )
}

function AdGuardStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: highlight ? 'var(--accent)' : 'var(--text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
    </div>
  )
}

export function StatBar({ label, value, unit, extra }: { label: string; value: number | null; unit: string; extra?: string }) {
  const pct = value ?? 0
  const color = pct >= 90 ? 'var(--status-offline)' : pct >= 70 ? '#f59e0b' : 'var(--accent)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {value === null ? '—' : `${value}${unit}`}
          {extra && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{extra}</span>}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--glass-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

// ── Nginx Proxy Manager stats view ───────────────────────────────────────────
export function NginxPMStatsView({ stats }: { stats: NpmStats & { error?: string } }) {
  if (stats.error) {
    return <div style={{ fontSize: 12, color: 'var(--status-offline)', textAlign: 'center', padding: '8px 0' }}>Error: {stats.error}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{stats.proxy_hosts}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Proxies</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{stats.streams}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Streams</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stats.cert_expiring_soon > 0 ? '#f59e0b' : 'var(--accent)' }}>{stats.certificates}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Certs</div>
        </div>
      </div>
      {stats.cert_expiring_soon > 0 && (
        <div style={{ fontSize: 11, color: '#f59e0b', textAlign: 'center' }}>
          {stats.cert_expiring_soon} cert{stats.cert_expiring_soon !== 1 ? 's' : ''} expiring within 30 days
        </div>
      )}
    </div>
  )
}

// ── Main Widgets page ─────────────────────────────────────────────────────────
interface Props {
  showAddForm: boolean
  onFormClose: () => void
}

export function WidgetsPage({ showAddForm, onFormClose }: Props) {
  const { isAdmin } = useStore()
  const { widgets, loadWidgets, loadStats, createWidget, updateWidget, deleteWidget, uploadWidgetIcon, startPollingAll, stopPollingAll } = useWidgetStore()
  const { isOnDashboard, addWidget, removeByRef } = useDashboardStore()
  const { loadContainers: loadDockerContainers } = useDockerStore()
  const { confirm: confirmDlg } = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    loadWidgets().catch(() => {})
  }, [])

  const widgetIds = widgets.map(w => w.id).join(',')

  useEffect(() => {
    const statsPollable = widgets.filter(w => w.type !== 'docker_overview' && w.type !== 'custom_button')
    const dockerPollable = widgets.filter(w => w.type === 'docker_overview')
    if (statsPollable.length === 0 && dockerPollable.length === 0) return
    Promise.all(statsPollable.map(w => loadStats(w.id))).catch(() => {})
    if (dockerPollable.length > 0) loadDockerContainers().catch(() => {})
    const allPollable = [...statsPollable, ...dockerPollable]
    startPollingAll(allPollable.map(w => ({ id: w.id, type: w.type })))
    return () => stopPollingAll()
  }, [widgetIds])

  const handleCreate = async (data: { name: string; type: string; config: object; display_location: 'topbar' | 'sidebar' | 'none'; iconData?: { data: string; contentType: string } | null }) => {
    const { iconData, ...widgetData } = data
    const id = await createWidget({ ...widgetData, show_in_topbar: widgetData.display_location === 'topbar' })
    if (iconData) await uploadWidgetIcon(id, iconData.data, iconData.contentType)
    onFormClose()
  }

  const handleUpdate = async (id: string, data: { name: string; type: string; config: object; display_location: 'topbar' | 'sidebar' | 'none'; iconData?: { data: string; contentType: string } | null }) => {
    const { iconData, ...widgetData } = data
    await updateWidget(id, { ...widgetData, show_in_topbar: widgetData.display_location === 'topbar' })
    if (iconData) await uploadWidgetIcon(id, iconData.data, iconData.contentType)
    setEditingId(null)
  }

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirmDlg({ title: `Delete widget "${name}"?`, danger: true, confirmLabel: 'Delete' })
    if (!ok) return
    await deleteWidget(id)
  }

  const handleToggleDashboard = async (widget: Widget) => {
    if (isOnDashboard('widget', widget.id)) {
      await removeByRef('widget', widget.id)
    } else {
      await addWidget(widget.id)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Add form */}
      {showAddForm && isAdmin && (
        <WidgetForm
          onSave={handleCreate}
          onCancel={onFormClose}
        />
      )}

      {widgets.length === 0 && !showAddForm && (
        <div className="empty-state">
          <div className="empty-state-icon">◈</div>
          <div className="empty-state-text">
            {isAdmin
              ? 'No widgets yet.\nClick "+ Add Widget" to create one.'
              : 'No widgets available.'}
          </div>
        </div>
      )}

      <div className="card-grid" style={{ gap: 16 }}>
        {widgets.map(widget => (
          editingId === widget.id
            ? (
              <WidgetForm
                key={widget.id}
                initial={widget}
                onSave={(data) => handleUpdate(widget.id, data)}
                onCancel={() => setEditingId(null)}
              />
            )
            : (
              <WidgetCard
                key={widget.id}
                widget={widget}
                onEdit={() => setEditingId(widget.id)}
                onDelete={() => handleDelete(widget.id, widget.name)}
                onToggleDashboard={() => handleToggleDashboard(widget)}
                isOnDashboard={isOnDashboard('widget', widget.id)}
              />
            )
        ))}
      </div>
    </div>
  )
}
