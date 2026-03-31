export interface RecyclarrProfile {
  trash_id: string
  name: string
  mediaType: 'radarr' | 'sonarr'
  group: string
  source: 'container' | 'cache'
}

export interface RecyclarrCf {
  trash_id: string
  name: string
  mediaType: 'radarr' | 'sonarr'
}

export interface RecyclarrSettings {
  containerName: string
  configPath: string
}

export interface RecyclarrScoreOverride {
  trash_id: string
  name: string
  score: number
  profileTrashId: string
}

export interface RecyclarrUserCf {
  trash_id?: string
  name: string
  score: number
  profileTrashId: string
  profileName: string
}

export interface UserCfSpecification {
  name: string
  implementation: string
  negate: boolean
  required: boolean
  fields: Record<string, unknown>
}

export interface UserCfFile {
  trash_id: string
  name: string
  includeCustomFormatWhenRenaming: boolean
  specifications: UserCfSpecification[]
}

export interface RecyclarrProfileConfig {
  trash_id: string
  name: string
  min_format_score?: number
  min_upgrade_format_score?: number
  score_set?: string
  reset_unmatched_scores_enabled: boolean
  reset_unmatched_scores_except: string[]
  reset_unmatched_scores_except_patterns: string[]
}

export interface RecyclarrInstanceConfig {
  instanceId: string
  instanceName: string
  instanceType: 'radarr' | 'sonarr'
  enabled: boolean
  selectedProfiles: string[]
  scoreOverrides: RecyclarrScoreOverride[]
  userCfNames: RecyclarrUserCf[]
  preferredRatio: number
  profilesConfig: RecyclarrProfileConfig[]
  syncSchedule: string
  lastSyncedAt: string | null
  lastSyncSuccess: boolean | null
  deleteOldCfs: boolean
  isSyncing: boolean
  yamlInstanceKey: string | null
  qualityDefType: string
  lastKnownScores: LastKnownScores
}

export interface RecyclarrConfigsResponse {
  configs: RecyclarrInstanceConfig[]
  syncSchedule?: string
}

export interface RecyclarrSyncLine {
  line: string
  type: 'stdout' | 'stderr' | 'done' | 'error'
}

// { profileTrashId: { cfTrashId: score } }
export type LastKnownScores = Record<string, Record<string, number>>

export interface ArrFormatItem {
  id: number
  name: string
  format: number
  score: number
}

export interface ArrQualityProfile {
  id: number
  name: string
  upgradeAllowed: boolean
  cutoffFormatScore: number
  minFormatScore: number
  formatItems: ArrFormatItem[]
  // trash_id may not exist if profile is not from guide
  trash_id?: string
}

export interface ArrCustomFormat {
  id: number
  name: string
  trash_id?: string
  includeCustomFormatWhenRenaming: boolean
  specifications: unknown[]
}

export interface ScoreChange {
  profileTrashId: string
  profileName: string
  cfTrashId: string
  cfName: string
  oldScore: number
  newScore: number
}

export interface SyncHistoryEntry {
  id: string
  synced_at: string
  success: boolean
  output: string
  changes_summary: { created?: number; updated?: number; deleted?: number } | null
}

export interface BackupEntry {
  filename: string
  timestamp: string
  size: number
}
