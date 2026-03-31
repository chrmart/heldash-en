import React, { useEffect, useLayoutEffect, useState } from 'react'
import {
  LayoutDashboard, Settings, AppWindow, Info, Tv2, BarChart2, Container, Home,
  ChevronLeft, ChevronRight, ScrollText, Network, HardDrive, Server,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { useDockerStore } from '../store/useDockerStore'
import type { Widget, ServerStats, AdGuardStats, HaEntityState, NpmStats, CalendarEntry } from '../types'
import { containerCounts } from '../utils'
import { LS_SIDEBAR_COLLAPSED } from '../constants'

interface Props {
  page: string
  onNavigate: (page: string) => void
}

export function Sidebar({ page, onNavigate }: Props) {
  const { settings, services, isAdmin, isAuthenticated, authUser, userGroups } = useStore()
  const { instances } = useArrStore()
  const { widgets, loadStats, startPolling, stopPolling } = useWidgetStore()

  const userGroupData = userGroups.find(g => g.id === authUser?.groupId)
  const canSeeDocker = isAdmin || (userGroupData?.docker_access ?? false)
  const title = settings?.dashboard_title ?? 'HELDASH'

  const onlineCount = services.filter(s => s.last_status === 'online').length
  const offlineCount = services.filter(s => s.last_status === 'offline').length

  const { loadContainers } = useDockerStore()

  const sidebarWidgets = widgets.filter(w => w.display_location === 'sidebar')
  const hasSidebarDocker = sidebarWidgets.some(w => w.type === 'docker_overview')
  const sidebarStatsKey = sidebarWidgets
    .filter(w => w.type !== 'docker_overview' && w.type !== 'custom_button')
    .map(w => w.id)
    .join(',')

  // ── Collapse state ──────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_SIDEBAR_COLLAPSED) === 'true' } catch { return false }
  })

  // Keep --sidebar-width CSS variable on :root in sync (useLayoutEffect avoids flash)
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '64px' : '240px')
  }, [collapsed])

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(LS_SIDEBAR_COLLAPSED, String(next)) } catch {}
      return next
    })
  }

  // ── Widget polling ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sidebarStatsKey) return
    const pollable = sidebarWidgets.filter(w => w.type !== 'docker_overview' && w.type !== 'custom_button')
    pollable.forEach(w => { loadStats(w.id).catch(() => {}); startPolling(w.id, w.type) })
    return () => pollable.forEach(w => stopPolling(w.id))
  }, [sidebarStatsKey])

  useEffect(() => {
    if (!hasSidebarDocker) return
    loadContainers().catch(() => {})
    const interval = setInterval(() => loadContainers().catch(() => {}), 30_000)
    return () => clearInterval(interval)
  }, [hasSidebarDocker])

  return (
    <>
      <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <img src="/favicon.png" alt="" className="sidebar-logo-icon" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          {!collapsed && <span className="sidebar-logo-text">{title}</span>}
        </div>

        {/* Online / Offline counter */}
        {services.length > 0 && (
          <div className="sidebar-status">
            <div className="sidebar-status-pill online">
              <span className="sidebar-status-dot" />
              {!collapsed && <span>{onlineCount} Online</span>}
            </div>
            {!collapsed && (
              <div className="sidebar-status-pill offline">
                <span className="sidebar-status-dot" />
                <span>{offlineCount} Offline</span>
              </div>
            )}
          </div>
        )}

        <NavItem icon={<LayoutDashboard size={16} />} label="Dashboard" active={page === 'dashboard'} onClick={() => onNavigate('dashboard')} collapsed={collapsed} />

        {isAuthenticated && (
          <>
            <NavItem icon={<AppWindow size={16} />} label="Apps" active={page === 'services'} onClick={() => onNavigate('services')} collapsed={collapsed} />
            {(isAdmin || instances.length > 0) && (
              <NavItem icon={<Tv2 size={16} />} label="Media" active={page === 'media'} onClick={() => onNavigate('media')} collapsed={collapsed} />
            )}
            {(isAdmin || widgets.length > 0) && (
              <NavItem icon={<BarChart2 size={16} />} label="Widgets" active={page === 'widgets'} onClick={() => onNavigate('widgets')} collapsed={collapsed} />
            )}
            {canSeeDocker && (
              <NavItem icon={<Container size={16} />} label="Docker" active={page === 'docker'} onClick={() => onNavigate('docker')} collapsed={collapsed} />
            )}
            <NavItem icon={<Home size={16} />} label="Home Assistant" active={page === 'home_assistant'} onClick={() => onNavigate('home_assistant')} collapsed={collapsed} />
            <NavItem icon={<Server size={16} />} label="Unraid" active={page === 'unraid'} onClick={() => onNavigate('unraid')} collapsed={collapsed} />
          </>
        )}

        {isAuthenticated && (
          <NavItem icon={<Network size={16} />} label="Netzwerk" active={page === 'network'} onClick={() => onNavigate('network')} collapsed={collapsed} />
        )}
        {isAuthenticated && (
          <NavItem icon={<HardDrive size={16} />} label="Backup" active={page === 'backup'} onClick={() => onNavigate('backup')} collapsed={collapsed} />
        )}
        {isAuthenticated && (
          <NavItem icon={<ScrollText size={16} />} label="Logbuch" active={page === 'logbuch'} onClick={() => onNavigate('logbuch')} collapsed={collapsed} />
        )}
        {isAdmin && (
          <NavItem icon={<Settings size={16} />} label="Settings" active={page === 'settings'} onClick={() => onNavigate('settings')} collapsed={collapsed} />
        )}
        <NavItem icon={<Info size={16} />} label="About" active={page === 'about'} onClick={() => onNavigate('about')} collapsed={collapsed} />

        {/* Sidebar widgets (hidden when collapsed) */}
        {!collapsed && sidebarWidgets.length > 0 && (
          <div className="sidebar-widgets-section">
            <span className="nav-section-label" style={{ marginTop: 16 }}>Widgets</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
              {sidebarWidgets.map(widget => (
                <SidebarWidget key={widget.id} widget={widget} />
              ))}
            </div>
          </div>
        )}

        {/* Collapse toggle at bottom */}
        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}>
          <button
            className="nav-item sidebar-collapse-btn"
            onClick={toggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ width: '100%', background: 'none', justifyContent: collapsed ? 'center' : 'flex-end', paddingRight: collapsed ? undefined : 14 }}
          >
            {collapsed ? <ChevronRight size={16} /> : <><span style={{ fontSize: 12, marginRight: 4 }}>Collapse</span><ChevronLeft size={16} /></>}
          </button>
        </div>
      </aside>

      {/* Mobile bottom navigation */}
      <BottomNavBar page={page} onNavigate={onNavigate} />
    </>
  )
}

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({ icon, label, active, onClick, collapsed }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; collapsed?: boolean
}) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={{
        width: '100%',
        textAlign: 'left',
        background: 'none',
        fontFamily: 'var(--font-sans)',
        justifyContent: collapsed ? 'center' : undefined,
      }}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  )
}

// ── Bottom navigation bar (mobile only) ────────────────────────────────────────

function BottomNavBar({ page, onNavigate }: { page: string; onNavigate: (p: string) => void }) {
  const { isAdmin, isAuthenticated, authUser, userGroups } = useStore()
  const { instances } = useArrStore()
  const userGroupData = userGroups.find(g => g.id === authUser?.groupId)
  const canSeeDocker = isAdmin || (userGroupData?.docker_access ?? false)

  const items: { icon: React.ReactNode; label: string; target: string; show: boolean }[] = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', target: 'dashboard', show: true },
    { icon: <AppWindow size={20} />, label: 'Apps', target: 'services', show: isAuthenticated },
    { icon: <Tv2 size={20} />, label: 'Media', target: 'media', show: isAuthenticated && (isAdmin || instances.length > 0) },
    { icon: <Container size={20} />, label: 'Docker', target: 'docker', show: canSeeDocker },
    { icon: <Home size={20} />, label: 'Home', target: 'home_assistant', show: isAuthenticated },
    { icon: <Settings size={20} />, label: 'Settings', target: 'settings', show: isAdmin },
  ]

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {items.filter(i => i.show).map(item => (
        <button
          key={item.target}
          className={`bottom-nav-item${page === item.target ? ' active' : ''}`}
          onClick={() => onNavigate(item.target)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

// ── SidebarWidget ─────────────────────────────────────────────────────────────

function SidebarWidget({ widget }: { widget: Widget }) {
  const { stats } = useWidgetStore()
  const { containers } = useDockerStore()
  const s = stats[widget.id]

  const row = (label: string, value: string, color?: string) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: color ?? 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{value}</span>
    </div>
  )

  const pctColor = (pct: number) =>
    pct >= 90 ? 'var(--status-offline)' : pct >= 70 ? '#f59e0b' : 'var(--status-online)'

  let body: React.ReactNode = null

  if (widget.type === 'docker_overview') {
    const { running, stopped, restarting } = containerCounts(containers)
    body = <>
      {row('Total', String(containers.length))}
      {row('Running', String(running), 'var(--status-online)')}
      {stopped > 0 && row('Stopped', String(stopped), 'var(--text-muted)')}
      {restarting > 0 && row('Restarting', String(restarting), '#f59e0b')}
    </>
  } else if (!s) {
    return null
  } else if (widget.type === 'server_status' && 'cpu' in (s as object)) {
    const ss = s as ServerStats
    body = <>
      {row('CPU', `${Math.round(ss.cpu.load * 10) / 10}%`, pctColor(ss.cpu.load))}
      {ss.ram.total > 0 && row('RAM', `${Math.round((ss.ram.used / ss.ram.total) * 100)}%`, pctColor(Math.round(ss.ram.used / ss.ram.total * 100)))}
      {ss.disks.filter(d => d.total > 0).map(d => {
        const pct = Math.round((d.used / d.total) * 100)
        return row(d.name, `${pct}% · ${(d.used / 1024).toFixed(0)}/${(d.total / 1024).toFixed(0)} GB`, pctColor(pct))
      })}
    </>
  } else if ((widget.type === 'adguard_home' || widget.type === 'pihole') && 'total_queries' in (s as object)) {
    const ag = s as AdGuardStats
    const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
    if (ag.total_queries === -1) {
      body = <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Unreachable</span>
    } else {
      body = <>
        {row('Queries', fmt(ag.total_queries))}
        {row('Blocked', `${ag.blocked_percent}%`, 'var(--status-offline)')}
        {row('Status', ag.protection_enabled ? 'Protected' : 'Paused', ag.protection_enabled ? 'var(--status-online)' : '#f59e0b')}
      </>
    }
  } else if (widget.type === 'home_assistant' && Array.isArray(s)) {
    const entities = s as HaEntityState[]
    if (entities.length === 0) return null
    const haStateColor = (state: string): string | undefined => {
      if (['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(state)) return 'var(--status-online)'
      if (['off', 'closed', 'locked', 'paused', 'idle', 'standby'].includes(state)) return 'var(--text-muted)'
      return undefined
    }
    body = <>
      {entities.map(e => row(
        e.label || e.friendly_name || e.entity_id,
        e.state + (e.unit ? ` ${e.unit}` : ''),
        haStateColor(e.state)
      ))}
    </>
  } else if (widget.type === 'nginx_pm' && 'proxy_hosts' in (s as object)) {
    const npm = s as NpmStats
    body = <>
      {row('Proxies', String(npm.proxy_hosts))}
      {row('Streams', String(npm.streams))}
      {row('Certs', String(npm.certificates), npm.cert_expiring_soon > 0 ? '#f59e0b' : undefined)}
      {npm.cert_expiring_soon > 0 && row('Expiring', String(npm.cert_expiring_soon), '#f59e0b')}
    </>
  } else if (widget.type === 'calendar' && Array.isArray(s)) {
    const entries = s as CalendarEntry[]
    const upcoming = entries.slice(0, 3)
    if (upcoming.length === 0) return null
    const fmtDate = (d: string) => {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const dd = new Date(d + 'T00:00:00')
      if (dd.getTime() === today.getTime()) return 'Today'
      if (dd.getTime() === today.getTime() + 86400000) return 'Tomorrow'
      return dd.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    }
    body = <>
      {upcoming.map(e => (
        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10, flexShrink: 0 }}>{fmtDate(e.date)}</span>
          <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'right' }}>
            {e.title}{e.type === 'episode' && e.season_number != null ? ` S${String(e.season_number).padStart(2,'0')}E${String(e.episode_number ?? 0).padStart(2,'0')}` : ''}
          </span>
        </div>
      ))}
      {entries.length > 3 && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>+{entries.length - 3} more</span>}
    </>
  } else {
    return null
  }

  return (
    <div
      className="glass"
      style={{ borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>{widget.name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
        {body}
      </div>
    </div>
  )
}
