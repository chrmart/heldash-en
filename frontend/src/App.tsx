import { useEffect, useState, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useStore } from './store/useStore'
import { useDashboardStore } from './store/useDashboardStore'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Dashboard } from './pages/Dashboard'
import { ServicesPage } from './pages/ServicesPage'
import { SettingsPage } from './pages/Settings'
import { MediaPage } from './pages/MediaPage'
import { WidgetsPage } from './pages/WidgetsPage'
import { DockerPage } from './pages/DockerPage'
import { HaPage } from './pages/HaPage'
import { LogbuchPage } from './pages/LogbuchPage'
import { NetworkPage } from './pages/NetworkPage'
import { BackupPage } from './pages/BackupPage'
import { AboutPage } from './pages/AboutPage'
import { UnraidPage } from './pages/UnraidPage'
import { SetupPage } from './pages/SetupPage'
import { ChangelogModal } from './components/ChangelogModal'
import { ServiceModal } from './components/ServiceModal'
import { LoginModal } from './components/LoginModal'
import { ToastProvider, useToast } from './components/Toast'
import { ConfirmDialogProvider } from './components/ConfirmDialog'
import { OnboardingWizard } from './components/OnboardingWizard'
import type { Service } from './types'
import { calcAutoTheme } from './utils'
import { api } from './api'

// ── HA Alert SSE listener (must be inside ToastProvider) ──────────────────────

function HaAlertListener({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { toast } = useToast()

  useEffect(() => {
    if (!isAuthenticated) return
    const es = new EventSource('/api/ha/alerts/stream')
    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as {
          type?: string
          entityName?: string
          message?: string
          entityState?: string
        }
        if (data.type === 'ha_alert') {
          const label = data.entityName ?? ''
          const msg = data.message ?? ''
          const state = data.entityState ? ` (${data.entityState})` : ''
          toast({ message: `${label}: ${msg}${state}`, type: 'warning', duration: 6000 })
        }
      } catch { /* ignore malformed event */ }
    }
    return () => es.close()
  }, [isAuthenticated, toast])

  return null
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(_err: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div className="glass" style={{ padding: 32, borderRadius: 'var(--radius-xl)', maxWidth: 420, width: '100%', textAlign: 'center' }}>
            <h3 style={{ marginBottom: 12 }}>Something went wrong</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>{this.state.error.message}</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const { loadAll, loadServices, checkAllServices, checkAuth, startHealthPolling, settings, authReady, needsSetup, isAdmin, isAuthenticated, authUser, userGroups, myBackground, loadMyBackground } = useStore()
  const { loadDashboard } = useDashboardStore()
  const [page, setPage] = useState('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [editService, setEditService] = useState<Service | null>(null)
  const [checking, setChecking] = useState(false)
  const [showAddInstance, setShowAddInstance] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [showAddHaInstance, setShowAddHaInstance] = useState(false)
  const [showAddHaPanel, setShowAddHaPanel] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)

  useEffect(() => {
    checkAuth().then(() => Promise.all([loadAll(), loadDashboard(), loadMyBackground()])).then(() => startHealthPolling())
  }, [])

  // Load onboarding state after auth is ready
  useEffect(() => {
    if (!authReady || !isAdmin) return
    api.settings.get().then(s => {
      const completed = (s as Record<string, unknown>).onboarding_completed as string | undefined
      const skippedAt = (s as Record<string, unknown>).onboarding_skipped_at as string | null | undefined
      if (completed === '1') return
      if (skippedAt && skippedAt !== 'null') {
        const skippedDate = new Date(skippedAt)
        const daysSince = (Date.now() - skippedDate.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince < 7) return
      }
      setShowOnboarding(true)
    }).catch(() => {})
  }, [authReady, isAdmin])

  // Apply theme from settings
  useEffect(() => {
    if (settings) {
      document.documentElement.setAttribute('data-theme', settings.theme_mode)
      document.documentElement.setAttribute('data-accent', settings.theme_accent)
    }
  }, [settings])

  // Reload background after login/logout, apply as CSS variable
  useEffect(() => {
    loadMyBackground()
  }, [authUser?.sub])

  useEffect(() => {
    if (myBackground) {
      document.documentElement.style.setProperty('--user-bg-url', `url(${myBackground})`)
    } else {
      document.documentElement.style.removeProperty('--user-bg-url')
    }
  }, [myBackground])

  // Kick non-admins off settings page (e.g. after logout while on settings)
  useEffect(() => {
    if (authReady && !isAdmin && page === 'settings') {
      setPage('dashboard')
    }
  }, [isAdmin, authReady])

  // Kick users without docker access off docker page
  useEffect(() => {
    if (!authReady || page !== 'docker') return
    const groupData = userGroups.find(g => g.id === authUser?.groupId)
    const canSeeDocker = isAdmin || (groupData?.docker_access ?? false)
    if (!canSeeDocker) setPage('dashboard')
  }, [isAdmin, authReady, authUser, userGroups, page])

  // Auto theme: re-apply every 60s so switches happen on time
  useEffect(() => {
    if (!settings?.auto_theme_enabled) return
    const interval = setInterval(() => {
      const mode = calcAutoTheme(settings.auto_theme_light_start ?? '08:00', settings.auto_theme_dark_start ?? '20:00')
      document.documentElement.setAttribute('data-theme', mode)
    }, 60_000)
    return () => clearInterval(interval)
  }, [settings?.auto_theme_enabled, settings?.auto_theme_light_start, settings?.auto_theme_dark_start])

  const handleCheckAll = async () => {
    setChecking(true)
    await checkAllServices()
    setChecking(false)
  }

  const handleEditService = (service: Service) => {
    setEditService(service)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditService(null)
  }

  // Loading state while auth is being checked
  if (!authReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    )
  }

  // First-time setup
  if (needsSetup) {
    return <SetupPage />
  }

  return (
    <ToastProvider>
    <ConfirmDialogProvider>
    <>
      <HaAlertListener isAuthenticated={isAuthenticated} />
      {/* User-assigned background image */}
      {myBackground && (
        <div className="bg-user-image" style={{ backgroundImage: `url(${myBackground})` }} />
      )}

      {/* Ambient background orbs */}
      <div className="bg-orbs">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
      </div>

      <div className="app-layout">
        {isAuthenticated && (
          <Sidebar page={page} onNavigate={(p) => { setPage(p); if (p !== 'widgets') setShowAddWidget(false); if (p !== 'media') setShowAddInstance(false) }} />
        )}

        <div className="main-area">
          <Topbar
            page={page}
            onAddService={() => setShowModal(true)}
            onAddInstance={() => setShowAddInstance(true)}
            onAddWidget={() => setShowAddWidget(true)}
            onCheckAll={handleCheckAll}
            checking={checking}
            onLogin={() => setShowLogin(true)}
            onAddHaInstance={() => setShowAddHaInstance(true)}
            onAddHaPanel={() => setShowAddHaPanel(true)}
          />
          <div className="content-area">
            <div className="content-inner">
              {page === 'dashboard' && <Dashboard onEdit={handleEditService} />}
              {page === 'settings' && <SettingsPage onStartOnboarding={isAdmin ? () => setShowOnboarding(true) : undefined} />}
              {page === 'services' && <ServicesPage onEdit={handleEditService} />}
              {page === 'media' && (
                <MediaPage
                  showAddForm={showAddInstance}
                  onFormClose={() => setShowAddInstance(false)}
                  onNavigate={p => setPage(p)}
                />
              )}
              {page === 'widgets' && (
                <WidgetsPage
                  showAddForm={showAddWidget}
                  onFormClose={() => setShowAddWidget(false)}
                />
              )}
              {page === 'docker' && <DockerPage />}
              {page === 'home_assistant' && (
                <HaPage
                  showAddInstance={showAddHaInstance}
                  onAddInstanceClose={() => setShowAddHaInstance(false)}
                  showAddPanel={showAddHaPanel}
                  onAddPanelClose={() => setShowAddHaPanel(false)}
                />
              )}
              {page === 'logbuch' && <LogbuchPage />}
              {page === 'network' && <NetworkPage />}
              {page === 'backup' && <BackupPage />}
              {page === 'unraid' && <UnraidPage />}
              {page === 'about' && <AboutPage onShowChangelog={() => setShowChangelog(true)} />}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <ServiceModal
          service={editService}
          onClose={handleCloseModal}
        />
      )}

      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} />
      )}

      {showOnboarding && isAdmin && (
        <OnboardingWizard
          onClose={() => setShowOnboarding(false)}
          onAddService={() => { setShowOnboarding(false); setShowModal(true) }}
          onAddInstance={() => { setShowOnboarding(false); setShowAddInstance(true); setPage('media') }}
        />
      )}

      {showChangelog && (
        <ChangelogModal onClose={() => setShowChangelog(false)} />
      )}
    </>
    </ConfirmDialogProvider>
    </ToastProvider>
  )
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
