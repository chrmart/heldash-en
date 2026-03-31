import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTemperature } from '../utils'
import { useStore } from '../store/useStore'
import { useUnraidStore } from '../store/useUnraidStore'
import { useToast } from '../components/Toast'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Server, Settings2, GripVertical, Plus, RefreshCw, Play, Square, RotateCcw,
  Pause, ChevronUp, ChevronDown, Trash2, Eye, EyeOff, AlertTriangle, Check,
  Download, Zap, SkipForward, HardDrive, Cpu,
  Monitor, Clock, Globe, Shield, Users, Key, Tag, Layers,
  Activity, Network, Package,
} from 'lucide-react'
import type { UnraidInstance, UnraidContainer, UnraidVm, UnraidPhysicalDisk, UnraidNotification } from '../types/unraid'
import { api } from '../api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '–'
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  if (gb < 1024) return `${gb.toFixed(2)} GB`
  return `${(gb / 1024).toFixed(2)} TB`
}

function formatKilobytes(kb?: number | string | null): string {
  const n = typeof kb === 'string' ? parseInt(kb, 10) : (kb ?? 0)
  if (!n || n === 0) return '–'
  if (n < 1024)       return `${n} KB`
  if (n < 1048576)    return `${(n / 1024).toFixed(1)} MB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(2)} GB`
  return `${(n / 1073741824).toFixed(2)} TB`
}

function formatUptime(uptime?: string): string {
  if (!uptime) return '–'
  const bootTime = new Date(uptime).getTime()
  if (isNaN(bootTime)) return uptime
  const seconds = Math.floor((Date.now() - bootTime) / 1000)
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}T`)
  if (h > 0) parts.push(`${h}Std`)
  if (m > 0 || parts.length === 0) parts.push(`${m}Min`)
  return parts.join(' ')
}

function formatRelative(ts?: string): string {
  if (!ts) return '–'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `vor ${m} Min`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} Std`
  return `vor ${Math.floor(h / 24)} Tagen`
}

function arrayStateBadgeStyle(state?: string): { color: string; background: string } {
  switch (state) {
    case 'STARTED':
    case 'started':
      return { color: 'var(--status-online)', background: 'rgba(34,197,94,0.12)' }
    case 'STOPPED':
    case 'stopped':
      return { color: 'var(--text-muted)', background: 'rgba(128,128,128,0.12)' }
    case 'RECON_DISK':
    case 'DISABLE_DISK':
    case 'SWAP_DSBL':
    case 'NEW_ARRAY':
      return { color: 'var(--warning)', background: 'rgba(234,179,8,0.12)' }
    default:
      return { color: 'var(--status-offline)', background: 'rgba(239,68,68,0.12)' }
  }
}

function pendingBadge(action: string): { label: string; color: string; bg: string; pulse: boolean } {
  switch (action) {
    case 'start':   return { label: 'Startet…',  color: 'var(--warning)', bg: 'rgba(234,179,8,0.12)',  pulse: true  }
    case 'stop':    return { label: 'Stoppt…',   color: 'var(--text-muted)', bg: 'rgba(128,128,128,0.12)', pulse: false }
    case 'restart': return { label: 'Neustart…', color: 'var(--warning)', bg: 'rgba(234,179,8,0.12)',  pulse: true  }
    case 'pause':   return { label: 'Pausiert…', color: 'var(--accent)',  bg: 'rgba(99,102,241,0.12)', pulse: false }
    case 'unpause': return { label: 'Startet…',  color: 'var(--warning)', bg: 'rgba(234,179,8,0.12)',  pulse: true  }
    case 'reboot':
    case 'reset':   return { label: 'Neustart…', color: 'var(--warning)', bg: 'rgba(234,179,8,0.12)',  pulse: true  }
    case 'forcestop': return { label: 'Stoppt…', color: 'var(--text-muted)', bg: 'rgba(128,128,128,0.12)', pulse: false }
    case 'resume':  return { label: 'Startet…',  color: 'var(--warning)', bg: 'rgba(234,179,8,0.12)',  pulse: true  }
    default:        return { label: 'Warten…',   color: 'var(--text-muted)', bg: 'rgba(128,128,128,0.12)', pulse: true }
  }
}

function containerStateBadge(state?: string): { label: string; color: string; bg: string; pulse: boolean } {
  switch (state) {
    case 'RUNNING':
      return { label: 'Running', color: 'var(--status-online)',  bg: 'rgba(34,197,94,0.12)',   pulse: true  }
    case 'PAUSED':
      return { label: 'Paused',  color: 'var(--warning)',        bg: 'rgba(234,179,8,0.12)',   pulse: false }
    case 'EXITED':
      return { label: 'Stopped', color: 'var(--text-muted)',     bg: 'rgba(128,128,128,0.12)', pulse: false }
    default:
      return { label: state ?? '?', color: 'var(--text-muted)', bg: 'rgba(128,128,128,0.12)', pulse: false }
  }
}

function vmStateBadge(state?: string): { label: string; color: string; bg: string; pulse: boolean } {
  switch (state) {
    case 'RUNNING':
      return { label: 'Running',       color: 'var(--status-online)',  bg: 'rgba(34,197,94,0.12)',   pulse: true  }
    case 'IDLE':
      return { label: 'Idle',          color: 'var(--accent)',         bg: 'rgba(99,102,241,0.12)',  pulse: false }
    case 'PAUSED':
      return { label: 'Paused',        color: 'var(--warning)',        bg: 'rgba(234,179,8,0.12)',   pulse: false }
    case 'SHUTDOWN':
      return { label: 'Shutting down', color: 'var(--warning)',        bg: 'rgba(234,179,8,0.12)',   pulse: false }
    case 'SHUTOFF':
      return { label: 'Off',           color: 'var(--text-muted)',     bg: 'rgba(128,128,128,0.12)', pulse: false }
    case 'CRASHED':
      return { label: 'Crashed',       color: 'var(--status-offline)', bg: 'rgba(239,68,68,0.12)',   pulse: false }
    case 'PMSUSPENDED':
      return { label: 'Suspended',     color: 'var(--text-secondary)', bg: 'rgba(128,128,128,0.12)', pulse: false }
    default:
      return { label: state ?? '?',    color: 'var(--text-muted)',     bg: 'rgba(128,128,128,0.12)', pulse: false }
  }
}

function formatParitySpeed(speed?: string | number | null): string {
  if (!speed) return '–'
  const raw = typeof speed === 'string' ? speed : String(speed)
  if (raw.includes('MB') || raw.includes('GB') || raw.toLowerCase().includes('kb')) return raw
  const n = parseFloat(raw)
  if (isNaN(n)) return raw
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB/s`
  if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)} MB/s`
  if (n >= 1_024)         return `${(n / 1_024).toFixed(0)} KB/s`
  return `${n} B/s`
}

function smartStatusStyle(status?: string): { color: string; label: string } {
  switch (status) {
    case 'OK':
    case 'PASSED':
      return { color: 'var(--status-online)',  label: status }
    case 'UNKNOWN':
      return { color: 'var(--text-muted)',     label: 'Unbekannt' }
    default:
      return { color: 'var(--status-offline)', label: status ?? '–' }
  }
}

function diskTypeBadge(interfaceType?: string, type?: string): { label: string; color: string } {
  if (interfaceType === 'PCIE' || type?.toLowerCase().includes('nvme')) {
    return { label: 'NVMe', color: 'var(--accent)' }
  }
  if (type?.toLowerCase().includes('ssd')) {
    return { label: 'SSD', color: 'var(--warning)' }
  }
  return { label: 'HDD', color: 'var(--text-muted)' }
}

function actionButton(
  label: string,
  icon: React.ReactNode,
  onClick: () => void,
  variant: 'green' | 'red' | 'yellow' | 'blue' | 'gray',
  disabled: boolean,
  loading?: boolean,
) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    green:  { bg: 'rgba(34,197,94,0.15)',  color: 'var(--status-online)',  border: 'rgba(34,197,94,0.3)'   },
    red:    { bg: 'rgba(239,68,68,0.15)',  color: 'var(--status-offline)', border: 'rgba(239,68,68,0.3)'   },
    yellow: { bg: 'rgba(234,179,8,0.15)',  color: 'var(--warning)',        border: 'rgba(234,179,8,0.3)'   },
    blue:   { bg: 'rgba(99,102,241,0.15)', color: 'var(--accent)',         border: 'rgba(99,102,241,0.3)'  },
    gray:   { bg: 'rgba(128,128,128,0.1)', color: 'var(--text-muted)',     border: 'rgba(128,128,128,0.2)' },
  }
  const s = disabled ? styles.gray : styles[variant]
  return (
    <button
      key={label}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 'var(--radius-sm)',
        fontSize: 12, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: s.bg, color: s.color,
        border: `1px solid ${s.border}`,
        opacity: disabled ? 0.5 : 1,
        transition: 'all var(--transition-fast)',
      }}
    >
      {loading
        ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
        : icon}
      {label}
    </button>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 0', borderBottom: '1px solid var(--border-subtle, rgba(128,128,128,0.1))',
    }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>{value ?? '–'}</span>
    </div>
  )
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────

function ConfirmModal({ title, message, onConfirm, onCancel, danger = false, children }: {
  title: string; message: string
  onConfirm: () => void; onCancel: () => void
  danger?: boolean; children?: React.ReactNode
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content glass" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{message}</p>
          {children}
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Abbrechen</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>Bestätigen</button>
        </div>
      </div>
    </div>
  )
}

// ── Setup Screen ──────────────────────────────────────────────────────────────

function SetupScreen() {
  const { createInstance } = useUnraidStore()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState<boolean | null>(null)
  const [testError, setTestError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    setTestOk(null)
    setTestError('')
    try {
      await api.unraid.instances.test(url, apiKey)
      setTestOk(true)
    } catch (e) {
      setTestOk(false)
      setTestError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await createInstance({ name, url, api_key: apiKey })
      toast({ message: 'Unraid verbunden', type: 'success' })
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '80px auto', padding: '0 var(--spacing-md)' }}>
      <div className="glass" style={{ padding: 'var(--spacing-2xl)', borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
        <Server size={40} style={{ color: 'var(--accent)', marginBottom: 'var(--spacing-md)' }} />
        <h2 style={{ margin: '0 0 var(--spacing-sm)', fontFamily: 'var(--font-display)' }}>Unraid verbinden</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-xl)' }}>Erfordert Unraid 7.2 oder neuer.</p>

        {/* Step 1 */}
        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', textAlign: 'left' }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'flex-start' }}>
            <span style={{ background: 'var(--accent)', color: '#000', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>1</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>API Key erstellen</div>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}>
                Unraid WebGUI → Settings → Management Access → API Keys → "Create"<br />
                Name: z.B. "HELDASH" | Rolle: admin | Speichern → Key kopieren
              </p>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)', textAlign: 'left' }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'flex-start', marginBottom: 'var(--spacing-md)' }}>
            <span style={{ background: 'var(--accent)', color: '#000', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>2</span>
            <div style={{ fontWeight: 600 }}>Verbinden</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            <input className="input" placeholder="Name (z.B. Heimserver)" value={name} onChange={e => setName(e.target.value)} />
            <input className="input" placeholder="URL (z.B. http://192.168.1.10)" value={url} onChange={e => { setUrl(e.target.value); setTestOk(null) }} />
            <div style={{ position: 'relative' }}>
              <input className="input" type={showKey ? 'text' : 'password'} placeholder="API Key" value={apiKey} onChange={e => { setApiKey(e.target.value); setTestOk(null) }} style={{ paddingRight: 40 }} />
              <button className="btn" onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: '2px 6px', minHeight: 'unset' }}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button className="btn btn-primary" onClick={handleTest} disabled={testing || !url || !apiKey} style={{ width: '100%' }}>
              {testing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Verbindung testen'}
            </button>
            {testOk === true && <div style={{ color: 'var(--status-online)', fontSize: 13 }}><Check size={12} /> Verbindung erfolgreich</div>}
            {testOk === false && <div style={{ color: 'var(--status-offline)', fontSize: 13 }}><AlertTriangle size={12} /> {testError}</div>}
            <button className="btn btn-primary" onClick={handleSave} disabled={!testOk || saving || !name} style={{ width: '100%' }}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Verbinden & Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation()
  const { info, array, notifications, loadInfo, loadArray, loadNotifications, errors } = useUnraidStore()
  const data = info[instanceId]
  const arrData = array[instanceId]
  const notifData = notifications[instanceId]

  useEffect(() => {
    loadInfo(instanceId)
    loadArray(instanceId)
    loadNotifications(instanceId)
    const t1 = setInterval(() => loadInfo(instanceId), 15_000)
    const t2 = setInterval(() => loadArray(instanceId), 30_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [instanceId])

  const os = data?.info?.os
  const cpu = data?.info?.cpu
  const memory = data?.metrics?.memory
  const cpuMetrics = data?.metrics?.cpu
  const baseboard = data?.info?.baseboard
  const versions = data?.info?.versions
  const sysInfo = data?.info?.system
  const arrState = arrData?.array?.state
  const cap = arrData?.array?.capacity?.kilobytes
  const unreadObj = notifData?.notifications?.overview?.unread
  const unread = unreadObj?.total ?? ((unreadObj?.info ?? 0) + (unreadObj?.warning ?? 0) + (unreadObj?.alert ?? 0))
  const warnings = (notifData?.notifications?.list ?? []).filter(n => n.importance === 'ALERT' || n.importance === 'WARNING')
  const err = errors[`info_${instanceId}`]

  const importanceColor = (imp?: string) => {
    if (imp === 'ALERT') return 'var(--status-offline)'
    if (imp === 'WARNING') return 'var(--warning)'
    return 'var(--accent)'
  }

  const cpuPct = cpuMetrics?.percentTotal ?? 0
  const cpuBarColor = cpuPct < 70 ? 'var(--accent)' : cpuPct < 90 ? 'var(--warning)' : 'var(--status-offline)'

  return (
    <div>
      {err && <div className="error-banner" style={{ marginBottom: 'var(--spacing-md)' }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--spacing-md)' }}>
        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Server</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{os?.hostname ?? '–'}</h3>
            {sysInfo?.virtual && <span style={{ background: '#8b5cf6', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>VM</span>}
            {versions?.core?.unraid && <span style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>Unraid {versions.core.unraid}</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sysInfo?.manufacturer} {sysInfo?.model}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Uptime: {formatUptime(os?.uptime)}</div>
        </div>

        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Cpu size={12} /> CPU</div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{cpu?.manufacturer} {cpu?.brand}</div>
          <div style={{ background: 'var(--glass-bg)', borderRadius: 4, height: 6, marginBottom: 4 }}>
            <div style={{ background: cpuBarColor, height: '100%', borderRadius: 4, width: `${cpuPct.toFixed(0)}%`, transition: 'width 0.5s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{cpu?.cores} {t('unraid.system.cores_threads').split(' / ')[0]} / {cpu?.threads} {t('unraid.system.cores_threads').split(' / ')[1]}</span>
            <span>{cpuPct.toFixed(1)}%</span>
          </div>
        </div>

        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>RAM</div>
          {memory?.total ? (
            <>
              <div style={{ background: 'var(--glass-bg)', borderRadius: 4, height: 6, marginBottom: 4 }}>
                <div style={{ background: 'var(--accent)', height: '100%', borderRadius: 4, width: `${(memory.percentTotal ?? 0).toFixed(0)}%` }} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{formatBytes(memory.used)} / {formatBytes(memory.total)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{(memory.percentTotal ?? 0).toFixed(1)}%</span>
              </div>
              {(memory.swapTotal ?? 0) > 0 && (
                <>
                  <div style={{ background: 'var(--glass-bg)', borderRadius: 4, height: 4, marginTop: 8, marginBottom: 3 }}>
                    <div style={{ background: '#8b5cf6', height: '100%', borderRadius: 4, width: `${(memory.percentSwapTotal ?? 0).toFixed(0)}%` }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Swap: {formatBytes(memory.swapUsed)} / {formatBytes(memory.swapTotal)}</span>
                    <span>{(memory.percentSwapTotal ?? 0).toFixed(1)}%</span>
                  </div>
                </>
              )}
            </>
          ) : <div style={{ color: 'var(--text-muted)' }}>–</div>}
        </div>

        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('unraid.system.motherboard')}</div>
          <div style={{ fontWeight: 600 }}>{baseboard?.manufacturer ?? '–'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{baseboard?.model ?? ''}</div>
        </div>

        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Array</div>
          <span style={{ ...arrayStateBadgeStyle(arrState), borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{arrState ?? '–'}</span>
          {cap && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{formatKilobytes(parseInt(cap.used ?? '0', 10))} / {formatKilobytes(parseInt(cap.total ?? '1', 10))}</div>}
        </div>

        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('logbuch.notifications.label')}</div>
          {unread === 0
            ? <span style={{ color: 'var(--status-online)', background: 'rgba(34,197,94,0.12)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>Alles OK</span>
            : <span style={{ color: 'var(--warning)', background: 'rgba(234,179,8,0.12)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{unread} ungelesen</span>
          }
          {warnings.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {warnings.slice(0, 3).map((w, i) => (
                <div key={w.id ?? i} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'flex-start', borderLeft: `3px solid ${importanceColor(w.importance)}`, paddingLeft: 6 }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{w.title ?? w.subject}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Array Tab ─────────────────────────────────────────────────────────────────

function ArrayTab({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation()
  const { settings } = useStore()
  const tempUnit = settings?.temp_unit ?? 'celsius'
  const { array, parity, physicalDisks, loadArray, loadParity, loadPhysicalDisks, arrayStart, arrayStop, parityStart, parityPause, parityResume, parityCancel, diskSpinUp, diskSpinDown, diskMount, diskUnmount, errors } = useUnraidStore()
  const { isAdmin } = useStore()
  const { toast } = useToast()
  const arrData = array[instanceId]
  const parityHistory = parity[instanceId] ?? []

  const [confirm, setConfirm] = useState<{ action: string; msg: string; extra?: React.ReactNode } | null>(null)
  const [parityCorrect, setParityCorrect] = useState(false)
  const [diskLoading, setDiskLoading] = useState<Record<string, boolean>>({})
  const [showHistory, setShowHistory] = useState(false)
  const [showCaches, setShowCaches] = useState(false)
  const [showPhysical, setShowPhysical] = useState(false)
  const pdisks = physicalDisks[instanceId] ?? []

  useEffect(() => {
    loadArray(instanceId)
    loadParity(instanceId)
    loadPhysicalDisks(instanceId)
    const _poll = setInterval(() => loadArray(instanceId), 15_000)
    return () => clearInterval(_poll)
  }, [instanceId])

  const arrState = arrData?.array?.state ?? ''
  const cap = arrData?.array?.capacity?.kilobytes
  const pcs = arrData?.array?.parityCheckStatus
  const parities = arrData?.array?.parities ?? []
  const disks = arrData?.array?.disks ?? []
  const caches = arrData?.array?.caches ?? []
  const isParityRunning = /resyncing|syncing|check/.test(arrState)
  const isParityPaused = /paused/.test(arrState)
  const err = errors[`array_${instanceId}`]

  const diskStatusColor = (s?: string) => {
    if (s === 'DISK_OK') return 'var(--status-online)'
    if (s === 'DISK_NP') return 'var(--text-muted)'
    if (s === 'DISK_DSBL') return 'var(--status-offline)'
    if (s === 'DISK_NEW') return '#3b82f6'
    return 'var(--warning)'
  }

  const tempColor = (t?: number | null) => {
    if (t == null) return 'var(--text-muted)'
    if (t < 40) return 'var(--status-online)'
    if (t <= 50) return 'var(--warning)'
    return 'var(--status-offline)'
  }

  const usedPct = cap ? (parseInt(cap.used ?? '0', 10) / (parseInt(cap.total ?? '1', 10) || 1) * 100) : 0
  const barColor = usedPct < 80 ? 'var(--accent)' : usedPct < 90 ? 'var(--warning)' : 'var(--status-offline)'

  const runConfirm = useCallback(async (action: string) => {
    setConfirm(null)
    try {
      if (action === 'arrayStart') { await arrayStart(instanceId); toast({ message: t('unraid.array.started'), type: 'success' }) }
      else if (action === 'arrayStop') { await arrayStop(instanceId); toast({ message: t('unraid.array.stopped'), type: 'success' }) }
      else if (action === 'parityStart') { await parityStart(instanceId, parityCorrect); toast({ message: t('unraid.array.parity_started'), type: 'success' }) }
      else if (action === 'parityCancel') { await parityCancel(instanceId); toast({ message: t('unraid.array.parity_cancelled'), type: 'success' }) }
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    }
  }, [instanceId, parityCorrect])

  const handleDiskSpin = async (diskId: string, action: 'up' | 'down') => {
    setDiskLoading(s => ({ ...s, [diskId]: true }))
    try {
      if (action === 'up') await diskSpinUp(instanceId, diskId)
      else await diskSpinDown(instanceId, diskId)
      toast({ message: `Disk ${action === 'up' ? 'hochgefahren' : 'heruntergefahren'}`, type: 'success' })
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    } finally {
      setDiskLoading(s => ({ ...s, [diskId]: false }))
    }
  }

  const handleDiskMount = async (diskId: string, action: 'mount' | 'unmount') => {
    setDiskLoading(s => ({ ...s, [`m_${diskId}`]: true }))
    try {
      if (action === 'mount') await diskMount(instanceId, diskId)
      else await diskUnmount(instanceId, diskId)
      toast({ message: `Disk ${action === 'mount' ? 'gemountet' : 'unmountet'}`, type: 'success' })
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    } finally {
      setDiskLoading(s => ({ ...s, [`m_${diskId}`]: false }))
    }
  }

  const diskColorToStatus = (color?: string) => {
    if (!color) return undefined
    if (color.startsWith('RED')) return 'var(--status-offline)'
    if (color.startsWith('YELLOW')) return 'var(--warning)'
    if (color.startsWith('GREEN')) return 'var(--status-online)'
    if (color.startsWith('BLUE')) return '#3b82f6'
    return 'var(--text-muted)'
  }

  return (
    <div>
      {err && <div className="error-banner" style={{ marginBottom: 'var(--spacing-md)' }}>{err}</div>}

      {isAdmin && (
        <div className="glass" style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <span style={{ ...arrayStateBadgeStyle(arrState), borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700, marginRight: 'var(--spacing-sm)', letterSpacing: '0.03em' }}>{arrState || '–'}</span>
          {arrState === 'stopped' && <button className="btn btn-primary" onClick={() => setConfirm({ action: 'arrayStart', msg: 'Array starten?' })}><Play size={14} /> Array starten</button>}
          {arrState === 'started' && <button className="btn btn-danger" onClick={() => setConfirm({ action: 'arrayStop', msg: 'Alle laufenden Zugriffe werden unterbrochen.' })}><Square size={14} /> Array stoppen</button>}
          {arrState === 'started' && !isParityRunning && !isParityPaused && (
            <button className="btn btn-primary" onClick={() => setConfirm({ action: 'parityStart', msg: 'Parity Check starten?', extra: (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={parityCorrect} onChange={e => setParityCorrect(e.target.checked)} />
                Auto-correct errors
              </label>
            ) })}>Parity Check starten</button>
          )}
          {isParityRunning && <>
            <button className="btn" onClick={() => parityPause(instanceId).then(() => toast({ message: 'Parity pausiert', type: 'success' })).catch(e => toast({ message: (e as Error).message, type: 'error' }))}><Pause size={14} /> Pausieren</button>
            <button className="btn btn-danger" onClick={() => setConfirm({ action: 'parityCancel', msg: 'Parity Check abbrechen?' })}>Abbrechen</button>
          </>}
          {isParityPaused && <>
            <button className="btn btn-primary" onClick={() => parityResume(instanceId).then(() => toast({ message: 'Parity fortgesetzt', type: 'success' })).catch(e => toast({ message: (e as Error).message, type: 'error' }))}><Play size={14} /> Fortsetzen</button>
            <button className="btn btn-danger" onClick={() => setConfirm({ action: 'parityCancel', msg: 'Parity Check abbrechen?' })}>Abbrechen</button>
          </>}
        </div>
      )}

      {cap && (
        <div className="glass" style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span>{formatKilobytes(parseInt(cap.used ?? '0', 10))} / {formatKilobytes(parseInt(cap.total ?? '1', 10))}</span>
            <span>{usedPct.toFixed(1)}%</span>
          </div>
          <div style={{ background: 'var(--glass-bg)', borderRadius: 4, height: 8 }}>
            <div style={{ background: barColor, height: '100%', borderRadius: 4, width: `${usedPct.toFixed(1)}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {(isParityRunning || isParityPaused) && pcs && (
        <div className="glass" style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', borderLeft: `4px solid ${isParityPaused ? 'var(--warning)' : 'var(--accent)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Parity Check {isParityPaused ? '(pausiert)' : 'läuft…'}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{(pcs.progress ?? 0).toFixed(1)}%</span>
          </div>
          <div style={{ background: 'var(--glass-bg)', borderRadius: 4, height: 6, marginBottom: 8 }}>
            <div style={{ background: isParityPaused ? 'var(--warning)' : 'var(--accent)', height: '100%', borderRadius: 4, width: `${pcs.progress ?? 0}%`, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {pcs.speed && <span>Speed: {pcs.speed}</span>}
            {pcs.errors != null && <span style={{ color: pcs.errors > 0 ? 'var(--status-offline)' : 'var(--text-muted)' }}>Errors: {pcs.errors}</span>}
            {pcs.correcting && <span style={{ color: 'var(--warning)' }}>Korrigierend</span>}
          </div>
        </div>
      )}

      {(parities.length > 0 || disks.length > 0) && (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>Array</div>
          <div className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[t('unraid.array.headers.type'), t('unraid.array.headers.name'), t('unraid.array.headers.device'), t('unraid.array.headers.size'), t('unraid.array.headers.status'), t('unraid.array.headers.temp'), t('unraid.array.headers.usage'), ...(isAdmin ? [t('unraid.array.headers.actions')] : [])].map(h => (
                    <th key={h} style={{ padding: 'var(--spacing-sm) var(--spacing-md)', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...parities.map(d => ({ ...d, _section: 'parity' })), ...disks.map(d => ({ ...d, _section: 'data' }))].map((disk, i) => (
                  <tr key={disk.id ?? i} style={{ borderBottom: '1px solid var(--glass-border)', opacity: disk.status === 'DISK_NP' ? 0.5 : 1 }}>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      <span style={{ background: disk._section === 'parity' ? '#8b5cf6' : 'var(--accent)', color: '#000', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600 }}>{disk._section === 'parity' ? 'Parity' : 'Daten'}</span>
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>{disk.name ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)' }}>{disk.device ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>{formatKilobytes(disk.size)}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {disk.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: diskColorToStatus(disk.color), flexShrink: 0, display: 'inline-block' }} />}
                        <span style={{ background: diskStatusColor(disk.status), color: disk.status === 'DISK_OK' ? '#000' : 'var(--text-primary)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{disk.status ?? '–'}</span>
                      </div>
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: tempColor(disk.temp) }}>{disk.temp != null ? (() => { const f = formatTemperature(disk.temp as number, '°C', tempUnit); return `${f.value}${f.unit}` })() : '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      {disk.fsSize && disk.fsSize > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ background: 'var(--glass-bg)', borderRadius: 2, height: 6, width: 60 }}>
                            <div style={{ background: 'var(--accent)', height: '100%', borderRadius: 2, width: `${(disk.fsUsedPercent ?? 0).toFixed(0)}%` }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(disk.fsUsedPercent ?? 0).toFixed(0)}%</span>
                        </div>
                      ) : '–'}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn" disabled={diskLoading[disk.id ?? ''] || arrState !== 'started' || disk.status === 'DISK_NP'} onClick={() => handleDiskSpin(disk.id!, 'up')} title="Spin Up" style={{ padding: '2px 6px' }}>
                            {diskLoading[disk.id ?? ''] ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <ChevronUp size={14} />}
                          </button>
                          <button className="btn" disabled={diskLoading[disk.id ?? ''] || arrState !== 'started' || disk.status === 'DISK_NP'} onClick={() => handleDiskSpin(disk.id!, 'down')} title="Spin Down" style={{ padding: '2px 6px' }}>
                            <ChevronDown size={14} />
                          </button>
                          {disk._section === 'data' && arrState === 'started' && disk.status !== 'DISK_NP' && (
                            <button className="btn" disabled={diskLoading[`m_${disk.id}`] || !disk.id} onClick={() => handleDiskMount(disk.id!, disk.status === 'DISK_OK' ? 'unmount' : 'mount')} title={disk.status === 'DISK_OK' ? 'Unmount' : 'Mount'} style={{ padding: '2px 6px', fontSize: 11 }}>
                              {diskLoading[`m_${disk.id}`] ? <span className="spinner" style={{ width: 12, height: 12 }} /> : (disk.status === 'DISK_OK' ? 'Unmount' : 'Mount')}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 'var(--spacing-md)' }}>
        <button className="btn" onClick={() => setShowCaches(v => !v)} style={{ width: '100%', textAlign: 'left', padding: 'var(--spacing-sm) var(--spacing-md)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Cache Pools {caches.length > 0 ? `(${caches.length})` : ''}</span>
          {showCaches ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showCaches && (
          caches.length === 0 ? (
            <div style={{ padding: 'var(--spacing-md)', color: 'var(--text-muted)', fontSize: 13 }}>{t('unraid.array.no_caches')}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, borderTop: '1px solid var(--border)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[t('unraid.array.headers.name'), t('unraid.array.headers.device'), t('unraid.array.headers.size'), t('unraid.array.headers.status'), t('unraid.array.headers.temp'), t('unraid.array.headers.usage')].map(h => (
                    <th key={h} style={{ padding: 'var(--spacing-sm) var(--spacing-md)', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {caches.map((disk, i) => (
                  <tr key={disk.id ?? i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>{disk.name ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)' }}>{disk.device ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>{formatKilobytes(disk.size)}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      <span style={{ background: diskStatusColor(disk.status), color: disk.status === 'DISK_OK' ? '#000' : 'var(--text-primary)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{disk.status ?? '–'}</span>
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: tempColor(disk.temp) }}>{disk.temp != null ? (() => { const f = formatTemperature(disk.temp as number, '°C', tempUnit); return `${f.value}${f.unit}` })() : '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      {disk.fsSize && disk.fsSize > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ background: 'var(--glass-bg)', borderRadius: 2, height: 6, width: 60 }}>
                            <div style={{ background: 'var(--accent)', height: '100%', borderRadius: 2, width: `${(disk.fsUsedPercent ?? 0).toFixed(0)}%` }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(disk.fsUsedPercent ?? 0).toFixed(0)}%</span>
                        </div>
                      ) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      <div className="glass" style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)' }}>
        <button className="btn" onClick={() => setShowHistory(v => !v)} style={{ marginBottom: showHistory ? 'var(--spacing-sm)' : 0 }}>
          {showHistory ? 'Parity-Historie ausblenden' : 'Parity-Historie anzeigen'}
        </button>
        {showHistory && parityHistory.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Duration', 'Speed', t('common.status'), t('common.error')].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parityHistory.slice(0, 10).map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '6px 8px' }}>{p.date ?? '–'}</td>
                  <td style={{ padding: '6px 8px' }}>{p.duration ? `${Math.floor((p.duration ?? 0) / 3600)}h ${Math.floor(((p.duration ?? 0) % 3600) / 60)}m` : '–'}</td>
                  <td style={{ padding: '6px 8px' }}>{formatParitySpeed(p.speed)}</td>
                  <td style={{ padding: '6px 8px' }}>{p.status ?? '–'}</td>
                  <td style={{ padding: '6px 8px', color: (p.errors ?? 0) > 0 ? 'var(--status-offline)' : 'var(--status-online)' }}>{p.errors ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {showHistory && parityHistory.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>{t('unraid.array.no_parity_history')}</div>}
      </div>

      <div className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', marginTop: 'var(--spacing-md)' }}>
        <button className="btn" onClick={() => setShowPhysical(v => !v)} style={{ width: '100%', textAlign: 'left', padding: 'var(--spacing-sm) var(--spacing-md)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{t('unraid.array.physical_drives')} {pdisks.length > 0 ? `(${pdisks.length})` : ''}</span>
          {showPhysical ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showPhysical && (
          pdisks.length === 0 ? (
            <div style={{ padding: 'var(--spacing-md)', color: 'var(--text-muted)', fontSize: 13 }}>Keine physischen Laufwerke gefunden.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, borderTop: '1px solid var(--border)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[t('unraid.array.headers.name'), t('unraid.array.headers.type'), t('unraid.array.headers.size'), t('unraid.array.headers.interface'), 'S/N', 'SMART', t('unraid.array.headers.temp'), t('unraid.array.headers.status')].map(h => (
                    <th key={h} style={{ padding: 'var(--spacing-sm) var(--spacing-md)', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pdisks.map((d, i) => (
                  <tr key={d.id ?? i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>{d.name ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      {(() => { const dtb = diskTypeBadge(d.interfaceType, d.type); return <span style={{ color: dtb.color, fontWeight: 600, fontSize: 11 }}>{dtb.label}</span> })()}
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>{formatBytes(d.size)}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)' }}>{d.interfaceType ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)', fontSize: 11 }}>{d.serialNum ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      {(() => { const s = smartStatusStyle(d.smartStatus); return <span style={{ color: s.color, fontWeight: 600, fontSize: 12 }}>{s.label}</span> })()}
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: tempColor(d.temperature) }}>{d.temperature != null ? (() => { const f = formatTemperature(d.temperature as number, '°C', tempUnit); return `${f.value}${f.unit}` })() : '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)', fontSize: 11 }}>{d.isSpinning ? t('unraid.array.spinning') : t('unraid.array.standby')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {confirm && (
        <ConfirmModal
          title="Bestätigen"
          message={confirm.msg}
          onConfirm={() => runConfirm(confirm.action)}
          onCancel={() => setConfirm(null)}
          danger={confirm.action === 'arrayStop' || confirm.action === 'parityCancel'}
        >
          {confirm.extra}
        </ConfirmModal>
      )}
    </div>
  )
}

// ── Docker Tab ────────────────────────────────────────────────────────────────

function DockerTab({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation()
  const { docker, loadDocker, dockerControl, dockerUpdateAll, errors } = useUnraidStore()
  const { isAdmin } = useStore()
  const { toast } = useToast()
  const containers = docker[instanceId] ?? []
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all')
  const [actionLoading, setActionLoading] = useState<Record<string, string | undefined>>({})
  const [updatingAll, setUpdatingAll] = useState(false)

  useEffect(() => {
    loadDocker(instanceId)
    const _poll = setInterval(() => loadDocker(instanceId), 15_000)
    return () => clearInterval(_poll)
  }, [instanceId])

  const sorted = [...containers].sort((a, b) => {
    const nameA = (a.names?.[0] ?? '').replace(/^\//, '').toLowerCase()
    const nameB = (b.names?.[0] ?? '').replace(/^\//, '').toLowerCase()
    return nameA.localeCompare(nameB)
  })
  const filtered = sorted.filter(c => {
    const name = c.names?.[0]?.replace(/^\//, '') ?? ''
    const image = c.image?.split('@')[0] ?? ''
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || image.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || (filter === 'running' && c.state === 'RUNNING') || (filter === 'stopped' && c.state !== 'RUNNING')
    return matchSearch && matchFilter
  })

  const handleAction = async (c: UnraidContainer, action: 'start' | 'stop' | 'restart' | 'unpause' | 'pause') => {
    const name = c.names?.[0]?.replace(/^\//, '') ?? ''
    setActionLoading(s => ({ ...s, [name]: action }))
    try {
      await dockerControl(instanceId, name, action)
      toast({ message: `${name} ${action}`, type: 'success' })
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    } finally {
      setActionLoading(s => ({ ...s, [name]: undefined }))
    }
  }

  const handleUpdateAll = async () => {
    setUpdatingAll(true)
    try {
      await dockerUpdateAll(instanceId)
      toast({ message: 'All containers are being updated', type: 'success' })
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    } finally {
      setUpdatingAll(false)
    }
  }

  const err = errors[`docker_${instanceId}`]

  return (
    <div>
      {err && <div className="error-banner" style={{ marginBottom: 'var(--spacing-md)' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="Suchen…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 220 }} />
        {(['all', 'running', 'stopped'] as const).map(f => (
          <button key={f} className={`btn${filter === f ? ' btn-primary' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : f === 'running' ? 'Running' : 'Stopped'}
          </button>
        ))}
        {isAdmin && (
          <button className="btn" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} disabled={updatingAll} onClick={handleUpdateAll}>
            {updatingAll ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Download size={14} />}
            Alle aktualisieren
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-md)' }}>
        {filtered.map((c, i) => {
          const name = c.names?.[0]?.replace(/^\//, '') ?? 'Unbekannt'
          const imageDisplay = (c.image ?? '').split('@')[0]
          const pendingAction = actionLoading[name]
          const isLoading = !!pendingAction
          const isRunning = c.state === 'RUNNING'
          const isExited = c.state === 'EXITED'
          const isPaused = c.state === 'PAUSED'
          const ports = (c.ports ?? []).filter(p => p.publicPort)
          const badge = pendingAction ? pendingBadge(pendingAction) : containerStateBadge(c.state)
          return (
            <div key={c.id ?? i} className="glass" style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{imageDisplay}</div>
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  color: badge.color, background: badge.bg,
                  borderRadius: 'var(--radius-sm)', padding: '2px 8px',
                  fontSize: 11, fontWeight: 600, flexShrink: 0,
                  animation: badge.pulse ? 'pulse 2s infinite' : 'none',
                }}>
                  {isLoading
                    ? <span className="spinner" style={{ width: 6, height: 6, flexShrink: 0 }} />
                    : <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color, flexShrink: 0 }} />}
                  {badge.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{c.status ?? ''}</div>
              {ports.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {ports.slice(0, 4).map((p, pi) => (
                    <span key={pi} style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {p.publicPort}:{p.privatePort}/{p.type}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, alignItems: 'center' }}>
                {c.hostConfig?.networkMode && <span>{c.hostConfig.networkMode}</span>}
                {c.autoStart && <RotateCcw size={11} title="Auto Start" />}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {actionButton('Start',   <Play size={11} />,      () => handleAction(c, 'start'),   'green',  !isExited,               isLoading)}
                {actionButton('Stop',    <Square size={11} />,    () => handleAction(c, 'stop'),    'red',    !(isRunning || isPaused), isLoading)}
                {actionButton('Restart', <RotateCcw size={11} />, () => handleAction(c, 'restart'), 'yellow', !isRunning,              isLoading)}
                {isRunning && actionButton('Pause',  <Pause size={11} />, () => handleAction(c, 'pause'),   'blue',   false, isLoading)}
                {isPaused  && actionButton('Resume', <Play size={11} />,  () => handleAction(c, 'unpause'), 'yellow', false, isLoading)}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--spacing-2xl)' }}>{t('unraid.docker.no_containers')}</div>}
    </div>
  )
}

// ── VMs Tab ───────────────────────────────────────────────────────────────────

function VmsTab({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation()
  const { vms, loadVms, vmControl, errors } = useUnraidStore()
  const { toast } = useToast()
  const domains = [...(vms[instanceId] ?? [])].sort((a, b) => (a.name ?? '').toLowerCase().localeCompare((b.name ?? '').toLowerCase()))
  const [vmLoading, setVmLoading] = useState<Record<string, string | undefined>>({})
  const [confirm, setConfirm] = useState<{ vm: UnraidVm; action: 'stop' | 'pause' | 'forcestop' | 'reset' } | null>(null)

  useEffect(() => {
    loadVms(instanceId)
    const _poll = setInterval(() => loadVms(instanceId), 30_000)
    return () => clearInterval(_poll)
  }, [instanceId])

  const handleVmAction = async (vm: UnraidVm, action: 'start' | 'stop' | 'pause' | 'resume' | 'forcestop' | 'reboot' | 'reset') => {
    const vmId = vm.id ?? ''
    setVmLoading(s => ({ ...s, [vmId]: action }))
    try {
      await vmControl(instanceId, vmId, action)
      toast({ message: `VM ${vm.name} ${action}`, type: 'success' })
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    } finally {
      setVmLoading(s => ({ ...s, [vmId]: undefined }))
    }
  }

  const err = errors[`vms_${instanceId}`]

  if (!err && domains.length === 0) {
    return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--spacing-2xl)' }}>{t('unraid.vms.no_vms')}</div>
  }

  return (
    <div>
      {err && <div className="error-banner" style={{ marginBottom: 'var(--spacing-md)' }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--spacing-md)' }}>
        {domains.map((vm, i) => {
          const vmId = vm.id ?? String(i)
          const vmPendingAction = vmLoading[vmId]
          const isLoading = !!vmPendingAction
          const isCrashed = vm.state === 'CRASHED'
          const isShutoff = vm.state === 'SHUTOFF' || vm.state === 'SHUTDOWN' || vm.state === 'NOSTATE'
          const isRunning = vm.state === 'RUNNING' || vm.state === 'IDLE'
          const isPaused = vm.state === 'PAUSED'
          const canStart = isShutoff || isCrashed
          const canStop = isRunning || isPaused
          const vmbadge = vmPendingAction ? pendingBadge(vmPendingAction) : vmStateBadge(vm.state)
          return (
            <div key={vmId} className="glass" style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{vm.name ?? '–'}</h3>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  color: vmbadge.color, background: vmbadge.bg,
                  borderRadius: 'var(--radius-sm)', padding: '2px 8px',
                  fontSize: 11, fontWeight: 600, flexShrink: 0,
                  animation: vmbadge.pulse ? 'pulse 2s infinite' : 'none',
                }}>
                  {isLoading
                    ? <span className="spinner" style={{ width: 6, height: 6, flexShrink: 0 }} />
                    : <span style={{ width: 6, height: 6, borderRadius: '50%', background: vmbadge.color, flexShrink: 0 }} />}
                  {vmbadge.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {canStart                 && actionButton('Start',   <Play size={11} />,        () => handleVmAction(vm, 'start'),                'green',  false, isLoading)}
                {canStop                  && actionButton('Stop',    <Square size={11} />,      () => setConfirm({ vm, action: 'stop' }),         'red',    false, isLoading)}
                {(isRunning || isCrashed) && actionButton('',        <Zap size={11} />,         () => setConfirm({ vm, action: 'forcestop' }),    'red',    false, isLoading)}
                {isRunning                && actionButton('Pause',   <Pause size={11} />,       () => setConfirm({ vm, action: 'pause' }),        'blue',   false, isLoading)}
                {isRunning                && actionButton('Restart', <RotateCcw size={11} />,   () => handleVmAction(vm, 'reboot'),               'yellow', false, isLoading)}
                {(isRunning || isCrashed) && actionButton('Reset',  <SkipForward size={11} />, () => setConfirm({ vm, action: 'reset' }),        'red',    false, isLoading)}
                {isPaused                 && actionButton('Resume',  <Play size={11} />,        () => handleVmAction(vm, 'resume'),               'yellow', false, isLoading)}
              </div>
            </div>
          )
        })}
      </div>
      {confirm && (
        <ConfirmModal
          title="Bestätigen"
          message={confirm.action === 'forcestop' ? 'VM sofort beenden — Datenverlust möglich!' : confirm.action === 'reset' ? 'Hard Reset — Datenverlust möglich!' : 'Ungespeicherte Daten in der VM können verloren gehen.'}
          onConfirm={() => { handleVmAction(confirm.vm, confirm.action); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
          danger
        />
      )}
    </div>
  )
}

// ── Shares Tab ────────────────────────────────────────────────────────────────

function SharesTab({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation()
  const { shares, loadShares, errors } = useUnraidStore()
  const shareList = shares[instanceId] ?? []
  const err = errors[`shares_${instanceId}`]

  useEffect(() => { loadShares(instanceId) }, [instanceId])

  return (
    <div>
      {err && <div className="error-banner" style={{ marginBottom: 'var(--spacing-md)' }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-sm)' }}>
        <button className="btn" onClick={() => loadShares(instanceId)}><RefreshCw size={14} /></button>
      </div>
      <div className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Name', 'Kommentar', 'LUKS', 'Belegt / Gesamt', 'Frei', 'Cache'].map(h => (
                <th key={h} style={{ padding: 'var(--spacing-sm) var(--spacing-md)', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shareList.map((s, i) => (
              <tr key={s.name ?? i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>{s.name ?? '–'}</td>
                <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)' }}>{s.comment ?? '–'}</td>
                <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                  {s.luksStatus ? <span style={{ background: '#f59e0b', color: '#000', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>LUKS</span> : null}
                </td>
                <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                  {(() => {
                    const total = s.size || ((s.used ?? 0) + (s.free ?? 0))
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {total > 0 ? (
                          <div style={{ background: 'var(--glass-bg)', borderRadius: 2, height: 6, width: 80 }}>
                            <div style={{ background: 'var(--accent)', height: '100%', borderRadius: 2, width: `${((s.used ?? 0) / (total || 1) * 100).toFixed(0)}%` }} />
                          </div>
                        ) : null}
                        <span>{formatKilobytes(s.used)} / {formatKilobytes(total || undefined)}</span>
                      </div>
                    )
                  })()}
                </td>
                <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>{formatKilobytes(s.free)}</td>
                <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                  {(() => {
                    const cv = s.cache
                    const active = cv && cv !== 'no'
                    const label = !cv || cv === 'no' ? 'Nein' : cv === 'yes' ? 'Ja' : cv === 'prefer' ? 'Prefer' : cv === 'only' ? 'Nur' : cv
                    return <span style={{ background: active ? '#3b82f6' : 'var(--glass-bg)', color: active ? '#fff' : 'var(--text-muted)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{label}</span>
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shareList.length === 0 && <div style={{ padding: 'var(--spacing-xl)', color: 'var(--text-muted)', textAlign: 'center' }}>{t('unraid.shares.no_shares')}</div>}
      </div>
    </div>
  )
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

function NotificationsTab({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation()
  const { notifications, loadNotifications, loadNotificationsArchive, archiveNotification, archiveAllNotifications, errors } = useUnraidStore()
  const { toast } = useToast()
  const data = notifications[instanceId]
  const [view, setView] = useState<'unread' | 'archive'>('unread')
  const unreadObj = data?.notifications?.overview?.unread
  const unread = unreadObj?.total ?? ((unreadObj?.info ?? 0) + (unreadObj?.warning ?? 0) + (unreadObj?.alert ?? 0))
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [archivingAll, setArchivingAll] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<UnraidNotification | null>(null)
  const [localList, setLocalList] = useState<UnraidNotification[]>([])
  const err = errors[`notif_${instanceId}`]

  useEffect(() => {
    loadNotifications(instanceId)
    const _poll = setInterval(() => loadNotifications(instanceId), 60_000)
    return () => clearInterval(_poll)
  }, [instanceId])

  useEffect(() => {
    if (view === 'archive') loadNotificationsArchive(instanceId)
  }, [view, instanceId])

  useEffect(() => {
    setLocalList(data?.notifications?.list ?? [])
  }, [data])

  const importanceColor = (imp?: string) => {
    if (imp === 'ALERT') return 'var(--status-offline)'
    if (imp === 'WARNING') return 'var(--warning)'
    if (imp === 'INFO') return 'var(--accent)'
    return 'var(--border)'
  }

  const handleArchive = async (notifId: string) => {
    setLocalList(prev => prev.filter(n => n.id !== notifId))
    try {
      await archiveNotification(instanceId, notifId)
    } catch {
      toast({ message: t('unraid.notifications.archive_error'), type: 'error' })
      setLocalList(data?.notifications?.list ?? [])
    }
  }

  const handleArchiveAll = async () => {
    setLocalList([])
    setArchivingAll(true)
    try {
      await archiveAllNotifications(instanceId)
    } catch {
      toast({ message: t('unraid.notifications.archive_all_error'), type: 'error' })
      setLocalList(data?.notifications?.list ?? [])
    } finally {
      setArchivingAll(false)
    }
  }

  const archiveList = data?.notifications?.archive ?? []
  const displayList = view === 'archive' ? archiveList : localList

  const renderList = (items: typeof displayList, showArchive: boolean) => (
    items.length === 0 ? (
      <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--text-muted)' }}>
        <Check size={20} color="var(--status-online)" style={{ marginBottom: 8 }} />
        <div>{view === 'archive' ? t('unraid.notifications.no_archive') : t('unraid.notifications.no_unread')}</div>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {items.map((n, i) => {
          const isLong = (n.description?.length ?? 0) > 120
          const isExpanded = expanded[n.id ?? String(i)]
          return (
            <div key={n.id ?? i} className="glass" style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', borderLeft: `4px solid ${importanceColor(n.importance)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{n.title ?? '–'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{n.subject ?? ''}</div>
                  {n.description && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {isLong && !isExpanded ? n.description.slice(0, 120) + '…' : n.description}
                      {isLong && (
                        <button className="btn" onClick={() => setExpanded(s => ({ ...s, [n.id ?? String(i)]: !s[n.id ?? String(i)] }))} style={{ marginLeft: 6, padding: '0 4px', fontSize: 11 }}>
                          {isExpanded ? 'weniger' : 'mehr anzeigen'}
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{n.formattedTimestamp ?? formatRelative(n.timestamp)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  {n.link && (
                    <button className="btn" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setSelectedNotification(n)}>
                      Details
                    </button>
                  )}
                  {showArchive && n.id && (
                    <button className="btn" onClick={() => handleArchive(n.id!)} style={{ padding: '2px 8px', fontSize: 12 }}>
                      Als gelesen markieren
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  )

  return (
    <div>
      {err && <div className="error-banner" style={{ marginBottom: 'var(--spacing-md)' }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn${view === 'unread' ? ' btn-primary' : ''}`} onClick={() => setView('unread')} style={{ fontSize: 13 }}>
            Ungelesen {unread > 0 && <span style={{ color: 'var(--warning)', background: 'rgba(234,179,8,0.12)', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>{unread}</span>}
          </button>
          <button className={`btn${view === 'archive' ? ' btn-primary' : ''}`} onClick={() => setView('archive')} style={{ fontSize: 13 }}>{t('unraid.notifications.archive')}</button>
        </div>
        {view === 'unread' && localList.length > 0 && (
          <button className="btn btn-primary" disabled={archivingAll} onClick={handleArchiveAll}>
            {archivingAll ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Wird archiviert…</> : t('unraid.notifications.mark_all_read')}
          </button>
        )}
      </div>
      {renderList(displayList, view === 'unread')}

      {selectedNotification && (
        <div className="modal-overlay" onClick={() => setSelectedNotification(null)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: selectedNotification.importance === 'ALERT'
                    ? 'var(--status-offline)'
                    : selectedNotification.importance === 'WARNING'
                      ? 'var(--warning)'
                      : 'var(--accent)',
                }} />
                <h3 className="modal-title" style={{ margin: 0 }}>{selectedNotification.title}</h3>
              </div>
              <button className="btn" style={{ flexShrink: 0 }} onClick={() => setSelectedNotification(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedNotification.subject && (
                <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>{selectedNotification.subject}</p>
              )}
              {selectedNotification.description && (
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selectedNotification.description}
                </p>
              )}
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                {selectedNotification.formattedTimestamp ?? formatRelative(selectedNotification.timestamp)}
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setSelectedNotification(null)}>Schließen</button>
              {selectedNotification.id && (
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    await handleArchive(selectedNotification.id!)
                    setSelectedNotification(null)
                  }}
                >
                  Als gelesen markieren
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── System Tab ────────────────────────────────────────────────────────────────

function SystemTab({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation()
  const { info, config, users, loadInfo, loadConfig, loadUsers, errors } = useUnraidStore()
  const data = info[instanceId]
  const cfgData = config[instanceId]
  const userList = users[instanceId] ?? []

  useEffect(() => {
    loadInfo(instanceId)
    loadConfig(instanceId)
    loadUsers(instanceId)
  }, [instanceId])

  const reload = () => { loadInfo(instanceId); loadConfig(instanceId); loadUsers(instanceId) }

  const os = data?.info?.os
  const cpu = data?.info?.cpu
  const memory = data?.metrics?.memory
  const baseboard = data?.info?.baseboard
  const sysInfo = data?.info?.system
  const versions = data?.info?.versions
  const memLayout = data?.info?.memory?.layout ?? []
  const cfg = cfgData?.config
  const err = errors[`info_${instanceId}`] ?? errors[`config_${instanceId}`]

  const roleColor = (r?: string) => r === 'admin' ? 'var(--status-offline)' : r === 'user' ? '#3b82f6' : 'var(--text-muted)'

  return (
    <div>
      {err && <div className="error-banner" style={{ marginBottom: 'var(--spacing-md)' }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-sm)' }}>
        <button className="btn" onClick={reload}><RefreshCw size={14} /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>

        {versions?.core?.unraid && (
          <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 'var(--spacing-sm)' }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Unraid {versions.core.unraid}</span>
              {sysInfo?.virtual && <span style={{ background: '#8b5cf6', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>Virtualisiert</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {versions.core.api    && <InfoRow icon={<Network size={14} />}  label="API"    value={versions.core.api} />}
              {versions.core.kernel && <InfoRow icon={<Zap size={14} />}      label="Kernel" value={versions.core.kernel} />}
              {versions.packages?.docker && <InfoRow icon={<Package size={14} />} label="Docker" value={versions.packages.docker} />}
            </div>
          </div>
        )}

        <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-sm)' }}>Hardware</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <InfoRow icon={<Server size={14} />}    label={t('unraid.system.manufacturer')}       value={`${sysInfo?.manufacturer ?? ''} ${sysInfo?.model ?? ''}`.trim() || '–'} />
            <InfoRow icon={<Globe size={14} />}     label={t('unraid.system.platform')}        value={os?.platform} />
            <InfoRow icon={<Monitor size={14} />}   label={t('unraid.system.os')}   value={`${os?.distro ?? ''} ${os?.release ?? ''}`.trim() || '–'} />
            <InfoRow icon={<Clock size={14} />}     label="Uptime"           value={formatUptime(os?.uptime)} />
            <InfoRow icon={<Cpu size={14} />}       label="CPU"              value={`${cpu?.manufacturer ?? ''} ${cpu?.brand ?? ''}`.trim() || '–'} />
            <InfoRow icon={<Layers size={14} />}    label={t('unraid.system.cores_threads')}  value={`${cpu?.cores ?? '–'} / ${cpu?.threads ?? '–'}`} />
            <InfoRow icon={<Activity size={14} />}  label={t('unraid.system.total_ram')}       value={memory?.total != null ? formatBytes(memory.total) : '–'} />
            <InfoRow icon={<HardDrive size={14} />} label={t('unraid.system.motherboard')}        value={`${baseboard?.manufacturer ?? ''} ${baseboard?.model ?? ''}`.trim() || '–'} />
          </div>
        </div>

        {memLayout.length > 0 && (
          <div className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--spacing-md)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>RAM-Module ({memLayout.length})</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[t('unraid.system.ram_table.slot'), t('unraid.system.ram_table.size'), t('unraid.system.ram_table.type'), 'Speed', t('unraid.system.ram_table.manufacturer'), t('unraid.system.ram_table.part')].map(h => (
                    <th key={h} style={{ padding: 'var(--spacing-sm) var(--spacing-md)', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memLayout.map((slot, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>{slot.size ? formatBytes(slot.size) : '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>{slot.type ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{slot.clockSpeed ? `${slot.clockSpeed} MHz` : '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)' }}>{slot.manufacturer ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{slot.partNum ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cfg && (
          <div className="glass" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-sm)' }}>{t('unraid.system.license')}</div>
            {cfg.error && <div className="error-banner" style={{ marginBottom: 8 }}>{cfg.error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <InfoRow icon={<Key size={14} />}    label={t('unraid.system.registered_for')} value={cfg.registrationTo} />
              <InfoRow icon={<Tag size={14} />}    label={t('unraid.system.license_type')}       value={cfg.registrationType} />
              <InfoRow icon={<Shield size={14} />} label="Status"          value={
                cfg.valid
                  ? <span style={{ color: 'var(--status-online)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} /> {t('unraid.system.active')}</span>
                  : <span style={{ color: 'var(--status-offline)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> {t('unraid.system.invalid')}</span>
              } />
            </div>
          </div>
        )}

        {userList.length > 0 && (
          <div className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--spacing-md)', fontWeight: 600, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} /> Benutzer</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Beschreibung', 'Rolle'].map(h => (
                    <th key={h} style={{ padding: 'var(--spacing-sm) var(--spacing-md)', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userList.map((u, i) => (
                  <tr key={u.name ?? i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>{u.name ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', color: 'var(--text-muted)' }}>{u.description ?? '–'}</td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      <span style={{ background: roleColor(u.role), color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{u.role ?? '–'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SortableInstanceCard ──────────────────────────────────────────────────────

function SortableInstanceCard({ instance, onUpdate, onDelete }: {
  instance: UnraidInstance
  onUpdate: (id: string, data: object) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const { online } = useUnraidStore()
  const { toast } = useToast()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(instance.name)
  const [editUrl, setEditUrl] = useState(instance.url)
  const [editKey, setEditKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [pingResult, setPingResult] = useState<boolean | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [saving, setSaving] = useState(false)

  const handlePing = async () => {
    setPinging(true)
    setPingResult(null)
    try {
      const res = await api.unraid.ping(instance.id)
      setPingResult(res.online)
    } catch {
      setPingResult(false)
    } finally {
      setPinging(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { name: editName, url: editUrl }
      if (editKey) body.api_key = editKey
      await onUpdate(instance.id, body)
      setEditing(false)
      toast({ message: 'Instanz aktualisiert', type: 'success' })
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const isOnline = online[instance.id]

  return (
    <div ref={setNodeRef} style={{ ...style, padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)' }} className="glass">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: editing ? 'var(--spacing-md)' : 0 }}>
          <GripVertical size={14} {...listeners} {...attributes} style={{ cursor: 'grab', color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? 'var(--status-online)' : 'var(--text-muted)', animation: isOnline ? 'pulse 2s infinite' : 'none', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{instance.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{instance.url}</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn" onClick={handlePing} disabled={pinging} style={{ padding: '3px 8px', fontSize: 12 }}>
              {pinging ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Testen'}
              {pingResult === true && !pinging && <span style={{ color: 'var(--status-online)', marginLeft: 4 }}>✓</span>}
              {pingResult === false && !pinging && <span style={{ color: 'var(--status-offline)', marginLeft: 4 }}>✗</span>}
            </button>
            <button className="btn" onClick={() => {
              if (editing) { setEditing(false) } else {
                setEditName(instance.name)
                setEditUrl(instance.url)
                setEditKey('')
                setEditing(true)
              }
            }} style={{ padding: '3px 8px', fontSize: 12 }}>
              {editing ? 'Abbrechen' : 'Bearbeiten'}
            </button>
            <button
              className="btn"
              onClick={() => onUpdate(instance.id, { enabled: !instance.enabled }).then(() => toast({ message: instance.enabled ? t('unraid.toast.disable') : t('unraid.toast.enable'), type: 'success' })).catch(e => toast({ message: (e as Error).message, type: 'error' }))}
              style={{ padding: '3px 8px', fontSize: 12, opacity: instance.enabled ? 1 : 0.5 }}
            >
              {instance.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)} style={{ padding: '3px 8px', fontSize: 12 }}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            <input className="input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
            <input className="input" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="URL" />
            <div style={{ position: 'relative' }}>
              <input className="input" type={showKey ? 'text' : 'password'} value={editKey} onChange={e => setEditKey(e.target.value)} placeholder="Neuer API Key (leer = unverändert)" style={{ paddingRight: 40 }} />
              <button className="btn" onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: '2px 6px', minHeight: 'unset' }}>
                {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEditing(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Speichern'}
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Instanz entfernen"
          message="Instanz entfernen? Alle gespeicherten Daten werden gelöscht."
          onConfirm={() => { onDelete(instance.id).then(() => toast({ message: 'Instanz gelöscht', type: 'success' })).catch(e => toast({ message: (e as Error).message, type: 'error' })); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
          danger
        />
      )}
    </div>
  )
}

// ── Management Tab ────────────────────────────────────────────────────────────

function ManagementTab() {
  const { instances, reorderInstances, updateInstance, deleteInstance, createInstance } = useUnraidStore()
  const { isAdmin } = useStore()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addKey, setAddKey] = useState('')
  const [showAddKey, setShowAddKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState<boolean | null>(null)
  const [testError, setTestError] = useState('')
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = instances.findIndex(i => i.id === active.id)
    const newIdx = instances.findIndex(i => i.id === over.id)
    const reordered = arrayMove(instances, oldIdx, newIdx)
    reorderInstances(reordered.map(i => i.id)).catch(e => toast({ message: (e as Error).message, type: 'error' }))
  }

  const handleTest = async () => {
    setTesting(true)
    setTestOk(null)
    setTestError('')
    try {
      await api.unraid.instances.test(addUrl, addKey)
      setTestOk(true)
    } catch (e) {
      setTestOk(false)
      setTestError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const handleAdd = async () => {
    setSaving(true)
    try {
      await createInstance({ name: addName, url: addUrl, api_key: addKey })
      setShowAdd(false)
      setAddName(''); setAddUrl(''); setAddKey('')
      setTestOk(null)
      toast({ message: 'Server hinzugefügt', type: 'success' })
    } catch (e) {
      toast({ message: (e as Error).message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Nur für Administratoren.</div>
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={instances.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
            {instances.map(inst => (
              <SortableInstanceCard key={inst.id} instance={inst} onUpdate={updateInstance} onDelete={deleteInstance} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add new server */}
      <div className="glass" style={{ borderRadius: 'var(--radius-md)', border: showAdd ? undefined : '2px dashed var(--border)', overflow: 'hidden' }}>
        {!showAdd ? (
          <button className="btn" onClick={() => setShowAdd(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 'var(--spacing-lg)', color: 'var(--text-muted)', background: 'none' }}>
            <Plus size={16} /> Server hinzufügen
          </button>
        ) : (
          <div style={{ padding: 'var(--spacing-lg)' }}>
            <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-md)' }}>Neuer Server</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
              <input className="input" placeholder="Name" value={addName} onChange={e => setAddName(e.target.value)} />
              <input className="input" placeholder="URL" value={addUrl} onChange={e => { setAddUrl(e.target.value); setTestOk(null) }} />
              <div style={{ position: 'relative' }}>
                <input className="input" type={showAddKey ? 'text' : 'password'} placeholder="API Key" value={addKey} onChange={e => { setAddKey(e.target.value); setTestOk(null) }} style={{ paddingRight: 40 }} />
                <button className="btn" onClick={() => setShowAddKey(v => !v)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: '2px 6px', minHeight: 'unset' }}>
                  {showAddKey ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <button className="btn btn-primary" onClick={handleTest} disabled={testing || !addUrl || !addKey}>
                {testing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Verbindung testen'}
              </button>
              {testOk === true && <div style={{ color: 'var(--status-online)', fontSize: 13 }}><Check size={12} /> Verbindung erfolgreich</div>}
              {testOk === false && <div style={{ color: 'var(--status-offline)', fontSize: 13 }}><AlertTriangle size={12} /> {testError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => { setShowAdd(false); setTestOk(null) }}>Abbrechen</button>
                <button className="btn btn-primary" onClick={handleAdd} disabled={!testOk || saving || !addName}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Hinzufügen'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function useContentTabs() {
  const { t } = useTranslation()
  return [
    { key: 'overview',      label: t('unraid.tabs.overview') },
    { key: 'array',         label: 'HDD' },
    { key: 'docker',        label: 'Docker' },
    { key: 'vms',           label: 'VMs' },
    { key: 'shares',        label: t('unraid.tabs.shares') },
    { key: 'notifications', label: t('unraid.tabs.notifications') },
    { key: 'system',        label: 'System' },
  ]
}

export function UnraidPage() {
  const contentTabs = useContentTabs()
  const { instances, selectedId, online, loadInstances, setSelected, pingAll } = useUnraidStore()
  const [instTab, setInstTab] = useState<string>('') // selected instance id or 'management'
  const [contentTab, setContentTab] = useState('overview')

  useEffect(() => {
    loadInstances()
  }, [])

  // Sync instTab with selectedId
  useEffect(() => {
    if (selectedId && instTab === '') setInstTab(selectedId)
  }, [selectedId])

  useEffect(() => {
    pingAll()
    const t = setInterval(() => pingAll(), 30_000)
    return () => clearInterval(t)
  }, [instances.length])

  const activeInstId = instTab !== 'management' ? instTab : null
  const activeInst = instances.find(i => i.id === activeInstId)

  if (instances.length === 0) {
    return (
      <div>
        <h2 style={{ margin: '0 0 var(--spacing-lg)', fontFamily: 'var(--font-display)' }}>Unraid</h2>
        <SetupScreen />
      </div>
    )
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    padding: 'var(--spacing-sm) var(--spacing-md)',
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'var(--font-sans)',
    whiteSpace: 'nowrap',
  })

  return (
    <div>
      <h2 style={{ margin: '0 0 var(--spacing-md)', fontFamily: 'var(--font-display)' }}>Unraid</h2>

      {/* Instance tab bar */}
      <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', marginBottom: 'var(--spacing-lg)', gap: 4 }}>
        {instances.map(inst => (
          <button
            key={inst.id}
            style={{ ...tabStyle(instTab === inst.id), opacity: !inst.enabled ? 0.4 : 1, cursor: !inst.enabled ? 'not-allowed' : 'pointer' }}
            disabled={!inst.enabled}
            onClick={() => { setInstTab(inst.id); setSelected(inst.id); setContentTab('overview') }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: online[inst.id] ? 'var(--status-online)' : 'var(--text-muted)', animation: online[inst.id] ? 'pulse 2s infinite' : 'none', flexShrink: 0 }} />
              {inst.name}
            </span>
          </button>
        ))}
        <button style={tabStyle(instTab === 'management')} onClick={() => setInstTab('management')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Settings2 size={14} /> Verwaltung</span>
        </button>
      </div>

      {instTab === 'management' && <ManagementTab />}

      {activeInst && (
        <div>
          {/* Content tab bar */}
          <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', marginBottom: 'var(--spacing-lg)', gap: 4 }}>
            {contentTabs.map(t => (
              <button key={t.key} style={tabStyle(contentTab === t.key)} onClick={() => setContentTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {contentTab === 'overview'      && <OverviewTab      instanceId={activeInst.id} />}
          {contentTab === 'array'         && <ArrayTab         instanceId={activeInst.id} />}
          {contentTab === 'docker'        && <DockerTab        instanceId={activeInst.id} />}
          {contentTab === 'vms'           && <VmsTab           instanceId={activeInst.id} />}
          {contentTab === 'shares'        && <SharesTab        instanceId={activeInst.id} />}
          {contentTab === 'notifications' && <NotificationsTab instanceId={activeInst.id} />}
          {contentTab === 'system'        && <SystemTab        instanceId={activeInst.id} />}
        </div>
      )}
    </div>
  )
}
