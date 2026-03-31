import { create } from 'zustand'
import { api } from '../api'
import type { DockerContainer, ContainerStats } from '../types'

interface DockerState {
  containers: DockerContainer[]
  stats: Record<string, ContainerStats>
  loading: boolean
  error: string | null

  loadContainers: () => Promise<void>
  loadStats: (id: string) => Promise<void>
  loadAllStats: () => Promise<void>
  controlContainer: (id: string, action: 'start' | 'stop' | 'restart') => Promise<void>
}

export const useDockerStore = create<DockerState>((set) => ({
  containers: [],
  stats: {},
  loading: false,
  error: null,

  loadContainers: async () => {
    set({ loading: true, error: null })
    try {
      const containers = await api.docker.containers()
      set({ containers, loading: false })
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  loadStats: async (id) => {
    try {
      const s = await api.docker.stats(id)
      set(state => ({ stats: { ...state.stats, [id]: s } }))
    } catch {
      // ignore stat errors (container may not be running)
    }
  },

  loadAllStats: async () => {
    try {
      const result = await api.docker.allStats()
      set({ stats: result })
    } catch {
      // ignore — Docker may be unavailable
    }
  },

  controlContainer: async (id, action) => {
    await api.docker.control(id, action)
  },
}))
