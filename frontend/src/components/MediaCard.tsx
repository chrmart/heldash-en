import { useState } from 'react'
import { useArrStore } from '../store/useArrStore'
import { useStore } from '../store/useStore'
import { useConfirm } from './ConfirmDialog'
import type { ArrStatus, ArrStats, ArrQueueItem, ArrCalendarItem, RadarrCalendarItem, SonarrCalendarItem, ProwlarrIndexer, SabnzbdQueueData, SabnzbdHistoryData, SabnzbdWarningItem, SeerrRequest, ArrHealthIssue } from '../types/arr'
import { ChevronDown, ChevronUp, Check, X, Trash2, AlertTriangle } from 'lucide-react'
import { normalizeUrl } from '../utils'

// Minimal instance shape — works for both ArrInstance and dashboard partial
export interface ArrInstanceBase {
  id: string
  type: string
  name: string
  url: string
  enabled: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function fmtMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb === 0) return '0 MB'
  return `${mb.toFixed(0)} MB`
}

export function fmtPct(done: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round(((total - done) / total) * 100)}%`
}

export const TYPE_LABELS: Record<string, string> = {
  radarr: 'Radarr',
  sonarr: 'Sonarr',
  prowlarr: 'Prowlarr',
  sabnzbd: 'SABnzbd',
  seerr: 'Seerr',
}

export const TYPE_COLORS: Record<string, string> = {
  radarr: '#f59e0b',
  sonarr: '#3b82f6',
  prowlarr: '#8b5cf6',
  sabnzbd: '#22c55e',
  seerr: '#6366f1',
}

// ── Shared sub-components ─────────────────────────────────────────────────────

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

export function ExpandBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={onClick}
      style={{ fontSize: 11, gap: 4, padding: '4px 8px', color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      {label}
      {active ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
    </button>
  )
}

// ── List components ───────────────────────────────────────────────────────────

export function QueueList({ items }: { items: ArrQueueItem[] }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Queue is empty.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(item => (
        <div key={item.id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
          <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
            <span>{fmtPct(item.sizeleft, item.size)} done</span>
            <span>{fmtBytes(item.sizeleft)} left</span>
            <span style={{ textTransform: 'capitalize' }}>{item.protocol}</span>
            <span style={{ color: item.status === 'downloading' ? 'var(--status-online)' : 'var(--text-muted)', textTransform: 'capitalize' }}>{item.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function CalendarList({ items, type }: { items: ArrCalendarItem[]; type: string }) {
  const { settings } = useStore()
  const locale = settings?.language ?? 'de'
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Nothing upcoming this week.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(item => {
        const isSonarr = type === 'sonarr'
        const sonarrItem = item as SonarrCalendarItem
        const radarrItem = item as RadarrCalendarItem
        const title = isSonarr
          ? `${sonarrItem.series?.title ?? 'Unknown'} — S${String(sonarrItem.seasonNumber).padStart(2, '0')}E${String(sonarrItem.episodeNumber).padStart(2, '0')}`
          : radarrItem.title
        const date = isSonarr ? sonarrItem.airDateUtc : (radarrItem.inCinemas ?? radarrItem.digitalRelease)
        return (
          <div key={item.id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              {date ? new Date(date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function IndexerList({ items }: { items: ProwlarrIndexer[] }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No indexers.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map(idx => (
        <div key={idx.id} className="glass" style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: idx.enable ? 'var(--status-online)' : 'var(--status-offline)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{idx.name}</span>
          <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize', fontSize: 11 }}>{idx.protocol}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{idx.privacy}</span>
        </div>
      ))}
    </div>
  )
}

export function SabnzbdQueueList({ queue }: { queue: SabnzbdQueueData }) {
  if (queue.slots.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Queue is empty.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {queue.slots.map(slot => {
        const pct = parseFloat(slot.percentage)
        return (
          <div key={slot.nzo_id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
            <div style={{ fontWeight: 500, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.filename}</div>
            <div style={{ height: 3, background: 'var(--glass-border)', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
              <span>{pct.toFixed(0)}%</span>
              <span>{fmtMb(slot.mbleft)} left</span>
              <span>{slot.timeleft}</span>
              <span style={{ color: slot.status === 'Downloading' ? 'var(--status-online)' : 'var(--text-muted)' }}>{slot.status}</span>
            </div>
          </div>
        )
      })}
      {queue.noofslots > queue.slots.length && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
          +{queue.noofslots - queue.slots.length} more items
        </p>
      )}
    </div>
  )
}

export function SabnzbdWarningList({ warnings }: { warnings: SabnzbdWarningItem[] }) {
  if (warnings.length === 0) return <p style={{ fontSize: 12, color: 'var(--status-online)', padding: '8px 0' }}>No warnings.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {warnings.map((w, i) => {
        const color = w.type === 'ERROR' ? 'var(--status-offline)' : '#f59e0b'
        return (
          <div key={i} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={12} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{w.text}</span>
          </div>
        )
      })}
    </div>
  )
}

export function SabnzbdHistoryList({ history }: { history: SabnzbdHistoryData }) {
  if (history.slots.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No history yet.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {history.slots.map(slot => (
        <div key={slot.nzo_id} className="glass" style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: slot.status === 'Completed' ? 'var(--status-online)' : 'var(--status-offline)',
          }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.name}</span>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{fmtBytes(slot.bytes)}</span>
          {slot.cat && <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{slot.cat}</span>}
        </div>
      ))}
    </div>
  )
}

// ── Optional icon in card header ──────────────────────────────────────────────

function InstanceIcon({ iconUrl, iconEmoji }: { iconUrl?: string | null; iconEmoji?: string | null }) {
  const [imgErr, setImgErr] = useState(false)
  if (iconUrl && !imgErr) {
    return (
      <img
        src={iconUrl}
        alt=""
        onError={() => setImgErr(true)}
        style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }}
      />
    )
  }
  if (iconEmoji) {
    return <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{iconEmoji}</span>
  }
  return null
}

// ── Arr card content (radarr / sonarr / prowlarr) ─────────────────────────────

function HealthIssueList({ issues }: { issues: ArrHealthIssue[] }) {
  if (issues.length === 0) return <p style={{ fontSize: 12, color: 'var(--status-online)', padding: '8px 0' }}>No health issues.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {issues.map((issue, i) => {
        const color = issue.type === 'error' ? 'var(--status-offline)' : issue.type === 'warning' ? '#f59e0b' : 'var(--text-muted)'
        return (
          <div key={i} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={12} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{issue.message}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ArrCardContent({ instance }: {
  instance: ArrInstanceBase
}) {
  const { stats, statuses, queues, calendars, indexers, loadQueue, loadCalendar, loadIndexers } = useArrStore()
  const { services } = useStore()
  const instUrl = normalizeUrl(instance.url)
  const matchingSvc = services.find(s =>
    normalizeUrl(s.url) === instUrl || (s.check_url && normalizeUrl(s.check_url) === instUrl)
  )
  const iconUrl = matchingSvc?.icon_url ?? null
  const iconEmoji = matchingSvc?.icon ?? null
  const [expanded, setExpanded] = useState<'queue' | 'calendar' | 'indexers' | 'health' | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  const status: ArrStatus | undefined = statuses[instance.id]
  const stat: ArrStats | undefined = stats[instance.id]
  const online = status?.online ?? null

  const handleExpand = async (section: 'queue' | 'calendar' | 'indexers' | 'health') => {
    if (expanded === section) { setExpanded(null); return }
    setExpanded(section)
    if (section === 'queue' && !queues[instance.id]) {
      setLoadingExpand(true); await loadQueue(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'calendar') {
      setLoadingExpand(true); await loadCalendar(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'indexers' && !indexers[instance.id]) {
      setLoadingExpand(true); await loadIndexers(instance.id).catch(() => {}); setLoadingExpand(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <InstanceIcon iconUrl={iconUrl} iconEmoji={iconEmoji} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px',
          borderRadius: 'var(--radius-sm)', background: `${TYPE_COLORS[instance.type]}22`,
          color: TYPE_COLORS[instance.type], border: `1px solid ${TYPE_COLORS[instance.type]}44`,
          textTransform: 'uppercase', flexShrink: 0,
        }}>
          {TYPE_LABELS[instance.type] ?? instance.type}
        </span>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: online === null ? 'var(--text-muted)' : online ? 'var(--status-online)' : 'var(--status-offline)',
          boxShadow: online ? '0 0 6px var(--status-online)' : 'none',
        }} />
      </div>

      {status?.online && status.version && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {status.instanceName ?? TYPE_LABELS[instance.type]} v{status.version}
        </div>
      )}

      {stat && stat.type !== 'sabnzbd' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {stat.type === 'radarr' && (
            <>
              <Stat label="Movies" value={stat.movieCount} />
              <Stat label="Monitored" value={stat.monitored} />
              <Stat label="On Disk" value={stat.withFile} />
              {stat.missingCount > 0 && <Stat label="Missing" value={stat.missingCount} />}
              <Stat label="Size" value={fmtBytes(stat.sizeOnDisk)} />
              {stat.diskspaceFreeBytes > 0 && <Stat label="Disk Free" value={fmtBytes(stat.diskspaceFreeBytes)} />}
            </>
          )}
          {stat.type === 'sonarr' && (
            <>
              <Stat label="Series" value={stat.seriesCount} />
              <Stat label="Monitored" value={stat.monitored} />
              <Stat label="Episodes" value={stat.episodeCount} />
              {stat.missingCount > 0 && <Stat label="Missing" value={stat.missingCount} />}
              <Stat label="Size" value={fmtBytes(stat.sizeOnDisk)} />
              {stat.diskspaceFreeBytes > 0 && <Stat label="Disk Free" value={fmtBytes(stat.diskspaceFreeBytes)} />}
            </>
          )}
          {stat.type === 'prowlarr' && (
            <>
              <Stat label="Indexers" value={stat.indexerCount} />
              <Stat label="Enabled" value={stat.enabledIndexers} />
              {stat.failingIndexers > 0 && <Stat label="Failing" value={stat.failingIndexers} />}
              <Stat label="Grabs 24h" value={stat.grabCount24h} />
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {instance.type !== 'prowlarr' && (
          <>
            <ExpandBtn label="Queue" active={expanded === 'queue'} onClick={() => handleExpand('queue')} />
            <ExpandBtn label="Calendar" active={expanded === 'calendar'} onClick={() => handleExpand('calendar')} />
          </>
        )}
        {instance.type === 'prowlarr' && (
          <ExpandBtn label="Indexers" active={expanded === 'indexers'} onClick={() => handleExpand('indexers')} />
        )}
        {(instance.type === 'radarr' || instance.type === 'sonarr' || instance.type === 'prowlarr') && (stat?.type === 'radarr' || stat?.type === 'sonarr' || stat?.type === 'prowlarr') && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleExpand('health')}
            style={{
              fontSize: 11, gap: 4, padding: '4px 8px',
              color: expanded === 'health'
                ? 'var(--accent)'
                : stat.healthIssues.length > 0
                  ? (stat.healthIssues.some(h => h.type === 'error') ? 'var(--status-offline)' : '#f59e0b')
                  : 'var(--text-secondary)',
              borderColor: expanded === 'health' ? 'var(--accent)' : 'transparent',
            }}
          >
            {stat.healthIssues.length > 0 && (
              <AlertTriangle size={10} />
            )}
            Health{stat.healthIssues.length > 0 ? ` (${stat.healthIssues.length})` : ''}
            {expanded === 'health' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}
      </div>

      {expanded && (
        <div>
          {loadingExpand
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : expanded === 'queue' && queues[instance.id]
              ? <QueueList items={queues[instance.id]!.records} />
              : expanded === 'calendar' && calendars[instance.id]
                ? <CalendarList items={calendars[instance.id]!} type={instance.type} />
                : expanded === 'indexers' && indexers[instance.id]
                  ? <IndexerList items={indexers[instance.id]!} />
                  : expanded === 'health' && (stat?.type === 'radarr' || stat?.type === 'sonarr' || stat?.type === 'prowlarr')
                    ? <HealthIssueList issues={stat.healthIssues} />
                    : null
          }
        </div>
      )}
    </>
  )
}

// ── SABnzbd card content ──────────────────────────────────────────────────────

export function SabnzbdCardContent({ instance }: {
  instance: ArrInstanceBase
}) {
  const { stats, statuses, sabQueues, histories, loadSabQueue, loadHistory } = useArrStore()
  const { services } = useStore()
  const instUrl = normalizeUrl(instance.url)
  const matchingSvc = services.find(s =>
    normalizeUrl(s.url) === instUrl || (s.check_url && normalizeUrl(s.check_url) === instUrl)
  )
  const iconUrl = matchingSvc?.icon_url ?? null
  const iconEmoji = matchingSvc?.icon ?? null
  const [expanded, setExpanded] = useState<'queue' | 'history' | 'warnings' | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  const status: ArrStatus | undefined = statuses[instance.id]
  const stat: ArrStats | undefined = stats[instance.id]
  const sabStat = stat?.type === 'sabnzbd' ? stat : undefined
  const online = status?.online ?? null

  const handleExpand = async (section: 'queue' | 'history' | 'warnings') => {
    if (expanded === section) { setExpanded(null); return }
    setExpanded(section)
    if (section === 'queue' && !sabQueues[instance.id]) {
      setLoadingExpand(true); await loadSabQueue(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'history' && !histories[instance.id]) {
      setLoadingExpand(true); await loadHistory(instance.id).catch(() => {}); setLoadingExpand(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <InstanceIcon iconUrl={iconUrl} iconEmoji={iconEmoji} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px',
          borderRadius: 'var(--radius-sm)', background: `${TYPE_COLORS['sabnzbd']}22`,
          color: TYPE_COLORS['sabnzbd'], border: `1px solid ${TYPE_COLORS['sabnzbd']}44`,
          textTransform: 'uppercase', flexShrink: 0,
        }}>SABnzbd</span>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: online === null ? 'var(--text-muted)' : online ? 'var(--status-online)' : 'var(--status-offline)',
          boxShadow: online ? '0 0 6px var(--status-online)' : 'none',
        }} />
      </div>

      {status?.online && status.version && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SABnzbd v{status.version}</div>
      )}

      {sabStat && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Stat label="Queue" value={sabStat.queueCount} />
          <Stat label="Left" value={fmtMb(sabStat.mbleft)} />
          <Stat label="Speed" value={sabStat.paused ? 'Paused' : (sabStat.speed || '—')} />
          {sabStat.queueCount > 0 && sabStat.timeleft && sabStat.timeleft !== '0:00:00' && (
            <Stat label="ETA" value={sabStat.timeleft} />
          )}
          {sabStat.speedlimit && sabStat.speedlimit !== '0' && sabStat.speedlimit !== '100' && (
            <Stat label="Limit" value={`${sabStat.speedlimit}%`} />
          )}
          <Stat label="Disk Free" value={`${sabStat.diskspaceFreeGb.toFixed(1)} GB`} />
          {sabStat.downloadedToday > 0 && (
            <Stat label="Today" value={fmtBytes(sabStat.downloadedToday)} />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <ExpandBtn label="Queue" active={expanded === 'queue'} onClick={() => handleExpand('queue')} />
        <ExpandBtn label="History" active={expanded === 'history'} onClick={() => handleExpand('history')} />
        {sabStat && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleExpand('warnings')}
            style={{
              fontSize: 11, gap: 4, padding: '4px 8px',
              color: expanded === 'warnings'
                ? 'var(--accent)'
                : sabStat.warnings.length > 0
                  ? (sabStat.warnings.some(w => w.type === 'ERROR') ? 'var(--status-offline)' : '#f59e0b')
                  : 'var(--text-secondary)',
              borderColor: expanded === 'warnings' ? 'var(--accent)' : 'transparent',
            }}
          >
            {sabStat.warnings.length > 0 && <AlertTriangle size={10} />}
            Warnings{sabStat.warnings.length > 0 ? ` (${sabStat.warnings.length})` : ''}
            {expanded === 'warnings' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}
      </div>

      {expanded && (
        <div>
          {loadingExpand
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : expanded === 'queue' && sabQueues[instance.id]
              ? <SabnzbdQueueList queue={sabQueues[instance.id]!} />
              : expanded === 'history' && histories[instance.id]
                ? <SabnzbdHistoryList history={histories[instance.id]!} />
                : expanded === 'warnings' && sabStat
                  ? <SabnzbdWarningList warnings={sabStat.warnings} />
                  : null
          }
        </div>
      )}
    </>
  )
}

// ── Seerr card content ────────────────────────────────────────────────────────

const SEERR_REQUEST_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending',  color: 'var(--accent)' },
  2: { label: 'Approved', color: 'var(--status-online)' },
  3: { label: 'Declined', color: 'var(--status-offline)' },
}

const SEERR_MEDIA_STATUS: Record<number, { label: string; color: string }> = {
  3: { label: 'Processing',  color: '#f59e0b' },
  4: { label: 'Partial',     color: '#6366f1' },
  5: { label: 'Available',   color: 'var(--status-online)' },
}

function SeerrRequestList({
  requests,
  controlling,
  isAdmin,
  onApprove,
  onDecline,
  onDelete,
}: {
  requests: SeerrRequest[]
  controlling: number | null
  isAdmin: boolean
  onApprove: (id: number) => void
  onDecline: (id: number) => void
  onDelete: (id: number) => void
}) {
  if (requests.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No requests.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflowY: 'auto', paddingRight: 2 }}>
      {requests.map(req => {
        const st = SEERR_REQUEST_STATUS[req.status] ?? { label: 'Unknown', color: 'var(--text-muted)' }
        const who = req.requestedBy.displayName ?? req.requestedBy.username ?? req.requestedBy.email
        const isBusy = controlling === req.id
        const title = req.media.title ?? `${req.media.mediaType === 'movie' ? 'Movie' : 'TV'} #${req.media.tmdbId}`
        return (
          <div key={req.id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                background: req.media.mediaType === 'movie' ? '#f59e0b22' : '#3b82f622',
                color: req.media.mediaType === 'movie' ? '#f59e0b' : '#3b82f6',
                border: `1px solid ${req.media.mediaType === 'movie' ? '#f59e0b44' : '#3b82f644'}`,
                textTransform: 'uppercase', flexShrink: 0,
              }}>
                {req.media.mediaType === 'movie' ? 'Movie' : 'TV'}
              </span>
              <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                {SEERR_MEDIA_STATUS[req.media.status] && (
                  <span style={{ fontSize: 10, color: SEERR_MEDIA_STATUS[req.media.status].color, fontWeight: 600 }}>
                    {SEERR_MEDIA_STATUS[req.media.status].label}
                  </span>
                )}
                <span style={{ fontSize: 10, color: st.color, fontWeight: 600 }}>{st.label}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>by {who}</span>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {req.status === 1 && (
                    <>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        disabled={isBusy}
                        onClick={() => onApprove(req.id)}
                        data-tooltip="Approve"
                        style={{ width: 22, height: 22, padding: 3, color: 'var(--status-online)' }}
                      >
                        {isBusy ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1 }} /> : <Check size={10} />}
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        disabled={isBusy}
                        onClick={() => onDecline(req.id)}
                        data-tooltip="Decline"
                        style={{ width: 22, height: 22, padding: 3, color: 'var(--status-offline)' }}
                      >
                        <X size={10} />
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    disabled={isBusy}
                    onClick={() => onDelete(req.id)}
                    data-tooltip="Delete"
                    style={{ width: 22, height: 22, padding: 3, color: 'var(--text-muted)' }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function SeerrCardContent({ instance }: { instance: ArrInstanceBase }) {
  const { stats, statuses, seerrRequests, loadSeerrRequests, seerrApprove, seerrDecline, seerrDelete } = useArrStore()
  const { isAdmin } = useStore()
  const { services } = useStore()
  const { confirm: confirmDlg } = useConfirm()
  const instUrl = normalizeUrl(instance.url)
  const matchingSvc = services.find(s =>
    normalizeUrl(s.url) === instUrl || (s.check_url && normalizeUrl(s.check_url) === instUrl)
  )
  const iconUrl = matchingSvc?.icon_url ?? null
  const iconEmoji = matchingSvc?.icon ?? null

  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'declined'>('pending')
  const [loadingExpand, setLoadingExpand] = useState(false)
  const [controlling, setControlling] = useState<number | null>(null)

  const status: ArrStatus | undefined = statuses[instance.id]
  const stat: ArrStats | undefined = stats[instance.id]
  const seerrStat = stat?.type === 'seerr' ? stat : undefined
  const online = status?.online ?? null
  const reqData = seerrRequests[instance.id]

  const handleExpand = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && !reqData) {
      setLoadingExpand(true)
      await loadSeerrRequests(instance.id, filter)
      setLoadingExpand(false)
    }
  }

  const handleFilter = async (f: typeof filter) => {
    setFilter(f)
    setLoadingExpand(true)
    await loadSeerrRequests(instance.id, f)
    setLoadingExpand(false)
  }

  const handleApprove = async (requestId: number) => {
    setControlling(requestId)
    try {
      await seerrApprove(instance.id, requestId)
      await loadSeerrRequests(instance.id, filter)
    } catch { /* ignore */ } finally { setControlling(null) }
  }

  const handleDecline = async (requestId: number) => {
    setControlling(requestId)
    try {
      await seerrDecline(instance.id, requestId)
      await loadSeerrRequests(instance.id, filter)
    } catch { /* ignore */ } finally { setControlling(null) }
  }

  const handleDelete = async (requestId: number) => {
    const ok = await confirmDlg({ title: 'Delete this request?', danger: true, confirmLabel: 'Delete' })
    if (!ok) return
    setControlling(requestId)
    try {
      await seerrDelete(instance.id, requestId)
      await loadSeerrRequests(instance.id, filter)
    } catch { /* ignore */ } finally { setControlling(null) }
  }

  const seerrColor = TYPE_COLORS['seerr']

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <InstanceIcon iconUrl={iconUrl} iconEmoji={iconEmoji} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px',
          borderRadius: 'var(--radius-sm)', background: `${seerrColor}22`,
          color: seerrColor, border: `1px solid ${seerrColor}44`,
          textTransform: 'uppercase', flexShrink: 0,
        }}>Seerr</span>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: online === null ? 'var(--text-muted)' : online ? 'var(--status-online)' : 'var(--status-offline)',
          boxShadow: online ? '0 0 6px var(--status-online)' : 'none',
        }} />
      </div>

      {status?.online && status.version && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Seerr v{status.version}</span>
          {seerrStat?.updateAvailable && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 600, padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.3)',
            }}>
              <AlertTriangle size={9} />
              Update{seerrStat.commitsBehind > 0 ? ` (${seerrStat.commitsBehind} behind)` : ''}
            </span>
          )}
          {seerrStat?.restartRequired && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239,68,68,0.15)', color: 'var(--status-offline)',
              border: '1px solid rgba(239,68,68,0.3)',
            }}>Restart required</span>
          )}
        </div>
      )}

      {seerrStat && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Stat label="Total" value={seerrStat.total} />
          <Stat label="Pending" value={seerrStat.pending} />
          {seerrStat.processing > 0 && <Stat label="Processing" value={seerrStat.processing} />}
          <Stat label="Approved" value={seerrStat.approved} />
          {seerrStat.declined > 0 && <Stat label="Declined" value={seerrStat.declined} />}
        </div>
      )}
      {seerrStat && seerrStat.total > 0 && (
        <div style={{ display: 'flex', gap: 10 }}>
          {seerrStat.movie > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>🎬 {seerrStat.movie} movie{seerrStat.movie !== 1 ? 's' : ''}</span>
          )}
          {seerrStat.tv > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📺 {seerrStat.tv} show{seerrStat.tv !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <ExpandBtn label="Requests" active={expanded} onClick={handleExpand} />
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'pending', 'approved', 'declined'] as const).map(f => (
              <button
                key={f}
                className="btn btn-ghost btn-sm"
                onClick={() => handleFilter(f)}
                style={{
                  fontSize: 11, padding: '3px 8px', textTransform: 'capitalize',
                  color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
                  borderColor: filter === f ? 'var(--accent)' : 'transparent',
                }}
              >
                {f}
              </button>
            ))}
          </div>
          {loadingExpand
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : reqData
              ? <SeerrRequestList
                  requests={reqData.results}
                  controlling={controlling}
                  isAdmin={isAdmin}
                  onApprove={handleApprove}
                  onDecline={handleDecline}
                  onDelete={handleDelete}
                />
              : <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Could not load requests.</p>
          }
          {reqData && reqData.pageInfo.results > reqData.results.length && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              +{reqData.pageInfo.results - reqData.results.length} more
            </p>
          )}
        </div>
      )}
    </>
  )
}
