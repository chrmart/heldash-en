import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { nanoid } from 'nanoid'
import * as fs from 'fs'
import * as path from 'path'
import { getDb, safeJson } from '../db/database'
import { callerGroupId as _callerGroupId, isValidHttpUrl } from './_helpers'
import { RadarrClient } from '../arr/radarr'
import { SonarrClient } from '../arr/sonarr'
import { ProwlarrClient } from '../arr/prowlarr'
import { SabnzbdClient } from '../arr/sabnzbd'
import { logActivity } from './activity'
import { SeerrClient } from '../arr/seerr'
import type { SeerrDiscoverResponse } from '../arr/seerr'

// ── Calendar entry (combined endpoint + widget) ───────────────────────────────
export interface CalendarEntry {
  id: string
  title: string
  type: 'movie' | 'episode'
  date: string        // YYYY-MM-DD
  instanceId: string
  instanceName: string
  instanceType: 'radarr' | 'sonarr'
  season_number?: number
  episode_number?: number
}

/** Fetch and merge calendar items for the given instance IDs.
 *  Skips instances that are unavailable or fail; deduplicates by title+date.
 *  Pass daysAhead to filter from today onward. */
export async function fetchCombinedCalendar(
  instanceIds: string[],
  groupId: string | null,
  daysAhead?: number,
): Promise<CalendarEntry[]> {
  const db = getDb()
  const start = new Date(); start.setDate(start.getDate() - 1)
  const end   = new Date(); end.setDate(end.getDate() + 30)
  const startStr = start.toISOString().slice(0, 10)
  const endStr   = end.toISOString().slice(0, 10)

  function isVisible(instanceId: string): boolean {
    if (groupId === null || groupId === 'grp_admin') return true
    return !db.prepare(
      'SELECT 1 FROM group_arr_visibility WHERE group_id = ? AND instance_id = ?'
    ).get(groupId, instanceId)
  }

  const items: CalendarEntry[] = []

  await Promise.all(instanceIds.map(async (id) => {
    const row = db.prepare(
      'SELECT * FROM arr_instances WHERE id = ? AND enabled = 1'
    ).get(id) as ArrInstanceRow | undefined
    if (!row) return
    if (row.type !== 'radarr' && row.type !== 'sonarr') return
    if (!isVisible(id)) return

    try {
      if (row.type === 'radarr') {
        const movies = await new RadarrClient(row.url, row.api_key).getCalendar(startStr, endStr) as Array<{
          id: number; title: string; inCinemas?: string; digitalRelease?: string
        }>
        for (const movie of movies) {
          const date = (movie.digitalRelease ?? movie.inCinemas ?? '').slice(0, 10)
          if (!date) continue
          items.push({ id: `radarr-${row.id}-${movie.id}`, title: movie.title, type: 'movie', date, instanceId: row.id, instanceName: row.name, instanceType: 'radarr' })
        }
      } else {
        const episodes = await new SonarrClient(row.url, row.api_key).getCalendar(startStr, endStr) as Array<{
          id: number; title: string; airDateUtc?: string; seasonNumber: number; episodeNumber: number; series?: { title: string }
        }>
        for (const ep of episodes) {
          const date = (ep.airDateUtc ?? '').slice(0, 10)
          if (!date) continue
          items.push({ id: `sonarr-${row.id}-${ep.id}`, title: ep.series?.title ?? ep.title, type: 'episode', date, instanceId: row.id, instanceName: row.name, instanceType: 'sonarr', season_number: ep.seasonNumber, episode_number: ep.episodeNumber })
        }
      }
    } catch { /* skip failing instance */ }
  }))

  // deduplicate by title+date, sort ascending
  const seen = new Set<string>()
  const deduped = items.filter(item => {
    const key = `${item.title}|${item.date}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  deduped.sort((a, b) => a.date.localeCompare(b.date))

  if (daysAhead !== undefined) {
    const today = new Date().toISOString().slice(0, 10)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + daysAhead)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return deduped.filter(i => i.date >= today && i.date <= cutoffStr)
  }
  return deduped
}

// ── DB row type ───────────────────────────────────────────────────────────────
interface ArrInstanceRow {
  id: string
  type: string
  name: string
  url: string
  api_key: string
  enabled: number
  position: number
  created_at: string
  updated_at: string
}

// ── Request body types ────────────────────────────────────────────────────────
interface CreateInstanceBody {
  type: string
  name: string
  url: string
  api_key: string
  enabled?: boolean
  position?: number
}

interface PatchInstanceBody {
  name?: string
  url?: string
  api_key?: string
  enabled?: boolean
  position?: number
}

interface VisibilityBody {
  hidden_instance_ids: string[]
}

interface CreateCfBody {
  name: string
  includeCustomFormatWhenRenaming?: boolean
  specifications: object[]
  trash_id?: string
}

interface PutCfBody {
  name: string
  includeCustomFormatWhenRenaming?: boolean
  specifications: object[]
  trash_id?: string
}

interface DeleteCfQuerystring {
  trashId?: string
}

interface UpdateProfileScoresBody {
  scores: { formatId: number; score: number }[]
}

// ── CF file helpers ───────────────────────────────────────────────────────────

function getUserCfBase(): string {
  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'recyclarr_config_path'").get() as { value: string } | undefined
  let configPath = '/recyclarr/recyclarr.yml'
  if (row) { try { configPath = JSON.parse(row.value) as string } catch { configPath = row.value } }
  return path.join(path.dirname(configPath), 'user-cfs')
}

function toUserCfSlugLocal(name: string): string {
  return 'user-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function writeUserCfJson(base: string, service: string, trashId: string, cf: object): void {
  const dir = path.join(base, service)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${trashId}.json`), JSON.stringify(cf, null, 2), 'utf8')
}

// ── CF schema cache (1h per instance) ────────────────────────────────────────

const cfSchemaCache = new Map<string, { data: unknown[]; ts: number }>()
const CF_SCHEMA_TTL = 60 * 60 * 1000

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Never return the API key to the client */
function sanitize(r: ArrInstanceRow) {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    url: r.url,
    enabled: r.enabled === 1,
    position: r.position,
    created_at: r.created_at,
  }
}

function calendarRange() {
  const start = new Date()
  start.setDate(start.getDate() - 7)
  const end = new Date()
  end.setDate(end.getDate() + 365)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export async function arrRoutes(app: FastifyInstance) {
  const db = getDb()

  function isVisibleToGroup(instanceId: string, groupId: string | null): boolean {
    if (groupId === null || groupId === 'grp_admin') return true
    return !db.prepare(
      'SELECT 1 FROM group_arr_visibility WHERE group_id = ? AND instance_id = ?'
    ).get(groupId, instanceId)
  }

  /** Resolve an instance and enforce group visibility; sends error reply and returns null on failure */
  async function resolveInstance(
    req: FastifyRequest,
    reply: FastifyReply,
    id: string,
  ): Promise<ArrInstanceRow | null> {
    const groupId = await _callerGroupId(req)
    const row = db.prepare(
      'SELECT * FROM arr_instances WHERE id = ? AND enabled = 1'
    ).get(id) as ArrInstanceRow | undefined

    if (!row) { reply.status(404).send({ error: 'Not found' }); return null }
    if (!isVisibleToGroup(id, groupId)) { reply.status(403).send({ error: 'Forbidden' }); return null }
    return row
  }

  function makeClient(row: ArrInstanceRow): RadarrClient | SonarrClient | ProwlarrClient {
    if (row.type === 'radarr') return new RadarrClient(row.url, row.api_key)
    if (row.type === 'sonarr') return new SonarrClient(row.url, row.api_key)
    if (row.type === 'prowlarr') return new ProwlarrClient(row.url, row.api_key)
    throw new Error(`makeClient called for unsupported type: ${row.type}`)
  }

  // ── Instance CRUD (admin-only) ─────────────────────────────────────────────

  // GET /api/arr/instances — visible to caller's group; public (filtered)
  app.get('/api/arr/instances', async (req) => {
    const groupId = await _callerGroupId(req)
    const all = db.prepare(
      'SELECT * FROM arr_instances ORDER BY position, type, name'
    ).all() as ArrInstanceRow[]

    if (groupId === null) return all.map(sanitize)  // admin sees all

    const hidden = new Set(
      (db.prepare(
        'SELECT instance_id FROM group_arr_visibility WHERE group_id = ?'
      ).all(groupId) as { instance_id: string }[]).map(r => r.instance_id)
    )
    return all.filter(r => !hidden.has(r.id)).map(sanitize)
  })

  // POST /api/arr/instances
  app.post<{ Body: CreateInstanceBody }>(
    '/api/arr/instances',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const { type, name, url, api_key, enabled = true, position = 0 } = req.body
      if (!['radarr', 'sonarr', 'prowlarr', 'sabnzbd', 'seerr'].includes(type)) {
        return reply.status(400).send({ error: 'type must be radarr, sonarr, prowlarr, sabnzbd or seerr' })
      }
      if (!name?.trim() || !url?.trim() || !api_key?.trim()) {
        return reply.status(400).send({ error: 'name, url and api_key are required' })
      }
      if (!isValidHttpUrl(url.trim())) {
        return reply.status(400).send({ error: 'url must be a valid http or https URL' })
      }

      const id = nanoid()
      db.prepare(`
        INSERT INTO arr_instances (id, type, name, url, api_key, enabled, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, type, name.trim(), url.trim().replace(/\/$/, ''), api_key.trim(), enabled ? 1 : 0, position)

      const row = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(id) as ArrInstanceRow
      logActivity('media', `${type}-Instanz "${name.trim()}" hinzugefügt`, 'info', { instanceId: id })
      return reply.status(201).send(sanitize(row))
    }
  )

  // PATCH /api/arr/instances/:id
  app.patch<{ Params: { id: string }; Body: PatchInstanceBody }>(
    '/api/arr/instances/:id',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(req.params.id) as ArrInstanceRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })

      const updates: string[] = ["updated_at = datetime('now')"]
      const values: unknown[] = []
      const { name, url, api_key, enabled, position } = req.body

      if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()) }
      if (url !== undefined) {
        if (!isValidHttpUrl(url.trim())) return reply.status(400).send({ error: 'url must be a valid http or https URL' })
        updates.push('url = ?'); values.push(url.trim().replace(/\/$/, ''))
      }
      if (api_key !== undefined) { updates.push('api_key = ?'); values.push(api_key.trim()) }
      if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0) }
      if (position !== undefined) { updates.push('position = ?'); values.push(position) }

      values.push(req.params.id)
      db.prepare(`UPDATE arr_instances SET ${updates.join(', ')} WHERE id = ?`).run(...values)

      const updated = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(req.params.id) as ArrInstanceRow
      return sanitize(updated)
    }
  )

  // DELETE /api/arr/instances/:id
  app.delete<{ Params: { id: string } }>(
    '/api/arr/instances/:id',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const existingInst = db.prepare('SELECT id, name, type FROM arr_instances WHERE id = ?').get(req.params.id) as { id: string; name: string; type: string } | undefined
      if (!existingInst) {
        return reply.status(404).send({ error: 'Not found' })
      }
      db.prepare('DELETE FROM group_arr_visibility WHERE instance_id = ?').run(req.params.id)
      db.prepare('DELETE FROM arr_instances WHERE id = ?').run(req.params.id)
      logActivity('media', `${existingInst.type}-Instanz "${existingInst.name}" gelöscht`, 'warning', { instanceId: req.params.id })
      return reply.status(204).send()
    }
  )

  // PUT /api/arr/groups/:groupId/visibility — set hidden instances for a user group
  app.put<{ Params: { groupId: string }; Body: VisibilityBody }>(
    '/api/arr/groups/:groupId/visibility',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      if (!db.prepare('SELECT id FROM user_groups WHERE id = ?').get(req.params.groupId)) {
        return reply.status(404).send({ error: 'Not found' })
      }
      const { hidden_instance_ids } = req.body
      db.prepare('DELETE FROM group_arr_visibility WHERE group_id = ?').run(req.params.groupId)
      const insert = db.prepare(
        'INSERT INTO group_arr_visibility (group_id, instance_id) VALUES (?, ?)'
      )
      for (const instanceId of hidden_instance_ids) {
        insert.run(req.params.groupId, instanceId)
      }
      return { ok: true, hidden_instance_ids }
    }
  )

  // ── Proxy routes ───────────────────────────────────────────────────────────

  // GET /api/arr/:id/status
  app.get<{ Params: { id: string } }>('/api/arr/:id/status', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    try {
      if (row.type === 'sabnzbd') {
        const { version } = await new SabnzbdClient(row.url, row.api_key).getVersion()
        return { online: true, type: 'sabnzbd', version }
      }
      if (row.type === 'seerr') {
        const status = await new SeerrClient(row.url, row.api_key).getStatus()
        return { online: true, type: 'seerr', version: status.version }
      }
      const status = await makeClient(row).getSystemStatus()
      return { online: true, type: row.type, ...status }
    } catch {
      return { online: false, type: row.type }
    }
  })

  // GET /api/arr/:id/stats
  app.get<{ Params: { id: string } }>('/api/arr/:id/stats', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    try {
      if (row.type === 'seerr') {
        const client = new SeerrClient(row.url, row.api_key)
        const [count, seerrStatus] = await Promise.all([
          client.getRequestCount(),
          client.getStatus().catch(() => null),
        ])
        return {
          type: 'seerr',
          pending: count.pending,
          approved: count.approved,
          declined: count.declined,
          processing: count.processing,
          available: count.available,
          total: count.total,
          movie: count.movie,
          tv: count.tv,
          updateAvailable: seerrStatus?.updateAvailable ?? false,
          commitsBehind: seerrStatus?.commitsBehind ?? 0,
          restartRequired: seerrStatus?.restartRequired ?? false,
        }
      }
      if (row.type === 'sabnzbd') {
        const client = new SabnzbdClient(row.url, row.api_key)
        // limit=1 to minimise payload; noofslots always reflects total count
        const [{ queue }, serverStats, warningsRes] = await Promise.all([
          client.getQueue(0, 1),
          client.getServerStats().catch(() => null),
          client.getWarnings().catch(() => ({ warnings: [] })),
        ])
        return {
          type: 'sabnzbd',
          speed: queue.speed,
          mbleft: parseFloat(queue.mbleft),
          mb: parseFloat(queue.mb),
          paused: queue.paused,
          queueCount: queue.noofslots,
          diskspaceFreeGb: parseFloat(queue.diskspace1),
          timeleft: queue.timeleft ?? '',
          speedlimit: queue.speedlimit ?? '',
          downloadedToday: serverStats?.day ?? 0,
          downloadedTotal: serverStats?.total ?? 0,
          warnings: warningsRes.warnings
            .filter(w => w.type !== 'INFO')
            .map(w => ({ type: w.type, text: w.text })),
        }
      }
      if (row.type === 'radarr') {
        const client = new RadarrClient(row.url, row.api_key)
        const [movies, health, diskspace, wanted] = await Promise.all([
          client.getMovies(),
          client.getHealth().catch(() => []),
          client.getDiskSpace().catch(() => []),
          client.getWantedMissing().catch(() => ({ totalRecords: 0, records: [] })),
        ])
        return {
          type: 'radarr',
          movieCount: movies.length,
          monitored: movies.filter(m => m.monitored).length,
          withFile: movies.filter(m => m.hasFile).length,
          sizeOnDisk: movies.reduce((a, m) => a + (m.sizeOnDisk ?? 0), 0),
          missingCount: wanted.totalRecords,
          healthIssues: health
            .filter(h => h.type !== 'ok')
            .map(h => ({ type: h.type, message: h.message })),
          diskspaceFreeBytes: diskspace.reduce((a, d) => a + (d.freeSpace ?? 0), 0),
        }
      }
      if (row.type === 'sonarr') {
        const client = new SonarrClient(row.url, row.api_key)
        const [series, health, diskspace, wanted] = await Promise.all([
          client.getSeries(),
          client.getHealth().catch(() => []),
          client.getDiskSpace().catch(() => []),
          client.getWantedMissing().catch(() => ({ totalRecords: 0, records: [] })),
        ])
        return {
          type: 'sonarr',
          seriesCount: series.length,
          monitored: series.filter(s => s.monitored).length,
          episodeCount: series.reduce((a, s) => a + (s.statistics?.episodeFileCount ?? 0), 0),
          sizeOnDisk: series.reduce((a, s) => a + (s.statistics?.sizeOnDisk ?? 0), 0),
          missingCount: wanted.totalRecords,
          healthIssues: health
            .filter(h => h.type !== 'ok')
            .map(h => ({ type: h.type, message: h.message })),
          diskspaceFreeBytes: diskspace.reduce((a, d) => a + (d.freeSpace ?? 0), 0),
        }
      }
      // prowlarr
      const client = new ProwlarrClient(row.url, row.api_key)
      const now = new Date()
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const [indexers, indexerStats, health, indexerStatus] = await Promise.all([
        client.getIndexers(),
        client.getIndexerStats(yesterday.toISOString(), now.toISOString()).catch(() => []),
        client.getHealth().catch(() => []),
        client.getIndexerStatus().catch(() => []),
      ])
      return {
        type: 'prowlarr',
        indexerCount: indexers.length,
        enabledIndexers: indexers.filter(i => i.enable).length,
        grabCount24h: indexerStats.reduce((a, s) => a + s.numberOfGrabs, 0),
        failingIndexers: indexerStatus.length,
        healthIssues: health
          .filter(h => h.type !== 'ok')
          .map(h => ({ type: h.type, message: h.message })),
      }
    } catch (e: unknown) {
      app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
    }
  })

  // GET /api/arr/:id/queue
  app.get<{ Params: { id: string } }>('/api/arr/:id/queue', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type === 'prowlarr' || row.type === 'seerr') return reply.status(400).send({ error: 'Not available for this instance type' })
    try {
      if (row.type === 'sabnzbd') {
        const { queue } = await new SabnzbdClient(row.url, row.api_key).getQueue(0, 20)
        return queue
      }
      const client = row.type === 'radarr'
        ? new RadarrClient(row.url, row.api_key)
        : new SonarrClient(row.url, row.api_key)
      return await client.getQueue()
    } catch (e: unknown) {
      app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
    }
  })

  // GET /api/arr/:id/history (SABnzbd only)
  app.get<{ Params: { id: string } }>('/api/arr/:id/history', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type !== 'sabnzbd') return reply.status(400).send({ error: 'Only available for SABnzbd instances' })
    try {
      const { history } = await new SabnzbdClient(row.url, row.api_key).getHistory(0, 10)
      return history
    } catch (e: unknown) {
      app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
    }
  })

  // GET /api/arr/calendar/combined?instanceIds=id1,id2
  app.get('/api/arr/calendar/combined', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { instanceIds } = req.query as { instanceIds?: string }
    if (!instanceIds?.trim()) return reply.status(400).send({ error: 'instanceIds query param required' })
    const ids = instanceIds.split(',').map(s => s.trim()).filter(Boolean)
    const groupId = await _callerGroupId(req)
    const items = await fetchCombinedCalendar(ids, groupId)
    return reply.send({ items, fetched_at: new Date().toISOString() })
  })

  // GET /api/arr/:id/calendar
  app.get<{ Params: { id: string } }>('/api/arr/:id/calendar', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type === 'prowlarr' || row.type === 'sabnzbd' || row.type === 'seerr') return reply.status(400).send({ error: 'Not supported for this instance type' })
    try {
      const { start, end } = calendarRange()
      const client = row.type === 'radarr'
        ? new RadarrClient(row.url, row.api_key)
        : new SonarrClient(row.url, row.api_key)
      return await client.getCalendar(start, end)
    } catch (e: unknown) {
      app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
    }
  })

  // GET /api/arr/:id/indexers (Prowlarr only)
  app.get<{ Params: { id: string } }>('/api/arr/:id/indexers', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type !== 'prowlarr') return reply.status(400).send({ error: 'Only available for Prowlarr' })
    try {
      return await new ProwlarrClient(row.url, row.api_key).getIndexers()
    } catch (e: unknown) {
      app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
    }
  })

  // GET /api/arr/:id/movies (Radarr only)
  app.get<{ Params: { id: string } }>('/api/arr/:id/movies', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type !== 'radarr') return reply.status(400).send({ error: 'Only available for Radarr' })
    try {
      return await new RadarrClient(row.url, row.api_key).getMovies()
    } catch (e: unknown) {
      app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
    }
  })

  // GET /api/arr/:id/series (Sonarr only)
  app.get<{ Params: { id: string } }>('/api/arr/:id/series', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type !== 'sonarr') return reply.status(400).send({ error: 'Only available for Sonarr' })
    try {
      return await new SonarrClient(row.url, row.api_key).getSeries()
    } catch (e: unknown) {
      app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
    }
  })

  // ── Custom Format routes ────────────────────────────────────────────────────

  // GET /api/arr/:id/custom-formats
  app.get<{ Params: { id: string } }>(
    '/api/arr/:id/custom-formats',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'radarr' && row.type !== 'sonarr') {
        return reply.status(400).send({ error: 'Only available for Radarr and Sonarr' })
      }
      try {
        return await makeClient(row).getCustomFormats()
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // POST /api/arr/:id/custom-formats
  app.post<{ Params: { id: string }; Body: CreateCfBody }>(
    '/api/arr/:id/custom-formats',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'radarr' && row.type !== 'sonarr') {
        return reply.status(400).send({ error: 'Only available for Radarr and Sonarr' })
      }
      if (!req.body.name?.trim()) return reply.status(400).send({ error: 'name is required' })
      const trashId = req.body.trash_id ?? toUserCfSlugLocal(req.body.name.trim())
      try {
        const { trash_id: _tid, ...cfPayload } = req.body
        const cf = await makeClient(row).createCustomFormat(cfPayload)
        try {
          writeUserCfJson(getUserCfBase(), row.type, trashId, {
            trash_id: trashId,
            name: req.body.name.trim(),
            includeCustomFormatWhenRenaming: req.body.includeCustomFormatWhenRenaming ?? false,
            specifications: req.body.specifications ?? [],
          })
        } catch { /* best-effort file write */ }
        return reply.status(201).send(cf)
      } catch (e: unknown) {
        app.log.error({
          error: (e as Error).message,
          stack: (e as Error).stack,
          instanceId: req.params.id,
          body: req.body,
        }, 'Custom format create failed')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // PUT /api/arr/:id/custom-formats/:cfId
  app.put<{ Params: { id: string; cfId: string }; Body: PutCfBody }>(
    '/api/arr/:id/custom-formats/:cfId',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'radarr' && row.type !== 'sonarr') {
        return reply.status(400).send({ error: 'Only available for Radarr and Sonarr' })
      }
      const cfId = parseInt(req.params.cfId, 10)
      if (isNaN(cfId)) return reply.status(400).send({ error: 'Invalid cfId' })
      try {
        const { trash_id: trashId, ...cfPayload } = req.body
        const result = await makeClient(row).updateCustomFormat(cfId, cfPayload)
        if (trashId) {
          try {
            writeUserCfJson(getUserCfBase(), row.type, trashId, {
              trash_id: trashId,
              name: req.body.name,
              includeCustomFormatWhenRenaming: req.body.includeCustomFormatWhenRenaming ?? false,
              specifications: req.body.specifications ?? [],
            })
          } catch { /* best-effort */ }
        }
        return result
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // DELETE /api/arr/:id/custom-formats/:cfId
  app.delete<{ Params: { id: string; cfId: string }; Querystring: DeleteCfQuerystring }>(
    '/api/arr/:id/custom-formats/:cfId',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'radarr' && row.type !== 'sonarr') {
        return reply.status(400).send({ error: 'Only available for Radarr and Sonarr' })
      }
      const cfId = parseInt(req.params.cfId, 10)
      if (isNaN(cfId)) return reply.status(400).send({ error: 'Invalid cfId' })

      const { trashId } = req.query
      if (trashId) {
        const cfBase = getUserCfBase()
        const filePath = path.join(cfBase, row.type, `${trashId}.json`)
        let cfName: string | null = null
        if (fs.existsSync(filePath)) {
          try { cfName = (JSON.parse(fs.readFileSync(filePath, 'utf8')) as { name?: string }).name ?? null } catch { /* skip */ }
        }
        if (cfName) {
          const sameTypeInsts = db.prepare('SELECT id FROM arr_instances WHERE type = ?').all(row.type) as { id: string }[]
          for (const inst of sameTypeInsts) {
            const configRow = db.prepare('SELECT user_cf_names FROM recyclarr_config WHERE instance_id = ?').get(inst.id) as { user_cf_names: string } | undefined
            if (!configRow) continue
            const userCfNames = safeJson<Array<{ name: string; profileName?: string }>>(configRow.user_cf_names, [])
            const found = userCfNames.find(ucf => ucf.name === cfName)
            if (found) {
              const profileName = found.profileName ?? 'einem Recyclarr-Profil'
              return reply.status(409).send({ error: `CF ist aktiv in Recyclarr-Profil "${profileName}" — zuerst dort entfernen` })
            }
          }
        }
      }

      try {
        await makeClient(row).deleteCustomFormat(cfId)
        if (trashId) {
          const fp = path.join(getUserCfBase(), row.type, `${trashId}.json`)
          if (fs.existsSync(fp)) fs.unlinkSync(fp)
        }
        return reply.status(204).send()
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // ── Quality Profile routes ──────────────────────────────────────────────────

  // GET /api/arr/:id/quality-profiles
  app.get<{ Params: { id: string } }>(
    '/api/arr/:id/quality-profiles',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'radarr' && row.type !== 'sonarr') {
        return reply.status(400).send({ error: 'Only available for Radarr and Sonarr' })
      }
      try {
        return await makeClient(row).getQualityProfiles()
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // PUT /api/arr/:id/quality-profiles/:profileId/scores
  app.put<{ Params: { id: string; profileId: string }; Body: UpdateProfileScoresBody }>(
    '/api/arr/:id/quality-profiles/:profileId/scores',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'radarr' && row.type !== 'sonarr') {
        return reply.status(400).send({ error: 'Only available for Radarr and Sonarr' })
      }
      const profileId = parseInt(req.params.profileId, 10)
      if (isNaN(profileId)) return reply.status(400).send({ error: 'Invalid profileId' })
      if (!Array.isArray(req.body.scores)) return reply.status(400).send({ error: 'scores must be an array' })

      // Check if Recyclarr sync is running for this instance
      const syncState = db.prepare(
        'SELECT is_syncing FROM recyclarr_config WHERE instance_id = ?'
      ).get(row.id) as { is_syncing: number } | undefined
      if (syncState?.is_syncing === 1) {
        return reply.status(409).send({ error: 'Recyclarr Sync läuft gerade — bitte nach dem Sync Scores anpassen' })
      }

      try {
        const client = makeClient(row)
        const profile = await client.getQualityProfile(profileId) as {
          id: number
          name: string
          formatItems: { format: number; score: number; name: string }[]
          [k: string]: unknown
        }
        const scoreMap = new Map(req.body.scores.map(s => [s.formatId, s.score]))
        const updatedProfile = {
          ...profile,
          formatItems: profile.formatItems.map(item => ({
            ...item,
            score: scoreMap.has(item.format) ? scoreMap.get(item.format)! : item.score,
          })),
        }
        await client.updateQualityProfile(profileId, updatedProfile)
        return { ok: true }
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/custom-format-schema (cached 1h per instance)
  app.get<{ Params: { id: string } }>(
    '/api/arr/:id/custom-format-schema',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'radarr' && row.type !== 'sonarr') {
        return reply.status(400).send({ error: 'Only available for Radarr and Sonarr' })
      }
      const cached = cfSchemaCache.get(req.params.id)
      if (cached && Date.now() - cached.ts < CF_SCHEMA_TTL) return cached.data
      try {
        const schema = await makeClient(row).getCustomFormatSchema()
        cfSchemaCache.set(req.params.id, { data: schema, ts: Date.now() })
        return schema
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // ── Seerr routes ────────────────────────────────────────────────────────────

  // GET /api/arr/:id/requests?page=1&filter=pending
  app.get<{ Params: { id: string }; Querystring: { page?: string; filter?: string } }>(
    '/api/arr/:id/requests',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10))
        const filter = req.query.filter
        const client = new SeerrClient(row.url, row.api_key)

        // 'declined' is not a valid API filter in Overseerr/Seerr — fetch all and filter server-side
        const apiFilter = filter === 'declined' ? undefined : filter
        const response = await client.getRequests(page, apiFilter)

        let results = response.results
        if (filter === 'declined') {
          results = results.filter(r => r.status === 3)
        }

        // Enrich with titles via movie/tv endpoints (parallel, each independently)
        const seen = new Set<string>()
        const titleMap: Record<string, string> = {}
        await Promise.allSettled(
          results
            .filter(r => {
              if (!r.media) return false
              const key = `${r.media.mediaType}:${r.media.tmdbId}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            .map(async r => {
              const key = `${r.media.mediaType}:${r.media.tmdbId}`
              try {
                if (r.media.mediaType === 'movie') {
                  const data = await client.getMovieDetails(r.media.tmdbId)
                  titleMap[key] = data.title
                } else {
                  const data = await client.getTvDetails(r.media.tmdbId)
                  titleMap[key] = data.name
                }
              } catch { /* title enrichment optional — falls back to tmdbId in frontend */ }
            })
        )

        return {
          ...response,
          results: results.map(r => ({
            ...r,
            media: { ...r.media, title: titleMap[`${r.media.mediaType}:${r.media.tmdbId}`] },
          })),
        }
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // POST /api/arr/:id/requests/:requestId/approve
  app.post<{ Params: { id: string; requestId: string } }>(
    '/api/arr/:id/requests/:requestId/approve',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        return await new SeerrClient(row.url, row.api_key).approveRequest(parseInt(req.params.requestId, 10))
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // POST /api/arr/:id/requests/:requestId/decline
  app.post<{ Params: { id: string; requestId: string } }>(
    '/api/arr/:id/requests/:requestId/decline',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        return await new SeerrClient(row.url, row.api_key).declineRequest(parseInt(req.params.requestId, 10))
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // DELETE /api/arr/:id/requests/:requestId
  app.delete<{ Params: { id: string; requestId: string } }>(
    '/api/arr/:id/requests/:requestId',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        await new SeerrClient(row.url, row.api_key).deleteRequest(parseInt(req.params.requestId, 10))
        return reply.status(204).send()
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/discover/movies?page=1&sortBy=popularity.desc[&language=de&genre=28,12&watchProviders=8,9&watchRegion=DE&voteAverageGte=7.0&primaryReleaseDateGte=2020-01-01&primaryReleaseDateLte=2024-12-31]
  app.get<{ Params: { id: string }; Querystring: { page?: string; sortBy?: string; language?: string; genre?: string; watchProviders?: string; watchRegion?: string; voteAverageGte?: string; primaryReleaseDateGte?: string; primaryReleaseDateLte?: string } }>(
    '/api/arr/:id/discover/movies',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10))
        const sortBy = req.query.sortBy ?? 'popularity.desc'
        const filters = {
          language: req.query.language,
          genre: req.query.genre,
          watchProviders: req.query.watchProviders,
          watchRegion: req.query.watchRegion,
          voteAverageGte: req.query.voteAverageGte,
          primaryReleaseDateGte: req.query.primaryReleaseDateGte,
          primaryReleaseDateLte: req.query.primaryReleaseDateLte,
        }
        return await new SeerrClient(row.url, row.api_key).getDiscoverMovies(page, sortBy, filters)
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/discover/tv?page=1&sortBy=popularity.desc[&language=de&genre=28,12&watchProviders=8,9&watchRegion=DE&voteAverageGte=7.0&primaryReleaseDateGte=2020-01-01&primaryReleaseDateLte=2024-12-31]
  app.get<{ Params: { id: string }; Querystring: { page?: string; sortBy?: string; language?: string; genre?: string; watchProviders?: string; watchRegion?: string; voteAverageGte?: string; primaryReleaseDateGte?: string; primaryReleaseDateLte?: string } }>(
    '/api/arr/:id/discover/tv',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10))
        const sortBy = req.query.sortBy ?? 'popularity.desc'
        const filters = {
          language: req.query.language,
          genre: req.query.genre,
          watchProviders: req.query.watchProviders,
          watchRegion: req.query.watchRegion,
          voteAverageGte: req.query.voteAverageGte,
          primaryReleaseDateGte: req.query.primaryReleaseDateGte,
          primaryReleaseDateLte: req.query.primaryReleaseDateLte,
        }
        return await new SeerrClient(row.url, row.api_key).getDiscoverTv(page, sortBy, filters)
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/discover/trending
  app.get<{ Params: { id: string } }>(
    '/api/arr/:id/discover/trending',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        return await new SeerrClient(row.url, row.api_key).getTrending()
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/discover/search?query=<search-term>[&language=de&page=1]
  app.get<{ Params: { id: string }; Querystring: { query: string; language?: string; page?: string } }>(
    '/api/arr/:id/discover/search',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      if (!req.query.query?.trim()) return reply.status(400).send({ error: 'Query required' })
      try {
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10))
        return await new SeerrClient(row.url, row.api_key).search(req.query.query, req.query.language, page)
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // POST /api/arr/:id/discover/request
  app.post<{ Params: { id: string }; Body: { mediaType: 'movie' | 'tv'; mediaId: number; seasons?: number[] } }>(
    '/api/arr/:id/discover/request',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      if (!req.body.mediaId || !req.body.mediaType) return reply.status(400).send({ error: 'mediaType and mediaId required' })
      try {
        const result = await new SeerrClient(row.url, row.api_key).requestMedia(req.body.mediaType, req.body.mediaId, req.body.seasons)
        return result
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/genres/:mediaType — movie or tv
  app.get<{ Params: { id: string; mediaType: string } }>(
    '/api/arr/:id/genres/:mediaType',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      const mt = req.params.mediaType
      if (mt !== 'movie' && mt !== 'tv') return reply.status(400).send({ error: 'mediaType must be movie or tv' })
      try {
        return await new SeerrClient(row.url, row.api_key).getGenres(mt)
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/watchproviders/:mediaType — movie or tv
  app.get<{ Params: { id: string; mediaType: string } }>(
    '/api/arr/:id/watchproviders/:mediaType',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      const mt = req.params.mediaType
      if (mt !== 'movie' && mt !== 'tv') return reply.status(400).send({ error: 'mediaType must be movie or tv' })
      try {
        return await new SeerrClient(row.url, row.api_key).getWatchProviders(mt)
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/movie/:tmdbId — movie detail with mediaInfo (status + request tracking)
  app.get<{ Params: { id: string; tmdbId: string } }>(
    '/api/arr/:id/movie/:tmdbId',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      const tmdbId = parseInt(req.params.tmdbId, 10)
      if (isNaN(tmdbId)) return reply.status(400).send({ error: 'Invalid tmdbId' })
      try {
        return await new SeerrClient(row.url, row.api_key).getMovieDetailFull(tmdbId)
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )

  // GET /api/arr/:id/tv/:tmdbId — full TV detail with seasons and per-season availability
  app.get<{ Params: { id: string; tmdbId: string } }>(
    '/api/arr/:id/tv/:tmdbId',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      const tmdbId = parseInt(req.params.tmdbId, 10)
      if (isNaN(tmdbId)) return reply.status(400).send({ error: 'Invalid tmdbId' })
      try {
        return await new SeerrClient(row.url, row.api_key).getTvDetailFull(tmdbId)
      } catch (e: unknown) {
        app.log.error({ detail: (e as Error).message, url: req.url, method: req.method }, 'Upstream error')
        return reply.status(502).send({ error: 'Upstream error', detail: (e as Error).message })
      }
    }
  )
}
