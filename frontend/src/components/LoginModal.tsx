import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { X, LogIn } from 'lucide-react'

interface Props {
  onClose: () => void
}

export function LoginModal({ onClose }: Props) {
  const { login, loadAll } = useStore()
  const { loadDashboard } = useDashboardStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) return setError('Username and password required')
    setLoading(true)
    try {
      await login(username.trim(), password)
      await Promise.all([loadAll(), loadDashboard()])
      onClose()
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 'var(--radius-xl)',
          padding: '40px 40px 36px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
        }}
      >
        {/* Close */}
        <button
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16 }}
        >
          <X size={16} />
        </button>

        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <img src="/favicon.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, color: 'var(--text-primary)' }}>
            HELDASH
          </span>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
          Welcome back
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 32 }}>
          Sign in to manage your dashboard
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Username</label>
            <input
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              style={{ fontSize: 14, padding: '10px 12px' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ fontSize: 14, padding: '10px 12px' }}
            />
          </div>

          {error && (
            <div className="setup-error">{error}</div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: 8, padding: '11px 20px', fontSize: 14, gap: 8, justifyContent: 'center' }}
          >
            {loading
              ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Signing in…</>
              : <><LogIn size={15} /> Sign in</>
            }
          </button>
        </form>
      </div>
    </div>
  )
}
