import { FastifyInstance, FastifyRequest } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { isValidHttpUrl } from './_helpers'
import { getHaWsClient, invalidateHaWsClient, ensureHaWsPersistent } from '../clients/ha-ws-manager'
import type { HaWsClient } from '../clients/ha-ws-client'
import { logActivity } from './activity'

// ── DB row types ──────────────────────────────────────────────────────────────

interface HaInstanceRow {
  id: string
  name: string
  url: string
  token: string
  enabled: number
  position: number
  created_at: string
  updated_at: string
}

interface HaPanelRow {
  id: string
  instance_id: string
  entity_id: string
  label: string | null
  panel_type: string
  position: number
  owner_id: string
  area_id: string | null
  created_at: string
}

// ── Request body types ────────────────────────────────────────────────────────

interface CreateInstanceBody {
  name: string
  url: string
  token: string
  enabled?: boolean
}

interface PatchInstanceBody {
  name?: string
  url?: string
  token?: string
  enabled?: boolean
}

interface AddPanelBody {
  instance_id: string
  entity_id: string
  label?: string
  panel_type?: string
  area_id?: string
}

interface PatchPanelBody {
  label?: string
  panel_type?: string
  area_id?: string | null
}

interface ReorderBody {
  ids: string[]
}

interface CallServiceBody {
  domain: string
  service: string
  entity_id: string
  service_data?: Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeInstance(r: HaInstanceRow) {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    enabled: r.enabled === 1,
    position: r.position,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function callerOwnerId(req: FastifyRequest): string {
  return req.user?.sub ?? 'guest'
}

async function haFetch(url: string, token: string, path: string, options?: RequestInit): Promise<Response> {
  const base = url.replace(/\/$/, '')
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function haRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/ha/instances
  app.get('/api/ha/instances', async (req) => {
    try {
      await req.jwtVerify()
    } catch {
      return []
    }
    const rows = db.prepare(
      'SELECT * FROM ha_instances ORDER BY position ASC, created_at ASC'
    ).all() as HaInstanceRow[]
    if (req.user.role !== 'admin') {
      return rows.filter(r => r.enabled === 1).map(sanitizeInstance)
    }
    return rows.map(sanitizeInstance)
  })

  // POST /api/ha/instances
  app.post<{ Body: CreateInstanceBody }>('/api/ha/instances', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const { name, url, token, enabled = true } = req.body
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (!url?.trim()) return reply.status(400).send({ error: 'url is required' })
    if (!token?.trim()) return reply.status(400).send({ error: 'token is required' })
    if (!isValidHttpUrl(url)) return reply.status(400).send({ error: 'Invalid URL — must be http or https' })
    const id = nanoid()
    const maxRow = db.prepare('SELECT MAX(position) as m FROM ha_instances').get() as { m: number | null }
    const position = (maxRow.m ?? -1) + 1
    const cleanUrl = url.replace(/\/$/, '')
    const cleanToken = token.trim()
    db.prepare(`
      INSERT INTO ha_instances (id, name, url, token, enabled, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), cleanUrl, cleanToken, enabled ? 1 : 0, position)
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(id) as HaInstanceRow
    if (enabled) ensureHaWsPersistent(id, cleanUrl, cleanToken)
    return reply.status(201).send(sanitizeInstance(row))
  })

  // PATCH /api/ha/instances/:id
  app.patch<{ Params: { id: string }; Body: PatchInstanceBody }>('/api/ha/instances/:id', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const name = req.body.name?.trim() ?? row.name
    const url = (req.body.url?.trim() ?? row.url).replace(/\/$/, '')
    if (req.body.url !== undefined && !isValidHttpUrl(url)) {
      return reply.status(400).send({ error: 'Invalid URL — must be http or https' })
    }
    const token = req.body.token?.trim() || row.token
    const enabled = req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled
    db.prepare(`
      UPDATE ha_instances SET name=?, url=?, token=?, enabled=?, updated_at=datetime('now') WHERE id=?
    `).run(name, url, token, enabled, row.id)
    // Invalidate WS client so it reconnects with updated credentials/URL
    invalidateHaWsClient(row.id)
    if (enabled) ensureHaWsPersistent(row.id, url, token)
    const updated = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(row.id) as HaInstanceRow
    logActivity('ha', `HA-Instanz "${updated.name}" aktualisiert`, 'info', { instanceId: row.id })
    return sanitizeInstance(updated)
  })

  // DELETE /api/ha/instances/:id
  app.delete<{ Params: { id: string } }>('/api/ha/instances/:id', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const row = db.prepare('SELECT id, name FROM ha_instances WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM ha_panels WHERE instance_id = ?').run(req.params.id)
    db.prepare('DELETE FROM ha_instances WHERE id = ?').run(req.params.id)
    invalidateHaWsClient(req.params.id)
    logActivity('ha', `HA-Instanz "${row.name}" gelöscht`, 'warning', { instanceId: req.params.id })
    return reply.status(204).send()
  })

  // POST /api/ha/instances/:id/test
  app.post<{ Params: { id: string } }>('/api/ha/instances/:id/test', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    try {
      const res = await haFetch(row.url, row.token, '/api/')
      if (res.ok) return { ok: true }
      return { ok: false, error: `HA returned HTTP ${res.status}` }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      return { ok: false, error: msg }
    }
  })

  // GET /api/ha/instances/:id/states — proxy all HA states for entity browser
  app.get<{ Params: { id: string } }>('/api/ha/instances/:id/states', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    try {
      const res = await haFetch(row.url, row.token, '/api/states')
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      const data = await res.json()
      return data
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Connection failed'
      app.log.error({ detail, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })

  // GET /api/ha/instances/:id/stream — SSE stream of state_changed events via HA WebSocket
  app.get<{ Params: { id: string } }>('/api/ha/instances/:id/stream', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })

    reply.hijack()
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    const unsubscribe = getHaWsClient(row.id, row.url, row.token).subscribe((entityId, newState) => {
      if (reply.raw.destroyed) return
      try {
        reply.raw.write(`data: ${JSON.stringify({ entity_id: entityId, state: newState })}\n\n`)
      } catch { /* client gone */ }
    })

    req.raw.on('close', () => {
      unsubscribe()
      if (!reply.raw.destroyed) reply.raw.end()
    })
  })

  // POST /api/ha/instances/:id/call — proxy a HA service call
  app.post<{ Params: { id: string }; Body: CallServiceBody }>('/api/ha/instances/:id/call', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const { domain, service, entity_id, service_data } = req.body
    if (!domain || !service || !entity_id) {
      return reply.status(400).send({ error: 'domain, service, entity_id are required' })
    }
    try {
      const haBody = { entity_id, ...(service_data ?? {}) }
      const res = await haFetch(row.url, row.token, `/api/services/${domain}/${service}`, {
        method: 'POST',
        body: JSON.stringify(haBody),
      })
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      return { ok: true }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Connection failed'
      app.log.error({ detail, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })

  // GET /api/ha/panels — list panels for caller
  app.get('/api/ha/panels', async (req) => {
    let ownerId = 'guest'
    try {
      await req.jwtVerify()
      ownerId = callerOwnerId(req)
    } catch { /* unauthenticated = guest */ }
    const rows = db.prepare(
      'SELECT * FROM ha_panels WHERE owner_id = ? ORDER BY position ASC'
    ).all(ownerId) as HaPanelRow[]
    return rows
  })

  // POST /api/ha/panels — add a panel
  app.post<{ Body: AddPanelBody }>('/api/ha/panels', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const ownerId = callerOwnerId(req)
    const { instance_id, entity_id, label, panel_type = 'auto', area_id } = req.body
    if (!instance_id?.trim()) return reply.status(400).send({ error: 'instance_id is required' })
    if (!entity_id?.trim()) return reply.status(400).send({ error: 'entity_id is required' })
    const inst = db.prepare('SELECT id FROM ha_instances WHERE id = ?').get(instance_id)
    if (!inst) return reply.status(404).send({ error: 'Instance not found' })
    const existing = db.prepare(
      'SELECT id FROM ha_panels WHERE owner_id = ? AND instance_id = ? AND entity_id = ?'
    ).get(ownerId, instance_id, entity_id)
    if (existing) return reply.status(409).send({ error: 'Panel already added' })
    const id = nanoid()
    const maxRow = db.prepare('SELECT MAX(position) as m FROM ha_panels WHERE owner_id = ?').get(ownerId) as { m: number | null }
    const position = (maxRow.m ?? -1) + 1
    db.prepare(`
      INSERT INTO ha_panels (id, instance_id, entity_id, label, panel_type, position, owner_id, area_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, instance_id, entity_id.trim(), label?.trim() ?? null, panel_type, position, ownerId, area_id ?? null)
    return reply.status(201).send(db.prepare('SELECT * FROM ha_panels WHERE id = ?').get(id) as HaPanelRow)
  })

  // PATCH /api/ha/panels/reorder — must be registered BEFORE /:id
  app.patch<{ Body: ReorderBody }>('/api/ha/panels/reorder', {
    preHandler: [app.authenticate],
  }, async (req) => {
    const ownerId = callerOwnerId(req)
    const { ids } = req.body
    if (!Array.isArray(ids)) return { ok: false }
    const update = db.prepare('UPDATE ha_panels SET position = ? WHERE id = ? AND owner_id = ?')
    db.transaction(() => {
      ids.forEach((id, idx) => update.run(idx, id, ownerId))
    })()
    return { ok: true }
  })

  // PATCH /api/ha/panels/:id — update label / panel_type
  app.patch<{ Params: { id: string }; Body: PatchPanelBody }>('/api/ha/panels/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const ownerId = callerOwnerId(req)
    const row = db.prepare(
      'SELECT * FROM ha_panels WHERE id = ? AND owner_id = ?'
    ).get(req.params.id, ownerId) as HaPanelRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const label = req.body.label !== undefined ? (req.body.label.trim() || null) : row.label
    const panel_type = req.body.panel_type ?? row.panel_type
    const area_id = 'area_id' in req.body ? (req.body.area_id ?? null) : row.area_id
    db.prepare('UPDATE ha_panels SET label=?, panel_type=?, area_id=? WHERE id=?').run(label, panel_type, area_id, row.id)
    return db.prepare('SELECT * FROM ha_panels WHERE id = ?').get(row.id) as HaPanelRow
  })

  // DELETE /api/ha/panels/:id
  app.delete<{ Params: { id: string } }>('/api/ha/panels/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const ownerId = callerOwnerId(req)
    const row = db.prepare('SELECT id FROM ha_panels WHERE id = ? AND owner_id = ?').get(req.params.id, ownerId)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM ha_panels WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })

  // GET /api/ha/instances/:id/areas — list all HA areas (rooms) via WS
  app.get<{ Params: { id: string } }>('/api/ha/instances/:id/areas', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    app.log.info({ instanceId: req.params.id }, 'Fetching HA areas')
    try {
      const client = getHaWsClient(row.id, row.url, row.token)
      let areas: unknown = null
      try {
        areas = await client.sendCommand('config/area_registry/list')
        app.log.info({ instanceId: req.params.id, count: Array.isArray(areas) ? areas.length : -1 }, 'HA areas fetched via config/area_registry/list')
      } catch (e1) {
        app.log.warn({ instanceId: req.params.id, err: String(e1) }, 'config/area_registry/list failed, trying area_registry/list')
        try {
          areas = await client.sendCommand('area_registry/list')
          app.log.info({ instanceId: req.params.id, count: Array.isArray(areas) ? areas.length : -1 }, 'HA areas fetched via area_registry/list')
        } catch (e2) {
          app.log.error({ instanceId: req.params.id, err: String(e2) }, 'Both area_registry commands failed')
          return []
        }
      }
      return Array.isArray(areas) ? areas : []
    } catch (err) {
      app.log.error({ instanceId: req.params.id, err: String(err) }, 'HA areas fetch failed')
      return []
    }
  })

  // GET /api/ha/instances/:id/entity-area — get area_id for a single entity
  app.get<{ Params: { id: string }; Querystring: { entity_id?: string } }>('/api/ha/instances/:id/entity-area', {
    preHandler: [app.authenticate],
  }, async (req) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row || !req.query.entity_id) return { area_id: null }
    try {
      const client = getHaWsClient(row.id, row.url, row.token)
      const result = await client.sendCommand('config/entity_registry/get', { entity_id: req.query.entity_id }) as { area_id?: string | null }
      return { area_id: result?.area_id ?? null }
    } catch {
      return { area_id: null }
    }
  })

  // In-memory cache for history
  const historyCache = new Map<string, { data: unknown[]; fetchedAt: number }>()

  // GET /api/ha/instances/:id/history
  app.get<{ Params: { id: string }; Querystring: { entity_id?: string; hours?: string } }>('/api/ha/instances/:id/history', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    const entityId = req.query.entity_id
    if (!entityId) return reply.status(400).send({ error: 'entity_id is required' })
    const hours = Math.min(168, Math.max(1, parseInt(req.query.hours ?? '24', 10) || 24))

    const cacheKey = `${req.params.id}:${entityId}:${hours}`
    const cached = historyCache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
      return cached.data
    }

    try {
      const end = new Date()
      const start = new Date(end.getTime() - hours * 60 * 60 * 1000)
      const startStr = start.toISOString()
      const res = await haFetch(
        row.url, row.token,
        `/api/history/period/${startStr}?filter_entity_id=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(end.toISOString())}&minimal_response=true&no_attributes=true`
      )
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      const data = await res.json() as unknown[][]
      const entries = Array.isArray(data) && data.length > 0 ? (data[0] ?? []) : []
      interface HistoryItem { state?: string; last_changed?: string }
      const result = (entries as HistoryItem[]).map(e => ({
        state: e.state ?? '',
        last_changed: e.last_changed ?? '',
      }))
      historyCache.set(cacheKey, { data: result, fetchedAt: Date.now() })
      return result
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Connection failed'
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })

  // GET /api/ha/instances/:id/scenes
  app.get<{ Params: { id: string } }>('/api/ha/instances/:id/scenes', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    try {
      const res = await haFetch(row.url, row.token, '/api/states')
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      const data = await res.json() as { entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string; last_updated: string }[]
      const filtered = data
        .filter(e => e.entity_id.startsWith('scene.') || e.entity_id.startsWith('script.'))
        .sort((a, b) => {
          const domainA = a.entity_id.startsWith('scene.') ? 0 : 1
          const domainB = b.entity_id.startsWith('scene.') ? 0 : 1
          if (domainA !== domainB) return domainA - domainB
          const nameA = (a.attributes.friendly_name as string | undefined) ?? a.entity_id
          const nameB = (b.attributes.friendly_name as string | undefined) ?? b.entity_id
          return nameA.localeCompare(nameB)
        })
      return filtered
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Connection failed'
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })

  // GET /api/ha/instances/:id/automations — list all automation.* entities
  app.get<{ Params: { id: string } }>('/api/ha/instances/:id/automations', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    try {
      const res = await haFetch(row.url, row.token, '/api/states')
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      const data = await res.json() as { entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string; last_updated: string }[]
      const filtered = data
        .filter(e => e.entity_id.startsWith('automation.'))
        .sort((a, b) => {
          const nameA = (a.attributes.friendly_name as string | undefined) ?? a.entity_id
          const nameB = (b.attributes.friendly_name as string | undefined) ?? b.entity_id
          return nameA.localeCompare(nameB)
        })
      return filtered
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Connection failed'
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })

  // POST /api/ha/instances/:id/automations/:entityId/toggle
  app.post<{ Params: { id: string; entityId: string } }>('/api/ha/instances/:id/automations/:entityId/toggle', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    try {
      const entityId = decodeURIComponent(req.params.entityId)
      const res = await haFetch(row.url, row.token, '/api/services/automation/toggle', {
        method: 'POST',
        body: JSON.stringify({ entity_id: entityId }),
      })
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      return { ok: true }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Connection failed'
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })

  // POST /api/ha/instances/:id/automations/:entityId/trigger
  app.post<{ Params: { id: string; entityId: string } }>('/api/ha/instances/:id/automations/:entityId/trigger', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    try {
      const entityId = decodeURIComponent(req.params.entityId)
      const res = await haFetch(row.url, row.token, '/api/services/automation/trigger', {
        method: 'POST',
        body: JSON.stringify({ entity_id: entityId }),
      })
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      return { ok: true }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Connection failed'
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })

  // GET /api/ha/instances/:id/persons — enriched person.* entities with device_tracker data
  app.get<{ Params: { id: string } }>('/api/ha/instances/:id/persons', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    try {
      const res = await haFetch(row.url, row.token, '/api/states')
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      const data = await res.json() as {
        entity_id: string
        state: string
        attributes: Record<string, unknown>
        last_updated: string
      }[]

      // Build tracker map for O(1) lookup
      const trackerMap = new Map<string, typeof data[number]>()
      for (const entity of data) {
        if (entity.entity_id.startsWith('device_tracker.')) {
          trackerMap.set(entity.entity_id, entity)
        }
      }

      const persons = data
        .filter(e => e.entity_id.startsWith('person.'))
        .map(person => {
          const source = person.attributes.source as string | undefined
          const tracker = source ? trackerMap.get(source) : undefined
          return {
            entity_id: person.entity_id,
            name: (person.attributes.friendly_name as string | undefined) ?? person.entity_id.split('.')[1] ?? person.entity_id,
            state: person.state,
            latitude: (person.attributes.latitude as number | undefined) ?? null,
            longitude: (person.attributes.longitude as number | undefined) ?? null,
            last_updated: person.last_updated,
            source: source ?? null,
            battery_level: (tracker?.attributes.battery_level as number | undefined) ?? null,
            tracker_last_updated: tracker?.last_updated ?? null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return persons
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Connection failed'
      app.log.error({ detail, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })

  // GET /api/ha/instances/:id/energy — energy dashboard data via HA WebSocket
  app.get<{ Params: { id: string }; Querystring: { period?: string } }>('/api/ha/instances/:id/energy', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    const period = ['week', 'month'].includes(req.query.period ?? '') ? req.query.period! : 'day'
    try {
      const client = getHaWsClient(row.id, row.url, row.token)
      return await fetchEnergyData(client, period)
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Energy fetch failed'
      app.log.error({ detail, url: req.url, method: req.method }, 'Upstream error')
      return reply.status(502).send({ error: 'Upstream error', detail })
    }
  })
}

// ── Energy data helper ─────────────────────────────────────────────────────────

interface EnergySource {
  type: 'grid' | 'solar' | 'battery' | 'gas'
  flow_from?: Array<{ stat_energy_from: string }>
  flow_to?: Array<{ stat_energy_to: string }>
  stat_energy_from?: string
  stat_energy_to?: string
}

interface EnergyPrefs {
  energy_sources?: EnergySource[]
}

interface StatEntry {
  start: string
  sum?: number | null
}

type StatsResult = Record<string, StatEntry[]>

function sumSeries(entries: StatEntry[] | undefined): number {
  if (!entries || entries.length < 2) return 0
  return Math.max(0, (entries[entries.length - 1].sum ?? 0) - (entries[0].sum ?? 0))
}

function chartSeries(entries: StatEntry[] | undefined): number[] {
  if (!entries || entries.length < 2) return []
  const result: number[] = []
  for (let i = 1; i < entries.length; i++) {
    result.push(Math.max(0, (entries[i].sum ?? 0) - (entries[i - 1].sum ?? 0)))
  }
  return result
}

function buildLabels(period: string, count: number): string[] {
  const labels: string[] = []
  const now = new Date()
  if (period === 'day') {
    for (let h = 0; h < count; h++) labels.push(`${h}h`)
  } else if (period === 'week') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (let d = count - 1; d >= 0; d--) {
      const date = new Date(now)
      date.setDate(now.getDate() - d)
      labels.push(days[date.getDay()])
    }
  } else {
    for (let d = 1; d <= count; d++) labels.push(String(d))
  }
  return labels
}

export async function fetchEnergyData(client: HaWsClient, period: string): Promise<Record<string, unknown>> {
  // Step 1: Get energy prefs
  let prefs: EnergyPrefs
  try {
    prefs = await client.sendCommand('energy/get_prefs') as EnergyPrefs
  } catch {
    return { configured: false }
  }
  if (!prefs?.energy_sources?.length) return { configured: false }

  // Extract statistic IDs per category
  let gridConsumptionIds: string[] = []
  let gridReturnIds: string[] = []
  let solarIds: string[] = []
  let batteryChargeIds: string[] = []
  let gasIds: string[] = []

  for (const src of prefs.energy_sources) {
    if (src.type === 'grid') {
      gridConsumptionIds = (src.flow_from ?? []).map(f => f.stat_energy_from).filter(Boolean)
      gridReturnIds = (src.flow_to ?? []).map(f => f.stat_energy_to).filter(Boolean)
    } else if (src.type === 'solar' && src.stat_energy_from) {
      solarIds.push(src.stat_energy_from)
    } else if (src.type === 'battery' && src.stat_energy_from) {
      batteryChargeIds.push(src.stat_energy_from)
    } else if (src.type === 'gas' && src.stat_energy_from) {
      gasIds.push(src.stat_energy_from)
    }
  }

  const allIds = [...gridConsumptionIds, ...gridReturnIds, ...solarIds, ...batteryChargeIds, ...gasIds]
  if (allIds.length === 0) return { configured: false }

  // Step 2: Build time range
  const now = new Date()
  const end_time = now.toISOString()
  const haStatPeriod = period === 'day' ? 'hour' : 'day'
  let start_time: string

  if (period === 'day') {
    const s = new Date(now)
    s.setHours(0, 0, 0, 0)
    s.setHours(s.getHours() - 1) // extra hour as baseline for diff
    start_time = s.toISOString()
  } else if (period === 'week') {
    const s = new Date(now)
    s.setDate(s.getDate() - 7)
    s.setHours(0, 0, 0, 0)
    s.setDate(s.getDate() - 1) // extra day as baseline
    start_time = s.toISOString()
  } else {
    const s = new Date(now.getFullYear(), now.getMonth(), 0) // last day of prev month (baseline)
    s.setHours(0, 0, 0, 0)
    start_time = s.toISOString()
  }

  // Step 3: Fetch statistics
  let stats: StatsResult
  try {
    stats = await client.sendCommand('history/statistics_during_period', {
      start_time,
      end_time,
      statistic_ids: allIds,
      period: haStatPeriod,
      types: ['sum'],
    }) as StatsResult
  } catch (err: unknown) {
    throw new Error(err instanceof Error ? err.message : 'Statistics fetch failed')
  }

  // Step 4: Aggregate
  const sumMultiple = (ids: string[]) => ids.reduce((acc, id) => acc + sumSeries(stats[id]), 0)
  const grid_consumption = sumMultiple(gridConsumptionIds)
  const grid_return = sumMultiple(gridReturnIds)
  const solar_production = sumMultiple(solarIds)
  const battery_charge = sumMultiple(batteryChargeIds)
  const gas_consumption = sumMultiple(gasIds)

  const self_sufficiency = grid_consumption > 0
    ? Math.min(100, Math.max(0, Math.round(((solar_production - grid_return) / grid_consumption) * 100)))
    : solar_production > 0 ? 100 : 0

  // Chart: use primary IDs for each series
  const consumptionSeries = chartSeries(gridConsumptionIds[0] ? stats[gridConsumptionIds[0]] : undefined)
  const solarSeries = chartSeries(solarIds[0] ? stats[solarIds[0]] : undefined)
  const batterySeries = chartSeries(batteryChargeIds[0] ? stats[batteryChargeIds[0]] : undefined)
  const gridReturnSeries = chartSeries(gridReturnIds[0] ? stats[gridReturnIds[0]] : undefined)
  const chartCount = consumptionSeries.length || solarSeries.length

  return {
    configured: true,
    period,
    grid_consumption: Math.round(grid_consumption * 100) / 100,
    solar_production: Math.round(solar_production * 100) / 100,
    battery_charge: Math.round(battery_charge * 100) / 100,
    grid_return: Math.round(grid_return * 100) / 100,
    gas_consumption: Math.round(gas_consumption * 1000) / 1000,
    self_sufficiency,
    chart_data: {
      labels: buildLabels(period, chartCount),
      consumption: consumptionSeries,
      solar: solarSeries,
      battery: batterySeries,
      grid_return: gridReturnSeries,
    },
  }
}
