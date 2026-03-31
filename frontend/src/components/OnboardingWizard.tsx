import { useState } from 'react'
import { Check, X, ChevronRight, ChevronLeft, LayoutGrid, Sliders, Layers } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { api } from '../api'

interface Props {
  onClose: () => void
  onAddService: () => void
  onAddInstance: () => void
}

export function OnboardingWizard({ onClose, onAddService, onAddInstance }: Props) {
  const [step, setStep] = useState(0)
  const { services } = useStore()
  const { instances } = useArrStore()

  const totalSteps = 5

  const handleSkip = async () => {
    try {
      await api.settings.update({ onboarding_skipped_at: new Date().toISOString() } as Parameters<typeof api.settings.update>[0])
    } catch { /* ignore */ }
    onClose()
  }

  const handleComplete = async () => {
    try {
      await api.settings.update({ onboarding_completed: '1' } as Parameters<typeof api.settings.update>[0])
    } catch { /* ignore */ }
    onClose()
  }

  const dots = Array.from({ length: totalSteps }, (_, i) => i)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--spacing-lg)',
      }}
    >
      <div
        className="glass"
        style={{
          maxWidth: 640, width: '100%',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--spacing-2xl)',
          display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xl)',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          className="btn btn-ghost btn-icon"
          onClick={handleSkip}
          style={{ position: 'absolute', top: 16, right: 16 }}
        >
          <X size={16} />
        </button>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {dots.map(i => (
            <div
              key={i}
              style={{
                width: i === step ? 24 : 8, height: 8,
                borderRadius: 4,
                background: i === step ? 'var(--accent)' : i < step ? 'rgba(var(--accent-rgb),0.5)' : 'var(--glass-border)',
                transition: 'all var(--transition-base)',
              }}
            />
          ))}
        </div>

        {/* Step content */}
        {step === 0 && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>👋</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)', margin: 0 }}>
              Willkommen bei HELDASH
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, maxWidth: 460, margin: 0 }}>
              Dein persönliches Homelab-Dashboard. Lass uns in wenigen Schritten alles einrichten.
              Du kannst diesen Assistenten jederzeit in den Einstellungen erneut starten.
            </p>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <LayoutGrid size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>Services hinzufügen</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Services sind Kacheln auf dem Dashboard — z.B. Radarr, Sonarr, Nginx etc.
              Du kannst eigene Icons, URLs und Beschreibungen hinterlegen.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={services.length > 0 ? 'badge-success' : 'badge-neutral'} style={{ padding: '4px 12px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                {services.length} Service{services.length !== 1 ? 's' : ''} konfiguriert
              </span>
              <button className="btn btn-ghost" onClick={onAddService} style={{ gap: 6, fontSize: 13 }}>
                + Service hinzufügen
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Layers size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>Media-Instanzen verbinden</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Verbinde Radarr, Sonarr, Prowlarr und SABnzbd für detaillierte Stats,
              Kalender-Ansicht und Recyclarr-Integration.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={instances.length > 0 ? 'badge-success' : 'badge-neutral'} style={{ padding: '4px 12px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                {instances.length} Instanz{instances.length !== 1 ? 'en' : ''} konfiguriert
              </span>
              <button className="btn btn-ghost" onClick={onAddInstance} style={{ gap: 6, fontSize: 13 }}>
                + Instanz hinzufügen
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Sliders size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>Widgets aktivieren</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Widgets zeigen Live-Daten in der Topbar, Sidebar oder auf dem Dashboard an.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '🖥️', name: 'Server Status', desc: 'CPU, RAM, Disk-Auslastung' },
                { icon: '🛡️', name: 'AdGuard / Pi-hole', desc: 'DNS-Blocking-Statistiken' },
                { icon: '🏠', name: 'Home Assistant', desc: 'Smart-Home-Entitäten' },
                { icon: '📅', name: 'Kalender', desc: 'Geplante Releases' },
              ].map(w => (
                <div key={w.name} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{w.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{w.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
              Widgets → Seite "Widgets" → "+ Widget hinzufügen"
            </p>
          </div>
        )}

        {step === 4 && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'center' }}>
            <div
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(var(--accent-rgb), 0.15)',
                border: '2px solid var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 8,
              }}
            >
              <Check size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-primary)', margin: 0 }}>
              Dashboard ist bereit!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: 0 }}>
              Du kannst jederzeit über das Dashboard weitere Services und Widgets hinzufügen.
              Der Einrichtungsassistent ist in den Einstellungen verfügbar.
            </p>
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          {step === 0 ? (
            <button className="btn btn-ghost" onClick={handleSkip} style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Überspringen
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)} style={{ gap: 6 }}>
              <ChevronLeft size={15} />
              Zurück
            </button>
          )}

          {step < totalSteps - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} style={{ gap: 6 }}>
              Weiter
              <ChevronRight size={15} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleComplete} style={{ gap: 6 }}>
              <Check size={15} />
              Dashboard öffnen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
