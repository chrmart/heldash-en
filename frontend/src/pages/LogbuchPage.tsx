import { useTranslation } from 'react-i18next'
import React, { useEffect, useState, useRef } from 'react'
import { Activity, TrendingUp, RefreshCw, Container, Home, Box, AlertTriangle, CheckCircle, XCircle, Search, ChevronRight, Cpu, Network, HardDrive } from 'lucide-react'
import type { ResourceSnapshot } from '../types'
import { useStore } from '../store/useStore'
import { useActivityStore } from '../store/useActivityStore'
import type { ActivityEntry } from '../store/useActivityStore'
import { useRecyclarrStore } from '../store/useRecyclarrStore'
import { api } from '../api'
import type { Service } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthScore {
  score: number
  breakdown: {
    services: { online: number; total: number; points: number }
    docker: { running: number; total: number; points: number; available: boolean }
    recyclarr: { lastSyncSuccess: boolean | null; points: number }
    ha: { reachable: number; total: number; points: number }
  }
}

interface CalendarDay {
  date: string
  count: number
  maxSeverity: string
}

interface Anomaly {
  serviceId: string
  serviceName: string | null
  offlineCount: number
}

// ── Tab config ─────────────────────────────────────────────────────────────────

function useTabs() {
  const { t } = useTranslation()
  return [
    { key: 'aktivitaeten', label: t('logbuch.tabs.activity'), icon: Activity },
    { key: 'uptime', label: t('logbuch.tabs.uptime'), icon: TrendingUp },
    { key: 'sync', label: t('logbuch.tabs.sync'), icon: RefreshCw },
    { key: 'ressourcen', label: t('logbuch.tabs.resources'), icon: Cpu },
  ]
}

// ── Health Score Badge ────────────────────────────────────────────────────────

function HealthScoreBadge({ hs }: { hs: HealthScore | null }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const scoreColor = (s: number) => {
    if (s >= 90) return 'var(--status-online)'
    if (s >= 70) return '#f59e0b'
    return 'var(--status-offline)'
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 18px', borderRadius: 'var(--radius-lg)',
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(12px)', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>Homelab Status</span>
          <span style={{
            fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700,
            color: hs ? scoreColor(hs.score) : 'var(--text-muted)',
            lineHeight: 1,
          }}>
            {hs ? hs.score : '—'}
          </span>
        </div>
      </button>

      {expanded && hs && (
        <div
          className="glass"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            borderRadius: 'var(--radius-md)', padding: '12px 16px',
            minWidth: 240, zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: 6,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Services: {hs.breakdown.services.online}/{hs.breakdown.services.total} online
            </span>
            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>+{hs.breakdown.services.points}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {hs.breakdown.docker.available
                ? `Docker: ${hs.breakdown.docker.running}/${hs.breakdown.docker.total} running`
                : t('logbuch.health.docker_unavailable')}            </span>
            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>+{hs.breakdown.docker.points}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Recyclarr: {hs.breakdown.recyclarr.lastSyncSuccess === null
                ? t('logbuch.health.no_sync')
                : hs.breakdown.recyclarr.lastSyncSuccess ? t('logbuch.health.last_sync_ok') : t('logbuch.health.last_sync_failed')}
            </span>
            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>+{hs.breakdown.recyclarr.points}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Home Assistant: {hs.breakdown.ha.reachable}/{hs.breakdown.ha.total}  {t('logbuch.health.reachable')}
            </span>
            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>+{hs.breakdown.ha.points}</span>
          </div>
          <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>{t('logbuch.health.total')}</span>
            <span style={{ fontWeight: 700, color: scoreColor(hs.score), fontFamily: 'var(--font-mono)' }}>{hs.score}/100</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ereignis-Kalender ─────────────────────────────────────────────────────────

function EreignisKalender({ days }: { days: CalendarDay[] }) {
  const { t } = useTranslation()
  const { settings } = useStore()
  const locale = settings?.language ?? 'de'
  const [open, setOpen] = useState(false)

  const dayMap = new Map(days.map(d => [d.date, d]))
  const cells: { date: string; day: CalendarDay | null }[] = []

  // Build 84-day grid ending today (Mon → Sun rows)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - 83)
  // Align to Monday
  const dayOfWeek = (start.getDay() + 6) % 7 // 0=Mon, 6=Sun
  start.setDate(start.getDate() - dayOfWeek)

  for (let i = 0; i < 84 + dayOfWeek; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const iso = d.toISOString().split('T')[0]
    const isInRange = d <= today && d >= new Date(today.getTime() - 83 * 86400000)
    cells.push({ date: iso, day: isInRange ? (dayMap.get(iso) ?? null) : null })
  }

  while (cells.length % 7 !== 0) cells.push({ date: '', day: null })

  const weekCount = cells.length / 7

  // Build rows (7 rows × weekCount cols) for row-based rendering
  const rows: { date: string; day: CalendarDay | null }[][] = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: weekCount }, (__, c) => cells[c * 7 + r])
  )

  const todayIso = today.toISOString().split('T')[0]
  const rangeStartIso = new Date(today.getTime() - 83 * 86400000).toISOString().split('T')[0]

  const cellColor = (cell: { date: string; day: CalendarDay | null }) => {
    if (!cell.date || cell.date > todayIso) return 'transparent'
    if (!cell.day) return 'var(--glass-border)'
    if (cell.day.maxSeverity === 'error') return 'var(--status-offline)'
    if (cell.day.maxSeverity === 'warning') return '#f59e0b'
    if (cell.day.maxSeverity === 'info') return 'var(--status-online)'
    return 'var(--glass-border)'
  }

  const fmtDate = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          fontSize: 12, color: 'var(--text-muted)', background: 'none',
          border: 'none', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: 6, padding: 0,
        }}
      >
        <ChevronRight size={12} style={{ transition: 'transform var(--transition-fast)', transform: open ? 'rotate(90deg)' : 'none' }} />
        Ereignis-Kalender — letzte 12 Wochen
      </button>

      {open && (
        <div style={{ marginTop: 10, overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, width: 'fit-content' }}>
            {/* Day labels column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 1 }}>
              {DAY_LABELS.map(l => (
                <div key={l} style={{ width: 16, height: 12, fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', lineHeight: 1 }}>{l}</div>
              ))}
            </div>
            {/* 7 rows × weekCount cols */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {rows.map((row, rowIdx) => (
                <div key={rowIdx} style={{ display: 'flex', gap: 3 }}>
                  {row.map((cell, colIdx) => {
                    const isInRange = cell.date && cell.date <= todayIso && cell.date >= rangeStartIso
                    const tooltipText = !cell.date || !isInRange
                      ? ''
                      : cell.day
                        ? `${fmtDate(cell.date)} — ${cell.day.count} Event${cell.day.count !== 1 ? 's' : ''}`
                        : `${fmtDate(cell.date)} — Keine Events`
                    return (
                      <div
                        key={colIdx}
                        data-tooltip={tooltipText || undefined}
                        style={{
                          width: 12, height: 12, borderRadius: 2,
                          background: cellColor(cell),
                          flexShrink: 0,
                          cursor: 'default',
                          transition: 'opacity 150ms',
                          opacity: 0.85,
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
                      />
                    )
                  })}
                </div>
              ))}
              {/* Legend */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 10, color: 'var(--text-muted)', alignItems: 'center' }}>
                <span>{t('logbuch.uptime.few')}</span>
                {(['var(--glass-border)', 'var(--status-online)', '#f59e0b', 'var(--status-offline)'] as const).map((bg, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: bg, flexShrink: 0 }} />
                ))}
                <span>{t('logbuch.uptime.many_errors')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aktivitäten Tab ───────────────────────────────────────────────────────────

const ACTIVITY_CATEGORIES = ['all', 'system', 'docker', 'ha', 'recyclarr', 'network', 'backup']
const categoryLabel: Record<string, string> = { all: 'Alle', system: 'System', docker: 'Docker', ha: 'HA', recyclarr: 'Recyclarr', network: 'Netzwerk', backup: 'Backup' }
const categoryIconNode: Record<string, React.ReactNode> = {
  docker: <Container size={12} />,
  ha: <Home size={12} />,
  recyclarr: <RefreshCw size={12} />,
  system: <Activity size={12} />,
  network: <Network size={12} />,
  backup: <HardDrive size={12} />,
  all: <Box size={12} />,
}

const TIME_FILTERS = ['today', '7days', '30days'] as const
type TimeFilter = 'today' | '7days' | '30days'

const PAGE_SIZE = 20

function AktivitaetenTab({ anomalies }: { anomalies: Anomaly[] }) {
  const { entries, loading, loadEntries } = useActivityStore()
  const { t } = useTranslation()
  const [category, setCategory] = useState('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7days')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    loadEntries(category !== 'all' ? category : undefined).catch(() => {})
  }, [category])

  const now = new Date()
  const filtered = entries.filter(e => {
    const d = new Date(e.created_at)
    if (timeFilter === 'today') {
      const today = new Date(now); today.setHours(0, 0, 0, 0)
      if (d < today) return false
    } else if (timeFilter === t('logbuch.resources.7d')) {
      if (now.getTime() - d.getTime() > 7 * 86400000) return false
    } else {
      if (now.getTime() - d.getTime() > 30 * 86400000) return false
    }
    if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset to page 0 on filter change
  const setFilter = (fn: () => void) => { fn(); setPage(0) }

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Anomaly banner */}
      {anomalies.length > 0 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(234,179,8,0.1)', borderColor: '#f59e0b' }}>
          <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: 12 }}>
            <strong style={{ color: '#f59e0b' }}>{t('logbuch.activity.unstable_services')}:</strong>{' '}
            {anomalies.map(a => `${a.serviceName ?? a.serviceId} (${a.offlineCount}× {t('logbuch.activity.offline_today')})`).join(', ')}
          </span>
        </div>
      )}

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Category filters */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ACTIVITY_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(() => setCategory(cat))}
              className={category === cat ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {categoryIconNode[cat]}
              {categoryLabel[cat]}
            </button>
          ))}
        </div>

        {/* Time filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TIME_FILTERS.map(tf => (
            <button
              key={tf}
              onClick={() => setFilter(() => setTimeFilter(tf))}
              className={timeFilter === tf ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 160, maxWidth: 280 }}>
          <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Suchen…"
            value={search}
            onChange={e => setFilter(() => setSearch(e.target.value))}
            style={{
              flex: 1, fontSize: 12, padding: '4px 8px',
              background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
            }}
          />
        </div>

        <button
          onClick={() => loadEntries(category !== 'all' ? category : undefined).catch(() => {})}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, padding: '3px 8px', marginLeft: 'auto' }}
          title={t('common.refresh')}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Entry list */}
      {filtered.length === 0 && !loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
          {entries.length === 0
            ? t('logbuch.activity.no_activity')
            : t('logbuch.activity.no_entries')}
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {paginated.map((entry, i) => (
              <ActivityRow key={entry.id} entry={entry} fmtTime={fmtTime} last={i === paginated.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >{t('common.back')}</button>
          <span style={{ color: 'var(--text-muted)' }}>
            {t('common.page_of', { current: page + 1, total: totalPages })} ({filtered.length} {t('common.entries', { count: filtered.length })})
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >{t('common.next')}</button>
        </div>
      )}
    </div>
  )
}

function ActivityRow({ entry, fmtTime, last }: { entry: ActivityEntry; fmtTime: (iso: string) => string; last: boolean }) {
  const iconNode = categoryIconNode[entry.category] ?? <Box size={12} />
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 14px',
        borderBottom: last ? 'none' : '1px solid var(--glass-border)',
        background: entry.severity === 'error' ? 'rgba(220,38,38,0.06)'
          : entry.severity === 'warning' ? 'rgba(234,179,8,0.06)'
          : 'transparent',
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', flexShrink: 0,
        color: entry.severity === 'error' ? 'var(--status-offline)'
          : entry.severity === 'warning' ? 'var(--status-warning)'
          : 'var(--text-muted)',
      }}>
        {iconNode}
      </span>
      <span style={{
        fontSize: 12, flex: 1, lineHeight: 1.4,
        color: entry.severity === 'error' ? 'var(--status-offline)'
          : entry.severity === 'warning' ? 'var(--status-warning)'
          : 'var(--text-secondary)',
      }}>
        {entry.message}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {fmtTime(entry.created_at)}
      </span>
    </div>
  )
}

// ── Uptime Tab (verbatim from ServicesPage) ───────────────────────────────────

interface UptimeServiceData {
  serviceId: string
  serviceName: string
  serviceIcon: string | null
  serviceIconUrl: string | null
  lastStatus: string | null
  history: { hour: string; uptime: number }[]
  uptimePercent7d: number | null
}

function uptimeColor(pct: number | null): string {
  if (pct === null) return 'var(--text-muted)'
  if (pct >= 99) return 'var(--status-online)'
  if (pct >= 95) return 'var(--status-warning)'
  return 'var(--status-offline)'
}

function UptimeOverview({ services }: { services: Service[] }) {
  const { t } = useTranslation()
  const { settings } = useStore()
  const locale = settings?.language ?? 'de'
  const use12h = settings?.time_format === '12h'
  const [data, setData] = useState<UptimeServiceData[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sort, setSort] = useState<'name' | 'uptime-desc' | 'uptime-asc'>('name')

  const serviceIds = services.map(s => s.id).join(',')

  const load = async () => {
    setLoading(true)
    const results = await Promise.all(
      services.map(async s => {
        try {
          const d = await api.services_extra.healthHistory(s.id)
          return {
            serviceId: s.id, serviceName: s.name,
            serviceIcon: s.icon ?? null, serviceIconUrl: s.icon_url ?? null,
            lastStatus: s.last_status ?? null,
            history: d.history, uptimePercent7d: d.uptimePercent7d,
          }
        } catch {
          return {
            serviceId: s.id, serviceName: s.name,
            serviceIcon: s.icon ?? null, serviceIconUrl: s.icon_url ?? null,
            lastStatus: s.last_status ?? null,
            history: [], uptimePercent7d: null,
          }
        }
      })
    )
    setData(results)
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => { load() }, [serviceIds]) // eslint-disable-line

  const sorted = [...data].sort((a, b) => {
    if (sort === 'name') return a.serviceName.localeCompare(b.serviceName)
    const pa = a.uptimePercent7d ?? -1
    const pb = b.uptimePercent7d ?? -1
    return sort === 'uptime-desc' ? pb - pa : pa - pb
  })

  const online = data.filter(d => d.lastStatus === 'online').length
  const offline = data.filter(d => d.lastStatus === 'offline').length
  const avgUptime = (() => {
    const vals = data.map(d => d.uptimePercent7d).filter((v): v is number => v !== null)
    if (vals.length === 0) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  })()

  const build24hBlocks = (history: { hour: string; uptime: number }[]) => {
    const now = new Date()
    const blocks: { label: string; uptime: number | null }[] = []
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now)
      d.setMinutes(0, 0, 0)
      d.setHours(d.getHours() - i)
      const isoHour = d.toISOString().slice(0, 13)
      const entry = history.find(h => h.hour.slice(0, 13) === isoHour)
      blocks.push({
        label: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: use12h }),
        uptime: entry ? entry.uptime : null,
      })
    }
    return blocks
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontFamily: 'var(--font-display)', fontWeight: 600 }}>{t('logbuch.uptime.title')}</span>
        {lastUpdated && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('logbuch.uptime.updated')}: {lastUpdated.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: use12h })}
          </span>
        )}
        <button onClick={load} className="btn btn-ghost btn-sm" disabled={loading} style={{ marginLeft: 4, padding: '3px 8px' }} title={t('common.refresh')}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('logbuch.uptime.sort')}:</label>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as typeof sort)}
            style={{
              fontSize: 12, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)', cursor: 'pointer', colorScheme: 'dark',
            } as React.CSSProperties}
          >
            <option value="name">Name A→Z</option>
            <option value="uptime-desc">Uptime ↓</option>
            <option value="uptime-asc">Uptime ↑</option>
          </select>
        </div>
      </div>

      <div className="glass" style={{ borderRadius: 'var(--radius-md)', padding: '10px 16px', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
        <span><span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{t('logbuch.uptime.total')}:</span><strong>{data.length}</strong></span>
        <span><span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Online:</span><strong style={{ color: 'var(--status-online)' }}>{online}</strong></span>
        <span><span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Offline:</span><strong style={{ color: offline > 0 ? 'var(--status-offline)' : 'var(--text-secondary)' }}>{offline}</strong></span>
        <span><span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{t('logbuch.uptime.avg_7d')}:</span><strong style={{ color: uptimeColor(avgUptime) }}>{avgUptime !== null ? `${avgUptime}%` : '—'}</strong></span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(Math.min(services.length, 5))].map((_, i) => (
            <div key={i} className="glass" style={{ borderRadius: 'var(--radius-md)', padding: '12px 16px', height: 52, opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(svc => {
            const blocks = build24hBlocks(svc.history)
            const hasData = svc.history.length > 0
            return (
              <div key={svc.serviceId} className="glass" style={{ borderRadius: 'var(--radius-md)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200, flex: '0 0 200px' }}>
                  <span style={{ flexShrink: 0 }}>
                    {svc.serviceIconUrl ? (
                      <img src={svc.serviceIconUrl} alt="" style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 3 }} />
                    ) : svc.serviceIcon ? (
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{svc.serviceIcon}</span>
                    ) : null}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {svc.serviceName}
                  </span>
                  <span className={`service-status ${svc.lastStatus ?? 'unknown'}`} style={{ flexShrink: 0 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!hasData ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Keine Daten</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 2 }}>
                      {blocks.map((b, i) => {
                        const bg = b.uptime === null
                          ? 'var(--glass-border)'
                          : b.uptime >= 90 ? 'var(--status-online)'
                          : b.uptime >= 50 ? 'var(--status-warning)'
                          : 'var(--status-offline)'
                        return (
                          <div
                            key={i}
                            title={`${b.label} — ${b.uptime !== null ? b.uptime + '% uptime' : 'keine Daten'}`}
                            style={{ flex: 1, height: 20, borderRadius: 2, background: bg, cursor: 'default', opacity: 0.85, transition: 'opacity 150ms' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 60 }}>
                  {svc.uptimePercent7d !== null ? (
                    <span style={{ fontWeight: 700, fontSize: 14, color: uptimeColor(svc.uptimePercent7d) }}>{svc.uptimePercent7d}%</span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Sync-Verlauf Tab ──────────────────────────────────────────────────────────

function SyncTab() {
  const { t } = useTranslation()
  const { settings } = useStore()
  const locale = settings?.language ?? 'de'
  const use12h = settings?.time_format === '12h'
  const { syncHistory, loadSyncHistory } = useRecyclarrStore()
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (syncHistory.length === 0) {
      setLoading(true)
      loadSyncHistory().catch(() => {}).finally(() => setLoading(false))
    }
  }, [])

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: use12h })
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /></div>

  if (syncHistory.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>{t('logbuch.sync.no_history')}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => { setLoading(true); loadSyncHistory().catch(() => {}).finally(() => setLoading(false)) }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      {syncHistory.map(h => (
        <div key={h.id} className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
            onClick={() => toggleExpand(h.id)}
          >
            {h.success
              ? <CheckCircle size={14} style={{ color: 'var(--status-online)', flexShrink: 0 }} />
              : <XCircle size={14} style={{ color: 'var(--status-offline)', flexShrink: 0 }} />
            }
            <span className={h.success ? 'badge-success' : 'badge-error'} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
              {h.success ? 'OK' : t('common.error')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
              {h.changes_summary
                ? [
                    h.changes_summary.created ? `+${h.changes_summary.created} {t('logbuch.sync.created', { count: h.changes_summary.created })}` : '',
                    h.changes_summary.updated ? `${h.changes_summary.updated} {t('logbuch.sync.updated', { count: h.changes_summary.updated })}` : '',
                    h.changes_summary.deleted ? `${h.changes_summary.deleted} {t('logbuch.sync.deleted', { count: h.changes_summary.deleted })}` : '',
                  ].filter(Boolean).join(', ') || t('logbuch.sync.no_changes')
                : t('logbuch.sync.no_changelog')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtTime(h.synced_at)}</span>
          </div>
          {expanded.has(h.id) && h.output && (
            <div style={{ borderTop: '1px solid var(--glass-border)', padding: '10px 14px' }}>
              <pre style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 300, overflowY: 'auto' }}>
                {h.output}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}


// ── Ressourcen Tab ────────────────────────────────────────────────────────────

type ResourceRange = '1h' | '24h' | '7d'

interface MiniChartProps {
  data: number[]
  color: string
  maxVal?: number
  height?: number
}

function MiniChart({ data, color, maxVal, height = 60 }: MiniChartProps) {
  if (data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>Keine Daten</div>

  const max = maxVal ?? Math.max(...data, 1)
  const width = 400
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (v / max) * height
    return `${x},${y}`
  }).join(' ')

  const areaPoints = `0,${height} ${pts} ${width},${height}`

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`grad-${color.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color.replace(/[^a-z]/gi, '')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

interface MetricCardProps {
  label: string
  value: string
  subValue?: string
  color: string
  data: number[]
  maxVal?: number
}

function MetricCard({ label, value, subValue, color, data, maxVal }: MetricCardProps) {
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-md)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{value}</span>
          {subValue && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subValue}</div>}
        </div>
      </div>
      <MiniChart data={data} color={color} maxVal={maxVal} height={56} />
    </div>
  )
}

function RessourcenTab() {
  const { t } = useTranslation()
  const [range, setRange] = useState<ResourceRange>('24h')
  const [snapshots, setSnapshots] = useState<ResourceSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (r: ResourceRange) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.resources.history(r)
      setSnapshots(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('logbuch.resources.load_error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(range) }, [range])

  const cpuData = snapshots.map(s => s.cpu_percent)
  const ramData = snapshots.map(s => s.ram_percent)
  const ramGbData = snapshots.map(s => s.ram_used_gb)
  const netRxData = snapshots.map(s => s.net_rx_mbps)
  const netTxData = snapshots.map(s => s.net_tx_mbps)

  const last = snapshots[snapshots.length - 1]
  const cpuVal = last ? `${last.cpu_percent.toFixed(1)}%` : '—'
  const ramVal = last ? `${last.ram_percent.toFixed(1)}%` : '—'
  const ramGbVal = last ? `${last.ram_used_gb.toFixed(1)} GB` : undefined
  const netRxVal = last ? `${last.net_rx_mbps.toFixed(2)} Mbps` : '—'
  const netTxVal = last ? `${last.net_tx_mbps.toFixed(2)} Mbps` : '—'

  const maxNet = Math.max(...netRxData, ...netTxData, 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {snapshots.length > 0 ? `${snapshots.length} {t('logbuch.resources.data_points', { count: snapshots.length })}` : ''}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['1h', '24h', '7d'] as ResourceRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={range === r ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {r === '1h' ? t('logbuch.resources.1h') : r === '24h' ? t('logbuch.resources.24h') : t('logbuch.resources.7d')}
            </button>
          ))}
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => load(range)}
            disabled={loading}
            title={t('common.refresh')}
          >
            <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : snapshots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <p style={{ margin: 0, fontSize: 13 }}>{t('logbuch.resources.no_data')}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>{t('logbuch.resources.no_data_hint')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MetricCard label="CPU" value={cpuVal} color="var(--accent)" data={cpuData} maxVal={100} />
          <MetricCard label="RAM" value={ramVal} subValue={ramGbVal} color="#a855f7" data={ramData} maxVal={100} />
          <MetricCard label="Netz RX" value={netRxVal} color="var(--status-online)" data={netRxData} maxVal={maxNet} />
          <MetricCard label="Netz TX" value={netTxVal} color="#f59e0b" data={netTxData} maxVal={maxNet} />
        </div>
      )}
    </div>
  )
}

// ── LogbuchPage ───────────────────────────────────────────────────────────────

export function LogbuchPage() {
  const tabs = useTabs()
  const { services } = useStore()
  const [activeTab, setActiveTab] = useState('aktivitaeten')
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null)
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const anomalyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Health score — load immediately + refresh every 60s
  const loadHealthScore = () => {
    api.logbuch.healthScore().then(setHealthScore).catch(() => {})
  }
  useEffect(() => {
    loadHealthScore()
    intervalRef.current = setInterval(loadHealthScore, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Calendar — load on mount only
  useEffect(() => {
    api.logbuch.calendar().then(d => setCalendarDays(d.days)).catch(() => {})
  }, [])

  // Anomalies — load immediately + refresh every 30s
  const loadAnomalies = () => {
    api.logbuch.anomalies().then(d => setAnomalies(d.anomalies)).catch(() => {})
  }
  useEffect(() => {
    loadAnomalies()
    anomalyIntervalRef.current = setInterval(loadAnomalies, 30_000)
    return () => { if (anomalyIntervalRef.current) clearInterval(anomalyIntervalRef.current) }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, margin: 0 }}>Logbuch</h2>
        <HealthScoreBadge hs={healthScore} />
      </div>

      {/* Ereignis-Kalender */}
      <EreignisKalender days={calendarDays} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--glass-border)' }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: 13, fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-muted)',
                marginBottom: -1,
                transition: 'color var(--transition-fast)',
              }}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'aktivitaeten' && <AktivitaetenTab anomalies={anomalies} />}
      {activeTab === 'uptime' && <UptimeOverview services={services} />}
      {activeTab === 'sync' && <SyncTab />}
      {activeTab === 'ressourcen' && <RessourcenTab />}
    </div>
  )
}
