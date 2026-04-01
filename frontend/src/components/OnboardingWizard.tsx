import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, ChevronRight, ChevronLeft, Globe, LayoutGrid, Sliders, Layers } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { api } from '../api'
import { applyLanguage } from '../i18n'

interface Props {
  onClose: () => void
  onAddService: () => void
  onAddInstance: () => void
}

const LANGUAGES = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
]

export function OnboardingWizard({ onClose, onAddService, onAddInstance }: Props) {
  const [step, setStep] = useState(0)
  const { services, updateSettings } = useStore()
  const { instances } = useArrStore()
  const { t, i18n } = useTranslation()

  const totalSteps = 6

  const handleLangChange = async (code: string) => {
    applyLanguage(code)
    try { await updateSettings({ language: code }) } catch { /* ignore */ }
  }

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

        {/* Step 0 — Language picker */}
        {step === 0 && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'center' }}>
            <Globe size={40} style={{ color: 'var(--accent)', marginBottom: 8 }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)', margin: 0 }}>
              {t('onboarding.step_lang.title')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, maxWidth: 400, margin: 0 }}>
              {t('onboarding.step_lang.hint')}
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => handleLangChange(lang.code)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 24px',
                    borderRadius: 'var(--radius-lg)',
                    fontSize: 15, fontWeight: i18n.language === lang.code ? 700 : 400,
                    background: i18n.language === lang.code ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--glass-bg)',
                    color: i18n.language === lang.code ? 'var(--accent)' : 'var(--text-primary)',
                    border: i18n.language === lang.code ? '2px solid var(--accent)' : '2px solid var(--glass-border)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{lang.flag}</span>
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>👋</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)', margin: 0 }}>
              {t('onboarding.step_welcome.title')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, maxWidth: 460, margin: 0 }}>
              {t('onboarding.step_welcome.body')}
            </p>
          </div>
        )}

        {/* Step 2 — Services */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <LayoutGrid size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>{t('onboarding.step_services.title')}</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              {t('onboarding.step_services.body')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={services.length > 0 ? 'badge-success' : 'badge-neutral'} style={{ padding: '4px 12px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                {t(services.length === 1 ? 'onboarding.step_services.configured_one' : 'onboarding.step_services.configured_other', { count: services.length })}
              </span>
              <button className="btn btn-ghost" onClick={onAddService} style={{ gap: 6, fontSize: 13 }}>
                {t('onboarding.step_services.add')}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Media */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Layers size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>{t('onboarding.step_media.title')}</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              {t('onboarding.step_media.body')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={instances.length > 0 ? 'badge-success' : 'badge-neutral'} style={{ padding: '4px 12px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                {t(instances.length === 1 ? 'onboarding.step_media.configured_one' : 'onboarding.step_media.configured_other', { count: instances.length })}
              </span>
              <button className="btn btn-ghost" onClick={onAddInstance} style={{ gap: 6, fontSize: 13 }}>
                {t('onboarding.step_media.add')}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Widgets */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Sliders size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>{t('onboarding.step_widgets.title')}</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              {t('onboarding.step_widgets.body')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '🖥️', nameKey: 'onboarding.widgets.server_status.name', descKey: 'onboarding.widgets.server_status.desc' },
                { icon: '🛡️', nameKey: 'onboarding.widgets.adguard.name',        descKey: 'onboarding.widgets.adguard.desc' },
                { icon: '🏠', nameKey: 'onboarding.widgets.home_assistant.name', descKey: 'onboarding.widgets.home_assistant.desc' },
                { icon: '📅', nameKey: 'onboarding.widgets.calendar.name',       descKey: 'onboarding.widgets.calendar.desc' },
              ].map(w => (
                <div key={w.nameKey} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{w.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t(w.nameKey)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t(w.descKey)}</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
              {t('onboarding.step_widgets.hint')}
            </p>
          </div>
        )}

        {/* Step 5 — Done */}
        {step === 5 && (
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
              {t('onboarding.step_done.title')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: 0 }}>
              {t('onboarding.step_done.body')}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          {step === 0 ? (
            <button className="btn btn-ghost" onClick={handleSkip} style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {t('onboarding.skip')}
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)} style={{ gap: 6 }}>
              <ChevronLeft size={15} />
              {t('onboarding.back')}
            </button>
          )}

          {step < totalSteps - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} style={{ gap: 6 }}>
              {t('onboarding.next')}
              <ChevronRight size={15} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleComplete} style={{ gap: 6 }}>
              <Check size={15} />
              {t('onboarding.finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


interface Props {
  onClose: () => void
  onAddService: () => void
  onAddInstance: () => void
}
