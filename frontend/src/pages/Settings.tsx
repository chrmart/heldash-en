import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { Plus, Trash2, Users, Shield, Pencil, X, Check, Eye, EyeOff, Settings, KeyRound, Upload, ImageIcon, Palette, AlertTriangle } from 'lucide-react'
import type { UserRecord, UserGroup, Service, Background, Settings as SettingsType } from '../types'
import type { ArrInstance } from '../types/arr'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'

type SettingsTab = 'general' | 'design' | 'users' | 'groups' | 'oidc'

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar({ active, onChange }: { active: SettingsTab; onChange: (t: SettingsTab) => void }) {
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings size={13} /> },
    { id: 'design',  label: 'Design',  icon: <Palette size={13} /> },
    { id: 'users',   label: 'Users',   icon: <Users size={13} /> },
    { id: 'groups',  label: 'Groups',  icon: <Shield size={13} /> },
    { id: 'oidc',    label: 'OIDC / SSO', icon: <KeyRound size={13} /> },
  ]
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2, alignSelf: 'center' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13, fontWeight: active === t.id ? 600 : 400,
            background: active === t.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
            color: active === t.id ? 'var(--accent)' : 'var(--text-secondary)',
            border: active === t.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Inline user edit form ─────────────────────────────────────────────────────
function UserEditRow({
  user,
  userGroups,
  isSelf,
  onSave,
  onCancel,
}: {
  user: UserRecord
  userGroups: UserGroup[]
  isSelf: boolean
  onSave: (data: { user_group_id: string | null; is_active: boolean; password?: string }) => Promise<void>
  onCancel: () => void
}) {
  const [groupId, setGroupId] = useState(user.user_group_id ?? '')
  const [isActive, setIsActive] = useState(user.is_active)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (password && password.length < 8) return setError('Password min. 8 Zeichen')
    setSaving(true)
    try {
      await onSave({
        user_group_id: groupId || null,
        is_active: isActive,
        ...(password ? { password } : {}),
      })
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass" style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Group</label>
          <select className="form-input" value={groupId} onChange={e => setGroupId(e.target.value)} style={{ fontSize: 13, padding: '5px 8px' }} disabled={isSelf}>
            <option value="">— no group —</option>
            {[...userGroups].sort((a, b) => a.name.localeCompare(b.name)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Active</label>
          <button
            type="button"
            onClick={() => setIsActive(a => !a)}
            disabled={isSelf}
            style={{
              padding: '5px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
              cursor: isSelf ? 'default' : 'pointer',
              background: isActive ? 'rgba(34,197,94,0.12)' : 'var(--glass-bg)',
              color: isActive ? 'var(--status-online)' : 'var(--text-muted)',
              border: `1px solid ${isActive ? 'rgba(34,197,94,0.25)' : 'var(--glass-border)'}`,
            }}
          >
            {isActive ? 'Active' : 'Disabled'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
          <label className="form-label" style={{ fontSize: 11 }}>New Password (optional)</label>
          <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave empty to keep" style={{ fontSize: 13, padding: '5px 8px' }} />
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ gap: 4, fontSize: 12 }}>
          <Check size={12} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ gap: 4, fontSize: 12 }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

// ── Reusable visibility checklist ─────────────────────────────────────────────
function VisibilityChecklist({
  label,
  items,
  hiddenIds,
  onSave,
}: {
  label: string
  items: { id: string; name: string; icon?: string | null; icon_url?: string | null }[]
  hiddenIds: string[]
  onSave: (hiddenIds: string[]) => Promise<void>
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set(hiddenIds))
  const [saving, setSaving] = useState(false)

  useEffect(() => { setHidden(new Set(hiddenIds)) }, [hiddenIds.join(',')])

  const toggle = (id: string) => {
    const next = new Set(hidden)
    next.has(id) ? next.delete(id) : next.add(id)
    setHidden(next)
    setSaving(true)
    onSave([...next]).finally(() => setSaving(false))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
        {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saving…</span>}
      </div>
      {items.length === 0
        ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None configured yet.</span>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {items.map(item => {
              const visible = !hidden.has(item.id)
              return (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={visible} onChange={() => toggle(item.id)} disabled={saving} style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  {item.icon_url
                    ? <img src={item.icon_url} alt="" style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }} />
                    : item.icon ? <span style={{ fontSize: 14, lineHeight: 1 }}>{item.icon}</span> : null
                  }
                  <span style={{ color: visible ? 'var(--text-primary)' : 'var(--text-muted)' }}>{item.name}</span>
                  {visible
                    ? <Eye size={11} style={{ color: 'var(--status-online)', marginLeft: 'auto' }} />
                    : <EyeOff size={11} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
                  }
                </label>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

// ── Per-group visibility editor ───────────────────────────────────────────────
function GroupVisibilityEditor({
  group, services, arrInstances, widgets, backgrounds,
  onSaveApps, onSaveArr, onSaveWidgets,
  onToggleDockerAccess, onToggleDockerWidgetAccess,
  onSetBackground,
}: {
  group: UserGroup
  services: Service[]
  arrInstances: ArrInstance[]
  widgets: { id: string; name: string; type: string }[]
  backgrounds: Background[]
  onSaveApps: (hiddenIds: string[]) => Promise<void>
  onSaveArr: (hiddenIds: string[]) => Promise<void>
  onSaveWidgets: (hiddenIds: string[]) => Promise<void>
  onToggleDockerAccess: (enabled: boolean) => void
  onToggleDockerWidgetAccess: (enabled: boolean) => void
  onSetBackground: (backgroundId: string | null) => void
}) {
  const [tab, setTab] = useState<'apps' | 'media' | 'widgets' | 'docker' | 'background'>('apps')
  // Non-docker widgets only in the widgets tab (docker_overview is managed via the Docker tab)
  const nonDockerWidgets = widgets.filter(w => w.type !== 'docker_overview')
  return (
    <div style={{ padding: '10px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['apps', 'media', 'widgets', 'docker', 'background'] as const).map(t => (
          <button
            key={t}
            className="btn btn-ghost btn-sm"
            onClick={() => setTab(t)}
            style={{ fontSize: 11, padding: '3px 10px', textTransform: 'capitalize', color: tab === t ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 0 }}
          >
            {t === 'apps' ? 'Apps' : t === 'media' ? 'Media' : t === 'widgets' ? 'Widgets' : t === 'docker' ? 'Docker' : 'Background'}
          </button>
        ))}
      </div>
      {tab === 'apps' && <VisibilityChecklist label="Visibility" items={services} hiddenIds={group.hidden_service_ids} onSave={onSaveApps} />}
      {tab === 'media' && <VisibilityChecklist label="Visibility" items={arrInstances.map(i => ({ id: i.id, name: i.name }))} hiddenIds={group.hidden_arr_ids} onSave={onSaveArr} />}
      {tab === 'widgets' && <VisibilityChecklist label="Visibility" items={nonDockerWidgets} hiddenIds={group.hidden_widget_ids ?? []} onSave={onSaveWidgets} />}
      {tab === 'docker' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Docker Permissions</div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={group.docker_access}
              onChange={e => onToggleDockerAccess(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14, marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Docker page in sidebar</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Allow access to the Docker containers page</div>
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={group.docker_widget_access}
              onChange={e => onToggleDockerWidgetAccess(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14, marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Docker Overview widget</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Show Docker Overview widgets on the dashboard</div>
            </div>
          </label>
        </div>
      )}
      {tab === 'background' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Dashboard Background</div>
          <select
            className="form-input"
            value={group.background_id ?? ''}
            onChange={e => onSetBackground(e.target.value || null)}
            style={{ fontSize: 13 }}
          >
            <option value="">— No background —</option>
            {[...backgrounds].sort((a, b) => a.name.localeCompare(b.name)).map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {backgrounds.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No backgrounds uploaded yet. Add them in Settings → General.</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Toggle button group ────────────────────────────────────────────────────────
function ToggleGroup<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; sub?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            fontWeight: value === o.value ? 600 : 400,
            background: value === o.value ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--glass-bg)',
            color: value === o.value ? 'var(--accent)' : 'var(--text-secondary)',
            border: value === o.value ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid var(--glass-border)',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {o.label}
          {o.sub && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{o.sub}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────
export function SettingsPage({ onStartOnboarding }: { onStartOnboarding?: () => void }) {
  const {
    settings, updateSettings, groups, createGroup, deleteGroup,
    services,
    isAdmin, authUser,
    users, loadUsers, createUser, updateUser, deleteUser,
    userGroups, loadUserGroups, createUserGroup, deleteUserGroup,
    updateGroupVisibility, updateArrVisibility, updateWidgetVisibility,
    updateDockerAccess, updateDockerWidgetAccess,
    backgrounds, loadBackgrounds, uploadBackground, deleteBackground, setGroupBackground,
  } = useStore()
  const { instances: arrInstances, loadInstances } = useArrStore()
  const { widgets, loadWidgets } = useWidgetStore()
  const { toast } = useToast()
  const { confirm: confirmDlg } = useConfirm()
  const { t } = useTranslation()

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const [title, setTitle] = useState(settings?.dashboard_title ?? 'HELDASH')
  const [newGroup, setNewGroup] = useState('')
  const [groupError, setGroupError] = useState('')
  const [saving, setSaving] = useState(false)

  const [tmdbKey, setTmdbKey] = useState(settings?.tmdb_api_key ?? '')
  const [tmdbKeySaving, setTmdbKeySaving] = useState(false)
  useEffect(() => { setTmdbKey(settings?.tmdb_api_key ?? '') }, [settings?.tmdb_api_key])

  const [autoTheme, setAutoTheme] = useState(settings?.auto_theme_enabled ?? false)
  const [lightStart, setLightStart] = useState(settings?.auto_theme_light_start ?? '08:00')
  const [darkStart, setDarkStart] = useState(settings?.auto_theme_dark_start ?? '20:00')
  const [autoThemeSaving, setAutoThemeSaving] = useState(false)

  const saveAutoTheme = async (enabled: boolean, ls: string, ds: string) => {
    setAutoThemeSaving(true)
    try { await updateSettings({ auto_theme_enabled: enabled, auto_theme_light_start: ls, auto_theme_dark_start: ds }) }
    finally { setAutoThemeSaving(false) }
  }

  const saveTmdbKey = async () => {
    setTmdbKeySaving(true)
    try {
      await updateSettings({ tmdb_api_key: tmdbKey.trim() })
      toast({ message: 'TMDB API key saved', type: 'success', duration: 1500 })
    } catch { /* ignore */ }
    finally { setTmdbKeySaving(false) }
  }

  const [newUser, setNewUser] = useState({ username: '', first_name: '', last_name: '', email: '', password: '', user_group_id: 'grp_guest' })
  const [userError, setUserError] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  const [newUG, setNewUG] = useState({ name: '', description: '' })
  const [ugError, setUgError] = useState('')

  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  // Background upload state
  const [bgName, setBgName] = useState('')
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [bgUploading, setBgUploading] = useState(false)
  const [bgError, setBgError] = useState('')
  const bgFileRef = useRef<HTMLInputElement>(null)

  // Design settings — sync when settings load
  const [customCss, setCustomCss] = useState(settings?.design_custom_css ?? '')
  useEffect(() => { setCustomCss(settings?.design_custom_css ?? '') }, [settings?.design_custom_css])
  const customCssTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveDesign = useCallback(async (patch: Partial<SettingsType>) => {
    try {
      await updateSettings(patch)
      toast({ message: 'Settings saved', type: 'success', duration: 1500 })
    } catch { /* ignore */ }
  }, [updateSettings, toast])

  const handleDesignChange = useCallback(<K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    saveDesign({ [key]: value })
  }, [saveDesign])

  const handleCustomCssChange = useCallback((value: string) => {
    setCustomCss(value)
    if (customCssTimer.current) clearTimeout(customCssTimer.current)
    customCssTimer.current = setTimeout(() => {
      saveDesign({ design_custom_css: value })
    }, 500)
  }, [saveDesign])

  useEffect(() => {
    if (isAdmin) {
      Promise.all([loadUsers(), loadUserGroups(), loadInstances(), loadWidgets(), loadBackgrounds()]).catch(() => {})
    }
  }, [isAdmin])

  if (!settings) return null

  const saveTitle = async () => {
    setSaving(true)
    try { await updateSettings({ dashboard_title: title }) }
    finally { setSaving(false) }
  }

  const handleAddGroup = async () => {
    if (!newGroup.trim()) return
    setGroupError('')
    try { await createGroup({ name: newGroup.trim() }); setNewGroup('') }
    catch (e: unknown) { setGroupError((e as Error).message ?? 'Failed to create group') }
  }

  const handleAddUser = async () => {
    setUserError('')
    if (!newUser.username.trim()) return setUserError('Username required')
    if (!newUser.first_name.trim()) return setUserError('First name required')
    if (!newUser.last_name.trim()) return setUserError('Last name required')
    if (newUser.password.length < 8) return setUserError('Password min. 8 characters')
    setAddingUser(true)
    try {
      await createUser({
        username: newUser.username.trim(),
        first_name: newUser.first_name.trim(),
        last_name: newUser.last_name.trim(),
        email: newUser.email.trim() || undefined,
        password: newUser.password,
        user_group_id: newUser.user_group_id || undefined,
      })
      setNewUser({ username: '', first_name: '', last_name: '', email: '', password: '', user_group_id: 'grp_guest' })
    } catch (e: unknown) {
      setUserError((e as Error).message)
    } finally {
      setAddingUser(false)
    }
  }

  const handleAddUserGroup = async () => {
    setUgError('')
    if (!newUG.name.trim()) return
    try { await createUserGroup({ name: newUG.name.trim(), description: newUG.description.trim() || undefined }); setNewUG({ name: '', description: '' }) }
    catch (e: unknown) { setUgError((e as Error).message ?? 'Failed to create group') }
  }

  const handleSaveUser = async (userId: string, data: Parameters<typeof updateUser>[1]) => {
    await updateUser(userId, data)
    setEditingUserId(null)
  }

  const groupName = (id: string | null) => {
    if (!id) return '—'
    const g = userGroups.find(g => g.id === id)
    return g ? g.name : '—'
  }

  const isAdminGroup = (id: string | null) => id === 'grp_admin'

  const handleBgUpload = async () => {
    if (!bgName.trim()) return setBgError('Name required')
    if (!bgFile) return setBgError('Please select an image')
    setBgError('')
    setBgUploading(true)
    try {
      await uploadBackground(bgName.trim(), bgFile)
      setBgName('')
      setBgFile(null)
      if (bgFileRef.current) bgFileRef.current.value = ''
    } catch (e: unknown) {
      setBgError((e as Error).message ?? 'Upload failed')
    } finally {
      setBgUploading(false)
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Tab bar */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* ── General ──────────────────────────────────────────────────────────── */}
      {activeTab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Dashboard title */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>General</h3>
            <div className="form-group">
              <label className="form-label">Dashboard Title</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} />
                <button className="btn btn-primary" onClick={saveTitle} disabled={saving} style={{ flexShrink: 0 }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Appearance</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Use the theme toggle (☀/🌙) and accent color dots in the top bar to change the look.
            </p>
            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Current:</span>
              <span className="glass" style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                {settings.theme_mode} / {settings.theme_accent}
              </span>
            </div>

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Auto Theme Schedule</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', marginBottom: 14 }}>
                <input
                  type="checkbox"
                  checked={autoTheme}
                  onChange={e => {
                    setAutoTheme(e.target.checked)
                    saveAutoTheme(e.target.checked, lightStart, darkStart)
                  }}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                />
                <span style={{ fontSize: 13 }}>Automatically switch dark/light mode by time of day</span>
              </label>
              {autoTheme && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 80 }}>☀ Light from</span>
                      <input
                        type="time"
                        className="form-input"
                        value={lightStart}
                        onChange={e => setLightStart(e.target.value)}
                        style={{ width: 110, fontSize: 13, padding: '4px 8px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 80 }}>🌙 Dark from</span>
                      <input
                        type="time"
                        className="form-input"
                        value={darkStart}
                        onChange={e => setDarkStart(e.target.value)}
                        style={{ width: 110, fontSize: 13, padding: '4px 8px' }}
                      />
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => saveAutoTheme(autoTheme, lightStart, darkStart)}
                      disabled={autoThemeSaving}
                      style={{ fontSize: 12 }}
                    >
                      {autoThemeSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Theme switches automatically every minute. The manual toggle in the topbar still works but will be overridden on the next tick.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* TMDB API Key */}
          {isAdmin && (
            <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
              <h3 style={{ marginBottom: 4, fontSize: 15, fontWeight: 600 }}>Integrations</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
                API keys for external services used by Heldash features.
              </p>
              <div className="form-group">
                <label className="form-label">
                  TMDB API Key
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                    — enables the Discover tab in Media. <a
                      href="https://www.themoviedb.org/settings/api"
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >Get a free key at themoviedb.org</a>
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    className="form-input"
                    value={tmdbKey}
                    onChange={e => setTmdbKey(e.target.value)}
                    placeholder="Paste your TMDB API key (v3 auth)"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
                  />
                  <button className="btn btn-primary" onClick={saveTmdbKey} disabled={tmdbKeySaving} style={{ flexShrink: 0 }}>
                    {tmdbKeySaving ? '...' : 'Save'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* App Groups */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>App Groups</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {groups.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No groups yet.</p>}
              {groups.map(g => (
                <div key={g.id} className="glass" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14 }}>{g.icon ? `${g.icon} ` : ''}{g.name}</span>
                  {isAdmin && (
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => deleteGroup(g.id)} style={{ padding: '4px', width: 28, height: 28 }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isAdmin && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="New group name" onKeyDown={e => e.key === 'Enter' && handleAddGroup()} />
                  <button className="btn btn-primary" onClick={handleAddGroup} style={{ flexShrink: 0 }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
                {groupError && <div style={{ fontSize: 12, color: 'var(--status-offline)', marginTop: 6 }}>{groupError}</div>}
              </>
            )}
          </section>

          {/* Localization */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 4, fontSize: 15, fontWeight: 600 }}>{t('settings.localization.title')}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              {t('settings.localization.hint')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Language */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('settings.localization.language')}</label>
                <select
                  className="form-input"
                  value={settings?.language ?? 'de'}
                  onChange={async e => {
                    try { await updateSettings({ language: e.target.value }); toast({ message: t('common.success'), type: 'success', duration: 1500 }) }
                    catch { /* ignore */ }
                  }}
                  style={{ fontSize: 13 }}
                >
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="en">🇺🇸 English</option>
                </select>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {t('settings.localization.language_hint')}
                </p>
              </div>

              {/* Time format */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{t('settings.localization.time_format')}</div>
                <ToggleGroup
                  options={[
                    { value: '24h' as const, label: '24h', sub: t('settings.localization.time_format_24h_sub') },
                    { value: '12h' as const, label: '12h', sub: t('settings.localization.time_format_12h_sub') },
                  ]}
                  value={settings?.time_format ?? '24h'}
                  onChange={async v => {
                    try { await updateSettings({ time_format: v }); toast({ message: t('common.success'), type: 'success', duration: 1500 }) }
                    catch { /* ignore */ }
                  }}
                />
              </div>

              {/* Temperature unit */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{t('settings.localization.temp_unit')}</div>
                <ToggleGroup
                  options={[
                    { value: 'celsius' as const, label: 'Celsius', sub: '°C' },
                    { value: 'fahrenheit' as const, label: 'Fahrenheit', sub: '°F' },
                  ]}
                  value={settings?.temp_unit ?? 'celsius'}
                  onChange={async v => {
                    try { await updateSettings({ temp_unit: v }); toast({ message: t('common.success'), type: 'success', duration: 1500 }) }
                    catch { /* ignore */ }
                  }}
                />
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {t('settings.localization.temp_unit_hint')}
                </p>
              </div>

            </div>
          </section>

          {/* Onboarding */}
          {isAdmin && onStartOnboarding && (
            <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
              <h3 style={{ marginBottom: 8, fontSize: 15, fontWeight: 600 }}>{t('settings.general.setup_wizard')}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {t('settings.general.setup_wizard_hint')}
              </p>
              <button className="btn btn-ghost" onClick={onStartOnboarding} style={{ gap: 6, fontSize: 13 }}>
                {t('settings.general.launch_wizard')}
              </button>
            </section>
          )}
        </div>
      )}

      {/* ── Design ───────────────────────────────────────────────────────────── */}
      {activeTab === 'design' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Appearance */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>Appearance</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Corner Style</div>
                <ToggleGroup
                  options={[
                    { value: 'sharp' as const, label: 'Sharp' },
                    { value: 'default' as const, label: 'Default' },
                    { value: 'rounded' as const, label: 'Rounded' },
                  ]}
                  value={settings?.design_border_radius ?? 'default'}
                  onChange={v => handleDesignChange('design_border_radius', v)}
                />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Background Blur</div>
                <ToggleGroup
                  options={[
                    { value: 'subtle' as const, label: 'Subtle', sub: 'Crisp' },
                    { value: 'medium' as const, label: 'Medium', sub: 'Balanced' },
                    { value: 'strong' as const, label: 'Strong', sub: 'Dreamy' },
                  ]}
                  value={settings?.design_glass_blur ?? 'medium'}
                  onChange={v => handleDesignChange('design_glass_blur', v)}
                />
              </div>
            </div>
          </section>

          {/* Layout & Density */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>Layout &amp; Density</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Spacing</div>
                <ToggleGroup
                  options={[
                    { value: 'compact' as const, label: 'Compact' },
                    { value: 'comfortable' as const, label: 'Comfortable' },
                    { value: 'spacious' as const, label: 'Spacious' },
                  ]}
                  value={settings?.design_density ?? 'comfortable'}
                  onChange={v => handleDesignChange('design_density', v)}
                />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Sidebar Style</div>
                <ToggleGroup
                  options={[
                    { value: 'default' as const, label: 'Default' },
                    { value: 'minimal' as const, label: 'Minimal' },
                    { value: 'floating' as const, label: 'Floating' },
                  ]}
                  value={settings?.design_sidebar_style ?? 'default'}
                  onChange={v => handleDesignChange('design_sidebar_style', v)}
                />
              </div>
            </div>
          </section>

          {/* Motion */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>Motion</h3>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Animation Level</div>
              <ToggleGroup
                options={[
                  { value: 'full' as const, label: 'Full' },
                  { value: 'reduced' as const, label: 'Reduced' },
                  { value: 'none' as const, label: 'None' },
                ]}
                value={settings?.design_animations ?? 'full'}
                onChange={v => handleDesignChange('design_animations', v)}
              />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                Reduced and None also respect system <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>prefers-reduced-motion</code>.
              </p>
            </div>
          </section>

          {/* Backgrounds */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 4, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ImageIcon size={15} /> Background Images
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Upload background images and assign them to user groups via Settings → Groups.
            </p>
            {backgrounds.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {backgrounds.map(bg => (
                  <div key={bg.id} className="glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                    <img src={bg.file_path} alt={bg.name} style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0, border: '1px solid var(--glass-border)' }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{bg.name}</span>
                    <button className="btn btn-danger btn-icon btn-sm" onClick={async () => { if (await confirmDlg({ title: `Delete "${bg.name}"?`, danger: true, confirmLabel: 'Delete' })) deleteBackground(bg.id) }} style={{ padding: '4px', width: 28, height: 28, flexShrink: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" placeholder="Background name" value={bgName} onChange={e => setBgName(e.target.value)} style={{ flex: 1 }} />
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  <Upload size={13} />
                  {bgFile ? bgFile.name : 'Choose image'}
                  <input
                    ref={bgFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f && f.size > 10 * 1024 * 1024) { setBgError('Max 10 MB'); return }
                      setBgError('')
                      setBgFile(f ?? null)
                    }}
                  />
                </label>
                <button className="btn btn-primary" onClick={handleBgUpload} disabled={bgUploading} style={{ flexShrink: 0 }}>
                  <Plus size={14} /> {bgUploading ? '…' : 'Upload'}
                </button>
              </div>
              {bgError && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{bgError}</div>}
            </div>
          </section>

          {/* Custom CSS */}
          <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>Custom CSS</h3>
            <div style={{ marginBottom: 12 }}>
              <span className="badge-warning">
                <AlertTriangle size={12} /> Incorrect CSS may break the interface
              </span>
            </div>
            <textarea
              className="form-input"
              rows={12}
              value={customCss}
              onChange={e => handleCustomCssChange(e.target.value)}
              placeholder="/* Add custom CSS overrides here */"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12, width: '100%', resize: 'vertical' }}
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Applied globally for all users.</p>
          </section>

        </div>
      )}

      {/* ── Users ────────────────────────────────────────────────────────────── */}
      {activeTab === 'users' && isAdmin && (
        <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={15} /> Users
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {users.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No users loaded.</p>}
            {users.map(u => (
              <div key={u.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {u.username}
                      {u.id === authUser?.sub && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', color: 'var(--accent)', border: '1px solid var(--glass-border)' }}>you</span>
                      )}
                      {!u.is_active && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}>disabled</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>{u.first_name} {u.last_name}</span>
                      {u.email && <span>{u.email}</span>}
                      <span style={{ color: isAdminGroup(u.user_group_id) ? 'var(--accent)' : 'inherit' }}>
                        {groupName(u.user_group_id)}
                      </span>
                      {u.last_login && <span>Last login: {new Date(u.last_login).toLocaleDateString(settings?.language ?? 'de')}</span>}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditingUserId(editingUserId === u.id ? null : u.id)} data-tooltip="Edit" style={{ padding: '4px', width: 28, height: 28, flexShrink: 0 }}>
                    <Pencil size={12} />
                  </button>
                  {u.id !== authUser?.sub && (
                    <button className="btn btn-danger btn-icon btn-sm" onClick={async () => { if (await confirmDlg({ title: `Delete "${u.username}"?`, danger: true, confirmLabel: 'Delete' })) deleteUser(u.id) }} data-tooltip="Delete" style={{ padding: '4px', width: 28, height: 28, flexShrink: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                {editingUserId === u.id && (
                  <UserEditRow
                    user={u}
                    userGroups={userGroups}
                    isSelf={u.id === authUser?.sub}
                    onSave={(data) => handleSaveUser(u.id, data)}
                    onCancel={() => setEditingUserId(null)}
                  />
                )}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Add User</div>
            <input className="form-input" placeholder="Username *" value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="First Name *" value={newUser.first_name} onChange={e => setNewUser(u => ({ ...u, first_name: e.target.value }))} style={{ flex: 1, minWidth: 0 }} />
              <input className="form-input" placeholder="Last Name *" value={newUser.last_name} onChange={e => setNewUser(u => ({ ...u, last_name: e.target.value }))} style={{ flex: 1, minWidth: 0 }} />
            </div>
            <input className="form-input" placeholder="Email (optional)" type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="form-label" style={{ fontSize: 11, whiteSpace: 'nowrap', margin: 0 }}>Group</label>
              <select className="form-input" value={newUser.user_group_id} onChange={e => setNewUser(u => ({ ...u, user_group_id: e.target.value }))} style={{ flex: 1, minWidth: 0 }}>
                {[...userGroups].sort((a, b) => a.name.localeCompare(b.name)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="Password (min. 8 chars) *" type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} style={{ flex: 1, minWidth: 0 }} />
              <button className="btn btn-primary" onClick={handleAddUser} disabled={addingUser} style={{ flexShrink: 0 }}>
                <Plus size={14} /> Add
              </button>
            </div>
            {userError && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{userError}</div>}
          </div>
        </section>
      )}

      {/* ── Groups ───────────────────────────────────────────────────────────── */}
      {activeTab === 'groups' && isAdmin && (
        <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={15} /> User Groups
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {userGroups.map(g => (
              <div key={g.id} className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {g.name}
                      {g.is_system && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}>system</span>
                      )}
                      {g.id === 'grp_admin' && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>full access</span>
                      )}
                    </div>
                    {g.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.description}</div>}
                  </div>
                  {g.id !== 'grp_admin' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setExpandedGroupId(expandedGroupId === g.id ? null : g.id)} style={{ fontSize: 11, gap: 4, padding: '4px 8px' }}>
                      <Eye size={11} />
                      {expandedGroupId === g.id ? 'Close' : 'Permissions'}
                    </button>
                  )}
                  {!g.is_system && (
                    <button className="btn btn-danger btn-icon btn-sm" onClick={async () => { if (await confirmDlg({ title: `Delete "${g.name}"?`, danger: true, confirmLabel: 'Delete' })) deleteUserGroup(g.id) }} style={{ padding: '4px', width: 28, height: 28, flexShrink: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                {expandedGroupId === g.id && g.id !== 'grp_admin' && (
                  <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <GroupVisibilityEditor
                      group={g}
                      services={services}
                      arrInstances={arrInstances}
                      widgets={widgets.map(w => ({ id: w.id, name: w.name, type: w.type }))}
                      backgrounds={backgrounds}
                      onSaveApps={(hiddenIds) => updateGroupVisibility(g.id, hiddenIds)}
                      onSaveArr={(hiddenIds) => updateArrVisibility(g.id, hiddenIds)}
                      onSaveWidgets={(hiddenIds) => updateWidgetVisibility(g.id, hiddenIds)}
                      onToggleDockerAccess={(enabled) => updateDockerAccess(g.id, enabled)}
                      onToggleDockerWidgetAccess={(enabled) => updateDockerWidgetAccess(g.id, enabled)}
                      onSetBackground={(bgId) => setGroupBackground(g.id, bgId)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="Group name" value={newUG.name} onChange={e => setNewUG(g => ({ ...g, name: e.target.value }))} style={{ flex: 1 }} />
            <input className="form-input" placeholder="Description (optional)" value={newUG.description} onChange={e => setNewUG(g => ({ ...g, description: e.target.value }))} style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={handleAddUserGroup} style={{ flexShrink: 0 }}>
              <Plus size={14} /> Add
            </button>
          </div>
          {ugError && <div style={{ fontSize: 12, color: 'var(--status-offline)', marginTop: 6 }}>{ugError}</div>}
        </section>
      )}

      {/* ── OIDC / SSO ───────────────────────────────────────────────────────── */}
      {activeTab === 'oidc' && (
        <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
          <h3 style={{ marginBottom: 6, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={15} /> OIDC / SSO
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
            OIDC/SSO integration will be configured here — not via environment variables.
            The fields below show the planned configuration options.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: 0.45, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Provider Name</label>
                <input className="form-input" placeholder="e.g. Authentik, voidauth, Keycloak" readOnly />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, userSelect: 'none', marginBottom: 6 }}>
                  <input type="checkbox" readOnly style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  Enabled
                </label>
              </div>
            </div>
            <div>
              <label className="form-label">Issuer / Discovery URL</label>
              <input className="form-input" placeholder="https://auth.example.com/application/o/heldash/" readOnly />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Client ID</label>
                <input className="form-input" placeholder="heldash" readOnly />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Client Secret</label>
                <input className="form-input" type="password" placeholder="••••••••••••••••" readOnly />
              </div>
            </div>
            <div>
              <label className="form-label">Scopes</label>
              <input className="form-input" placeholder="openid profile email" readOnly />
            </div>
            <div>
              <label className="form-label">Redirect URI (auto-generated)</label>
              <input className="form-input" placeholder="https://heldash.example.com/api/auth/oidc/callback" readOnly />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Default Group for new OIDC users</label>
                <select className="form-input" disabled><option>Guest</option></select>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, userSelect: 'none', marginBottom: 6 }}>
                  <input type="checkbox" readOnly style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  Auto-provision users
                </label>
              </div>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled>
              <Check size={14} /> Save
            </button>
          </div>

          <div style={{ marginTop: 20, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(var(--accent-rgb), 0.06)', border: '1px solid rgba(var(--accent-rgb), 0.2)', fontSize: 12, color: 'var(--text-secondary)' }}>
            Coming in a future release. User records are already prepared with <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>oidc_subject</code> and <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>oidc_provider</code> fields.
          </div>
        </section>
      )}

    </div>
  )
}
