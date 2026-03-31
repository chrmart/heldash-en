import { create } from 'zustand'
import { api } from '../api'
import type { ArrInstance, ArrStatus, ArrStats, ArrQueueResponse, ArrCalendarItem, ProwlarrIndexer, SabnzbdQueueData, SabnzbdHistoryData, SeerrRequestsResponse, RadarrMovie, SonarrSeries, ArrCustomFormat, ArrCFSpecification, ArrQualityProfile, ArrCFSchema } from '../types/arr'
import type { SeerrMediaSeasonStatus } from '../types/seerr'
import type { UserCfFile } from '../types/recyclarr'

interface ArrState {
  instances: ArrInstance[]
  statuses: Record<string, ArrStatus>
  stats: Record<string, ArrStats>
  queues: Record<string, ArrQueueResponse>
  calendars: Record<string, ArrCalendarItem[]>
  indexers: Record<string, ProwlarrIndexer[]>
  sabQueues: Record<string, SabnzbdQueueData>
  histories: Record<string, SabnzbdHistoryData>
  seerrRequests: Record<string, SeerrRequestsResponse>
  seerrTvStatus: Record<number, { status: number; seasons?: SeerrMediaSeasonStatus[] }>
  seerrMovieStatus: Record<number, { status: number }>
  movies: Record<string, RadarrMovie[]>
  series: Record<string, SonarrSeries[]>

  loadInstances: () => Promise<void>
  loadAllStats: () => Promise<void>
  loadStatus: (id: string) => Promise<void>
  loadStats: (id: string) => Promise<void>
  loadQueue: (id: string) => Promise<void>
  loadCalendar: (id: string) => Promise<void>
  loadIndexers: (id: string) => Promise<void>
  loadSabQueue: (id: string) => Promise<void>
  loadHistory: (id: string) => Promise<void>
  loadSeerrRequests: (id: string, filter?: string, page?: number) => Promise<void>
  loadSeerrTvStatus: (seerrId: string, tmdbId: number) => Promise<void>
  loadSeerrMovieStatus: (seerrId: string, tmdbId: number) => Promise<void>
  loadMovies: (id: string) => Promise<void>
  loadSeries: (id: string) => Promise<void>
  discoverRequest: (id: string, mediaType: 'movie' | 'tv', mediaId: number, seasons?: number[]) => Promise<unknown>
  seerrApprove: (id: string, requestId: number) => Promise<void>
  seerrDecline: (id: string, requestId: number) => Promise<void>
  seerrDelete: (id: string, requestId: number) => Promise<void>

  customFormats: Record<string, ArrCustomFormat[]>
  qualityProfiles: Record<string, ArrQualityProfile[]>
  cfLoading: Record<string, boolean>
  cfSchemas: Record<string, ArrCFSchema[]>
  userCfFiles: Record<string, UserCfFile[]>

  loadCustomFormats: (instanceId: string) => Promise<void>
  loadQualityProfiles: (instanceId: string) => Promise<void>
  createCustomFormat: (instanceId: string, data: { name: string; trash_id?: string; includeCustomFormatWhenRenaming?: boolean; specifications: ArrCFSpecification[] }) => Promise<ArrCustomFormat>
  updateCustomFormat: (instanceId: string, cfId: number, data: { name: string; trash_id?: string; includeCustomFormatWhenRenaming?: boolean; specifications: ArrCFSpecification[] }) => Promise<void>
  deleteCustomFormat: (instanceId: string, cfId: number, trashId?: string) => Promise<void>
  deleteUserCf: (service: 'radarr' | 'sonarr', trashId: string) => Promise<void>
  updateProfileScores: (instanceId: string, profileId: number, scores: { formatId: number; score: number }[]) => Promise<void>
  loadCfSchema: (instanceId: string) => Promise<void>
  loadUserCfFiles: (service: 'radarr' | 'sonarr') => Promise<void>

  createInstance: (data: { type: string; name: string; url: string; api_key: string }) => Promise<string>
  updateInstance: (id: string, data: { name?: string; url?: string; api_key?: string; enabled?: boolean; position?: number }) => Promise<void>
  deleteInstance: (id: string) => Promise<void>
  reorderInstances: (orderedIds: string[]) => Promise<void>
}

export const useArrStore = create<ArrState>((set, get) => ({
  instances: [],
  statuses: {},
  stats: {},
  queues: {},
  calendars: {},
  indexers: {},
  sabQueues: {},
  histories: {},
  seerrRequests: {},
  seerrTvStatus: {},
  seerrMovieStatus: {},
  movies: {},
  series: {},
  customFormats: {},
  qualityProfiles: {},
  cfLoading: {},
  cfSchemas: {},
  userCfFiles: {},

  loadInstances: async () => {
    const instances = await api.arr.instances.list()
    set({ instances })
  },

  loadAllStats: async () => {
    const { instances } = get()
    await Promise.allSettled(
      instances.filter(i => i.enabled).map(async (i) => {
        try {
          const [status, stats] = await Promise.all([
            api.arr.status(i.id),
            api.arr.stats(i.id),
          ])
          set(state => ({
            statuses: { ...state.statuses, [i.id]: status },
            stats: { ...state.stats, [i.id]: stats },
          }))
        } catch { /* keep previous state on error */ }
      })
    )
  },

  loadStatus: async (id) => {
    const status = await api.arr.status(id)
    set(state => ({ statuses: { ...state.statuses, [id]: status } }))
  },

  loadStats: async (id) => {
    const stats = await api.arr.stats(id)
    set(state => ({ stats: { ...state.stats, [id]: stats } }))
  },

  loadQueue: async (id) => {
    const queue = await api.arr.queue(id)
    set(state => ({ queues: { ...state.queues, [id]: queue } }))
  },

  loadCalendar: async (id) => {
    const calendar = await api.arr.calendar(id)
    set(state => ({ calendars: { ...state.calendars, [id]: calendar } }))
  },

  loadIndexers: async (id) => {
    const indexers = await api.arr.indexers(id)
    set(state => ({ indexers: { ...state.indexers, [id]: indexers } }))
  },

  loadSabQueue: async (id) => {
    const queue = await api.arr.sabQueue(id)
    set(state => ({ sabQueues: { ...state.sabQueues, [id]: queue } }))
  },

  loadHistory: async (id) => {
    const history = await api.arr.history(id)
    set(state => ({ histories: { ...state.histories, [id]: history } }))
  },

  loadSeerrRequests: async (id, filter, page = 1) => {
    try {
      const result = await api.arr.seerrRequests(id, page, filter)
      set(state => ({ seerrRequests: { ...state.seerrRequests, [id]: result } }))
    } catch { /* keep previous state on error — API independent */ }
  },

  loadSeerrTvStatus: async (seerrId, tmdbId) => {
    try {
      const detail = await api.arr.seerrTvDetail(seerrId, tmdbId)
      const info = detail.mediaInfo
        ? { status: detail.mediaInfo.status, seasons: detail.mediaInfo.seasons }
        : { status: 1 }  // not tracked by Seerr / not in Sonarr
      set(state => ({ seerrTvStatus: { ...state.seerrTvStatus, [tmdbId]: info } }))
    } catch { /* keep previous state — falls back to seerrRequests check */ }
  },

  loadSeerrMovieStatus: async (seerrId, tmdbId) => {
    try {
      const detail = await api.arr.seerrMovieDetail(seerrId, tmdbId)
      const info = detail.mediaInfo
        ? { status: detail.mediaInfo.status }
        : { status: 1 }  // not tracked by Seerr / not in Radarr
      set(state => ({ seerrMovieStatus: { ...state.seerrMovieStatus, [tmdbId]: info } }))
    } catch { /* keep previous state — falls back to seerrRequests check */ }
  },

  seerrApprove: async (id, requestId) => {
    await api.arr.seerrApprove(id, requestId)
  },

  seerrDecline: async (id, requestId) => {
    await api.arr.seerrDecline(id, requestId)
  },

  seerrDelete: async (id, requestId) => {
    await api.arr.seerrDelete(id, requestId)
  },

  loadMovies: async (id) => {
    try {
      const movies = await api.arr.movies(id)
      set(state => ({ movies: { ...state.movies, [id]: movies } }))
    } catch { /* keep previous state on error */ }
  },

  loadSeries: async (id) => {
    try {
      const series = await api.arr.series(id)
      set(state => ({ series: { ...state.series, [id]: series } }))
    } catch { /* keep previous state on error */ }
  },

  discoverRequest: async (id, mediaType, mediaId, seasons) => {
    const result = await api.arr.discoverRequest(id, mediaType, mediaId, seasons)
    // Refresh requests list so badge updates for newly-requested item
    try {
      const updated = await api.arr.seerrRequests(id, 1)
      set(state => ({ seerrRequests: { ...state.seerrRequests, [id]: updated } }))
    } catch { /* optional refresh */ }
    return result
  },

  loadCustomFormats: async (instanceId) => {
    set(s => ({ cfLoading: { ...s.cfLoading, [instanceId]: true } }))
    try {
      const cfs = await api.arr.customFormats.list(instanceId)
      set(s => ({
        customFormats: { ...s.customFormats, [instanceId]: cfs },
        cfLoading: { ...s.cfLoading, [instanceId]: false },
      }))
    } catch (e) {
      set(s => ({ cfLoading: { ...s.cfLoading, [instanceId]: false } }))
      throw e
    }
  },

  loadQualityProfiles: async (instanceId) => {
    const profiles = await api.arr.qualityProfiles.list(instanceId)
    set(s => ({ qualityProfiles: { ...s.qualityProfiles, [instanceId]: profiles } }))
  },

  createCustomFormat: async (instanceId, data) => {
    return await api.arr.customFormats.create(instanceId, data)
  },

  updateCustomFormat: async (instanceId, cfId, data) => {
    await api.arr.customFormats.update(instanceId, cfId, data)
  },

  deleteCustomFormat: async (instanceId, cfId, trashId) => {
    await api.arr.customFormats.delete(instanceId, cfId, trashId)
  },

  deleteUserCf: async (service, trashId) => {
    await api.recyclarr.deleteUserCf(service, trashId)
  },

  loadCfSchema: async (instanceId) => {
    if (get().cfSchemas[instanceId]) return
    const schema = await api.arr.cfSchema(instanceId)
    set(s => ({ cfSchemas: { ...s.cfSchemas, [instanceId]: schema } }))
  },

  loadUserCfFiles: async (service) => {
    const res = await api.recyclarr.listUserCfs(service)
    set(s => ({ userCfFiles: { ...s.userCfFiles, [service]: res.cfs } }))
  },

  updateProfileScores: async (instanceId, profileId, scores) => {
    await api.arr.qualityProfiles.updateScores(instanceId, profileId, scores)
  },

  createInstance: async (data) => {
    const instance = await api.arr.instances.create(data)
    set(state => ({ instances: [...state.instances, instance] }))
    return instance.id
  },

  updateInstance: async (id, data) => {
    const instance = await api.arr.instances.update(id, data)
    set(state => ({ instances: state.instances.map(i => i.id === id ? instance : i) }))
  },

  reorderInstances: async (orderedIds) => {
    // Optimistic update — apply new order immediately
    set(state => ({
      instances: orderedIds
        .map((id, i) => {
          const inst = state.instances.find(x => x.id === id)
          return inst ? { ...inst, position: i } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    }))
    // Persist all positions in parallel
    await Promise.allSettled(
      orderedIds.map((id, i) => api.arr.instances.update(id, { position: i }))
    )
  },

  deleteInstance: async (id) => {
    await api.arr.instances.delete(id)
    set(state => ({
      instances: state.instances.filter(i => i.id !== id),
      statuses: Object.fromEntries(Object.entries(state.statuses).filter(([k]) => k !== id)),
      stats: Object.fromEntries(Object.entries(state.stats).filter(([k]) => k !== id)),
      queues: Object.fromEntries(Object.entries(state.queues).filter(([k]) => k !== id)),
      calendars: Object.fromEntries(Object.entries(state.calendars).filter(([k]) => k !== id)),
      sabQueues: Object.fromEntries(Object.entries(state.sabQueues).filter(([k]) => k !== id)),
      histories: Object.fromEntries(Object.entries(state.histories).filter(([k]) => k !== id)),
      seerrRequests: Object.fromEntries(Object.entries(state.seerrRequests).filter(([k]) => k !== id)),
      movies: Object.fromEntries(Object.entries(state.movies).filter(([k]) => k !== id)),
      series: Object.fromEntries(Object.entries(state.series).filter(([k]) => k !== id)),
      customFormats: Object.fromEntries(Object.entries(state.customFormats).filter(([k]) => k !== id)),
      qualityProfiles: Object.fromEntries(Object.entries(state.qualityProfiles).filter(([k]) => k !== id)),
      cfLoading: Object.fromEntries(Object.entries(state.cfLoading).filter(([k]) => k !== id)),
      cfSchemas: Object.fromEntries(Object.entries(state.cfSchemas).filter(([k]) => k !== id)),
    }))
  },
}))
