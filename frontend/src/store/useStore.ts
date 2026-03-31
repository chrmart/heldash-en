import { create } from 'zustand'
import type { Service, Group, Settings, ThemeMode, ThemeAccent, AuthUser, UserRecord, UserGroup, Background } from '../types'
import { api } from '../api'
import { calcAutoTheme } from '../utils'
import { LS_GUEST_THEME_MODE, LS_GUEST_THEME_ACCENT } from '../constants'
import { applyLanguage } from '../i18n'

interface AppState {
  // App data
  services: Service[]
  groups: Group[]
  settings: Settings | null
  loading: boolean
  error: string | null

  // Auth state
  authUser: AuthUser | null
  isAuthenticated: boolean
  isAdmin: boolean
  needsSetup: boolean
  authReady: boolean

  // User management data
  users: UserRecord[]
  userGroups: UserGroup[]

  // App data actions
  loadAll: () => Promise<void>
  loadServices: () => Promise<void>
  createService: (data: Partial<Service>) => Promise<string>
  uploadServiceIcon: (id: string, file: File) => Promise<void>
  updateService: (id: string, data: Partial<Service>) => Promise<void>
  deleteService: (id: string) => Promise<void>
  checkService: (id: string) => Promise<void>
  checkAllServices: () => Promise<void>
  reorderGroups: (orderedIds: string[]) => Promise<void>
  reorderServices: (groupId: string | null, orderedIds: string[]) => Promise<void>

  loadGroups: () => Promise<void>
  createGroup: (data: Partial<Group>) => Promise<void>
  updateGroup: (id: string, data: Partial<Group>) => Promise<void>
  deleteGroup: (id: string) => Promise<void>

  loadSettings: () => Promise<void>
  updateSettings: (data: Partial<Settings>) => Promise<void>
  setThemeMode: (mode: ThemeMode) => Promise<void>
  setThemeAccent: (accent: ThemeAccent) => Promise<void>

  // Health polling
  startHealthPolling: () => void
  stopHealthPolling: () => void

  // Auth actions
  checkAuth: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setupAdmin: (data: { username: string; password: string; first_name: string; last_name: string; email?: string }) => Promise<void>

  // User management actions (admin-only)
  loadUsers: () => Promise<void>
  createUser: (data: Partial<UserRecord> & { password: string; user_group_id?: string }) => Promise<void>
  updateUser: (id: string, data: Partial<UserRecord> & { password?: string }) => Promise<void>
  deleteUser: (id: string) => Promise<void>
  loadUserGroups: () => Promise<void>
  createUserGroup: (data: { name: string; description?: string }) => Promise<void>
  deleteUserGroup: (id: string) => Promise<void>
  updateGroupVisibility: (groupId: string, hiddenServiceIds: string[]) => Promise<void>
  updateArrVisibility: (groupId: string, hiddenInstanceIds: string[]) => Promise<void>
  updateWidgetVisibility: (groupId: string, hiddenWidgetIds: string[]) => Promise<void>
  updateDockerAccess: (groupId: string, enabled: boolean) => Promise<void>
  updateDockerWidgetAccess: (groupId: string, enabled: boolean) => Promise<void>

  // Background images
  backgrounds: Background[]
  myBackground: string | null  // URL of the background assigned to the current user's group
  loadBackgrounds: () => Promise<void>
  loadMyBackground: () => Promise<void>
  uploadBackground: (name: string, file: File) => Promise<void>
  deleteBackground: (id: string) => Promise<void>
  setGroupBackground: (groupId: string, backgroundId: string | null) => Promise<void>
}

function parseService<T extends { tags: string | string[], check_enabled: number | boolean }>(s: T): T {
  return {
    ...s,
    tags: typeof s.tags === 'string' ? JSON.parse(s.tags) : s.tags,
    check_enabled: Boolean(s.check_enabled),
  }
}

let healthCheckInterval: ReturnType<typeof setInterval> | null = null

export const useStore = create<AppState>((set, get) => ({
  services: [],
  groups: [],
  settings: null,
  loading: false,
  error: null,

  authUser: null,
  isAuthenticated: false,
  isAdmin: false,
  needsSetup: false,
  authReady: false,

  users: [],
  userGroups: [],

  backgrounds: [],
  myBackground: null,

  // ── App data ────────────────────────────────────────────────────────────────

  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      const [services, groups, rawSettings] = await Promise.all([
        api.services.list(),
        api.groups.list(),
        api.settings.get(),
      ])
      const parsedServices = services.map(parseService)
      // Non-admins: apply locally stored theme preferences (no API write access)
      const settings = { ...rawSettings }
      if (!get().isAdmin) {
        const m = localStorage.getItem(LS_GUEST_THEME_MODE) as ThemeMode | null
        const a = localStorage.getItem(LS_GUEST_THEME_ACCENT) as ThemeAccent | null
        if (m) settings.theme_mode = m
        if (a) settings.theme_accent = a
      }
      set({ services: parsedServices, groups, settings, loading: false })
      applyTheme(settings)
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  loadServices: async () => {
    const services = await api.services.list()
    set({ services: services.map(parseService) })
  },

  createService: async (data) => {
    const parsed = parseService(await api.services.create(data))
    set(state => ({ services: [...state.services, parsed] }))
    if (parsed.check_enabled) {
      get().checkService(parsed.id).catch(() => { /* ignore */ })
    }
    return parsed.id
  },

  uploadServiceIcon: async (id, file) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const result = await api.services.uploadIcon(id, base64, file.type)
    set(state => ({
      services: state.services.map(s => s.id === id ? { ...s, icon_url: result.icon_url } : s),
    }))
  },

  updateService: async (id, data) => {
    const parsed = parseService(await api.services.update(id, data))
    set(state => ({ services: state.services.map(s => s.id === id ? parsed : s) }))
  },

  deleteService: async (id) => {
    await api.services.delete(id)
    set(state => ({ services: state.services.filter(s => s.id !== id) }))
  },

  checkService: async (id) => {
    const result = await api.services.check(id)
    set(state => ({
      services: state.services.map(s => s.id === id
        ? { ...s, last_status: result.status as Service['last_status'], last_checked: result.checked_at }
        : s
      )
    }))
  },

  reorderGroups: async (orderedIds) => {
    set(state => ({
      groups: orderedIds.map((id, i) => {
        const g = state.groups.find(g => g.id === id)!
        return { ...g, position: i }
      }),
    }))
    await Promise.all(orderedIds.map((id, i) => api.groups.update(id, { position: i })))
  },

  reorderServices: async (groupId, orderedIds) => {
    set(state => {
      const idxMap: Record<string, number> = Object.fromEntries(orderedIds.map((id, i) => [id, i]))
      return {
        services: state.services.map(s =>
          idxMap[s.id] !== undefined ? { ...s, position_x: idxMap[s.id] } : s
        ),
      }
    })
    await Promise.all(orderedIds.map((id, i) => api.services.update(id, { position_x: i })))
  },

  checkAllServices: async () => {
    const results = await api.services.checkAll()
    const map = Object.fromEntries(results.map(r => [r.id, r.status]))
    set(state => ({
      services: state.services.map(s => map[s.id]
        ? { ...s, last_status: map[s.id] as Service['last_status'], last_checked: new Date().toISOString() }
        : s
      )
    }))
  },

  loadGroups: async () => {
    const groups = await api.groups.list()
    set({ groups })
  },

  createGroup: async (data) => {
    const group = await api.groups.create(data)
    set(state => ({ groups: [...state.groups, group] }))
  },

  updateGroup: async (id, data) => {
    const group = await api.groups.update(id, data)
    set(state => ({ groups: state.groups.map(g => g.id === id ? group : g) }))
  },

  deleteGroup: async (id) => {
    await api.groups.delete(id)
    set(state => ({ groups: state.groups.filter(g => g.id !== id) }))
  },

  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
    applyTheme(settings)
  },

  updateSettings: async (data) => {
    const settings = await api.settings.update(data)
    set({ settings })
    applyTheme(settings)
  },

  setThemeMode: async (mode) => {
    if (get().isAdmin) {
      await get().updateSettings({ theme_mode: mode })
    } else {
      localStorage.setItem(LS_GUEST_THEME_MODE, mode)
      const settings = get().settings
      if (settings) {
        const updated = { ...settings, theme_mode: mode }
        set({ settings: updated })
        applyTheme(updated)
      }
    }
  },

  setThemeAccent: async (accent) => {
    if (get().isAdmin) {
      await get().updateSettings({ theme_accent: accent })
    } else {
      localStorage.setItem(LS_GUEST_THEME_ACCENT, accent)
      const settings = get().settings
      if (settings) {
        const updated = { ...settings, theme_accent: accent }
        set({ settings: updated })
        applyTheme(updated)
      }
    }
  },

  // ── Health polling ───────────────────────────────────────────────────────────

  startHealthPolling: () => {
    if (healthCheckInterval) return
    // Immediate first load so last_status from DB is shown without waiting 15s
    get().loadServices().catch(() => {})
    healthCheckInterval = setInterval(async () => {
      try { await get().loadServices() } catch { /* ignore */ }
    }, 15_000)
  },

  stopHealthPolling: () => {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval)
      healthCheckInterval = null
    }
  },

  // ── Auth ────────────────────────────────────────────────────────────────────

  checkAuth: async () => {
    try {
      const { needsSetup, user } = await api.auth.status()
      set({
        needsSetup,
        authUser: user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        authReady: true,
      })
    } catch {
      set({ authReady: true, needsSetup: false, isAuthenticated: false, isAdmin: false })
    }
  },

  login: async (username, password) => {
    const user = await api.auth.login(username, password)
    set({
      authUser: user,
      isAuthenticated: true,
      isAdmin: user.role === 'admin',
    })
  },

  logout: async () => {
    await api.auth.logout()
    set({ authUser: null, isAuthenticated: false, isAdmin: false })
    // Auto-refresh page after logout
    setTimeout(() => window.location.reload(), 100)
  },

  setupAdmin: async (data) => {
    const user = await api.auth.setup(data)
    set({
      authUser: user,
      isAuthenticated: true,
      isAdmin: user.role === 'admin',
      needsSetup: false,
    })
  },

  // ── User management ─────────────────────────────────────────────────────────

  loadUsers: async () => {
    const users = await api.users.list()
    set({ users })
  },

  createUser: async (data) => {
    const user = await api.users.create(data)
    set(state => ({ users: [...state.users, user] }))
  },

  updateUser: async (id, data) => {
    const user = await api.users.update(id, data)
    set(state => ({ users: state.users.map(u => u.id === id ? user : u) }))
  },

  deleteUser: async (id) => {
    await api.users.delete(id)
    set(state => ({ users: state.users.filter(u => u.id !== id) }))
  },

  loadUserGroups: async () => {
    const userGroups = await api.userGroups.list()
    set({ userGroups })
  },

  createUserGroup: async (data) => {
    const group = await api.userGroups.create(data)
    set(state => ({ userGroups: [...state.userGroups, { ...group, hidden_arr_ids: [], hidden_widget_ids: [] }] }))
  },

  deleteUserGroup: async (id) => {
    await api.userGroups.delete(id)
    set(state => ({ userGroups: state.userGroups.filter(g => g.id !== id) }))
  },

  updateGroupVisibility: async (groupId, hiddenServiceIds) => {
    await api.userGroups.updateVisibility(groupId, hiddenServiceIds)
    set(state => ({
      userGroups: state.userGroups.map(g =>
        g.id === groupId ? { ...g, hidden_service_ids: hiddenServiceIds } : g
      ),
    }))
  },

  updateArrVisibility: async (groupId, hiddenInstanceIds) => {
    await api.userGroups.updateArrVisibility(groupId, hiddenInstanceIds)
    set(state => ({
      userGroups: state.userGroups.map(g =>
        g.id === groupId ? { ...g, hidden_arr_ids: hiddenInstanceIds } : g
      ),
    }))
  },

  updateWidgetVisibility: async (groupId, hiddenWidgetIds) => {
    await api.userGroups.updateWidgetVisibility(groupId, hiddenWidgetIds)
    set(state => ({
      userGroups: state.userGroups.map(g =>
        g.id === groupId ? { ...g, hidden_widget_ids: hiddenWidgetIds } : g
      ),
    }))
  },

  updateDockerAccess: async (groupId, enabled) => {
    await api.userGroups.updateDockerAccess(groupId, enabled)
    set(state => ({
      userGroups: state.userGroups.map(g =>
        g.id === groupId ? { ...g, docker_access: enabled } : g
      ),
    }))
  },

  updateDockerWidgetAccess: async (groupId, enabled) => {
    await api.userGroups.updateDockerWidgetAccess(groupId, enabled)
    set(state => ({
      userGroups: state.userGroups.map(g =>
        g.id === groupId ? { ...g, docker_widget_access: enabled } : g
      ),
    }))
  },

  // ── Background images ────────────────────────────────────────────────────────

  loadBackgrounds: async () => {
    const backgrounds = await api.backgrounds.list()
    set({ backgrounds })
  },

  loadMyBackground: async () => {
    try {
      const result = await api.backgrounds.mine()
      set({ myBackground: result?.url ?? null })
    } catch {
      set({ myBackground: null })
    }
  },

  uploadBackground: async (name, file) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const bg = await api.backgrounds.upload(name, base64, file.type)
    set(state => ({ backgrounds: [bg, ...state.backgrounds] }))
  },

  deleteBackground: async (id) => {
    await api.backgrounds.delete(id)
    set(state => ({
      backgrounds: state.backgrounds.filter(b => b.id !== id),
      userGroups: state.userGroups.map(g => g.background_id === id ? { ...g, background_id: null } : g),
    }))
  },

  setGroupBackground: async (groupId, backgroundId) => {
    await api.backgrounds.setGroupBackground(groupId, backgroundId)
    set(state => ({
      userGroups: state.userGroups.map(g =>
        g.id === groupId ? { ...g, background_id: backgroundId } : g
      ),
    }))
  },
}))

function applyTheme(settings: Settings) {
  const root = document.documentElement
  const mode = settings.auto_theme_enabled
    ? calcAutoTheme(settings.auto_theme_light_start ?? '08:00', settings.auto_theme_dark_start ?? '20:00')
    : settings.theme_mode
  root.setAttribute('data-theme', mode)
  root.setAttribute('data-accent', settings.theme_accent)
  root.setAttribute('data-radius',     settings.design_border_radius ?? 'default')
  root.setAttribute('data-blur',       settings.design_glass_blur    ?? 'medium')
  root.setAttribute('data-density',    settings.design_density       ?? 'comfortable')
  root.setAttribute('data-animations', settings.design_animations    ?? 'full')
  root.setAttribute('data-sidebar',    settings.design_sidebar_style ?? 'default')
  // Sync i18next language whenever settings are applied
  if (settings.language) applyLanguage(settings.language)
  let el = document.getElementById('heldash-custom-css') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'heldash-custom-css'
    document.head.appendChild(el)
  }
  el.textContent = settings.design_custom_css ?? ''
}
