import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { Pool, Agent, request as undiciRequest } from 'undici'
import * as cron from 'node-cron'
import { logActivity } from './activity'

const dockerPool = new Pool('http://localhost', {
  socketPath: '/var/run/docker.sock',
  connections: 5,
})

async function dockerExecInContainer(
  containerName: string,
  cmd: string[],
  timeoutMs = 30_000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const createRes = await dockerPool.request({
    path: `/v1.41/containers/${containerName}/exec`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Cmd: cmd }),
  })
  if (createRes.statusCode === 404) {
    await createRes.body.dump()
    throw new Error(`Container '${containerName}' not found. Check container name in settings.`)
  }
  if (createRes.statusCode !== 201) {
    const body = await createRes.body.text()
    throw new Error(`Docker exec create failed (${createRes.statusCode}): ${body}`)
  }
  const { Id: execId } = await createRes.body.json() as { Id: string }

  const startRes = await dockerPool.request({
    path: `/v1.41/exec/${execId}/start`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ Detach: false, Tty: false }),
  })
  if (startRes.statusCode !== 200) {
    const body = await startRes.body.text()
    throw new Error(`Docker exec start failed (${startRes.statusCode}): ${body}`)
  }

  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  let buf = Buffer.alloc(0)

  const timeout = setTimeout(() => startRes.body.destroy(), timeoutMs)
  try {
    for await (const chunk of startRes.body) {
      buf = Buffer.concat([buf, chunk as Buffer])
      while (true) {
        if (buf.length < 8) break
        const streamByte = buf[0]
        const size = buf.readUInt32BE(4)
        if (buf.length < 8 + size) break
        const payload = buf.subarray(8, 8 + size)
        buf = buf.subarray(8 + size)
        if (streamByte === 2) stderrChunks.push(payload)
        else stdoutChunks.push(payload)
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  const inspectRes = await dockerPool.request({ path: `/v1.41/exec/${execId}/json`, method: 'GET' })
  const inspectJson = await inspectRes.body.json() as { ExitCode: number; Running: boolean }

  return {
    stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
    exitCode: inspectJson.ExitCode ?? 1,
  }
}

async function streamingDockerExec(
  containerName: string,
  cmd: string[],
  onLine: (stream: 'stdout' | 'stderr', line: string) => void,
  timeoutMs = 300_000
): Promise<number> {
  const createRes = await dockerPool.request({
    path: `/v1.41/containers/${containerName}/exec`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Cmd: cmd }),
  })
  if (createRes.statusCode === 404) {
    await createRes.body.dump()
    throw new Error(`Container '${containerName}' not found. Check container name in settings.`)
  }
  if (createRes.statusCode !== 201) {
    const body = await createRes.body.text()
    throw new Error(`Docker exec create failed (${createRes.statusCode}): ${body}`)
  }
  const { Id: execId } = await createRes.body.json() as { Id: string }

  const startRes = await dockerPool.request({
    path: `/v1.41/exec/${execId}/start`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ Detach: false, Tty: false }),
  })
  if (startRes.statusCode !== 200) {
    const body = await startRes.body.text()
    throw new Error(`Docker exec start failed (${startRes.statusCode}): ${body}`)
  }

  let buf = Buffer.alloc(0)
  const timeout = setTimeout(() => startRes.body.destroy(), timeoutMs)
  try {
    for await (const chunk of startRes.body) {
      buf = Buffer.concat([buf, chunk as Buffer])
      while (true) {
        if (buf.length < 8) break
        const streamByte = buf[0]
        const size = buf.readUInt32BE(4)
        if (buf.length < 8 + size) break
        const payload = buf.subarray(8, 8 + size)
        buf = buf.subarray(8 + size)
        const stream = streamByte === 2 ? 'stderr' : 'stdout'
        for (const line of payload.toString('utf8').split('\n')) {
          if (line.trim()) onLine(stream, line)
        }
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  const inspectRes = await dockerPool.request({ path: `/v1.41/exec/${execId}/json`, method: 'GET' })
  const inspectJson = await inspectRes.body.json() as { ExitCode: number; Running: boolean }
  return inspectJson.ExitCode ?? 1
}

interface RecyclarrProfile {
  trash_id: string
  name: string
  mediaType: 'radarr' | 'sonarr'
  group: string
  source: 'container' | 'cache'
}

interface RecyclarrCf {
  trash_id: string
  name: string
  mediaType: 'radarr' | 'sonarr'
}

interface ProfileConfig {
  trash_id: string
  name: string
  min_format_score?: number
  min_upgrade_format_score?: number
  score_set?: string
  reset_unmatched_scores_enabled: boolean
  reset_unmatched_scores_except: string[]
  reset_unmatched_scores_except_patterns?: string[]
}

interface RecyclarrConfigRow {
  id: string
  instance_id: string
  enabled: number
  templates: string
  score_overrides: string
  user_cf_names: string
  preferred_ratio: number
  profiles_config: string
  sync_schedule: string
  last_synced_at: string | null
  last_sync_success: number | null
  delete_old_cfs: number
  is_syncing: number
  yaml_instance_key: string | null
  quality_def_type: string | null
  last_known_scores: string | null
  updated_at: string
}

interface ArrInstanceRow {
  id: string
  name: string
  type: string
  url: string
  api_key: string
}

interface ScoreOverride {
  trash_id: string
  name: string
  score: number
  profileTrashId: string
}

interface UserCf {
  trash_id?: string
  name: string
  score: number
  profileTrashId: string
  profileName: string
}

interface ArrFormatItem {
  id: number
  name: string
  format: number
  score: number
}

interface ArrQualityProfile {
  id: number
  name: string
  formatItems: ArrFormatItem[]
  trash_id?: string
}

interface ArrCustomFormat {
  id: number
  name: string
  trash_id?: string
}

interface ArrCustomFormatFull {
  id: number
  name: string
  trash_id?: string
  includeCustomFormatWhenRenaming: boolean
  specifications: Array<{
    name: string
    implementation: string
    implementationName: string
    negate: boolean
    required: boolean
    fields: Array<{ name: string; value: unknown }>
  }>
}

interface ScoreChange {
  profileTrashId: string
  profileName: string
  cfTrashId: string
  cfName: string
  oldScore: number
  newScore: number
}

type LastKnownScores = Record<string, Record<string, number>>

interface UserCfSpecification {
  name: string
  implementation: string
  negate: boolean
  required: boolean
  fields: { name: string; value: unknown }[]
}

interface UserCfFile {
  trash_id: string
  name: string
  includeCustomFormatWhenRenaming: boolean
  specifications: UserCfSpecification[]
}

interface CreateUserCfBody {
  name: string
  specifications: UserCfSpecification[]
}

interface UpdateUserCfBody {
  name: string
  specifications: UserCfSpecification[]
}

interface SaveConfigBody {
  enabled: boolean
  selectedProfiles: string[]
  scoreOverrides: ScoreOverride[]
  userCfNames: UserCf[]
  preferredRatio: number
  profilesConfig: ProfileConfig[]
  syncSchedule: string
  deleteOldCfs: boolean
  qualityDefType?: string
  yamlInstanceKey?: string
  lastKnownScores?: Record<string, Record<string, number>>
}

interface RecyclarrConfig {
  instanceId: string
  enabled: boolean
  selectedProfiles: string[]
  scoreOverrides: ScoreOverride[]
  userCfNames: UserCf[]
  preferredRatio: number
  profilesConfig: ProfileConfig[]
  deleteOldCfs: boolean
  yamlInstanceKey: string | null
  qualityDefType: string
  lastKnownScores: LastKnownScores
}

interface SimpleLogger {
  info: (obj: object, msg?: string) => void
  warn: (obj: object, msg?: string) => void
  error: (obj: object, msg?: string) => void
}

function getSettingStr(key: string, fallback: string): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return fallback
  try { return JSON.parse(row.value) as string } catch { return row.value }
}

function delSetting(key: string): void {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

function getSettingJson<T>(key: string): T | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.value) as T } catch { return null }
}

function setSettingJson(key: string, value: unknown): void {
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, JSON.stringify(value))
}

function getRecyclarrSettings(): { containerName: string; configPath: string } {
  return {
    containerName: getSettingStr('recyclarr_container_name', 'recyclarr'),
    configPath: getSettingStr('recyclarr_config_path', '/recyclarr/recyclarr.yml'),
  }
}

const USER_CF_BASE = '/recyclarr/user-cfs'
const SETTINGS_YML_PATH = '/recyclarr/settings.yml'

interface SyncHistoryRow {
  id: string
  synced_at: string
  success: number
  output: string
  changes_summary: string | null
}

function parseSyncSummary(output: string): { created?: number; updated?: number; deleted?: number } | null {
  const summary: { created?: number; updated?: number; deleted?: number } = {}
  const createdMatch = output.match(/(\d+)\s+(?:custom format[s]?\s+)?(?:were\s+)?created/i)
  const updatedMatch = output.match(/(\d+)\s+(?:(?:custom format[s]?\s+|score[s]?\s+))?(?:were\s+)?updated/i)
  const deletedMatch = output.match(/(\d+)\s+(?:custom format[s]?\s+)?(?:were\s+)?deleted/i)
  if (createdMatch) summary.created = parseInt(createdMatch[1], 10)
  if (updatedMatch) summary.updated = parseInt(updatedMatch[1], 10)
  if (deletedMatch) summary.deleted = parseInt(deletedMatch[1], 10)
  if (Object.keys(summary).length === 0) return null
  return summary
}

function recordSyncHistory(success: boolean, output: string): void {
  try {
    const db = getDb()
    const id = nanoid()
    const summary = parseSyncSummary(output)
    db.prepare("INSERT INTO recyclarr_sync_history (id, synced_at, success, output, changes_summary) VALUES (?, datetime('now'), ?, ?, ?)")
      .run(id, success ? 1 : 0, output, summary ? JSON.stringify(summary) : null)
    // Keep max 10 rows
    db.prepare('DELETE FROM recyclarr_sync_history WHERE id NOT IN (SELECT id FROM recyclarr_sync_history ORDER BY synced_at DESC LIMIT 10)').run()
  } catch { /* ignore */ }
}

function backupConfig(configPath: string): void {
  try {
    if (!fs.existsSync(configPath)) return
    const backupPath = `${configPath}.bak.${Date.now()}`
    fs.copyFileSync(configPath, backupPath)
    // Keep max 5 backups
    const dir = path.dirname(configPath)
    const base = path.basename(configPath)
    const backups = fs.readdirSync(dir)
      .filter(f => f.startsWith(`${base}.bak.`))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const old of backups.slice(5)) {
      try { fs.unlinkSync(path.join(dir, old.name)) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function toUserCfSlug(name: string): string {
  return 'user-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function ensureUserCfFolders(): void {
  fs.mkdirSync(`${USER_CF_BASE}/radarr`, { recursive: true })
  fs.mkdirSync(`${USER_CF_BASE}/sonarr`, { recursive: true })
}

const RESOLUTION_MIGRATE_MAP: Record<string, number> = {
  R360p: 360, R480p: 480, R540p: 540, R576p: 576,
  R720p: 720, R1080p: 1080, R2160p: 2160,
}

function migrateUserCfFiles(dir: string): void {
  if (!fs.existsSync(dir)) return
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  for (const file of files) {
    const p = path.join(dir, file)
    try {
      const cf = JSON.parse(fs.readFileSync(p, 'utf8')) as { specifications?: { implementation: string; fields: unknown }[] }
      let changed = false
      for (const spec of cf.specifications ?? []) {
        // Fix array fields → object
        if (Array.isArray(spec.fields)) {
          spec.fields = Object.fromEntries(
            (spec.fields as { name: string; value: unknown }[]).map(f => [f.name, f.value])
          )
          changed = true
        }
        // Fix ResolutionSpecification string → integer
        if (spec.implementation === 'ResolutionSpecification') {
          const fields = spec.fields as Record<string, unknown>
          if (typeof fields.value === 'string' && RESOLUTION_MIGRATE_MAP[fields.value]) {
            fields.value = RESOLUTION_MIGRATE_MAP[fields.value]
            changed = true
          }
        }
      }
      if (changed) fs.writeFileSync(p, JSON.stringify(cf, null, 2), 'utf8')
    } catch { /* skip malformed files */ }
  }
}

function writeSettingsYml(): void {
  const content = [
    '# yaml-language-server: $schema=https://raw.githubusercontent.com/recyclarr/recyclarr/master/schemas/settings-schema.json',
    'resource_providers:',
    '  - name: user-cfs-radarr',
    '    type: custom-formats',
    '    path: /config/user-cfs/radarr',
    '    service: radarr',
    '  - name: user-cfs-sonarr',
    '    type: custom-formats',
    '    path: /config/user-cfs/sonarr',
    '    service: sonarr',
  ].join('\n') + '\n'
  const dir = path.dirname(SETTINGS_YML_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SETTINGS_YML_PATH, content, 'utf8')
}

function listUserCfs(service: 'radarr' | 'sonarr'): UserCfFile[] {
  const folder = path.join(USER_CF_BASE, service)
  ensureUserCfFolders()
  let files: string[]
  try { files = fs.readdirSync(folder).filter(f => f.endsWith('.json')) } catch { return [] }
  const result: UserCfFile[] = []
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(folder, f), 'utf8')
      result.push(JSON.parse(content) as UserCfFile)
    } catch { /* skip malformed files */ }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}


function normalizeSpecsForCompare(specs: unknown[]): unknown {
  return specs.map((s: unknown) => {
    const spec = s as { name: string; implementation: string; negate: boolean; required: boolean; fields: unknown }
    let fields: Record<string, unknown>
    if (Array.isArray(spec.fields)) {
      fields = Object.fromEntries((spec.fields as { name: string; value: unknown }[]).map(f => [f.name, f.value]))
    } else {
      fields = spec.fields as Record<string, unknown>
    }
    return { name: spec.name, implementation: spec.implementation, negate: spec.negate, required: spec.required, fields }
  })
}

function deriveGroup(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('german') || lower.includes('deutsch')) return 'Deutsch (German)'
  if (lower.includes('anime')) return 'Anime'
  if (lower.includes('french')) return 'French'
  if (lower.includes('dutch')) return 'Dutch'
  return 'Standard'
}

function parseQualityProfiles(stdout: string, mediaType: 'radarr' | 'sonarr', source: 'container' | 'cache'): RecyclarrProfile[] {
  const profiles: RecyclarrProfile[] = []
  const seen = new Set<string>()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Try tab-separated --raw format: trash_id\tname
    const parts = trimmed.split('\t')
    const trash_id_tab = parts[0]?.trim() ?? ''
    const name_tab = parts[1]?.trim() ?? ''
    if (/^[0-9a-f]{32}$/i.test(trash_id_tab) && name_tab && !seen.has(trash_id_tab)) {
      seen.add(trash_id_tab)
      profiles.push({ trash_id: trash_id_tab, name: name_tab, mediaType, group: deriveGroup(name_tab), source })
      continue
    }
    // Fallback: table format (box-drawing characters)
    const clean = trimmed.replace(/[│┌└─┐┘]/g, '').trim()
    if (!clean) continue
    const tableParts = clean.split(/\s{2,}/)
    const hexPart = tableParts.find(p => /^[0-9a-f]{32}$/i.test(p.trim()))
    if (hexPart) {
      const trash_id = hexPart.trim()
      const name = tableParts.find(p => p.trim() && !/^[0-9a-f]{32}$/i.test(p.trim()))?.trim()
      if (trash_id && name && !seen.has(trash_id)) {
        seen.add(trash_id)
        profiles.push({ trash_id, name, mediaType, group: deriveGroup(name), source })
      }
    }
  }
  return profiles
}

const CF_LINE_RE_RAW = /^\s*-\s+([0-9a-f]{32})\s+#\s+(.+)$/i

function parseCustomFormats(stdout: string, mediaType: 'radarr' | 'sonarr'): RecyclarrCf[] {
  const cfs: RecyclarrCf[] = []
  const seen = new Set<string>()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Primary: --raw format: trash_id<TAB>name[<TAB>category]
    if (trimmed.includes('\t')) {
      const parts = trimmed.split('\t')
      const trash_id = parts[0]?.trim()
      const name = parts[1]?.trim()
      if (trash_id && name && !seen.has(trash_id)) {
        seen.add(trash_id)
        cfs.push({ trash_id, name, mediaType })
      }
      continue
    }
    // Fallback: old "  - <hash> # <name>" format
    const m = CF_LINE_RE_RAW.exec(line)
    if (m) {
      const trash_id = m[1]!
      const name = m[2]!.trim()
      if (trash_id && name && !seen.has(trash_id)) {
        seen.add(trash_id)
        cfs.push({ trash_id, name, mediaType })
      }
      continue
    }
    // Fallback: table format (box-drawing chars, without --raw or older recyclarr)
    const clean = line.replace(/[│┌└─┐┘]/g, '').trim()
    if (!clean) continue
    const tableParts = clean.split(/\s{2,}/)
    const hexPart = tableParts.find(p => /^[0-9a-f]{32}$/i.test(p.trim()))
    if (hexPart) {
      const trash_id = hexPart.trim()
      const name = tableParts.find(p => p.trim() && !/^[0-9a-f]{32}$/i.test(p.trim()))?.trim()
      if (trash_id && name && !seen.has(trash_id)) {
        seen.add(trash_id)
        cfs.push({ trash_id, name, mediaType })
      }
    }
  }
  return cfs
}

interface ProfilesCacheEntry { profiles: RecyclarrProfile[]; fetchedAt: string }
interface CfsCacheEntry { cfs: RecyclarrCf[]; fetchedAt: string }
const CACHE_TTL = 24 * 60 * 60 * 1000
const CF_GROUPS_CACHE_TTL = 5 * 60 * 1000
const cfGroupsCache = new Map<string, { groups: { name: string; cfNames: string[] }[]; fetchedAt: number }>()

async function getQualityProfiles(
  service: 'radarr' | 'sonarr',
  containerName: string,
  forceRefresh = false
): Promise<{ profiles: RecyclarrProfile[]; warning: boolean }> {
  const cacheKey = `recyclarr_profiles_cache_${service}`
  if (!forceRefresh) {
    const cached = getSettingJson<ProfilesCacheEntry>(cacheKey)
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL) {
      return { profiles: cached.profiles.map(p => ({ ...p, source: 'cache' as const })), warning: false }
    }
  }
  try {
    const { stdout, exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'list', 'quality-profiles', service, '--raw'], 15_000)
    if (exitCode !== 0) throw new Error(`recyclarr list quality-profiles failed (exit ${exitCode})`)
    const profiles = parseQualityProfiles(stdout, service, 'container')
    const entry: ProfilesCacheEntry = { profiles, fetchedAt: new Date().toISOString() }
    setSettingJson(cacheKey, entry)
    return { profiles, warning: false }
  } catch (e) {
    const cached = getSettingJson<ProfilesCacheEntry>(cacheKey)
    if (cached) {
      return { profiles: cached.profiles.map(p => ({ ...p, source: 'cache' as const })), warning: true }
    }
    throw e
  }
}

async function getCustomFormats(
  service: 'radarr' | 'sonarr',
  containerName: string,
  forceRefresh = false
): Promise<{ cfs: RecyclarrCf[]; warning: boolean }> {
  const cacheKey = `recyclarr_cf_cache_${service}`
  if (!forceRefresh) {
    const cached = getSettingJson<CfsCacheEntry>(cacheKey)
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL) {
      return { cfs: cached.cfs, warning: false }
    }
  }
  try {
    const { stdout, exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'list', 'custom-formats', service, '--raw'], 15_000)
    if (exitCode !== 0) throw new Error(`recyclarr list custom-formats failed (exit ${exitCode})`)
    const cfs = parseCustomFormats(stdout, service)
    const entry: CfsCacheEntry = { cfs, fetchedAt: new Date().toISOString() }
    setSettingJson(cacheKey, entry)
    return { cfs, warning: false }
  } catch (e) {
    const cached = getSettingJson<CfsCacheEntry>(cacheKey)
    if (cached) return { cfs: cached.cfs, warning: true }
    throw e
  }
}

function sanitizeInstanceKey(name: string): string {
  return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').replace(/^_+|_+$/g, '') || 'instance'
}

function generateRecyclarrYaml(configs: RecyclarrConfig[], instances: ArrInstanceRow[]): string {
  const radarr: Record<string, unknown> = {}
  const sonarr: Record<string, unknown> = {}

  for (const cfg of configs) {
    if (!cfg.enabled) continue
    const inst = instances.find(i => i.id === cfg.instanceId)
    if (!inst || (inst.type !== 'radarr' && inst.type !== 'sonarr')) continue

    const instanceKey = cfg.yamlInstanceKey || sanitizeInstanceKey(inst.name)

    // Quality definition
    const qdType = cfg.qualityDefType || (inst.type === 'radarr' ? 'movie' : 'series')
    const qualityDefinition: Record<string, unknown> = { type: qdType }
    if (cfg.preferredRatio > 0) qualityDefinition.preferred_ratio = cfg.preferredRatio

    // Quality profiles — skip entries with missing/empty trash_id
    const qualityProfiles = cfg.profilesConfig.filter(pc => pc.trash_id && pc.trash_id.trim()).map(pc => {
      const entry: Record<string, unknown> = { trash_id: pc.trash_id }
      if (pc.min_format_score != null && pc.min_format_score > 0) {
        entry.min_format_score = pc.min_format_score
      }
      if (pc.min_upgrade_format_score != null && pc.min_upgrade_format_score > 0) {
        entry.min_upgrade_format_score = pc.min_upgrade_format_score
      }
      if (pc.score_set) {
        entry.score_set = pc.score_set
      }
      if (pc.reset_unmatched_scores_enabled) {
        const rusObj: Record<string, unknown> = { enabled: true }
        const userCfTrashIds = new Set(cfg.userCfNames.map(u => u.trash_id).filter(Boolean))
        // except: user-provided list minus user CF trash IDs (they never need to be in except)
        const cleanedExcept = (pc.reset_unmatched_scores_except ?? [])
          .filter(e => !userCfTrashIds.has(e))
        if (cleanedExcept.length > 0) {
          rusObj.except = [...cleanedExcept].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        }
        if (pc.reset_unmatched_scores_except_patterns && pc.reset_unmatched_scores_except_patterns.length > 0) {
          rusObj.except_patterns = pc.reset_unmatched_scores_except_patterns
        }
        entry.reset_unmatched_scores = rusObj
      }
      return entry
    })

    // Custom formats: score overrides (only where override != current API score) + user CFs
    // Group by profileTrashId+score for compact output
    const groupedOverrides: Record<string, { trash_ids: string[]; profileTrashId: string; score: number }> = {}

    for (const o of cfg.scoreOverrides) {
      if (!o.trash_id) continue
      const key = `${o.profileTrashId}::${o.score}`
      if (!groupedOverrides[key]) {
        groupedOverrides[key] = { trash_ids: [], profileTrashId: o.profileTrashId, score: o.score }
      }
      if (!groupedOverrides[key].trash_ids.includes(o.trash_id)) {
        groupedOverrides[key].trash_ids.push(o.trash_id)
      }
    }

    // User CFs with non-zero score
    for (const ucf of cfg.userCfNames) {
      if (ucf.score === 0) continue
      const tid = (ucf.trash_id && ucf.trash_id.trim()) ? ucf.trash_id : ucf.name
      if (!tid) continue
      const profileTargets = ucf.profileTrashId
        ? [ucf.profileTrashId]
        : cfg.profilesConfig.map(pc => pc.trash_id)
      for (const ptid of profileTargets) {
        const key = `${ptid}::${ucf.score}`
        if (!groupedOverrides[key]) {
          groupedOverrides[key] = { trash_ids: [], profileTrashId: ptid, score: ucf.score }
        }
        if (!groupedOverrides[key].trash_ids.includes(tid)) {
          groupedOverrides[key].trash_ids.push(tid)
        }
      }
    }

    const customFormats: unknown[] = []
    for (const g of Object.values(groupedOverrides)) {
      customFormats.push({
        trash_ids: g.trash_ids,
        assign_scores_to: [{ trash_id: g.profileTrashId, score: g.score }],
      })
    }

    const instanceConfig: Record<string, unknown> = {
      base_url: inst.url,
      api_key: inst.api_key,
      quality_definition: qualityDefinition,
    }
    if (qualityProfiles.length > 0) instanceConfig.quality_profiles = qualityProfiles
    if (customFormats.length > 0) instanceConfig.custom_formats = customFormats
    if (cfg.deleteOldCfs) instanceConfig.delete_old_custom_formats = true

    if (inst.type === 'radarr') radarr[instanceKey] = instanceConfig
    else sonarr[instanceKey] = instanceConfig
  }

  const doc: Record<string, unknown> = {}
  if (Object.keys(radarr).length > 0) doc.radarr = radarr
  if (Object.keys(sonarr).length > 0) doc.sonarr = sonarr
  return stringify(doc)
}

async function writeYaml(configs: RecyclarrConfig[], instances: ArrInstanceRow[]): Promise<void> {
  const { configPath } = getRecyclarrSettings()
  const yaml = generateRecyclarrYaml(configs, instances)
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, yaml, 'utf8')
}

function safeJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) as T } catch { return fallback }
}

function rowToConfig(row: RecyclarrConfigRow): RecyclarrConfig {
  return {
    instanceId: row.instance_id,
    enabled: row.enabled === 1,
    selectedProfiles: safeJson<string[]>(row.templates, []),
    scoreOverrides: safeJson<ScoreOverride[]>(row.score_overrides, []),
    userCfNames: safeJson<UserCf[]>(row.user_cf_names, []),
    preferredRatio: row.preferred_ratio ?? 0,
    profilesConfig: safeJson<ProfileConfig[]>(row.profiles_config, []),
    deleteOldCfs: row.delete_old_cfs === 1,
    yamlInstanceKey: row.yaml_instance_key ?? null,
    qualityDefType: row.quality_def_type ?? 'movie',
    lastKnownScores: safeJson<LastKnownScores>(row.last_known_scores ?? '', {}),
  }
}

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map()
const GLOBAL_TASK_KEY = '__global__'

export function scheduleGlobalRecyclarrSync(schedule: string, logger: SimpleLogger): void {
  const existing = scheduledTasks.get(GLOBAL_TASK_KEY)
  if (existing) { existing.stop(); scheduledTasks.delete(GLOBAL_TASK_KEY) }
  if (!schedule || schedule === 'manual') return
  if (!cron.validate(schedule)) {
    logger.warn({ schedule }, 'Invalid global cron schedule for recyclarr sync')
    return
  }
  const task = cron.schedule(schedule, async () => {
    console.log('[Recyclarr Scheduler] Firing global sync')
    logger.info({}, 'Running global scheduled recyclarr sync')
    try {
      const db = getDb()
      const rows = db.prepare('SELECT * FROM recyclarr_config WHERE enabled = 1').all() as RecyclarrConfigRow[]
      if (rows.length === 0) return
      const inUse = db.prepare('SELECT 1 FROM recyclarr_config WHERE is_syncing = 1').get()
      if (inUse) { logger.warn({}, 'Global recyclarr sync already running, skipping'); return }
      db.prepare('UPDATE recyclarr_config SET is_syncing = 1 WHERE enabled = 1').run()
      const { containerName } = getRecyclarrSettings()
      try {
        const { exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'sync'], 300_000)
        const success = exitCode === 0 ? 1 : 0
        db.prepare("UPDATE recyclarr_config SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = ? WHERE enabled = 1").run(success)
      } catch (e) {
        db.prepare("UPDATE recyclarr_config SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = 0 WHERE enabled = 1").run()
        logger.error({ err: e }, 'Global scheduled recyclarr sync failed')
      }
    } catch (e) {
      logger.error({ err: e }, 'Global scheduled recyclarr sync error')
    }
  })
  scheduledTasks.set(GLOBAL_TASK_KEY, task)
  logger.info({ schedule }, 'Scheduled global recyclarr sync')
}

export function scheduleRecyclarrSync(instanceId: string, schedule: string, logger: SimpleLogger): void {
  const existing = scheduledTasks.get(instanceId)
  if (existing) { existing.stop(); scheduledTasks.delete(instanceId) }
  if (!schedule || schedule === 'manual') return
  if (!cron.validate(schedule)) {
    logger.warn({ instanceId, schedule }, 'Invalid cron schedule for recyclarr sync')
    return
  }
  const task = cron.schedule(schedule, async () => {
    logger.info({ instanceId }, 'Running scheduled recyclarr sync')
    try {
      const db = getDb()
      const row = db.prepare('SELECT * FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as RecyclarrConfigRow | undefined
      if (!row || !row.enabled) return
      const inUse = db.prepare('SELECT 1 FROM recyclarr_config WHERE is_syncing = 1').get()
      if (inUse) { logger.warn({ instanceId }, 'Recyclarr sync already running, skipping'); return }
      db.prepare('UPDATE recyclarr_config SET is_syncing = 1 WHERE instance_id = ?').run(instanceId)
      const { containerName } = getRecyclarrSettings()
      try {
        const { exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'sync'], 300_000)
        const success = exitCode === 0 ? 1 : 0
        db.prepare("UPDATE recyclarr_config SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = ? WHERE instance_id = ?").run(success, instanceId)
      } catch (e) {
        db.prepare("UPDATE recyclarr_config SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = 0 WHERE instance_id = ?").run(instanceId)
        logger.error({ instanceId, err: e }, 'Scheduled recyclarr sync failed')
      }
    } catch (e) {
      logger.error({ instanceId, err: e }, 'Scheduled recyclarr sync error')
    }
  })
  scheduledTasks.set(instanceId, task)
  logger.info({ instanceId, schedule }, 'Scheduled recyclarr sync')
}

export function initRecyclarrSchedulers(logger: SimpleLogger): void {
  console.log('[Recyclarr Scheduler] Initializing...')
  try {
    const db = getDb()
    const globalRow = db.prepare("SELECT value FROM settings WHERE key = 'recyclarr_sync_schedule'").get() as { value: string } | undefined
    if (globalRow?.value && globalRow.value !== 'manual') {
      console.log(`[Recyclarr Scheduler] Registered global schedule: ${globalRow.value}`)
      scheduleGlobalRecyclarrSync(globalRow.value, logger)
    } else {
      console.log('[Recyclarr Scheduler] No active schedule (manual or not set)')
    }
  } catch (e) {
    logger.warn({ err: e }, 'Could not init recyclarr schedulers')
  }
}

export default async function recyclarrRoutes(app: FastifyInstance): Promise<void> {
  // Init user CF folders and settings.yml on startup
  try {
    ensureUserCfFolders()
    migrateUserCfFiles(`${USER_CF_BASE}/radarr`)
    migrateUserCfFiles(`${USER_CF_BASE}/sonarr`)
    writeSettingsYml()
  } catch (e) {
    app.log.warn({ err: e }, 'Could not init user CF folders or settings.yml')
  }

  // GET /api/recyclarr/profiles/:service
  app.get<{ Params: { service: string }; Querystring: { refresh?: string } }>(
    '/api/recyclarr/profiles/:service',
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'
      const { containerName } = getRecyclarrSettings()
      try {
        const result = await getQualityProfiles(service, containerName, forceRefresh)
        return reply.send(result)
      } catch (e) {
        app.log.error({ detail: e instanceof Error ? e.message : 'Failed to fetch profiles', url: req.url, method: req.method }, 'Upstream error')
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to fetch profiles' })
      }
    }
  )

  // GET /api/recyclarr/cfs/:service
  app.get<{ Params: { service: string }; Querystring: { refresh?: string } }>(
    '/api/recyclarr/cfs/:service',
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'
      const { containerName } = getRecyclarrSettings()
      try {
        const result = await getCustomFormats(service, containerName, forceRefresh)
        return reply.send(result)
      } catch (e) {
        app.log.error({ detail: e instanceof Error ? e.message : 'Failed to fetch custom formats', url: req.url, method: req.method }, 'Upstream error')
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to fetch custom formats' })
      }
    }
  )

  // GET /api/recyclarr/configs
  app.get('/api/recyclarr/configs', async (req, reply) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT rc.*, ai.name as instance_name, ai.type as instance_type
      FROM recyclarr_config rc
      JOIN arr_instances ai ON rc.instance_id = ai.id
      WHERE ai.type IN ('radarr','sonarr')
      ORDER BY ai.name
    `).all() as (RecyclarrConfigRow & { instance_name: string; instance_type: string })[]

    const globalScheduleRow = db.prepare("SELECT value FROM settings WHERE key = 'recyclarr_sync_schedule'").get() as { value: string } | undefined
    const syncSchedule = globalScheduleRow?.value ?? 'manual'

    const configs = rows.map(row => ({
      instanceId: row.instance_id,
      instanceName: row.instance_name,
      instanceType: row.instance_type as 'radarr' | 'sonarr',
      enabled: row.enabled === 1,
      selectedProfiles: safeJson<string[]>(row.templates, []),
      scoreOverrides: safeJson<ScoreOverride[]>(row.score_overrides, []),
      userCfNames: safeJson<UserCf[]>(row.user_cf_names, []),
      preferredRatio: row.preferred_ratio ?? 0,
      profilesConfig: safeJson<ProfileConfig[]>(row.profiles_config, []),
      syncSchedule: row.sync_schedule ?? 'manual',
      lastSyncedAt: row.last_synced_at,
      lastSyncSuccess: row.last_sync_success === null ? null : row.last_sync_success === 1,
      deleteOldCfs: row.delete_old_cfs === 1,
      isSyncing: row.is_syncing === 1,
      yamlInstanceKey: row.yaml_instance_key ?? null,
      qualityDefType: row.quality_def_type ?? (row.instance_type === 'radarr' ? 'movie' : 'series'),
      lastKnownScores: safeJson<LastKnownScores>(row.last_known_scores ?? '', {}),
    }))
    return reply.send({ configs, syncSchedule })
  })

  // PATCH /api/recyclarr/schedule
  app.patch<{ Body: { syncSchedule: string } }>(
    '/api/recyclarr/schedule',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const { syncSchedule } = req.body
      if (!syncSchedule) return reply.status(400).send({ error: 'syncSchedule required' })
      if (syncSchedule !== 'manual' && !cron.validate(syncSchedule)) {
        return reply.status(400).send({ error: 'Ungültiger Cron-Ausdruck' })
      }
      const db = getDb()
      const existing = db.prepare("SELECT key FROM settings WHERE key = 'recyclarr_sync_schedule'").get()
      if (existing) {
        db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'recyclarr_sync_schedule'").run(syncSchedule)
      } else {
        db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('recyclarr_sync_schedule', ?, datetime('now'))").run(syncSchedule)
      }
      scheduleGlobalRecyclarrSync(syncSchedule, app.log)
      return reply.send({ ok: true, syncSchedule })
    }
  )

  // POST /api/recyclarr/configs/:instanceId
  app.post<{ Params: { instanceId: string }; Body: SaveConfigBody }>(
    '/api/recyclarr/configs/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') return reply.status(400).send({ error: 'Only radarr/sonarr instances supported' })

      const body = req.body
      const userCfTrashIdsForSave = new Set((body.userCfNames ?? []).map((u: UserCf) => u.trash_id).filter(Boolean))
      const cleanedProfilesConfig = (body.profilesConfig ?? []).map((pc: ProfileConfig) => ({
        ...pc,
        reset_unmatched_scores_except: pc.reset_unmatched_scores_except
          .filter((e: string) => !userCfTrashIdsForSave.has(e))
      }))

      const existing = db.prepare('SELECT id FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { id: string } | undefined

      // Compute yaml_instance_key: set once on first save, never change
      const existingKey = existing
        ? (db.prepare('SELECT yaml_instance_key FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { yaml_instance_key: string | null } | undefined)?.yaml_instance_key
        : null
      const yamlInstanceKey = existingKey || body.yamlInstanceKey || sanitizeInstanceKey(inst.name)

      // Update last_known_scores if provided
      const lastKnownScores = body.lastKnownScores != null
        ? JSON.stringify(body.lastKnownScores)
        : null

      if (existing) {
        const updateParts: string[] = [
          'enabled = ?', 'templates = ?', 'score_overrides = ?', 'user_cf_names = ?',
          'preferred_ratio = ?', 'profiles_config = ?', 'sync_schedule = ?', 'delete_old_cfs = ?',
          'quality_def_type = ?',
          "updated_at = datetime('now')",
        ]
        const updateVals: unknown[] = [
          body.enabled ? 1 : 0,
          JSON.stringify(body.selectedProfiles ?? []),
          JSON.stringify(body.scoreOverrides ?? []),
          JSON.stringify(body.userCfNames ?? []),
          body.preferredRatio ?? 0,
          JSON.stringify(cleanedProfilesConfig),
          body.syncSchedule ?? 'manual',
          body.deleteOldCfs ? 1 : 0,
          body.qualityDefType ?? 'movie',
        ]
        // Only set yaml_instance_key if not already set
        if (!existingKey) {
          updateParts.splice(updateParts.length - 1, 0, 'yaml_instance_key = ?')
          updateVals.push(yamlInstanceKey)
        }
        if (lastKnownScores != null) {
          updateParts.splice(updateParts.length - 1, 0, 'last_known_scores = ?')
          updateVals.push(lastKnownScores)
        }
        updateVals.push(instanceId)
        db.prepare(`UPDATE recyclarr_config SET ${updateParts.join(', ')} WHERE instance_id = ?`).run(...updateVals)
      } else {
        const id = nanoid()
        db.prepare(`INSERT INTO recyclarr_config
          (id, instance_id, enabled, templates, score_overrides, user_cf_names, preferred_ratio, profiles_config, sync_schedule, delete_old_cfs, is_syncing, yaml_instance_key, quality_def_type, last_known_scores, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))`).run(
          id, instanceId,
          body.enabled ? 1 : 0,
          JSON.stringify(body.selectedProfiles ?? []),
          JSON.stringify(body.scoreOverrides ?? []),
          JSON.stringify(body.userCfNames ?? []),
          body.preferredRatio ?? 0,
          JSON.stringify(cleanedProfilesConfig),
          body.syncSchedule ?? 'manual',
          body.deleteOldCfs ? 1 : 0,
          yamlInstanceKey,
          body.qualityDefType ?? (inst.type === 'radarr' ? 'movie' : 'series'),
          lastKnownScores ?? '{}'
        )
      }

      scheduleRecyclarrSync(instanceId, body.syncSchedule ?? 'manual', app.log)

      try {
        const allRows = db.prepare('SELECT * FROM recyclarr_config WHERE enabled = 1').all() as RecyclarrConfigRow[]
        const allInsts = db.prepare('SELECT * FROM arr_instances').all() as ArrInstanceRow[]
        const allConfigs = allRows.map(rowToConfig)
        await writeYaml(allConfigs, allInsts)
      } catch (e) {
        app.log.warn({ err: e }, 'Failed to write recyclarr YAML after save')
      }

      return reply.send({ ok: true })
    }
  )

  // GET /api/recyclarr/yaml-preview
  app.get('/api/recyclarr/yaml-preview', { onRequest: [app.authenticate] }, async (req, reply) => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM recyclarr_config WHERE enabled = 1').all() as RecyclarrConfigRow[]
    const insts = db.prepare('SELECT * FROM arr_instances').all() as ArrInstanceRow[]
    const configs = rows.map(rowToConfig)
    const yaml = generateRecyclarrYaml(configs, insts)
    return reply.send({ yaml })
  })

  // POST /api/recyclarr/reset
  app.post('/api/recyclarr/reset', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const db = getDb()
    db.prepare('UPDATE recyclarr_config SET enabled = 0, templates = ?, score_overrides = ?, user_cf_names = ?, preferred_ratio = 0, profiles_config = ?, sync_schedule = ?, delete_old_cfs = 0 WHERE 1=1').run(
      JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), 'manual'
    )
    for (const [, task] of scheduledTasks.entries()) {
      task.stop()
    }
    scheduledTasks.clear()
    try {
      await writeYaml([], [])
    } catch (e) {
      app.log.warn({ err: e }, 'Failed to write empty recyclarr YAML after reset')
    }
    return reply.send({ ok: true })
  })

  // GET /api/recyclarr/global-sync  (SSE streaming)
  app.get('/api/recyclarr/global-sync', { onRequest: [app.authenticate] }, async (req, reply) => {
    const db = getDb()
    const inUse = db.prepare('SELECT 1 FROM recyclarr_config WHERE is_syncing = 1').get()
    if (inUse) return reply.status(409).send({ error: 'A sync is already running' })

    reply.hijack()
    const raw = reply.raw
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.flushHeaders()

    const send = (line: string, type: 'stdout' | 'stderr' | 'done' | 'error') => {
      raw.write(`data: ${JSON.stringify({ line, type })}\n\n`)
    }

    db.prepare('UPDATE recyclarr_config SET is_syncing = 1 WHERE enabled = 1').run()
    const { containerName, configPath } = getRecyclarrSettings()
    backupConfig(configPath)
    try {
      const collectedLines: string[] = []
      let exitCode = await streamingDockerExec(
        containerName,
        ['recyclarr', 'sync'],
        (stream, line) => { send(line, stream); collectedLines.push(line) },
        300_000
      )

      // Auto-adopt: if sync fails and output mentions existing CFs conflict
      if (exitCode !== 0) {
        const combined = collectedLines.join('\n')
        if (combined.includes('state repair --adopt') || combined.includes('already exist')) {
          send('Auto-adopting existing custom formats…', 'stdout')
          try {
            const adoptResult = await dockerExecInContainer(
              containerName, ['recyclarr', 'state', 'repair', '--adopt'], 60_000
            )
            const adoptOutput = (adoptResult.stdout + adoptResult.stderr).trim()
            if (adoptOutput) send(adoptOutput, 'stdout')
            if (adoptResult.exitCode === 0) {
              send('Retrying sync after adoption…', 'stdout')
              exitCode = await streamingDockerExec(
                containerName,
                ['recyclarr', 'sync'],
                (stream, line) => { send(line, stream); collectedLines.push(line) },
                300_000
              )
            }
          } catch (adoptError) {
            send(`Adoption failed: ${adoptError instanceof Error ? adoptError.message : String(adoptError)}`, 'stderr')
          }
        }
      }

      const success = exitCode === 0
      db.prepare("UPDATE recyclarr_config SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = ? WHERE enabled = 1").run(success ? 1 : 0)
      const fullOutput = collectedLines.join('\n')
      recordSyncHistory(success, fullOutput)
      if (success) {
        send('Global sync completed successfully', 'done')
        logActivity('recyclarr', 'Sync abgeschlossen', 'info')
      } else {
        send(`Global sync failed with exit code ${exitCode}`, 'error')
        logActivity('recyclarr', 'Sync fehlgeschlagen', 'warning')
      }
    } catch (e) {
      db.prepare('UPDATE recyclarr_config SET is_syncing = 0 WHERE enabled = 1').run()
      const msg = e instanceof Error ? e.message : 'Sync error'
      recordSyncHistory(false, msg)
      logActivity('recyclarr', `Sync fehlgeschlagen: ${msg}`, 'error')
      send(msg, 'error')
    }
    raw.end()
  })

  // GET /api/recyclarr/trash-cf-names?service=radarr|sonarr
  app.get<{ Querystring: { service?: string } }>(
    '/api/recyclarr/trash-cf-names',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const service = req.query.service as 'radarr' | 'sonarr' | undefined
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { containerName } = getRecyclarrSettings()
      try {
        const { cfs, warning } = await getCustomFormats(service, containerName, false)
        return reply.send({ names: cfs.map(cf => cf.name), cached: false, warning: warning ? 'Container unreachable, using cached data' : undefined })
      } catch (e) {
        app.log.error({ detail: e instanceof Error ? e.message : 'Failed to fetch CF names', url: req.url, method: req.method }, 'Upstream error')
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to fetch CF names' })
      }
    }
  )

  // POST /api/recyclarr/preview-yaml/:instanceId
  app.post<{ Params: { instanceId: string }; Body: SaveConfigBody }>(
    '/api/recyclarr/preview-yaml/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') return reply.status(400).send({ error: 'Only radarr/sonarr instances supported' })
      const body = req.body
      const tempConfig: RecyclarrConfig = {
        instanceId,
        enabled: body.enabled,
        selectedProfiles: body.selectedProfiles ?? [],
        scoreOverrides: body.scoreOverrides ?? [],
        userCfNames: body.userCfNames ?? [],
        preferredRatio: body.preferredRatio ?? 0,
        profilesConfig: body.profilesConfig ?? [],
        deleteOldCfs: body.deleteOldCfs ?? false,
        yamlInstanceKey: body.yamlInstanceKey ?? null,
        qualityDefType: body.qualityDefType ?? (inst.type === 'radarr' ? 'movie' : 'series'),
        lastKnownScores: {},
      }
      const yaml = generateRecyclarrYaml([tempConfig], [inst])
      return reply.send({ yaml })
    }
  )

  // DELETE /api/recyclarr/cache/:service
  app.delete<{ Params: { service: string } }>(
    '/api/recyclarr/cache/:service',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.params.service
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      delSetting(`recyclarr_profiles_cache_${service}`)
      delSetting(`recyclarr_cf_cache_${service}`)
      return reply.send({ ok: true })
    }
  )

  // GET /api/recyclarr/debug/cf-raw?service=radarr|sonarr
  app.get<{ Querystring: { service?: string } }>(
    '/api/recyclarr/debug/cf-raw',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.query.service as 'radarr' | 'sonarr' | undefined
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { containerName } = getRecyclarrSettings()
      try {
        const { stdout, stderr, exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'list', 'custom-formats', service, '--raw'], 15_000)
        const parsed = parseCustomFormats(stdout, service)
        return reply.send({
          stdout,
          stderr,
          exitCode,
          parsed_count: parsed.length,
          first_10_lines: stdout.split('\n').slice(0, 10),
        })
      } catch (e) {
        app.log.error({ detail: e instanceof Error ? e.message : 'Failed', url: req.url, method: req.method }, 'Upstream error')
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed' })
      }
    }
  )

  // POST /api/recyclarr/adopt
  app.post('/api/recyclarr/adopt', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { containerName } = getRecyclarrSettings()
    try {
      const { exitCode, stdout, stderr } = await dockerExecInContainer(
        containerName, ['recyclarr', 'state', 'repair', '--adopt'], 60_000
      )
      return reply.send({ ok: exitCode === 0, output: stdout + stderr })
    } catch (e) {
      app.log.error({ detail: e instanceof Error ? e.message : 'Adopt failed', url: req.url, method: req.method }, 'Upstream error')
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Adopt failed' })
    }
  })

  // ── User CF filesystem routes ───────────────────────────────────────────────

  // GET /api/recyclarr/user-cfs/:service
  app.get<{ Params: { service: string } }>(
    '/api/recyclarr/user-cfs/:service',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      try {
        return reply.send({ cfs: listUserCfs(service) })
      } catch (e) {
        app.log.error({ detail: e instanceof Error ? e.message : 'Failed to list user CFs', url: req.url, method: req.method }, 'Upstream error')
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to list user CFs' })
      }
    }
  )

  // POST /api/recyclarr/user-cfs/:service
  app.post<{ Params: { service: string }; Body: CreateUserCfBody }>(
    '/api/recyclarr/user-cfs/:service',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { name, specifications } = req.body
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
      const trashId = toUserCfSlug(name.trim())
      ensureUserCfFolders()
      const existing = listUserCfs(service)
      if (existing.some(cf => cf.trash_id === trashId)) {
        return reply.status(400).send({ error: `A user CF with trash_id "${trashId}" already exists` })
      }
      const cf: UserCfFile = {
        trash_id: trashId,
        name: name.trim(),
        includeCustomFormatWhenRenaming: false,
        specifications: specifications ?? [],
      }
      fs.writeFileSync(path.join(USER_CF_BASE, service, `${trashId}.json`), JSON.stringify(cf, null, 2), 'utf8')
      writeSettingsYml()
      return reply.status(201).send({ cf })
    }
  )

  // PUT /api/recyclarr/user-cfs/:service/:trashId
  app.put<{ Params: { service: string; trashId: string }; Body: UpdateUserCfBody }>(
    '/api/recyclarr/user-cfs/:service/:trashId',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { trashId } = req.params
      const { name, specifications } = req.body
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
      const filePath = path.join(USER_CF_BASE, service, `${trashId}.json`)
      if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'CF not found' })
      const cf: UserCfFile = {
        trash_id: trashId,
        name: name.trim(),
        includeCustomFormatWhenRenaming: false,
        specifications: specifications ?? [],
      }
      fs.writeFileSync(filePath, JSON.stringify(cf, null, 2), 'utf8')
      return reply.send({ cf })
    }
  )

  // DELETE /api/recyclarr/user-cfs/:service/:trashId
  app.delete<{ Params: { service: string; trashId: string } }>(
    '/api/recyclarr/user-cfs/:service/:trashId',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { trashId } = req.params
      const filePath = path.join(USER_CF_BASE, service, `${trashId}.json`)
      if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'CF file not found' })
      // Block deletion if CF is active in any Recyclarr profile
      const db = getDb()
      const configRows = db.prepare('SELECT user_cf_names FROM recyclarr_config').all() as { user_cf_names: string }[]
      for (const row of configRows) {
        const names = safeJson<UserCf[]>(row.user_cf_names, [])
        if (names.some(ucf => ucf.trash_id === trashId)) {
          return reply.status(409).send({ error: 'CF aktiv in Recyclarr-Profil — dort zuerst entfernen' })
        }
      }
      fs.unlinkSync(filePath)
      writeSettingsYml()
      // Regenerate YAML
      try {
        const allRows = db.prepare('SELECT * FROM recyclarr_config WHERE enabled = 1').all() as RecyclarrConfigRow[]
        const allInsts = db.prepare('SELECT * FROM arr_instances').all() as ArrInstanceRow[]
        await writeYaml(allRows.map(rowToConfig), allInsts)
      } catch (e) {
        app.log.warn({ err: e }, 'Failed to write recyclarr YAML after user CF delete')
      }
      return reply.status(204).send()
    }
  )

  // ── New routes for arr-data, score changes, list-profiles, list-score-sets ──

  // GET /api/recyclarr/arr-data/:instanceId
  // Fetches quality profiles + custom formats directly from the Arr instance API
  app.get<{ Params: { instanceId: string } }>(
    '/api/recyclarr/arr-data/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') return reply.status(400).send({ error: 'Only radarr/sonarr supported' })

      const agent = new Agent({ connect: { rejectUnauthorized: false } })
      const baseUrl = inst.url.replace(/\/$/, '')
      const headers = { 'X-Api-Key': inst.api_key, 'Content-Type': 'application/json' }

      try {
        const [profilesRes, cfsRes] = await Promise.all([
          undiciRequest(`${baseUrl}/api/v3/qualityprofile`, { method: 'GET', headers, dispatcher: agent }),
          undiciRequest(`${baseUrl}/api/v3/customformat`, { method: 'GET', headers, dispatcher: agent }),
        ])
        const profiles = await profilesRes.body.json() as ArrQualityProfile[]
        const customFormats = await cfsRes.body.json() as ArrCustomFormat[]
        return reply.send({ profiles, customFormats })
      } catch (e) {
        app.log.error({ detail: e instanceof Error ? e.message : 'Failed to reach instance', url: req.url, method: req.method }, 'Upstream error')
        return reply.send({ profiles: [], customFormats: [], error: e instanceof Error ? e.message : 'Failed to reach instance' })
      }
    }
  )

  // POST /api/recyclarr/check-score-changes/:instanceId
  app.post<{ Params: { instanceId: string }; Body: { profileData: ArrQualityProfile[] } }>(
    '/api/recyclarr/check-score-changes/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const row = db.prepare('SELECT last_known_scores FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { last_known_scores: string | null } | undefined
      const lastKnown: LastKnownScores = safeJson<LastKnownScores>(row?.last_known_scores ?? '', {})
      const profileData: ArrQualityProfile[] = req.body.profileData ?? []

      const changes: ScoreChange[] = []
      for (const profile of profileData) {
        const profileTid = profile.trash_id
        if (!profileTid) continue
        const knownForProfile = lastKnown[profileTid] ?? {}
        for (const item of profile.formatItems ?? []) {
          // Only care about CFs that have a trash_id (known to recyclarr)
          // We store by CF name since Arr API doesn't give trash_id here; use format id as key
          const cfKey = String(item.format)
          if (!(cfKey in knownForProfile)) continue
          const oldScore = knownForProfile[cfKey]!
          if (oldScore !== item.score) {
            changes.push({
              profileTrashId: profileTid,
              profileName: profile.name,
              cfTrashId: cfKey,
              cfName: item.name,
              oldScore,
              newScore: item.score,
            })
          }
        }
      }
      return reply.send({ hasChanges: changes.length > 0, changes })
    }
  )

  // POST /api/recyclarr/accept-score-changes/:instanceId
  app.post<{ Params: { instanceId: string }; Body: { changes: ScoreChange[] } }>(
    '/api/recyclarr/accept-score-changes/:instanceId',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const row = db.prepare('SELECT last_known_scores FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { last_known_scores: string | null } | undefined
      if (!row) return reply.status(404).send({ error: 'Config not found' })
      const lastKnown: LastKnownScores = safeJson<LastKnownScores>(row.last_known_scores ?? '', {})

      for (const change of req.body.changes ?? []) {
        if (!lastKnown[change.profileTrashId]) lastKnown[change.profileTrashId] = {}
        lastKnown[change.profileTrashId]![change.cfTrashId] = change.newScore
      }
      db.prepare("UPDATE recyclarr_config SET last_known_scores = ?, updated_at = datetime('now') WHERE instance_id = ?")
        .run(JSON.stringify(lastKnown), instanceId)
      return reply.send({ ok: true })
    }
  )

  // GET /api/recyclarr/profile-cfs/:instanceId?profileTrashId=xxx
  app.get<{ Params: { instanceId: string }; Querystring: { profileTrashId?: string } }>(
    '/api/recyclarr/profile-cfs/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const { profileTrashId } = req.query

      if (!profileTrashId) return reply.status(400).send({ error: 'profileTrashId required' })

      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') return reply.status(400).send({ error: 'Only radarr/sonarr supported' })

      const service = inst.type as 'radarr' | 'sonarr'
      const { containerName } = getRecyclarrSettings()

      // Step 1: Fetch CFs managed by Recyclarr — always force-fresh for profile display
      let recyclarrCfs: RecyclarrCf[] = []
      let warning = false
      let warningMessage: string | undefined

      try {
        const result = await getCustomFormats(service, containerName, true)
        recyclarrCfs = result.cfs
        if (result.warning) warning = true
      } catch (e) {
        app.log.warn({ err: e }, 'Failed to fetch Recyclarr managed CFs for profile-cfs')
        warning = true
        warningMessage = 'CF-Gruppen konnten nicht geladen werden'
      }

      // Clear group cache so group memberships are also freshly fetched
      cfGroupsCache.delete(service)
      // TRaSH guide CFs (trash_id does not start with "user-")
      const recyclarrCfNameSet = new Set(recyclarrCfs.filter(c => !c.trash_id.startsWith('user-')).map(c => c.name.toLowerCase()))
      // User-created CFs (trash_id starts with "user-") — shown in profile but with different badge
      const userCfNameSet = new Set(recyclarrCfs.filter(c => c.trash_id.startsWith('user-')).map(c => c.name.toLowerCase()))

      // Step 2: Fetch live quality profiles from Arr
      const agent = new Agent({ connect: { rejectUnauthorized: false } })
      const baseUrl = inst.url.replace(/\/$/, '')
      const headers = { 'X-Api-Key': inst.api_key, 'Content-Type': 'application/json' }

      let arrProfiles: ArrQualityProfile[] = []
      try {
        const profilesRes = await undiciRequest(`${baseUrl}/api/v3/qualityprofile`, { method: 'GET', headers, dispatcher: agent })
        arrProfiles = await profilesRes.body.json() as ArrQualityProfile[]
      } catch (e) {
        app.log.error({ err: e }, 'Failed to reach Arr instance for profile-cfs')
        return reply.status(502).send({ error: `Arr instance unreachable: ${e instanceof Error ? e.message : 'unknown'}` })
      }

      // Find the matching Arr profile: first by trash_id, then by name from recyclarr_config
      let arrProfile = arrProfiles.find(p => p.trash_id === profileTrashId)
      if (!arrProfile) {
        const cfgRow = db.prepare('SELECT profiles_config FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { profiles_config: string } | undefined
        const profilesConfig = safeJson<ProfileConfig[]>(cfgRow?.profiles_config ?? '', [])
        const configured = profilesConfig.find(p => p.trash_id === profileTrashId)
        if (configured) {
          arrProfile = arrProfiles.find(p => p.name === configured.name)
        }
      }
      if (!arrProfile) {
        return reply.status(400).send({ error: `Profile not found for trash_id: ${profileTrashId}` })
      }

      const formatItems = [...(arrProfile.formatItems ?? [])].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      )

      // Step 3: Show ALL formatItems from this quality profile; mark managedByRecyclarr/isUserCf per entry
      type CfEntry = { arrId: number; name: string; currentScore: number; groups: string[]; inMultipleGroups: boolean; managedByRecyclarr: boolean; isUserCf: boolean }
      type NotInProfileEntry = { arrId: number; name: string; currentScore: number }

      const cfs: CfEntry[] = []
      const notInProfile: NotInProfileEntry[] = []

      // Only show TRaSH-managed CFs in main list; user CFs handled frontend-only; unmanaged → notInProfile
      for (const item of formatItems) {
        const managedByRecyclarr = recyclarrCfNameSet.has(item.name.toLowerCase())
        const isUserCf = userCfNameSet.has(item.name.toLowerCase())
        if (isUserCf) continue  // User CFs handled in frontend only
        if (managedByRecyclarr) {
          cfs.push({ arrId: item.format, name: item.name, currentScore: item.score, groups: [], inMultipleGroups: false, managedByRecyclarr: true, isUserCf: false })
        } else {
          notInProfile.push({ arrId: item.format, name: item.name, currentScore: item.score })
        }
      }

      // Step 4: Fetch CF groups (5-min in-memory cache per service)
      const groupCacheKey = service
      const groupCached = cfGroupsCache.get(groupCacheKey)
      let parsedGroups: { name: string; cfNames: string[] }[] = []
      let allGroupsForEdgeCase: { name: string; cfNames: string[] }[] = []
      const profileCfNamesLower = new Set(formatItems.map(item => item.name.toLowerCase()))

      if (groupCached && Date.now() - groupCached.fetchedAt < CF_GROUPS_CACHE_TTL) {
        // Filter cached groups: >= 50% of group CFs must be in this profile
        allGroupsForEdgeCase = groupCached.groups
        parsedGroups = groupCached.groups.filter(g => {
          const matchCount = g.cfNames.filter(n => profileCfNamesLower.has(n.toLowerCase())).length
          return matchCount > 0 && matchCount >= Math.ceil(g.cfNames.length * 0.5)
        })
        // Groups loaded from cache successfully — clear any warning from earlier steps
        warning = false; warningMessage = undefined
      } else {
        try {
          // --raw output format: paired lines per CF
          //   Line N:   group_trash_id<TAB>group_name
          //   Line N+1: cf_trash_id<TAB>cf_name<TAB>required<TAB>default
          const rawResult = await dockerExecInContainer(
            containerName,
            ['recyclarr', 'list', 'custom-format-groups', service, '--raw'],
            15_000
          )

          if (rawResult.exitCode === 0 && rawResult.stdout.trim()) {
            const lines = rawResult.stdout.split('\n').filter(l => l.trim())
            const groupMap = new Map<string, { name: string; cfNames: string[] }>()
            let i = 0
            while (i < lines.length) {
              const groupParts = lines[i]!.split('\t')
              const cfParts = lines[i + 1]?.split('\t')
              if (groupParts.length >= 2 && cfParts && cfParts.length >= 2) {
                const groupId = groupParts[0]!.trim()
                const groupName = groupParts[1]!.trim()
                const cfName = cfParts[1]!.trim()
                if (groupId && groupName && cfName) {
                  if (!groupMap.has(groupId)) {
                    groupMap.set(groupId, { name: groupName, cfNames: [] })
                  }
                  groupMap.get(groupId)!.cfNames.push(cfName)
                }
                i += 2
              } else {
                i++
              }
            }
            if (groupMap.size > 0) {
              const allGroups = Array.from(groupMap.values())
              cfGroupsCache.set(groupCacheKey, { groups: allGroups, fetchedAt: Date.now() })
              allGroupsForEdgeCase = allGroups
              parsedGroups = allGroups.filter(g => {
                const matchCount = g.cfNames.filter(n => profileCfNamesLower.has(n.toLowerCase())).length
                return matchCount > 0 && matchCount >= Math.ceil(g.cfNames.length * 0.5)
              })
              // Groups parsed successfully — clear any warning from earlier steps
              // Even if filtering leaves 0 relevant groups, that's normal (not an error)
              warning = false; warningMessage = undefined
            }
          } else if (rawResult.exitCode !== 0) {
            app.log.warn({ exitCode: rawResult.exitCode, service }, 'recyclarr list custom-format-groups exited non-zero')
            if (!warning) { warning = true; warningMessage = 'CF-Gruppen konnten nicht geladen werden' }
          }
        } catch (e) {
          app.log.error({ err: e, service }, 'Failed to fetch CF groups via docker exec')
          if (!warning) { warning = true; warningMessage = 'CF-Gruppen konnten nicht geladen werden' }
        }
      }

      // Step 5: Assign group membership to each CF entry
      for (const group of parsedGroups) {
        const cfNamesLower = new Set(group.cfNames.map(n => n.toLowerCase()))
        for (const cf of cfs) {
          if (cfNamesLower.has(cf.name.toLowerCase())) cf.groups.push(group.name)
        }
      }

      // Step 6: Edge case — filter irrelevant groups, move CFs-in-irrelevant-only-groups to notInProfile
      const allGroupCfNamesLower = new Set(allGroupsForEdgeCase.flatMap(g => g.cfNames.map(n => n.toLowerCase())))
      const relevantGroupNames = new Set(parsedGroups.map(g => g.name))
      for (const cf of cfs) {
        cf.groups = cf.groups.filter(groupName => relevantGroupNames.has(groupName))
        cf.inMultipleGroups = cf.groups.length > 1
      }
      const toRemove = new Set<number>()
      for (let i = 0; i < cfs.length; i++) {
        const cf = cfs[i]!
        if (cf.groups.length === 0 && allGroupCfNamesLower.has(cf.name.toLowerCase())) {
          // Belongs to irrelevant groups only — not relevant for this profile
          notInProfile.push({ arrId: cf.arrId, name: cf.name, currentScore: cf.currentScore })
          toRemove.add(i)
        }
      }
      const afterStep6 = cfs.filter((_, i) => !toRemove.has(i))

      // Step 7: Ungrouped CFs with score 0 are likely spillover from other profiles — move to notInProfile
      const toRemove2 = new Set<number>()
      for (let i = 0; i < afterStep6.length; i++) {
        const cf = afterStep6[i]!
        if (cf.groups.length === 0 && cf.currentScore === 0) {
          notInProfile.push({ arrId: cf.arrId, name: cf.name, currentScore: 0 })
          toRemove2.add(i)
        }
      }
      const finalCfs = afterStep6.filter((_, i) => !toRemove2.has(i))

      app.log.info({
        recyclarrCfCount: recyclarrCfs.length,
        recyclarrCfNameSetSize: recyclarrCfNameSet.size,
        userCfCount: userCfNameSet.size,
        formatItemsCount: formatItems.length,
        groupsParsed: parsedGroups.length,
        cfsWithGroups: finalCfs.filter(c => c.groups.length > 0).length,
        totalCfs: finalCfs.length,
        notInProfileCount: notInProfile.length,
      }, 'profile-cfs result summary')

      const responseGroups = parsedGroups.map(g => ({
        name: g.name,
        cfNames: g.cfNames,
        syncEnabled: true,
      }))

      return reply.send({ cfs: finalCfs, groups: responseGroups, notInProfile, warning, warningMessage })
    }
  )

  // GET /api/recyclarr/list-profiles/:instanceId
  app.get<{ Params: { instanceId: string } }>(
    '/api/recyclarr/list-profiles/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') return reply.status(400).send({ error: 'Only radarr/sonarr supported' })
      const { containerName } = getRecyclarrSettings()
      try {
        const { stdout, exitCode } = await dockerExecInContainer(
          containerName,
          ['recyclarr', 'list', 'quality-profiles', inst.type, '--raw'],
          15_000
        )
        if (exitCode !== 0) throw new Error(`exit ${exitCode}`)
        const parsed = parseQualityProfiles(stdout, inst.type, 'container')
        return reply.send({ profiles: parsed.map(p => ({ trash_id: p.trash_id, name: p.name })) })
      } catch (e) {
        app.log.error({ detail: e instanceof Error ? e.message : 'Failed to list profiles', url: req.url, method: req.method }, 'Upstream error')
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to list profiles' })
      }
    }
  )

  // GET /api/recyclarr/list-score-sets/:instanceId
  app.get<{ Params: { instanceId: string } }>(
    '/api/recyclarr/list-score-sets/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') return reply.status(400).send({ error: 'Only radarr/sonarr supported' })
      const { containerName } = getRecyclarrSettings()
      try {
        const { stdout, exitCode } = await dockerExecInContainer(
          containerName,
          ['recyclarr', 'list', 'score-sets', inst.type],
          15_000
        )
        if (exitCode !== 0) throw new Error(`exit ${exitCode}`)
        // Parse lines: filter out header/box-drawing chars
        const scoreSets = stdout.split('\n')
          .map(l => l.replace(/[│┌└─┐┘]/g, '').trim())
          .filter(l => l && !/^(Name|score.set)/i.test(l))
          .filter(l => !/^\s*$/.test(l))
        return reply.send({ scoreSets })
      } catch (e) {
        app.log.error({ detail: e instanceof Error ? e.message : 'Failed to list score sets', url: req.url, method: req.method }, 'Upstream error')
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to list score sets' })
      }
    }
  )

  // GET /api/recyclarr/container-status?name=recyclarr
  app.get<{ Querystring: { name?: string } }>(
    '/api/recyclarr/container-status',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const name = req.query.name || 'recyclarr'
      try {
        const res = await dockerPool.request({
          path: `/v1.41/containers/${encodeURIComponent(name)}/json`,
          method: 'GET',
        })
        if (res.statusCode === 404) {
          await res.body.dump()
          return reply.send({ running: false, name })
        }
        const info = await res.body.json() as { State?: { Running?: boolean } }
        return reply.send({ running: info.State?.Running === true, name })
      } catch (e) {
        return reply.send({ running: false, name })
      }
    }
  )

  // GET /api/recyclarr/importable-cfs/:instanceId
  app.get<{ Params: { instanceId: string } }>(
    '/api/recyclarr/importable-cfs/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') {
        return reply.status(400).send({ error: 'Only radarr/sonarr supported' })
      }
      const service = inst.type as 'radarr' | 'sonarr'
      const agent = new Agent({ connect: { rejectUnauthorized: false } })
      const baseUrl = inst.url.replace(/\/$/, '')
      const headers = { 'X-Api-Key': inst.api_key, 'Content-Type': 'application/json' }

      // 1. Get all CFs from Arr
      let arrCfs: ArrCustomFormatFull[] = []
      try {
        const res = await undiciRequest(`${baseUrl}/api/v3/customformat`, { method: 'GET', headers, dispatcher: agent })
        arrCfs = await res.body.json() as ArrCustomFormatFull[]
      } catch (e) {
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to reach instance' })
      }

      // 2. Get Recyclarr-known CF names via docker exec
      const { containerName } = getRecyclarrSettings()
      const recyclarrKnownNames = new Set<string>()
      try {
        const { stdout, exitCode } = await dockerExecInContainer(
          containerName,
          ['recyclarr', 'list', 'custom-formats', service],
          15_000
        )
        if (exitCode === 0) {
          for (const cf of parseCustomFormats(stdout, service)) {
            recyclarrKnownNames.add(cf.name.toLowerCase())
          }
        }
      } catch { /* recyclarr unavailable — skip name filtering */ }

      // 3. Load already managed CFs from user-cfs/
      const managedCfs = listUserCfs(service)
      const managedByTrashId = new Map(managedCfs.map(cf => [cf.trash_id, cf]))
      const managedByName = new Map(managedCfs.map(cf => [cf.name.toLowerCase(), cf]))

      // 4. Classify
      const importable: ArrCustomFormatFull[] = []
      const alreadyManaged: { cf: ArrCustomFormatFull; hasChanges: boolean }[] = []

      for (const cf of arrCfs) {
        if (recyclarrKnownNames.has(cf.name.toLowerCase())) continue
        const slug = toUserCfSlug(cf.name)
        const managedCf = managedByTrashId.get(slug) ?? managedByName.get(cf.name.toLowerCase())
        if (managedCf) {
          const hasChanges =
            JSON.stringify(normalizeSpecsForCompare(managedCf.specifications as unknown[])) !==
            JSON.stringify(normalizeSpecsForCompare(cf.specifications))
          alreadyManaged.push({ cf, hasChanges })
        } else {
          importable.push(cf)
        }
      }

      return reply.send({ importable, alreadyManaged })
    }
  )

  // GET /api/recyclarr/sync-history
  app.get('/api/recyclarr/sync-history', { preHandler: [app.authenticate] }, async (_req, reply) => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM recyclarr_sync_history ORDER BY synced_at DESC LIMIT 10').all() as SyncHistoryRow[]
    return reply.send({
      history: rows.map(r => ({
        id: r.id,
        synced_at: r.synced_at.endsWith('Z') ? r.synced_at : r.synced_at.replace(' ', 'T') + 'Z',
        success: r.success === 1,
        output: r.output,
        changes_summary: r.changes_summary ? JSON.parse(r.changes_summary) as { created?: number; updated?: number; deleted?: number } : null,
      }))
    })
  })

  // GET /api/recyclarr/backups — list backup files (admin only)
  app.get('/api/recyclarr/backups', { preHandler: [app.requireAdmin] }, async (_req, reply) => {
    const { configPath } = getRecyclarrSettings()
    const dir = path.dirname(configPath)
    const base = path.basename(configPath)
    try {
      const files = fs.readdirSync(dir).filter(f => f.startsWith(`${base}.bak.`))
      const backups = files.map(f => {
        const filePath = path.join(dir, f)
        const stat = fs.statSync(filePath)
        const tsStr = f.replace(`${base}.bak.`, '')
        const ts = parseInt(tsStr, 10)
        return {
          filename: f,
          timestamp: isNaN(ts) ? stat.mtime.toISOString() : new Date(ts).toISOString(),
          size: stat.size,
        }
      }).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      return reply.send({ backups })
    } catch {
      return reply.send({ backups: [] })
    }
  })

  // POST /api/recyclarr/backups/:filename/restore — restore backup (admin only)
  app.post<{ Params: { filename: string } }>(
    '/api/recyclarr/backups/:filename/restore',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const { configPath } = getRecyclarrSettings()
      const dir = path.dirname(configPath)
      const filename = path.basename(req.params.filename) // prevent traversal
      const backupPath = path.join(dir, filename)
      if (!fs.existsSync(backupPath)) return reply.status(404).send({ error: 'Backup not found' })
      try {
        fs.copyFileSync(backupPath, configPath)
        return reply.send({ ok: true })
      } catch (e) {
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Restore failed' })
      }
    }
  )
}
