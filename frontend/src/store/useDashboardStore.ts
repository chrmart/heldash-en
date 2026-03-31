import { create } from 'zustand'
import { api } from '../api'
import type { DashboardItem, DashboardGroup } from '../types'

interface DashboardState {
  items: DashboardItem[]
  groups: DashboardGroup[]
  editMode: boolean
  guestMode: boolean
  loading: boolean
  showVisibilityOverlay: boolean

  loadDashboard: () => Promise<void>
  setEditMode: (v: boolean) => void
  setGuestMode: (v: boolean) => Promise<void>
  setShowVisibilityOverlay: (v: boolean) => void

  addService: (refId: string) => Promise<void>
  addArrInstance: (refId: string) => Promise<void>
  addWidget: (refId: string) => Promise<void>
  addPlaceholder: (size: 'app' | 'instance' | 'row') => Promise<void>
  removeItem: (id: string) => Promise<void>
  removeByRef: (type: 'service' | 'arr_instance' | 'widget', refId: string) => Promise<void>
  reorder: (orderedIds: string[]) => Promise<void>

  createGroup: (name: string) => Promise<void>
  updateGroup: (id: string, data: { name?: string; col_span?: number }) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  reorderGroups: (orderedIds: string[]) => Promise<void>
  moveItemToGroup: (itemId: string, groupId: string | null) => Promise<void>
  reorderGroupItems: (groupId: string, orderedIds: string[]) => Promise<void>

  isOnDashboard: (type: 'service' | 'arr_instance' | 'widget', refId: string) => boolean
  getDashboardItemId: (type: 'service' | 'arr_instance' | 'widget', refId: string) => string | undefined
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  items: [],
  groups: [],
  editMode: false,
  guestMode: false,
  loading: false,
  showVisibilityOverlay: false,

  loadDashboard: async () => {
    set({ loading: true })
    try {
      const { groups, items } = await api.dashboard.list(get().guestMode)
      set({ items, groups })
    } finally {
      set({ loading: false })
    }
  },

  setEditMode: (v) => set({ editMode: v }),
  setShowVisibilityOverlay: (v) => set({ showVisibilityOverlay: v }),

  setGuestMode: async (v) => {
    set({ guestMode: v, editMode: false })
    const { groups, items } = await api.dashboard.list(v)
    set({ items, groups })
  },

  addService: async (refId) => {
    await api.dashboard.addItem('service', refId, get().guestMode)
    await get().loadDashboard()
  },

  addArrInstance: async (refId) => {
    await api.dashboard.addItem('arr_instance', refId, get().guestMode)
    await get().loadDashboard()
  },

  addWidget: async (refId) => {
    await api.dashboard.addItem('widget', refId, get().guestMode)
    await get().loadDashboard()
  },

  addPlaceholder: async (size) => {
    const type = size === 'widget' ? 'placeholder_widget' : size === 'row' ? 'placeholder_row' : 'placeholder_app'
    const raw = await api.dashboard.addItem(type, undefined, get().guestMode)
    set(state => ({
      items: [...state.items, { id: raw.id, type, position: raw.position } as import('../types').DashboardPlaceholderItem],
    }))
  },

  removeItem: async (id) => {
    set(state => ({ items: state.items.filter(i => i.id !== id) }))
    await api.dashboard.removeItem(id, get().guestMode)
  },

  removeByRef: async (type, refId) => {
    set(state => ({
      items: state.items.filter(i => !(i.type === type && 'ref_id' in i && i.ref_id === refId)),
    }))
    await api.dashboard.removeByRef(type, refId, get().guestMode)
  },

  reorder: async (orderedIds) => {
    set(state => {
      const map = new Map(state.items.map(i => [i.id, i]))
      const reordered = orderedIds
        .map((id, idx) => {
          const item = map.get(id)
          return item ? { ...item, position: idx } : null
        })
        .filter((x): x is DashboardItem => x !== null)
      return { items: reordered }
    })
    await api.dashboard.reorder(orderedIds, get().guestMode)
  },

  createGroup: async (name) => {
    const group = await api.dashboard.createGroup(name, get().guestMode)
    set(state => ({ groups: [...state.groups, { ...group, items: [] }] }))
  },

  updateGroup: async (id, data) => {
    await api.dashboard.updateGroup(id, data, get().guestMode)
    set(state => ({
      groups: state.groups.map(g => g.id === id ? { ...g, ...data } : g)
    }))
  },

  deleteGroup: async (id) => {
    const group = get().groups.find(g => g.id === id)
    await api.dashboard.deleteGroup(id, get().guestMode)
    set(state => ({
      groups: state.groups.filter(g => g.id !== id),
      items: [...state.items, ...(group?.items ?? [])],
    }))
  },

  reorderGroups: async (orderedIds) => {
    set(state => ({
      groups: orderedIds
        .map(id => state.groups.find(g => g.id === id)!)
        .map((g, i) => ({ ...g, position: i }))
    }))
    await api.dashboard.reorderGroups(orderedIds, get().guestMode)
  },

  moveItemToGroup: async (itemId, groupId) => {
    await api.dashboard.moveItemToGroup(itemId, groupId, get().guestMode)
    await get().loadDashboard()
  },

  reorderGroupItems: async (groupId, orderedIds) => {
    set(state => ({
      groups: state.groups.map(g => g.id !== groupId ? g : {
        ...g,
        items: orderedIds
          .map(id => g.items.find(i => i.id === id)!)
          .map((item, i) => ({ ...item, position: i }))
      })
    }))
    await api.dashboard.reorderGroupItems(groupId, orderedIds, get().guestMode)
  },

  isOnDashboard: (type, refId) => {
    const allItems = [...get().items, ...get().groups.flatMap(g => g.items)]
    return allItems.some(i => i.type === type && 'ref_id' in i && i.ref_id === refId)
  },

  getDashboardItemId: (type, refId) => {
    const allItems = [...get().items, ...get().groups.flatMap(g => g.items)]
    const item = allItems.find(i => i.type === type && 'ref_id' in i && i.ref_id === refId)
    return item?.id
  },
}))
