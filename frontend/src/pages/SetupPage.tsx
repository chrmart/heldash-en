import { useState } from 'react'
import { useStore } from '../store/useStore'

export function SetupPage() {
  const { setupAdmin } = useStore()
  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.username.trim()) return setError('Username is required')
    if (!form.first_name.trim()) return setError('First name is required')
    if (!form.last_name.trim()) return setError('Last name is required')
    if (form.password.length < 8) return setError('Password must be at least 8 characters')
    if (form.password !== form.confirm) return setError('Passwords do not match')

    setLoading(true)
    try {
      await setupAdmin({
        username: form.username.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
      })
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-card glass">
        <div className="setup-logo">
          <img src="/favicon.png" alt="" className="setup-logo-icon" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <span className="setup-logo-text">HELDASH</span>
        </div>
        <h2 className="setup-title">Welcome — Create Admin Account</h2>
        <p className="setup-subtitle">
          Set up your administrator account to get started.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Username *</label>
            <input className="form-input" value={form.username} onChange={update('username')} autoFocus autoComplete="username" />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">First Name *</label>
              <input className="form-input" value={form.first_name} onChange={update('first_name')} autoComplete="given-name" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Last Name *</label>
              <input className="form-input" value={form.last_name} onChange={update('last_name')} autoComplete="family-name" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="form-input" type="email" value={form.email} onChange={update('email')} autoComplete="email" />
          </div>

          <div className="form-group">
            <label className="form-label">Password *</label>
            <input className="form-input" type="password" value={form.password} onChange={update('password')} autoComplete="new-password" />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password *</label>
            <input className="form-input" type="password" value={form.confirm} onChange={update('confirm')} autoComplete="new-password" />
          </div>

          {error && (
            <div className="setup-error">{error}</div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Setting up...</> : 'Create Account & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
