import type { Service, Group, Settings, AuthUser, UserRecord, UserGroup, DashboardItem, DashboardGroup, DashboardResponse, Widget, WidgetStats, DockerContainer, ContainerStats, Background, HaInstance, HaPanel, HaEntityFull, HaArea, EnergyData, CalendarEntry, HaFloorplan, HaFloorplanEntity, HaAlert, HaHistoryEntry, NetworkDevice, NetworkDeviceHistory, ScanResult, BackupSource, BackupStatusResult, ResourceSnapshot, ChangelogRelease } from './types'
import type { SyncHistoryEntry, BackupEntry } from './types/recyclarr'
import type { UnraidInstance, UnraidInfo, UnraidArray, UnraidParityHistory, UnraidContainer, UnraidVm, UnraidShare, UnraidUser, UnraidNotifications, UnraidConfig, UnraidPhysicalDisk } from './types/unraid'
import type { ArrInstance, ArrStatus, ArrStats, ArrQueueResponse, ArrCalendarItem, ProwlarrIndexer, SabnzbdQueueData, SabnzbdHistoryData, SeerrRequest, SeerrRequestsResponse, RadarrMovie, SonarrSeries, ArrCustomFormat, ArrCFSpecification, ArrQualityProfile } from './types/arr'
import type { TmdbPage, TmdbGenre, TmdbProvider, TmdbTvDetail, TmdbDiscoverFilters } from './types/tmdb'
import type { SeerrTvDetail, SeerrMovieDetail } from './types/seerr'

const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ─── Services ─────────────────────────────────────────────────────────────────
export const api = {
  services: {
    list: () => req<Service[]>('/services'),
    create: (data: Partial<Service>) => req<Service>('/services', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Service>) => req<Service>(`/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/services/${id}`, { method: 'DELETE' }),
    check: (id: string) => req<{ id: string; status: string; checked_at: string }>(`/services/${id}/check`, { method: 'POST', body: JSON.stringify({}) }),
    checkAll: () => req<{ id: string; status: string }[]>('/services/check-all', { method: 'POST', body: JSON.stringify({}) }),
    uploadIcon: (id: string, data: string, contentType: string) =>
      req<{ icon_url: string }>(`/services/${id}/icon`, { method: 'POST', body: JSON.stringify({ data, content_type: contentType }) }),
    export: () => fetch('/api/services/export', { credentials: 'include' }).then(r => r.blob()),
    import: (services: Record<string, unknown>[]) => req<{ imported: number; skipped: number; total: number; errors?: string[] }>('/services/import', { method: 'POST', body: JSON.stringify({ services }) }),
  },

  groups: {
    list: () => req<Group[]>('/groups'),
    create: (data: Partial<Group>) => req<Group>('/groups', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Group>) => req<Group>(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/groups/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => req<Settings>('/settings'),
    update: (data: Partial<Settings>) => req<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  auth: {
    status: () => req<{ needsSetup: boolean; user: AuthUser | null }>('/auth/status'),
    setup: (data: { username: string; password: string; first_name: string; last_name: string; email?: string }) =>
      req<AuthUser>('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
    login: (username: string, password: string) =>
      req<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
    me: () => req<AuthUser>('/auth/me'),
  },

  users: {
    list: () => req<UserRecord[]>('/users'),
    create: (data: Partial<UserRecord> & { password: string; user_group_id?: string }) =>
      req<UserRecord>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<UserRecord> & { password?: string }) =>
      req<UserRecord>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/users/${id}`, { method: 'DELETE' }),
  },

  userGroups: {
    list: () => req<UserGroup[]>('/user-groups'),
    create: (data: { name: string; description?: string }) => req<UserGroup>('/user-groups', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/user-groups/${id}`, { method: 'DELETE' }),
    updateVisibility: (id: string, hiddenServiceIds: string[]) =>
      req<{ ok: boolean }>(`/user-groups/${id}/visibility`, {
        method: 'PUT',
        body: JSON.stringify({ hidden_service_ids: hiddenServiceIds }),
      }),
    updateArrVisibility: (id: string, hiddenArrIds: string[]) =>
      req<{ ok: boolean }>(`/user-groups/${id}/arr-visibility`, {
        method: 'PUT',
        body: JSON.stringify({ hidden_arr_ids: hiddenArrIds }),
      }),
    updateWidgetVisibility: (id: string, hiddenWidgetIds: string[]) =>
      req<{ ok: boolean }>(`/user-groups/${id}/widget-visibility`, {
        method: 'PUT',
        body: JSON.stringify({ hidden_widget_ids: hiddenWidgetIds }),
      }),
    updateDockerAccess: (id: string, enabled: boolean) =>
      req<{ ok: boolean }>(`/user-groups/${id}/docker-access`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    updateDockerWidgetAccess: (id: string, enabled: boolean) =>
      req<{ ok: boolean }>(`/user-groups/${id}/docker-widget-access`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
  },

  arr: {
    instances: {
      list: () => req<ArrInstance[]>('/arr/instances'),
      create: (data: { type: string; name: string; url: string; api_key: string; enabled?: boolean; position?: number }) =>
        req<ArrInstance>('/arr/instances', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name?: string; url?: string; api_key?: string; enabled?: boolean; position?: number }) =>
        req<ArrInstance>(`/arr/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/arr/instances/${id}`, { method: 'DELETE' }),
      updateVisibility: (groupId: string, hiddenInstanceIds: string[]) =>
        req<{ ok: boolean; hidden_instance_ids: string[] }>(`/arr/groups/${groupId}/visibility`, {
          method: 'PUT',
          body: JSON.stringify({ hidden_instance_ids: hiddenInstanceIds }),
        }),
    },
    status: (id: string) => req<ArrStatus>(`/arr/${id}/status`),
    stats: (id: string) => req<ArrStats>(`/arr/${id}/stats`),
    queue: (id: string) => req<ArrQueueResponse>(`/arr/${id}/queue`),
    sabQueue: (id: string) => req<SabnzbdQueueData>(`/arr/${id}/queue`),
    calendar: (id: string) => req<ArrCalendarItem[]>(`/arr/${id}/calendar`),
    indexers: (id: string) => req<ProwlarrIndexer[]>(`/arr/${id}/indexers`),
    history: (id: string) => req<SabnzbdHistoryData>(`/arr/${id}/history`),
    seerrRequests: (id: string, page = 1, filter?: string) => {
      const params = new URLSearchParams({ page: String(page) })
      if (filter && filter !== 'all') params.set('filter', filter)
      return req<SeerrRequestsResponse>(`/arr/${id}/requests?${params}`)
    },
    seerrApprove: (id: string, requestId: number) =>
      req<SeerrRequest>(`/arr/${id}/requests/${requestId}/approve`, { method: 'POST', body: JSON.stringify({}) }),
    seerrDecline: (id: string, requestId: number) =>
      req<SeerrRequest>(`/arr/${id}/requests/${requestId}/decline`, { method: 'POST', body: JSON.stringify({}) }),
    seerrDelete: (id: string, requestId: number) =>
      req<void>(`/arr/${id}/requests/${requestId}`, { method: 'DELETE' }),
    movies: (id: string) => req<RadarrMovie[]>(`/arr/${id}/movies`),
    series: (id: string) => req<SonarrSeries[]>(`/arr/${id}/series`),
    seerrTvDetail: (id: string, tmdbId: number) => req<SeerrTvDetail>(`/arr/${id}/tv/${tmdbId}`),
    seerrMovieDetail: (id: string, tmdbId: number) => req<SeerrMovieDetail>(`/arr/${id}/movie/${tmdbId}`),
    discoverRequest: (id: string, mediaType: 'movie' | 'tv', mediaId: number, seasons?: number[]) =>
      req<unknown>(`/arr/${id}/discover/request`, { method: 'POST', body: JSON.stringify({ mediaType, mediaId, seasons }) }),
    customFormats: {
      list: (id: string) => req<ArrCustomFormat[]>(`/arr/${id}/custom-formats`),
      create: (id: string, data: { name: string; trash_id?: string; includeCustomFormatWhenRenaming?: boolean; specifications: ArrCFSpecification[] }) =>
        req<ArrCustomFormat>(`/arr/${id}/custom-formats`, { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, cfId: number, data: { name: string; trash_id?: string; includeCustomFormatWhenRenaming?: boolean; specifications: ArrCFSpecification[] }) =>
        req<ArrCustomFormat>(`/arr/${id}/custom-formats/${cfId}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string, cfId: number, trashId?: string) =>
        req<void>(`/arr/${id}/custom-formats/${cfId}${trashId ? `?trashId=${encodeURIComponent(trashId)}` : ''}`, { method: 'DELETE' }),
    },
    cfSchema: (id: string) => req<import('./types/arr').ArrCFSchema[]>(`/arr/${id}/custom-format-schema`),
    qualityProfiles: {
      list: (id: string) => req<ArrQualityProfile[]>(`/arr/${id}/quality-profiles`),
      updateScores: (id: string, profileId: number, scores: { formatId: number; score: number }[]) =>
        req<{ ok: boolean }>(`/arr/${id}/quality-profiles/${profileId}/scores`, { method: 'PUT', body: JSON.stringify({ scores }) }),
    },
    calendarCombined: (instanceIds: string[]) =>
      req<{ items: CalendarEntry[]; fetched_at: string }>(`/arr/calendar/combined?instanceIds=${instanceIds.join(',')}`),
  },

  tmdb: {
    trending: (mediaType = 'all', timeWindow = 'day') => {
      const params = new URLSearchParams({ mediaType, timeWindow })
      return req<TmdbPage>(`/tmdb/trending?${params}`)
    },
    discoverMovies: (page = 1, sortBy = 'popularity.desc', filters?: TmdbDiscoverFilters) => {
      const params = new URLSearchParams({ page: String(page), sortBy })
      if (filters?.language) params.set('language', filters.language)
      if (filters?.genreIds?.length) params.set('genreIds', filters.genreIds.join(','))
      if (filters?.watchProviderIds?.length) params.set('watchProviders', filters.watchProviderIds.join(','))
      if (filters?.voteAverageGte) params.set('voteAverageGte', String(filters.voteAverageGte))
      if (filters?.releaseYearFrom) params.set('releaseDateGte', `${filters.releaseYearFrom}-01-01`)
      if (filters?.releaseYearTo) params.set('releaseDateLte', `${filters.releaseYearTo}-12-31`)
      return req<TmdbPage>(`/tmdb/discover/movie?${params}`)
    },
    discoverTv: (page = 1, sortBy = 'popularity.desc', filters?: TmdbDiscoverFilters) => {
      const params = new URLSearchParams({ page: String(page), sortBy })
      if (filters?.language) params.set('language', filters.language)
      if (filters?.genreIds?.length) params.set('genreIds', filters.genreIds.join(','))
      if (filters?.watchProviderIds?.length) params.set('watchProviders', filters.watchProviderIds.join(','))
      if (filters?.voteAverageGte) params.set('voteAverageGte', String(filters.voteAverageGte))
      if (filters?.releaseYearFrom) params.set('firstAirDateGte', `${filters.releaseYearFrom}-01-01`)
      if (filters?.releaseYearTo) params.set('firstAirDateLte', `${filters.releaseYearTo}-12-31`)
      return req<TmdbPage>(`/tmdb/discover/tv?${params}`)
    },
    search: (query: string, page = 1, language?: string) => {
      const params = new URLSearchParams({ query, page: String(page) })
      if (language) params.set('language', language)
      return req<TmdbPage>(`/tmdb/search?${params}`)
    },
    tvDetail: (tmdbId: number) => req<TmdbTvDetail>(`/tmdb/tv/${tmdbId}`),
    movieDetail: (tmdbId: number) => req<unknown>(`/tmdb/movie/${tmdbId}`),
    genres: (mediaType: 'movie' | 'tv') => req<{ genres: TmdbGenre[] }>(`/tmdb/genres/${mediaType}`),
    watchProviders: (mediaType: 'movie' | 'tv') => req<{ results: TmdbProvider[] }>(`/tmdb/watchproviders/${mediaType}`),
  },

  widgets: {
    list: () => req<Widget[]>('/widgets'),
    create: (data: { type: string; name: string; config: object; show_in_topbar?: boolean }) =>
      req<Widget>('/widgets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; config: object; show_in_topbar: boolean; position: number }>) =>
      req<Widget>(`/widgets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/widgets/${id}`, { method: 'DELETE' }),
    stats: (id: string) => req<WidgetStats>(`/widgets/${id}/stats`),
    setAdGuardProtection: (id: string, enabled: boolean) =>
      req<{ ok: boolean }>(`/widgets/${id}/adguard/protection`, {
        method: 'POST', body: JSON.stringify({ enabled }),
      }),
    triggerButton: (id: string, buttonId: string) =>
      req<{ ok: boolean; status: number }>(`/widgets/${id}/trigger`, { method: 'POST', body: JSON.stringify({ button_id: buttonId }) }),
    haToggle: (id: string, entityId: string, currentState: string) =>
      req<{ ok: boolean }>(`/widgets/${id}/ha/toggle`, { method: 'POST', body: JSON.stringify({ entity_id: entityId, current_state: currentState }) }),
    setPiholeProtection: (id: string, enabled: boolean) =>
      req<{ ok: boolean }>(`/widgets/${id}/pihole/protection`, { method: 'POST', body: JSON.stringify({ enabled }) }),
    uploadIcon: (id: string, data: string, contentType: string) =>
      req<{ icon_url: string }>(`/widgets/${id}/icon`, { method: 'POST', body: JSON.stringify({ data, content_type: contentType }) }),
  },

  dashboard: {
    list: (asGuest?: boolean) => req<DashboardResponse>(`/dashboard${asGuest ? '?as=guest' : ''}`),
    createGroup: (name: string, asGuest?: boolean) =>
      req<DashboardGroup>(`/dashboard/groups${asGuest ? '?as=guest' : ''}`,
        { method: 'POST', body: JSON.stringify({ name }) }),
    updateGroup: (id: string, data: { name?: string; col_span?: number }, asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/groups/${id}${asGuest ? '?as=guest' : ''}`,
        { method: 'PATCH', body: JSON.stringify(data) }),
    deleteGroup: (id: string, asGuest?: boolean) =>
      req<void>(`/dashboard/groups/${id}${asGuest ? '?as=guest' : ''}`, { method: 'DELETE' }),
    reorderGroups: (ids: string[], asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/groups/reorder${asGuest ? '?as=guest' : ''}`,
        { method: 'PATCH', body: JSON.stringify({ ids }) }),
    moveItemToGroup: (itemId: string, groupId: string | null, asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/items/${itemId}/group${asGuest ? '?as=guest' : ''}`,
        { method: 'PATCH', body: JSON.stringify({ group_id: groupId }) }),
    reorderGroupItems: (groupId: string, ids: string[], asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/groups/${groupId}/reorder-items${asGuest ? '?as=guest' : ''}`,
        { method: 'PATCH', body: JSON.stringify({ ids }) }),
    addItem: (type: string, ref_id?: string, asGuest?: boolean) =>
      req<{ id: string; type: string; ref_id: string | null; position: number }>(
        `/dashboard/items${asGuest ? '?as=guest' : ''}`, { method: 'POST', body: JSON.stringify({ type, ref_id }) }
      ),
    removeItem: (id: string, asGuest?: boolean) => req<void>(`/dashboard/items/${id}${asGuest ? '?as=guest' : ''}`, { method: 'DELETE' }),
    removeByRef: (type: string, ref_id: string, asGuest?: boolean) =>
      req<void>(`/dashboard/items/by-ref${asGuest ? '?as=guest' : ''}`, { method: 'DELETE', body: JSON.stringify({ type, ref_id }) }),
    reorder: (ids: string[], asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/reorder${asGuest ? '?as=guest' : ''}`, { method: 'PATCH', body: JSON.stringify({ ids }) }),
  },

  docker: {
    containers: () => req<DockerContainer[]>('/docker/containers'),
    stats: (id: string) => req<ContainerStats>(`/docker/containers/${id}/stats`),
    allStats: () => req<Record<string, ContainerStats>>('/docker/stats'),
    control: (id: string, action: 'start' | 'stop' | 'restart') =>
      req<{ ok: boolean }>(`/docker/containers/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }),
  },

  backgrounds: {
    list: () => req<Background[]>('/backgrounds'),
    mine: () => req<{ id: string; name: string; url: string } | null>('/backgrounds/mine'),
    upload: (name: string, data: string, content_type: string) =>
      req<Background>('/backgrounds', { method: 'POST', body: JSON.stringify({ name, data, content_type }) }),
    delete: (id: string) => req<void>(`/backgrounds/${id}`, { method: 'DELETE' }),
    setGroupBackground: (groupId: string, background_id: string | null) =>
      req<{ ok: boolean }>(`/user-groups/${groupId}/background`, {
        method: 'PUT',
        body: JSON.stringify({ background_id }),
      }),
  },

  ha: {
    instances: {
      list: () => req<HaInstance[]>('/ha/instances'),
      create: (data: { name: string; url: string; token: string; enabled?: boolean }) =>
        req<HaInstance>('/ha/instances', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name?: string; url?: string; token?: string; enabled?: boolean }) =>
        req<HaInstance>(`/ha/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/ha/instances/${id}`, { method: 'DELETE' }),
      test: (id: string) => req<{ ok: boolean; error?: string }>(`/ha/instances/${id}/test`, { method: 'POST', body: JSON.stringify({}) }),
      states: (id: string) => req<HaEntityFull[]>(`/ha/instances/${id}/states`),
      persons: (id: string) => req<import('./types').HaPersonEnriched[]>(`/ha/instances/${id}/persons`),
      areas: (id: string) => req<HaArea[]>(`/ha/instances/${id}/areas`),
      entityArea: (id: string, entityId: string) => req<{ area_id: string | null }>(`/ha/instances/${id}/entity-area?entity_id=${encodeURIComponent(entityId)}`),
      call: (id: string, domain: string, service: string, entity_id: string, service_data?: Record<string, unknown>) =>
        req<{ ok: boolean }>(`/ha/instances/${id}/call`, { method: 'POST', body: JSON.stringify({ domain, service, entity_id, service_data }) }),
    },
    energy: (instanceId: string, period: string) =>
      req<EnergyData>(`/ha/instances/${instanceId}/energy?period=${period}`),
    panels: {
      list: () => req<HaPanel[]>('/ha/panels'),
      add: (data: { instance_id: string; entity_id: string; label?: string; panel_type?: string }) =>
        req<HaPanel>('/ha/panels', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { label?: string; panel_type?: string; area_id?: string | null }) =>
        req<HaPanel>(`/ha/panels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/ha/panels/${id}`, { method: 'DELETE' }),
      reorder: (ids: string[]) => req<{ ok: boolean }>('/ha/panels/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    },
    alerts: {
      list: () => req<HaAlert[]>('/ha/alerts'),
      create: (data: { instance_id: string; entity_id: string; condition_type: string; condition_value?: string | null; message: string }) =>
        req<HaAlert>('/ha/alerts', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { condition_type?: string; condition_value?: string | null; message?: string; enabled?: boolean }) =>
        req<HaAlert>(`/ha/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/ha/alerts/${id}`, { method: 'DELETE' }),
    },
    history: (instanceId: string, entityId: string, hours: number) =>
      req<HaHistoryEntry[]>(`/ha/instances/${instanceId}/history?entity_id=${encodeURIComponent(entityId)}&hours=${hours}`),
    scenes: (instanceId: string) =>
      req<HaEntityFull[]>(`/ha/instances/${instanceId}/scenes`),
    automations: (instanceId: string) =>
      req<HaEntityFull[]>(`/ha/instances/${instanceId}/automations`),
    automationToggle: (instanceId: string, entityId: string) =>
      req<{ ok: boolean }>(`/ha/instances/${instanceId}/automations/${encodeURIComponent(entityId)}/toggle`, { method: 'POST', body: JSON.stringify({}) }),
    automationTrigger: (instanceId: string, entityId: string) =>
      req<{ ok: boolean }>(`/ha/instances/${instanceId}/automations/${encodeURIComponent(entityId)}/trigger`, { method: 'POST', body: JSON.stringify({}) }),
    floorplans: {
      list: () => req<HaFloorplan[]>('/ha/floorplans'),
      create: (data: { name: string; type?: string; level?: number; icon?: string; orientation?: string }) =>
        req<HaFloorplan>('/ha/floorplans', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name?: string; type?: string; level?: number; icon?: string; orientation?: string }) =>
        req<HaFloorplan>(`/ha/floorplans/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/ha/floorplans/${id}`, { method: 'DELETE' }),
      uploadImage: (id: string, data: string, content_type: string) =>
        req<{ url: string }>(`/ha/floorplans/${id}/image`, { method: 'POST', body: JSON.stringify({ data, content_type }) }),
      deleteImage: (id: string) => req<{ ok: boolean }>(`/ha/floorplans/${id}/image`, { method: 'DELETE' }),
      export: () => req<{ floorplans: HaFloorplan[]; entities: Record<string, HaFloorplanEntity[]> }>('/ha/floorplans/export'),
      import: (data: { floorplans: HaFloorplan[]; entities: Record<string, HaFloorplanEntity[]> }) =>
        req<{ imported: number; skipped: number }>('/ha/floorplans/import', { method: 'POST', body: JSON.stringify(data) }),
      entities: {
        list: (id: string) => req<HaFloorplanEntity[]>(`/ha/floorplans/${id}/entities`),
        add: (id: string, data: { entity_id: string; pos_x: number; pos_y: number; display_size?: string; show_label?: boolean }) =>
          req<HaFloorplanEntity>(`/ha/floorplans/${id}/entities`, { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, entityId: string, data: { pos_x?: number; pos_y?: number; display_size?: string; show_label?: boolean }) =>
          req<HaFloorplanEntity>(`/ha/floorplans/${id}/entities/${entityId}`, { method: 'PATCH', body: JSON.stringify(data) }),
        remove: (id: string, entityId: string) =>
          req<void>(`/ha/floorplans/${id}/entities/${entityId}`, { method: 'DELETE' }),
      },
    },
  },

  recyclarr: {
    profiles: (service: 'radarr' | 'sonarr', forceRefresh = false) =>
      req<{ profiles: import('./types/recyclarr').RecyclarrProfile[]; warning: boolean }>(
        `/recyclarr/profiles/${service}${forceRefresh ? '?refresh=1' : ''}`
      ),
    cfs: (service: 'radarr' | 'sonarr', forceRefresh = false) =>
      req<{ cfs: import('./types/recyclarr').RecyclarrCf[]; warning: boolean }>(
        `/recyclarr/cfs/${service}${forceRefresh ? '?refresh=1' : ''}`
      ),
    configs: () => req<import('./types/recyclarr').RecyclarrConfigsResponse>('/recyclarr/configs'),
    saveConfig: (instanceId: string, data: {
      enabled: boolean
      selectedProfiles: string[]
      scoreOverrides: import('./types/recyclarr').RecyclarrScoreOverride[]
      userCfNames: import('./types/recyclarr').RecyclarrUserCf[]
      preferredRatio: number
      profilesConfig: import('./types/recyclarr').RecyclarrProfileConfig[]
      syncSchedule: string
      deleteOldCfs: boolean
      qualityDefType?: string
      yamlInstanceKey?: string
      lastKnownScores?: import('./types/recyclarr').LastKnownScores
    }) => req<{ ok: boolean }>(`/recyclarr/configs/${instanceId}`, { method: 'POST', body: JSON.stringify(data) }),
    previewYaml: () => req<{ yaml: string }>('/recyclarr/yaml-preview'),
    previewYamlForInstance: (instanceId: string, data: {
      enabled: boolean
      selectedProfiles: string[]
      scoreOverrides: import('./types/recyclarr').RecyclarrScoreOverride[]
      userCfNames: import('./types/recyclarr').RecyclarrUserCf[]
      preferredRatio: number
      profilesConfig: import('./types/recyclarr').RecyclarrProfileConfig[]
      syncSchedule: string
      deleteOldCfs: boolean
      qualityDefType?: string
      yamlInstanceKey?: string
    }) => req<{ yaml: string }>(`/recyclarr/preview-yaml/${instanceId}`, { method: 'POST', body: JSON.stringify(data) }),
    trashCfNames: (service: 'radarr' | 'sonarr') =>
      req<{ names: string[]; cached: boolean; warning?: string }>(`/recyclarr/trash-cf-names?service=${service}`),
    resetConfig: () => req<{ ok: boolean }>('/recyclarr/reset', { method: 'POST', body: JSON.stringify({}) }),
    clearCache: (service: 'radarr' | 'sonarr') => req<{ ok: boolean }>(`/recyclarr/cache/${service}`, { method: 'DELETE', body: JSON.stringify({}) }),
    listUserCfs: (service: 'radarr' | 'sonarr') =>
      req<{ cfs: import('./types/recyclarr').UserCfFile[] }>(`/recyclarr/user-cfs/${service}`),
    createUserCf: (service: 'radarr' | 'sonarr', data: { name: string; specifications: import('./types/recyclarr').UserCfSpecification[] }) =>
      req<{ cf: import('./types/recyclarr').UserCfFile }>(`/recyclarr/user-cfs/${service}`, { method: 'POST', body: JSON.stringify(data) }),
    updateUserCf: (service: 'radarr' | 'sonarr', trashId: string, data: { name: string; specifications: import('./types/recyclarr').UserCfSpecification[] }) =>
      req<{ cf: import('./types/recyclarr').UserCfFile }>(`/recyclarr/user-cfs/${service}/${trashId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUserCf: (service: 'radarr' | 'sonarr', trashId: string) =>
      req<void>(`/recyclarr/user-cfs/${service}/${trashId}`, { method: 'DELETE', body: JSON.stringify({}) }),
    saveSchedule: (syncSchedule: string) =>
      req<{ ok: boolean; syncSchedule: string }>('/recyclarr/schedule', { method: 'PATCH', body: JSON.stringify({ syncSchedule }) }),
    adopt: () => req<{ ok: boolean; output: string }>('/recyclarr/adopt', { method: 'POST', body: JSON.stringify({}) }),
    arrData: (instanceId: string) =>
      req<{ profiles: import('./types/recyclarr').ArrQualityProfile[]; customFormats: import('./types/recyclarr').ArrCustomFormat[]; error?: string }>(`/recyclarr/arr-data/${instanceId}`),
    checkScoreChanges: (instanceId: string, profileData: import('./types/recyclarr').ArrQualityProfile[]) =>
      req<{ hasChanges: boolean; changes: import('./types/recyclarr').ScoreChange[] }>(`/recyclarr/check-score-changes/${instanceId}`, { method: 'POST', body: JSON.stringify({ profileData }) }),
    acceptScoreChanges: (instanceId: string, changes: import('./types/recyclarr').ScoreChange[]) =>
      req<{ ok: boolean }>(`/recyclarr/accept-score-changes/${instanceId}`, { method: 'POST', body: JSON.stringify({ changes }) }),
    profileCfs: (instanceId: string, profileTrashId: string) =>
      req<{
        cfs: { arrId: number; name: string; currentScore: number; groups: string[]; inMultipleGroups: boolean }[];
        groups: { name: string; cfNames: string[]; syncEnabled: boolean }[];
        notInProfile: { arrId: number; name: string; currentScore: number }[];
        warning: boolean;
        warningMessage?: string;
      }>(`/recyclarr/profile-cfs/${instanceId}?profileTrashId=${encodeURIComponent(profileTrashId)}`),
    listProfiles: (instanceId: string) =>
      req<{ profiles: { trash_id: string; name: string }[] }>(`/recyclarr/list-profiles/${instanceId}`),
    listScoreSets: (instanceId: string) =>
      req<{ scoreSets: string[] }>(`/recyclarr/list-score-sets/${instanceId}`),
    containerStatus: (containerName: string) =>
      req<{ running: boolean; name: string }>(`/recyclarr/container-status?name=${encodeURIComponent(containerName)}`),
    importableCfs: (instanceId: string) =>
      req<{ importable: import('./types/arr').ArrCustomFormat[]; alreadyManaged: { cf: import('./types/arr').ArrCustomFormat; hasChanges: boolean }[] }>(`/recyclarr/importable-cfs/${instanceId}`),
    syncHistory: () => req<{ history: SyncHistoryEntry[] }>('/recyclarr/sync-history'),
    backups: () => req<{ backups: BackupEntry[] }>('/recyclarr/backups'),
    restoreBackup: (filename: string) => req<{ ok: boolean }>(`/recyclarr/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST', body: JSON.stringify({}) }),
  },

  activity: {
    list: (category?: string) => {
      const url = category && category !== 'all' ? `/activity?category=${encodeURIComponent(category)}` : '/activity'
      return req<{ entries: { id: string; created_at: string; category: string; message: string; severity: string; meta: string | null }[] }>(url)
    },
  },

  admin: {
    guestVisibility: () => req<{ services: string[]; arr: string[]; widgets: string[] }>('/admin/guest-visibility'),
  },

  services_extra: {
    healthHistory: (id: string) => req<{ history: { hour: string; uptime: number }[]; uptimePercent7d: number | null }>(`/services/${id}/health-history`),
  },

  logbuch: {
    healthScore: () => req<{
      score: number
      breakdown: {
        services: { online: number; total: number; points: number }
        docker: { running: number; total: number; points: number; available: boolean }
        recyclarr: { lastSyncSuccess: boolean | null; points: number }
        ha: { reachable: number; total: number; points: number }
      }
    }>('/logbuch/health-score'),
    calendar: () => req<{ days: { date: string; count: number; maxSeverity: string }[] }>('/logbuch/calendar'),
    anomalies: () => req<{ anomalies: { serviceId: string; serviceName: string | null; offlineCount: number }[] }>('/logbuch/anomalies'),
  },

  network: {
    devices: {
      list: () => req<NetworkDevice[]>('/network/devices'),
      create: (data: Partial<NetworkDevice>) => req<NetworkDevice>('/network/devices', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<NetworkDevice>) => req<NetworkDevice>(`/network/devices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/network/devices/${id}`, { method: 'DELETE' }),
    },
    wol: (id: string) => req<{ ok: boolean; error?: string }>(`/network/devices/${id}/wol`, { method: 'POST', body: JSON.stringify({}) }),
    scan: (subnet: string) => req<ScanResult[]>(`/network/scan?subnet=${encodeURIComponent(subnet)}`),
    history: (id: string) => req<NetworkDeviceHistory[]>(`/network/devices/${id}/history`),
  },

  backup: {
    sources: {
      list: () => req<BackupSource[]>('/backup/sources'),
      create: (data: { name: string; type: string; config?: Record<string, unknown>; enabled?: boolean }) =>
        req<BackupSource>('/backup/sources', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<BackupSource>) =>
        req<BackupSource>(`/backup/sources/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/backup/sources/${id}`, { method: 'DELETE' }),
    },
    status: () => req<{ sources: BackupStatusResult[] }>('/backup/status'),
    dockerExport: () => fetch('/api/backup/docker/export', { credentials: 'include' }).then(r => r.blob()),
  },

  resources: {
    history: (range?: '1h' | '24h' | '7d') => req<ResourceSnapshot[]>(`/resources/history${range ? `?range=${range}` : ''}`),
  },

  changelog: {
    list: () => req<ChangelogRelease[]>('/changelog'),
  },

  health: () => req<{ status: string; version: string; uptime: number }>('/health'),
  serverTime: () => req<{ iso: string }>('/time'),

  unraid: {
    instances: {
      list:    ()                                                   => req<UnraidInstance[]>('/unraid/instances'),
      create:  (b: { name: string; url: string; api_key: string }) => req<UnraidInstance>('/unraid/instances', { method: 'POST', body: JSON.stringify(b) }),
      update:  (id: string, b: object)                             => req<UnraidInstance>(`/unraid/instances/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
      delete:  (id: string)                                        => req<void>(`/unraid/instances/${id}`, { method: 'DELETE' }),
      reorder: (ids: string[])                                     => req<{ ok: boolean }>('/unraid/instances/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
      test:    (url: string, api_key: string)                      => req<{ ok: boolean }>('/unraid/test', { method: 'POST', body: JSON.stringify({ url, api_key }) }),
    },
    ping:                (id: string)                                                                   => req<{ online: boolean }>(`/unraid/${id}/ping`),
    info:                (id: string)                                                                   => req<UnraidInfo>(`/unraid/${id}/info`),
    array:               (id: string)                                                                   => req<UnraidArray>(`/unraid/${id}/array`),
    parity:              (id: string)                                                                   => req<{ parityHistory?: UnraidParityHistory[] }>(`/unraid/${id}/parityhistory`),
    arrayStart:          (id: string)                                                                   => req<unknown>(`/unraid/${id}/array/start`, { method: 'POST', body: JSON.stringify({}) }),
    arrayStop:           (id: string)                                                                   => req<unknown>(`/unraid/${id}/array/stop`, { method: 'POST', body: JSON.stringify({}) }),
    parityStart:         (id: string, correct: boolean)                                                 => req<unknown>(`/unraid/${id}/parity/start`, { method: 'POST', body: JSON.stringify({ correct }) }),
    parityPause:         (id: string)                                                                   => req<unknown>(`/unraid/${id}/parity/pause`, { method: 'POST', body: JSON.stringify({}) }),
    parityResume:        (id: string)                                                                   => req<unknown>(`/unraid/${id}/parity/resume`, { method: 'POST', body: JSON.stringify({}) }),
    parityCancel:        (id: string)                                                                   => req<unknown>(`/unraid/${id}/parity/cancel`, { method: 'POST', body: JSON.stringify({}) }),
    diskSpinUp:          (id: string, diskId: string)                                                   => req<unknown>(`/unraid/${id}/disks/${encodeURIComponent(diskId)}/spinup`, { method: 'POST', body: JSON.stringify({}) }),
    diskSpinDown:        (id: string, diskId: string)                                                   => req<unknown>(`/unraid/${id}/disks/${encodeURIComponent(diskId)}/spindown`, { method: 'POST', body: JSON.stringify({}) }),
    docker:              (id: string)                                                                   => req<UnraidContainer[]>(`/unraid/${id}/docker`),
    dockerControl:       (id: string, name: string, action: 'start' | 'stop' | 'restart' | 'unpause' | 'pause') => req<unknown>(`/unraid/${id}/docker/${encodeURIComponent(name)}/${action}`, { method: 'POST', body: JSON.stringify({}) }),
    dockerUpdate:        (id: string, name: string)                                                             => req<unknown>(`/unraid/${id}/docker/${encodeURIComponent(name)}/update`, { method: 'POST', body: JSON.stringify({}) }),
    dockerUpdateAll:     (id: string)                                                                           => req<unknown>(`/unraid/${id}/docker/update-all`, { method: 'POST', body: JSON.stringify({}) }),
    vms:                 (id: string)                                                                           => req<{ vms?: { domains?: UnraidVm[] } }>(`/unraid/${id}/vms`),
    vmControl:           (id: string, uuid: string, action: 'start' | 'stop' | 'pause' | 'resume' | 'forcestop' | 'reboot' | 'reset') => req<unknown>(`/unraid/${id}/vms/${encodeURIComponent(uuid)}/${action}`, { method: 'POST', body: JSON.stringify({}) }),
    shares:              (id: string)                                                                           => req<{ shares?: UnraidShare[] }>(`/unraid/${id}/shares`),
    users:               (id: string)                                                                           => req<{ users?: UnraidUser[] }>(`/unraid/${id}/users`),
    notifications:       (id: string)                                                                           => req<UnraidNotifications>(`/unraid/${id}/notifications`),
    notificationsArchive: (id: string)                                                                          => req<{ list?: import('./types/unraid').UnraidNotification[] }>(`/unraid/${id}/notifications/archive`),
    archiveNotification:     (id: string, nId: string) => req<unknown>(`/unraid/${id}/notifications/archive/${encodeURIComponent(nId)}`, { method: 'POST', body: JSON.stringify({}) }),
    archiveAllNotifications: (id: string)              => req<unknown>(`/unraid/${id}/notifications/archive-all`, { method: 'POST', body: JSON.stringify({}) }),
    config:              (id: string)                                                                           => req<UnraidConfig>(`/unraid/${id}/config`),
    physicalDisks:       (id: string)                                                                           => req<{ disks?: UnraidPhysicalDisk[] }>(`/unraid/${id}/physicaldisks`),
    diskMount:           (id: string, diskId: string)                                                           => req<unknown>(`/unraid/${id}/disks/${encodeURIComponent(diskId)}/mount`, { method: 'POST', body: JSON.stringify({}) }),
    diskUnmount:         (id: string, diskId: string)                                                           => req<unknown>(`/unraid/${id}/disks/${encodeURIComponent(diskId)}/unmount`, { method: 'POST', body: JSON.stringify({}) }),
  },
}
