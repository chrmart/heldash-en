import React, { useEffect, useState } from 'react'
import { Sun, Moon, RefreshCw, Plus, LogIn, LogOut, Pencil, LayoutGrid, LayoutList, Minus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store/useStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { useDockerStore } from '../store/useDockerStore'
import { api } from '../api'
import type { ThemeAccent, ServerStats, AdGuardStats, HaEntityState, NpmStats, CalendarEntry } from '../types'
import { containerCounts } from '../utils'

interface Props {
  page: string
  onAddService: () => void
  onAddInstance: () => void
  onAddWidget: () => void
  onCheckAll: () => void
  checking: boolean
  onLogin: () => void
  onAddHaInstance?: () => void
  onAddHaPanel?: () => void
}

const ACCENTS: { value: ThemeAccent; label: string; color: string }[] = [
  { value: 'cyan', label: 'Cyan', color: '#22d3ee' },
  { value: 'orange', label: 'Orange', color: '#fb923c' },
  { value: 'magenta', label: 'Magenta', color: '#e879f9' },
]

export function Topbar({ page, onAddService, onAddInstance, onAddWidget, onCheckAll, checking, onLogin, onAddHaInstance, onAddHaPanel }: Props) {
  const { settings, setThemeMode, setThemeAccent, isAuthenticated, isAdmin, authUser, logout, loadAll } = useStore()
  const { t } = useTranslation()
  const locale = settings?.language ?? 'de'
  const use12h = settings?.time_format === '12h'
  const { loadDashboard, editMode, setEditMode, addPlaceholder, guestMode, setGuestMode } = useDashboardStore()
  const { widgets, stats, loadWidgets, loadStats, startPolling, stopPolling } = useWidgetStore()
  const { containers, loadContainers } = useDockerStore()
  const mode = settings?.theme_mode ?? 'dark'
  const accent = settings?.theme_accent ?? 'cyan'

  // Users in grp_guest (or no group) cannot edit the dashboard
  const isGuestUser = !isAdmin && (!authUser?.groupId || authUser.groupId === 'grp_guest')
  const canEditDashboard = isAuthenticated && !isGuestUser

  const topbarWidgets = widgets.filter(w => w.display_location === 'topbar')
  const hasDockerTopbar = topbarWidgets.some(w => w.type === 'docker_overview')
  const statsWidgetKey = topbarWidgets.filter(w => w.type !== 'docker_overview').map(w => w.id).join(',')

  // Server clock: fetch server time once, compute offset, tick every second
  const [serverOffset, setServerOffset] = useState(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    api.serverTime().then(({ iso }) => {
      setServerOffset(new Date(iso).getTime() - Date.now())
    }).catch(() => {})
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const serverNow = new Date(now.getTime() + serverOffset)

  // Re-load widgets whenever auth state changes so backend permission filtering is applied
  useEffect(() => {
    loadWidgets().catch(() => {})
  }, [isAuthenticated, authUser?.sub])

  // Poll stats for topbar widgets
  useEffect(() => {
    if (!statsWidgetKey) return
    const pollable = topbarWidgets.filter(w => w.type !== 'docker_overview' && w.type !== 'custom_button')
    pollable.forEach(w => { loadStats(w.id).catch(() => {}); startPolling(w.id, w.type) })
    return () => pollable.forEach(w => stopPolling(w.id))
  }, [statsWidgetKey])

  // Poll container list for docker_overview topbar widgets
  useEffect(() => {
    if (!hasDockerTopbar) return
    loadContainers().catch(() => {})
    const interval = setInterval(() => loadContainers().catch(() => {}), 30_000)
    return () => clearInterval(interval)
  }, [hasDockerTopbar])

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span>{serverNow.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <span style={{ marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>
          {serverNow.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: use12h })}
        </span>
      </div>

      {/* Center zone — topbar widget stats */}
      <div className="topbar-center">
        {topbarWidgets.map(w => {
          const pillStyle: React.CSSProperties = {
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-md)',
            padding: '4px 12px',
            background: 'rgba(var(--accent-rgb), 0.06)',
            boxShadow: '0 0 8px rgba(var(--accent-rgb), 0.25)',
            fontSize: 12,
          }
          const label = (text: string) => (
            <span style={{ color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.3px', marginRight: 2 }}>{text}</span>
          )
          const sep = <span style={{ color: 'var(--glass-border)', userSelect: 'none' }}>·</span>
          const val = (text: string, color?: string) => (
            <span style={{ color: color ?? 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600, whiteSpace: 'nowrap' }}>{text}</span>
          )
          const muted = (text: string) => (
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{text}</span>
          )
          const pctColor = (pct: number) =>
            pct >= 90 ? 'var(--status-offline)' : pct >= 70 ? '#f59e0b' : 'var(--status-online)'

          if (w.type === 'docker_overview') {
            const { running, stopped, restarting } = containerCounts(containers)
            return (
              <div key={w.id} style={pillStyle}>
                {label('Docker:')}
                {val(String(containers.length))} {muted('total')}
                {sep}
                {val(String(running), 'var(--status-online)')} {muted('running')}
                {stopped > 0 && <>{sep}{val(String(stopped), 'var(--text-muted)')} {muted('stopped')}</>}
                {restarting > 0 && <>{sep}{val(String(restarting), '#f59e0b')} {muted('restarting')}</>}
              </div>
            )
          }

          if (w.type === 'adguard_home') {
            const s = stats[w.id] as AdGuardStats | undefined
            if (!s) return null
            const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
            const isErr = s.total_queries === -1
            return (
              <div key={w.id} style={pillStyle}>
                {label('AdGuard:')}
                {isErr
                  ? muted('unreachable')
                  : <>
                      {val(fmt(s.total_queries))} {muted('req')}
                      {sep}
                      {val(fmt(s.blocked_queries), 'var(--status-offline)')} {muted(`blocked (${s.blocked_percent}%)`)}
                      {sep}
                      <span style={{ color: s.protection_enabled ? 'var(--status-online)' : '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {s.protection_enabled ? '● Protected' : '● Paused'}
                      </span>
                    </>
                }
              </div>
            )
          }

          if (w.type === 'home_assistant') {
            const entities = Array.isArray(stats[w.id]) ? stats[w.id] as unknown as HaEntityState[] : []
            if (entities.length === 0) return null
            return (
              <div key={w.id} style={pillStyle}>
                {label(`${w.name}:`)}
                {entities.map((e, i) => (
                  <React.Fragment key={e.entity_id}>
                    {i > 0 && sep}
                    {muted(e.label || e.friendly_name || e.entity_id)}{' '}
                    {val(
                      e.state + (e.unit ? ` ${e.unit}` : ''),
                    ['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(e.state) ? 'var(--status-online)'
                      : ['off', 'closed', 'locked', 'paused', 'idle', 'standby'].includes(e.state) ? 'var(--text-muted)'
                      : undefined
                    )}
                  </React.Fragment>
                ))}
              </div>
            )
          }

          if (w.type === 'nginx_pm') {
            const npm = stats[w.id] as unknown as NpmStats & { error?: string }
            if (!npm || npm.error) return null
            return (
              <div key={w.id} style={pillStyle}>
                {label('NPM:')}
                {val(String(npm.proxy_hosts))} {muted('proxies')}
                {sep}
                {val(String(npm.streams))} {muted('streams')}
                {sep}
                {val(String(npm.certificates), npm.cert_expiring_soon > 0 ? '#f59e0b' : undefined)} {muted('certs')}
                {npm.cert_expiring_soon > 0 && <>{sep}{val(String(npm.cert_expiring_soon), '#f59e0b')} {muted('expiring soon')}</>}
              </div>
            )
          }

          if (w.type === 'pihole') {
            const p = stats[w.id] as unknown as AdGuardStats
            if (!p) return null
            const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
            const isErr = p.total_queries === -1
            return (
              <div key={w.id} style={pillStyle}>
                {label('Pi-hole:')}
                {isErr
                  ? muted('unreachable')
                  : <>
                      {val(fmt(p.total_queries))} {muted('req')}
                      {sep}
                      {val(fmt(p.blocked_queries), 'var(--status-offline)')} {muted(`blocked (${p.blocked_percent}%)`)}
                    </>
                }
              </div>
            )
          }

          if (w.type === 'calendar') {
            const entries = Array.isArray(stats[w.id]) ? stats[w.id] as unknown as CalendarEntry[] : []
            const upcoming = entries.slice(0, 3)
            if (upcoming.length === 0) return null
            const fmtDate = (d: string) => {
              const today = new Date(); today.setHours(0, 0, 0, 0)
              const dd = new Date(d + 'T00:00:00')
              if (dd.getTime() === today.getTime()) return 'Today'
              return dd.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            }
            return (
              <div key={w.id} style={pillStyle}>
                {label('Cal:')}
                {upcoming.map((e, i) => (
                  <React.Fragment key={e.id}>
                    {i > 0 && sep}
                    {muted(fmtDate(e.date))}{' '}
                    {val(e.title + (e.type === 'episode' && e.season_number != null ? ` S${String(e.season_number).padStart(2,'0')}E${String(e.episode_number ?? 0).padStart(2,'0')}` : ''))}
                  </React.Fragment>
                ))}
                {entries.length > 3 && <>{sep}{muted(`+${entries.length - 3} more`)}</>}
              </div>
            )
          }

          // server_status
          if (w.type !== 'server_status') return null
          const s = stats[w.id] as ServerStats | undefined
          if (!s) return null
          return (
            <div key={w.id} style={pillStyle}>
              {label(`${w.name}:`)}
              {s.cpu.load >= 0 && <>
                {muted('CPU')} {val(`${s.cpu.load}%`, pctColor(s.cpu.load))}
              </>}
              {s.ram.total > 0 && <>
                {sep}
                {muted('RAM')} {val(`${(s.ram.used / 1024).toFixed(1)}`, pctColor(Math.round(s.ram.used / s.ram.total * 100)))}
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>/{(s.ram.total / 1024).toFixed(1)} GB</span>
              </>}
              {s.disks.filter(d => d.total > 0).map(d => {
                const pct = Math.round((d.used / d.total) * 100)
                return (
                  <React.Fragment key={d.path}>
                    {sep}
                    {muted(d.name)} {val(`${pct}%`, pctColor(pct))}
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>· {(d.used / 1024).toFixed(0)}/{(d.total / 1024).toFixed(0)} GB</span>
                  </React.Fragment>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="topbar-actions">
        {/* Accent picker */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 4 }}>
          {ACCENTS.map(a => (
            <button
              key={a.value}
              data-tooltip={a.label}
              onClick={() => setThemeAccent(a.value)}
              style={{
                width: 16, height: 16,
                borderRadius: '50%',
                background: a.color,
                border: accent === a.value ? `2px solid white` : '2px solid transparent',
                cursor: 'pointer',
                outline: accent === a.value ? `2px solid ${a.color}` : 'none',
                outlineOffset: 1,
                transition: 'all 150ms ease',
                boxShadow: accent === a.value ? `0 0 8px ${a.color}` : 'none',
              }}
            />
          ))}
        </div>

        <button
          className="btn btn-ghost btn-icon"
          data-tooltip={mode === 'dark' ? t('topbar.light_mode') : t('topbar.dark_mode')}
          onClick={() => setThemeMode(mode === 'dark' ? 'light' : 'dark')}
        >
          {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          className="btn btn-ghost btn-icon topbar-mobile-hide"
          data-tooltip={t('topbar.check_apps')}
          onClick={onCheckAll}
          disabled={checking}
        >
          {checking
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : <RefreshCw size={16} />
          }
        </button>

        {/* Dashboard controls */}
        {page === 'dashboard' && (
          <>
            {isAdmin && (
              <button
                className={`${guestMode ? 'btn btn-primary' : 'btn btn-ghost'} topbar-mobile-hide`}
                data-tooltip={guestMode ? t('topbar.exit_guest_mode') : t('topbar.guest_mode')}
                onClick={() => setGuestMode(!guestMode)}
                style={{ gap: 6 }}
              >
                <Users size={15} />
                {t('topbar.guest_mode')}
              </button>
            )}

            {canEditDashboard && (
              <>
                {editMode && (
                  <>
                    <button className="btn btn-ghost topbar-mobile-hide" onClick={() => addPlaceholder('app')} style={{ gap: 6 }}>
                      <LayoutGrid size={15} />
                      {t('topbar.add_app')}
                    </button>
                    <button className="btn btn-ghost topbar-mobile-hide" onClick={() => addPlaceholder('widget')} style={{ gap: 6 }}>
                      <LayoutList size={15} />
                      {t('topbar.add_widget')}
                    </button>
                    <button className="btn btn-ghost topbar-mobile-hide" onClick={() => addPlaceholder('row')} style={{ gap: 6 }}>
                      <Minus size={15} />
                      {t('topbar.add_row')}
                    </button>
                  </>
                )}
                <button
                  className={`${editMode ? 'btn btn-primary' : 'btn btn-ghost'} topbar-mobile-hide`}
                  onClick={() => setEditMode(!editMode)}
                  style={{ gap: 6 }}
                >
                  <Pencil size={15} />
                  {editMode ? t('topbar.done_editing') : t('topbar.edit_dashboard')}
                </button>
              </>
            )}
          </>
        )}

        {isAdmin && page === 'media' && (
          <button className="btn btn-primary topbar-mobile-hide" onClick={onAddInstance} style={{ gap: 6 }}>
            <Plus size={16} />
            {t('topbar.add_instance')}
          </button>
        )}
        {isAdmin && page === 'widgets' && (
          <button className="btn btn-primary topbar-mobile-hide" onClick={onAddWidget} style={{ gap: 6 }}>
            <Plus size={16} />
            {t('topbar.add_widget_btn')}
          </button>
        )}
        {isAdmin && page === 'services' && (
          <button className="btn btn-primary topbar-mobile-hide" onClick={onAddService} style={{ gap: 6 }}>
            <Plus size={16} />
            {t('topbar.add_app_btn')}
          </button>
        )}
        {isAdmin && page === 'home_assistant' && (
          <>
            {onAddHaInstance && (
              <button className="btn btn-ghost topbar-mobile-hide" onClick={onAddHaInstance} style={{ gap: 6 }}>
                <Plus size={16} />
                {t('topbar.add_ha_instance')}
              </button>
            )}
            {onAddHaPanel && (
              <button className="btn btn-primary topbar-mobile-hide" onClick={onAddHaPanel} style={{ gap: 6 }}>
                <Plus size={16} />
                {t('topbar.add_panel')}
              </button>
            )}
          </>
        )}

        {isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {authUser?.username}
            </span>
            <button
              className="btn btn-ghost btn-icon"
              data-tooltip={t('topbar.logout')}
              onClick={async () => {
                if (guestMode) await setGuestMode(false)
                await logout()
                await Promise.all([loadAll(), loadDashboard()])
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={onLogin} style={{ gap: 6 }}>
            <LogIn size={16} />
            {t('topbar.login')}
          </button>
        )}
      </div>
    </header>
  )
}
