import { create } from 'zustand'
import { api } from '../api'
import type { Widget, WidgetStats } from '../types'
import { useDockerStore } from './useDockerStore'

// ── Centralized polling state (module scope, non-reactive) ────────────────────
const intervalMap = new Map<string, ReturnType<typeof setInterval>>()
const refCountMap = new Map<string, number>()

const POLL_INTERVALS: Record<string, number> = {
  server_status: 2000,
  adguard_home: 30000,
  pihole: 30000,
  docker_overview: 30000,
  nginx_pm: 60000,
  home_assistant: 30000,
  home_assistant_energy: 30000,
  calendar: 300000,
}

interface WidgetState {
  widgets: Widget[]
  stats: Record<string, WidgetStats>
  loading: boolean

  loadWidgets: () => Promise<void>
  createWidget: (data: { type: string; name: string; config: object; show_in_topbar?: boolean; display_location?: string }) => Promise<string>
  updateWidget: (id: string, data: Partial<{ name: string; config: object; show_in_topbar: boolean; display_location: string; position: number }>) => Promise<void>
  deleteWidget: (id: string) => Promise<void>
  uploadWidgetIcon: (id: string, data: string, contentType: string) => Promise<void>
  loadStats: (id: string) => Promise<void>
  setAdGuardProtection: (id: string, enabled: boolean) => Promise<void>
  triggerButton: (widgetId: string, buttonId: string) => Promise<void>
  haToggle: (widgetId: string, entityId: string, currentState: string) => Promise<void>
  setPiholeProtection: (widgetId: string, enabled: boolean) => Promise<void>
  startPolling: (widgetId: string, widgetType: string) => void
  stopPolling: (widgetId: string) => void
  startPollingAll: (widgets: { id: string; type: string }[]) => void
  stopPollingAll: () => void
}

export const useWidgetStore = create<WidgetState>((set, get) => ({
  widgets: [],
  stats: {},
  loading: false,

  loadWidgets: async () => {
    set({ loading: true })
    try {
      const widgets = await api.widgets.list()
      set({ widgets })
    } finally {
      set({ loading: false })
    }
  },

  createWidget: async (data) => {
    const widget = await api.widgets.create(data)
    set(state => ({ widgets: [...state.widgets, widget] }))
    return widget.id
  },

  updateWidget: async (id, data) => {
    const updated = await api.widgets.update(id, data)
    set(state => ({ widgets: state.widgets.map(w => w.id === id ? updated : w) }))
  },

  deleteWidget: async (id) => {
    await api.widgets.delete(id)
    set(state => ({
      widgets: state.widgets.filter(w => w.id !== id),
      stats: Object.fromEntries(Object.entries(state.stats).filter(([k]) => k !== id)),
    }))
  },

  uploadWidgetIcon: async (id, data, contentType) => {
    const { icon_url } = await api.widgets.uploadIcon(id, data, contentType)
    set(state => ({ widgets: state.widgets.map(w => w.id === id ? { ...w, icon_url } : w) }))
  },

  loadStats: async (id) => {
    try {
      const s = await api.widgets.stats(id)
      set(state => ({ stats: { ...state.stats, [id]: s } }))
    } catch {
      // ignore stat errors (server may not be Linux / AdGuard unreachable)
    }
  },

  setAdGuardProtection: async (id, enabled) => {
    await api.widgets.setAdGuardProtection(id, enabled)
    // Reload stats so protection_enabled reflects the new state
    await get().loadStats(id)
  },

  triggerButton: async (widgetId, buttonId) => {
    await api.widgets.triggerButton(widgetId, buttonId)
  },

  haToggle: async (widgetId, entityId, currentState) => {
    await api.widgets.haToggle(widgetId, entityId, currentState)
    await get().loadStats(widgetId)
    setTimeout(() => get().loadStats(widgetId).catch(() => {}), 2000)
  },

  setPiholeProtection: async (widgetId, enabled) => {
    await api.widgets.setPiholeProtection(widgetId, enabled)
    await get().loadStats(widgetId)
  },

  startPolling: (widgetId, widgetType) => {
    const count = (refCountMap.get(widgetId) ?? 0) + 1
    refCountMap.set(widgetId, count)
    if (count === 1) {
      const ms = POLL_INTERVALS[widgetType] ?? 30000
      let id: ReturnType<typeof setInterval>
      if (widgetType === 'docker_overview') {
        id = setInterval(() => { useDockerStore.getState().loadContainers().catch(() => {}) }, ms)
      } else {
        if (!(widgetType in POLL_INTERVALS)) {
          console.warn(`[useWidgetStore] Unknown widget type "${widgetType}" — using default 30s interval`)
        }
        id = setInterval(() => { useWidgetStore.getState().loadStats(widgetId).catch(() => {}) }, ms)
      }
      intervalMap.set(widgetId, id)
    }
  },

  stopPolling: (widgetId) => {
    const count = (refCountMap.get(widgetId) ?? 1) - 1
    if (count <= 0) {
      const id = intervalMap.get(widgetId)
      if (id !== undefined) clearInterval(id)
      intervalMap.delete(widgetId)
      refCountMap.delete(widgetId)
    } else {
      refCountMap.set(widgetId, count)
    }
  },

  startPollingAll: (widgets) => {
    widgets.forEach(w => get().startPolling(w.id, w.type))
  },

  stopPollingAll: () => {
    const ids = [...intervalMap.keys()]
    ids.forEach(id => get().stopPolling(id))
  },
}))
