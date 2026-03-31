import { useEffect, useRef, useState, useCallback } from 'react'
import { useDockerStore } from '../store/useDockerStore'
import { useStore } from '../store/useStore'
import { ArrowLeft, RefreshCw, Play, Square, RotateCcw, Search, ChevronUp, ChevronDown } from 'lucide-react'
import type { DockerContainer, ContainerStats, DockerLogEvent } from '../types'
import { containerCounts } from '../utils'

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ state }: { state: string }) {
  const color =
    state === 'running'    ? 'var(--status-online)' :
    state === 'paused'     ? '#f59e0b' :
    state === 'restarting' ? 'var(--accent)' :
    'var(--text-muted)'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: state === 'running' ? `0 0 5px ${color}` : undefined,
      }} />
      <span style={{ fontSize: 12, color, fontWeight: 500 }}>{state}</span>
    </span>
  )
}

// ── Stat pill (overview bar) ───────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  const c = color ?? 'var(--accent)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
      background: 'var(--glass-bg)', backdropFilter: 'blur(12px)',
      border: `1px solid ${c}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: `0 0 8px ${c}22`,
    }}>
      <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.3px' }}>{label}</span>
    </div>
  )
}

// ── Uptime relative string ─────────────────────────────────────────────────────
function relativeTime(isoOrNull: string | null): string {
  if (!isoOrNull) return '—'
  const diff = Date.now() - new Date(isoOrNull).getTime()
  if (diff < 0) return '—'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

// ── Format bytes ──────────────────────────────────────────────────────────────
function fmtBytes(b: number): string {
  if (b === 0) return '0'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// ── Stats display ─────────────────────────────────────────────────────────────
function StatsDisplay({ stats }: { stats: ContainerStats | undefined }) {
  if (!stats) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
  return (
    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
      {stats.cpuPercent.toFixed(1)}% · {fmtBytes(stats.memUsed)}/{fmtBytes(stats.memTotal)}
    </span>
  )
}

// ── Sort helpers ───────────────────────────────────────────────────────────────
type SortCol = 'name' | 'image' | 'state' | 'uptime' | 'cpu' | 'mem'

function sortContainers(
  list: DockerContainer[],
  stats: Record<string, ContainerStats>,
  col: SortCol,
  dir: 'asc' | 'desc'
): DockerContainer[] {
  const factor = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    let cmp = 0
    switch (col) {
      case 'name':   cmp = a.name.localeCompare(b.name); break
      case 'image':  cmp = a.image.localeCompare(b.image); break
      case 'state':  cmp = a.state.localeCompare(b.state); break
      case 'uptime': {
        const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0
        const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0
        cmp = ta - tb
        break
      }
      case 'cpu':    cmp = (stats[a.id]?.cpuPercent ?? -1) - (stats[b.id]?.cpuPercent ?? -1); break
      case 'mem':    cmp = (stats[a.id]?.memUsed ?? -1) - (stats[b.id]?.memUsed ?? -1); break
    }
    return cmp * factor
  })
}

function SortHeader({
  label, col, sortCol, sortDir, onSort,
}: {
  label: string; col: SortCol; sortCol: SortCol | null; sortDir: 'asc' | 'desc'; onSort: (c: SortCol) => void
}) {
  const active = sortCol === col
  return (
    <th style={{ padding: '12px 16px', textAlign: 'left' }}>
      <button
        onClick={() => onSort(col)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-sans)',
        }}
      >
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ChevronUp size={11} style={{ opacity: 0.2 }} />}
      </button>
    </th>
  )
}

// ── Container overview table ──────────────────────────────────────────────────
function ContainerTable({
  containers,
  stats,
  filter,
  sortCol,
  sortDir,
  onSort,
  onSelect,
}: {
  containers: DockerContainer[]
  stats: Record<string, ContainerStats>
  filter: string
  sortCol: SortCol | null
  sortDir: 'asc' | 'desc'
  onSort: (col: SortCol) => void
  onSelect: (id: string) => void
}) {
  const filtered = containers.filter(c =>
    c.name.toLowerCase().includes(filter.toLowerCase()) ||
    c.image.toLowerCase().includes(filter.toLowerCase())
  )

  const sorted = sortCol ? sortContainers(filtered, stats, sortCol, sortDir) : filtered

  if (sorted.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🐳</div>
        <div className="empty-state-text">
          {containers.length === 0 ? 'No containers found.\nIs the Docker socket mounted?' : 'No containers match the filter.'}
        </div>
      </div>
    )
  }

  const cols: { label: string; col: SortCol }[] = [
    { label: 'Name', col: 'name' },
    { label: 'Image', col: 'image' },
    { label: 'Status', col: 'state' },
    { label: 'Uptime', col: 'uptime' },
    { label: 'CPU / Memory', col: 'cpu' },
  ]

  return (
    <div className="table-responsive">
      <table className="data-table">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
            {cols.map(({ label, col }) => (
              <SortHeader key={col} label={label} col={col} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => (
            <tr
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{
                borderBottom: i < sorted.length - 1 ? '1px solid var(--glass-border)' : undefined,
                cursor: 'pointer',
                transition: 'background 100ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                {c.name}
              </td>
              <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {c.image}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <StatusBadge state={c.state} />
              </td>
              <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {c.state === 'running' ? relativeTime(c.startedAt) : '—'}
              </td>
              <td style={{ padding: '12px 16px' }}>
                {c.state === 'running'
                  ? <StatsDisplay stats={stats[c.id]} />
                  : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Log line ──────────────────────────────────────────────────────────────────
function LogLine({ evt }: { evt: DockerLogEvent }) {
  const isErr = evt.stream === 'stderr'
  const ts = evt.timestamp ? evt.timestamp.replace('T', ' ').replace(/\.\d+Z$/, '') : ''
  return (
    <div style={{ display: 'flex', gap: 8, padding: '1px 0', lineHeight: '1.5' }}>
      {ts && (
        <span style={{ flexShrink: 0, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', minWidth: 160 }}>
          {ts}
        </span>
      )}
      <span style={{ color: isErr ? 'var(--status-offline)' : 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
        {evt.log}
      </span>
    </div>
  )
}

// ── Container detail view ─────────────────────────────────────────────────────
function ContainerDetail({
  container,
  onBack,
}: {
  container: DockerContainer
  onBack: () => void
}) {
  const { isAdmin } = useStore()
  const { controlContainer, loadContainers } = useDockerStore()
  const [logs, setLogs] = useState<DockerLogEvent[]>([])
  const [logFilter, setLogFilter] = useState('')
  const [live, setLive] = useState(false)
  const [controlling, setControlling] = useState(false)
  const [ctrlError, setCtrlError] = useState('')
  const [currentState, setCurrentState] = useState(container.state)
  const logEndRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const startStream = useCallback(() => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource(`/api/docker/containers/${container.id}/logs`)
    esRef.current = es
    setLive(true)
    setLogs([])

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as DockerLogEvent
        if (evt.log === '[stream ended]') {
          setLive(false)
          return
        }
        setLogs(prev => {
          const next = [...prev, evt]
          return next.length > 5000 ? next.slice(next.length - 5000) : next
        })
      } catch { /* ignore malformed events */ }
    }

    es.onerror = () => {
      setLive(false)
      es.close()
    }
  }, [container.id])

  useEffect(() => {
    startStream()
    return () => { esRef.current?.close() }
  }, [startStream])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  const handleControl = async (action: 'start' | 'stop' | 'restart') => {
    setCtrlError('')
    setControlling(true)
    try {
      await controlContainer(container.id, action)
      await loadContainers()
      setCurrentState(action === 'stop' ? 'exited' : 'running')
      setTimeout(() => startStream(), 1500)
    } catch (e: unknown) {
      setCtrlError((e as Error).message)
    } finally {
      setControlling(false)
    }
  }

  const visibleLogs = logFilter
    ? logs.filter(l => l.log.toLowerCase().includes(logFilter.toLowerCase()))
    : logs

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Header */}
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onBack} style={{ flexShrink: 0 }}>
          <ArrowLeft size={15} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{container.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{container.image}</div>
        </div>
        <StatusBadge state={currentState} />
        {currentState === 'running' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{relativeTime(container.startedAt)}</span>
        )}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => handleControl('start')}
              disabled={controlling || currentState === 'running'}
              style={{ gap: 5, fontSize: 12, color: (!controlling && currentState !== 'running') ? 'var(--status-online)' : undefined, borderColor: (!controlling && currentState !== 'running') ? 'rgba(34,197,94,0.35)' : undefined }}>
              {controlling ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : <Play size={12} />} Start
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleControl('stop')}
              disabled={controlling || currentState !== 'running'}
              style={{ gap: 5, fontSize: 12, color: (!controlling && currentState === 'running') ? 'var(--status-offline)' : undefined, borderColor: (!controlling && currentState === 'running') ? 'rgba(239,68,68,0.35)' : undefined }}>
              {controlling ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : <Square size={12} />} Stop
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleControl('restart')}
              disabled={controlling}
              style={{ gap: 5, fontSize: 12, color: !controlling ? '#f59e0b' : undefined, borderColor: !controlling ? 'rgba(245,158,11,0.35)' : undefined }}>
              {controlling ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : <RotateCcw size={12} />} Restart
            </button>
          </div>
        )}
      </div>

      {ctrlError && (
        <div style={{ fontSize: 12, color: 'var(--status-offline)', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)' }}>
          {ctrlError}
        </div>
      )}

      {/* Log viewer */}
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            className="form-input"
            placeholder="Filter logs…"
            value={logFilter}
            onChange={e => setLogFilter(e.target.value)}
            style={{ flex: 1, fontSize: 12, padding: '4px 8px', height: 30 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: live ? 'var(--status-online)' : 'var(--text-muted)',
              boxShadow: live ? '0 0 5px var(--status-online)' : undefined,
            }} />
            <span style={{ fontSize: 11, color: live ? 'var(--status-online)' : 'var(--text-muted)', fontWeight: 500 }}>
              {live ? 'Live' : 'Ended'}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={startStream}
            style={{ fontSize: 11, gap: 4, padding: '3px 8px' }} title="Reconnect stream">
            <RotateCcw size={11} /> Reconnect
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {visibleLogs.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>
              {logs.length === 0 ? 'Waiting for logs…' : 'No lines match the filter.'}
            </div>
          )}
          {visibleLogs.map((evt, i) => <LogLine key={i} evt={evt} />)}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}

// ── Main Docker page ──────────────────────────────────────────────────────────
export function DockerPage() {
  const { containers, stats, loading, error, loadContainers, loadAllStats } = useDockerStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [sortCol, setSortCol] = useState<SortCol | null>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadContainers()
  }, [])

  // Batch-poll stats every 2s while on overview
  useEffect(() => {
    if (selectedId) return
    const running = containers.filter(c => c.state === 'running')
    if (running.length === 0) return
    loadAllStats()
    const interval = setInterval(() => loadAllStats(), 2_000)
    return () => clearInterval(interval)
  }, [selectedId, containers.map(c => c.id).join(',')])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadContainers()
    setRefreshing(false)
  }

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const selectedContainer = selectedId ? containers.find(c => c.id === selectedId) ?? null : null

  if (selectedContainer) {
    return (
      <div style={{ height: 'calc(100vh - 60px - 48px)', display: 'flex', flexDirection: 'column' }}>
        <ContainerDetail container={selectedContainer} onBack={() => setSelectedId(null)} />
      </div>
    )
  }

  const { running, stopped, restarting } = containerCounts(containers)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar: overview pills left, filter+refresh right */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatPill label="Total"      value={containers.length} color="var(--accent)" />
          <StatPill label="Running"    value={running}    color="var(--status-online)" />
          <StatPill label="Stopped"    value={stopped}    color="var(--text-muted)" />
          <StatPill label="Restarting" value={restarting} color="#f59e0b" />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            className="form-input"
            placeholder="Filter containers…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ paddingLeft: 30, fontSize: 13, width: 220 }}
          />
        </div>
        <button className="btn btn-ghost btn-icon" onClick={handleRefresh} disabled={refreshing} data-tooltip="Refresh">
          {refreshing
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : <RefreshCw size={16} />
          }
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 13, color: 'var(--status-offline)', padding: '12px 16px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-md)' }}>
          {error.includes('503') || error.toLowerCase().includes('docker unavailable')
            ? 'Docker socket unavailable. Make sure /var/run/docker.sock is mounted.'
            : error}
        </div>
      )}

      {/* Loading */}
      {loading && containers.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
        </div>
      )}

      {/* Container table */}
      {!loading || containers.length > 0 ? (
        <ContainerTable
          containers={containers}
          stats={stats}
          filter={filter}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
          onSelect={setSelectedId}
        />
      ) : null}
    </div>
  )
}
