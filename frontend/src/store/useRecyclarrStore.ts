import { create } from 'zustand'
import { api } from '../api'
import type {
  RecyclarrProfile,
  RecyclarrCf,
  RecyclarrSettings,
  RecyclarrInstanceConfig,
  RecyclarrScoreOverride,
  RecyclarrUserCf,
  RecyclarrSyncLine,
  RecyclarrProfileConfig,
  ArrQualityProfile,
  ArrCustomFormat,
  ScoreChange,
  SyncHistoryEntry,
  BackupEntry,
} from '../types/recyclarr'

interface ArrData {
  profiles: ArrQualityProfile[]
  customFormats: ArrCustomFormat[]
  error?: string
  loadedAt: number
}

interface RecyclarrState {
  profiles: { radarr: RecyclarrProfile[]; sonarr: RecyclarrProfile[] }
  cfs: { radarr: RecyclarrCf[]; sonarr: RecyclarrCf[] }
  profilesWarning: boolean
  cfsWarning: boolean
  settings: RecyclarrSettings | null
  configs: RecyclarrInstanceConfig[]
  syncSchedule: string
  syncLines: RecyclarrSyncLine[]
  syncDone: boolean
  syncing: boolean
  loading: boolean
  // arrData keyed by instanceId
  arrData: Record<string, ArrData>
  arrDataLoading: Record<string, boolean>
  syncHistory: SyncHistoryEntry[]
  backups: BackupEntry[]

  loadProfiles: (service: 'radarr' | 'sonarr', forceRefresh?: boolean) => Promise<void>
  loadCfs: (service: 'radarr' | 'sonarr', forceRefresh?: boolean) => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (settings: Partial<RecyclarrSettings>) => Promise<void>
  loadConfigs: () => Promise<void>
  saveSchedule: (syncSchedule: string) => Promise<void>
  loadSyncHistory: () => Promise<void>
  loadBackups: () => Promise<void>
  restoreBackup: (filename: string) => Promise<void>
  saveConfig: (instanceId: string, data: {
    enabled: boolean
    selectedProfiles: string[]
    scoreOverrides: RecyclarrScoreOverride[]
    userCfNames: RecyclarrUserCf[]
    preferredRatio: number
    profilesConfig: RecyclarrProfileConfig[]
    syncSchedule: string
    deleteOldCfs: boolean
    qualityDefType?: string
    yamlInstanceKey?: string
    lastKnownScores?: LastKnownScores
  }) => Promise<void>
  loadArrData: (instanceId: string) => Promise<ArrData>
  checkScoreChanges: (instanceId: string) => Promise<{ hasChanges: boolean; changes: ScoreChange[] }>
  acceptScoreChanges: (instanceId: string, changes: ScoreChange[]) => Promise<void>
  sync: (instanceId?: string) => void
  adoptCfs: () => Promise<{ ok: boolean; output: string }>
  resetConfig: () => Promise<void>
  clearCache: (service: 'radarr' | 'sonarr') => Promise<void>
}

export const useRecyclarrStore = create<RecyclarrState>((set, get) => ({
  profiles: { radarr: [], sonarr: [] },
  cfs: { radarr: [], sonarr: [] },
  profilesWarning: false,
  cfsWarning: false,
  settings: null,
  configs: [],
  syncSchedule: 'manual',
  syncLines: [],
  syncDone: false,
  syncing: false,
  loading: false,
  arrData: {},
  arrDataLoading: {},
  syncHistory: [],
  backups: [],

  loadProfiles: async (service, forceRefresh = false) => {
    const data = await api.recyclarr.profiles(service, forceRefresh)
    set(s => ({
      profiles: { ...s.profiles, [service]: data.profiles },
      profilesWarning: data.warning,
    }))
  },

  loadCfs: async (service, forceRefresh = false) => {
    const data = await api.recyclarr.cfs(service, forceRefresh)
    set(s => ({
      cfs: { ...s.cfs, [service]: data.cfs },
      cfsWarning: data.warning,
    }))
  },

  loadSettings: async () => {
    const data = await api.settings.get()
    set({
      settings: {
        containerName: (data.recyclarr_container_name as string | undefined) ?? 'recyclarr',
        configPath: (data.recyclarr_config_path as string | undefined) ?? '/recyclarr/recyclarr.yml',
      },
    })
  },

  saveSettings: async (settings) => {
    const patch: Record<string, string> = {}
    if (settings.containerName !== undefined) patch.recyclarr_container_name = settings.containerName
    if (settings.configPath !== undefined) patch.recyclarr_config_path = settings.configPath
    await api.settings.update(patch as Partial<import('../types').Settings>)
    await get().loadSettings()
  },

  loadConfigs: async () => {
    set({ loading: true })
    try {
      const data = await api.recyclarr.configs()
      set({ configs: data.configs, syncSchedule: data.syncSchedule ?? 'manual' })
    } finally {
      set({ loading: false })
    }
  },

  saveSchedule: async (syncSchedule: string) => {
    await api.recyclarr.saveSchedule(syncSchedule)
    set({ syncSchedule })
  },

  saveConfig: async (instanceId, data) => {
    await api.recyclarr.saveConfig(instanceId, data)
    await get().loadConfigs()
  },

  loadArrData: async (instanceId: string): Promise<ArrData> => {
    set(s => ({ arrDataLoading: { ...s.arrDataLoading, [instanceId]: true } }))
    try {
      const result = await api.recyclarr.arrData(instanceId)
      const data: ArrData = { ...result, loadedAt: Date.now() }
      set(s => ({
        arrData: { ...s.arrData, [instanceId]: data },
        arrDataLoading: { ...s.arrDataLoading, [instanceId]: false },
      }))
      return data
    } catch (e) {
      const data: ArrData = { profiles: [], customFormats: [], error: e instanceof Error ? e.message : 'Failed', loadedAt: Date.now() }
      set(s => ({
        arrData: { ...s.arrData, [instanceId]: data },
        arrDataLoading: { ...s.arrDataLoading, [instanceId]: false },
      }))
      return data
    }
  },

  checkScoreChanges: async (instanceId: string) => {
    const ad = get().arrData[instanceId]
    if (!ad || ad.profiles.length === 0) return { hasChanges: false, changes: [] }
    return api.recyclarr.checkScoreChanges(instanceId, ad.profiles)
  },

  acceptScoreChanges: async (instanceId: string, changes: ScoreChange[]) => {
    await api.recyclarr.acceptScoreChanges(instanceId, changes)
    // Reload configs to get updated lastKnownScores
    await get().loadConfigs()
  },

  sync: (instanceId?: string) => {
    const url = instanceId
      ? `/api/recyclarr/sync/${encodeURIComponent(instanceId)}`
      : '/api/recyclarr/global-sync'
    set({ syncing: true, syncLines: [], syncDone: false })

    const es = new EventSource(url)

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as RecyclarrSyncLine
        if (data.type === 'done' || data.type === 'error') {
          set(s => ({
            syncing: false,
            syncDone: true,
            syncLines: [...s.syncLines, data],
          }))
          es.close()
          get().loadConfigs().catch(() => {})
        } else {
          set(s => ({ syncLines: [...s.syncLines, data] }))
        }
      } catch { /* ignore parse error */ }
    }

    es.onerror = () => {
      set(s => ({
        syncing: false,
        syncLines: [...s.syncLines, { line: 'Connection lost', type: 'error' as const }],
        syncDone: true,
      }))
      es.close()
    }
  },

  adoptCfs: async () => {
    return api.recyclarr.adopt()
  },

  resetConfig: async () => {
    await api.recyclarr.resetConfig()
    await get().loadConfigs()
  },

  clearCache: async (service) => {
    await api.recyclarr.clearCache(service)
  },

  loadSyncHistory: async () => {
    const data = await api.recyclarr.syncHistory()
    set({ syncHistory: data.history })
  },

  loadBackups: async () => {
    const data = await api.recyclarr.backups()
    set({ backups: data.backups })
  },

  restoreBackup: async (filename: string) => {
    await api.recyclarr.restoreBackup(filename)
    await get().loadBackups()
  },
}))
