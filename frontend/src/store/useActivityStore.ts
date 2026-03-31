import { create } from 'zustand'
import { api } from '../api'

export interface ActivityEntry {
  id: string
  created_at: string
  category: string
  message: string
  severity: string
  meta: string | null
}

interface ActivityState {
  entries: ActivityEntry[]
  loading: boolean
  loadEntries: (category?: string) => Promise<void>
}

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],
  loading: false,

  loadEntries: async (category?: string) => {
    set({ loading: true })
    try {
      const data = await api.activity.list(category)
      set({ entries: data.entries })
    } finally {
      set({ loading: false })
    }
  },
}))
