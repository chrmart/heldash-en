export type ArrType = 'radarr' | 'sonarr' | 'prowlarr' | 'sabnzbd' | 'seerr'

export interface ArrInstance {
  id: string
  type: ArrType
  name: string
  url: string  // for display only — never used for direct API calls from the frontend
  enabled: boolean
  position: number
  created_at: string
}

// ── Status ────────────────────────────────────────────────────────────────────
export interface ArrStatus {
  online: boolean
  type: ArrType
  version?: string
  instanceName?: string
}

// ── Stats (type-discriminated) ────────────────────────────────────────────────
export interface ArrHealthIssue {
  type: string   // 'notice' | 'warning' | 'error'
  message: string
}

export interface RadarrStats {
  type: 'radarr'
  movieCount: number
  monitored: number
  withFile: number
  sizeOnDisk: number
  missingCount: number
  healthIssues: ArrHealthIssue[]
  diskspaceFreeBytes: number
}

export interface SonarrStats {
  type: 'sonarr'
  seriesCount: number
  monitored: number
  episodeCount: number
  sizeOnDisk: number
  missingCount: number
  healthIssues: ArrHealthIssue[]
  diskspaceFreeBytes: number
}

export interface ProwlarrStats {
  type: 'prowlarr'
  indexerCount: number
  enabledIndexers: number
  grabCount24h: number
  failingIndexers: number
  healthIssues: ArrHealthIssue[]
}

export interface SabnzbdWarningItem {
  type: string   // "WARNING" | "ERROR"
  text: string
}

export interface SabnzbdStats {
  type: 'sabnzbd'
  speed: string         // "1.2 MB/s" — formatted by SABnzbd
  mbleft: number        // MB remaining in queue
  mb: number            // total MB in queue
  paused: boolean
  queueCount: number    // total items (regardless of slot limit)
  diskspaceFreeGb: number
  timeleft: string      // "H:MM:SS"
  speedlimit: string    // percentage string, e.g. "50" (empty = unlimited)
  downloadedToday: number   // bytes
  downloadedTotal: number   // bytes
  warnings: SabnzbdWarningItem[]
}

export interface SeerrStats {
  type: 'seerr'
  pending: number
  approved: number
  declined: number
  processing: number
  available: number
  total: number
  movie: number
  tv: number
  updateAvailable: boolean
  commitsBehind: number
  restartRequired: boolean
}

export type ArrStats = RadarrStats | SonarrStats | ProwlarrStats | SabnzbdStats | SeerrStats

// ── Seerr requests ────────────────────────────────────────────────────────────

export interface SeerrMedia {
  id: number
  mediaType: 'movie' | 'tv'
  tmdbId: number
  tvdbId?: number | null
  status: number  // 1=unknown, 2=pending, 3=processing, 4=partially_available, 5=available
  title?: string  // enriched by backend via /movie/:tmdbId or /tv/:tmdbId
}

export interface SeerrRequest {
  id: number
  status: number  // 1=pending, 2=approved, 3=declined
  createdAt: string
  requestedBy: { id: number; displayName?: string; username?: string; email: string }
  media: SeerrMedia
  seasons?: { seasonNumber: number }[]
}

export interface SeerrRequestsResponse {
  pageInfo: { pages: number; pageSize: number; results: number; page: number }
  results: SeerrRequest[]
}

// ── SABnzbd queue / history ───────────────────────────────────────────────────
export interface SabnzbdQueueSlot {
  nzo_id: string
  filename: string
  status: string
  mbleft: number
  mb: number
  percentage: string  // "75.2"
  timeleft: string    // "0:12:34"
  cat: string
}

export interface SabnzbdQueueData {
  speed: string
  mbleft: string      // float as string
  mb: string
  paused: boolean
  noofslots: number
  slots: SabnzbdQueueSlot[]
}

export interface SabnzbdHistorySlot {
  nzo_id: string
  name: string
  status: string      // "Completed" | "Failed" | ...
  bytes: number
  fail_message: string
  cat: string
  download_time: number
}

export interface SabnzbdHistoryData {
  noofslots: number
  slots: SabnzbdHistorySlot[]
}

// ── Queue ─────────────────────────────────────────────────────────────────────
export interface ArrQueueItem {
  id: number
  title: string
  status: string
  trackedDownloadStatus: string
  size: number
  sizeleft: number
  protocol: string
  downloadClient?: string
  episode?: { title: string; seasonNumber: number; episodeNumber: number }
}

export interface ArrQueueResponse {
  totalRecords: number
  records: ArrQueueItem[]
}

// ── Calendar ──────────────────────────────────────────────────────────────────
export interface RadarrCalendarItem {
  id: number
  title: string
  inCinemas?: string
  digitalRelease?: string
  hasFile: boolean
  monitored: boolean
}

export interface SonarrCalendarItem {
  id: number
  title: string
  seasonNumber: number
  episodeNumber: number
  airDateUtc?: string
  hasFile: boolean
  series: { title: string; id: number }
}

export type ArrCalendarItem = RadarrCalendarItem | SonarrCalendarItem

// ── Prowlarr Indexer ──────────────────────────────────────────────────────────
export interface ProwlarrIndexer {
  id: number
  name: string
  enable: boolean
  protocol: string
  privacy: string
}

// ── Custom Format Schema ──────────────────────────────────────────────────────
export interface ArrCFSchemaField {
  name: string
  label: string
  type: 'textbox' | 'select' | 'number' | string
  selectOptions?: { value: number; name: string }[]
}

export interface ArrCFSchema {
  implementation: string
  implementationName: string
  infoLink?: string
  fields: ArrCFSchemaField[]
}

// ── Custom Formats ────────────────────────────────────────────────────────────
export interface ArrCFSpecification {
  name: string
  implementation: string
  implementationName: string
  infoLink?: string
  negate: boolean
  required: boolean
  fields: { name: string; value: unknown }[]
}

export interface ArrCustomFormat {
  id: number
  name: string
  includeCustomFormatWhenRenaming: boolean
  specifications: ArrCFSpecification[]
}

export interface ArrQualityProfile {
  id: number
  name: string
  formatItems: { format: number; score: number; name: string }[]
}

// ── Library (Radarr movies / Sonarr series) ───────────────────────────────────
export interface RadarrMovie {
  id: number
  title: string
  monitored: boolean
  hasFile: boolean
  sizeOnDisk: number
  year?: number
  inCinemas?: string
  digitalRelease?: string
  images?: { coverType: string; remoteUrl: string }[]
}

export interface SonarrSeries {
  id: number
  title: string
  monitored: boolean
  statistics: {
    episodeFileCount: number
    totalEpisodeCount: number
    episodeCount?: number
    sizeOnDisk: number
  }
  images?: { coverType: string; remoteUrl: string }[]
}
