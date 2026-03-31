import { FastifyInstance } from 'fastify'
import { getDb, safeJson } from '../db/database'
import { isValidHttpUrl } from './_helpers'
import { nanoid } from 'nanoid'
import { request, Agent } from 'undici'
import pLimit from 'p-limit'
import fs from 'fs'
import path from 'path'
import { logActivity } from './activity'

const DATA_DIR = process.env.DATA_DIR ?? '/data'

// Reusable agent: accepts self-signed TLS certs (common in homelabs), 5s timeout
const pingAgent = new Agent({
  headersTimeout: 5_000,
  bodyTimeout: 5_000,
  connect: { rejectUnauthorized: false },
})

// ── DB row types ─────────────────────────────────────────────────────────────
interface ServiceRow {
  id: string
  group_id: string | null
  name: string
  url: string
  icon: string | null
  icon_url: string | null
  description: string | null
  tags: string
  check_enabled: number
  check_url: string | null
  check_interval: number
  position_x: number
  position_y: number
  width: number
  height: number
  last_status: string | null
  last_checked: string | null
  created_at: string
  updated_at: string
}

function mapServiceRow(row: ServiceRow): ServiceRow {
  return {
    ...row,
    last_status: row.check_enabled === 1 && row.last_status === null ? 'unknown' : row.last_status,
  }
}

// ── Request body types ───────────────────────────────────────────────────────
interface CreateServiceBody {
  name: string
  url: string
  icon?: string | null
  description?: string | null
  group_id?: string | null
  tags?: string[]
  check_enabled?: boolean
  check_url?: string | null
  check_interval?: number
  position_x?: number
  position_y?: number
  width?: number
  height?: number
}

interface PatchServiceBody {
  name?: string
  url?: string
  icon?: string | null
  icon_url?: string | null
  description?: string | null
  group_id?: string | null
  tags?: string[]
  check_enabled?: boolean
  check_url?: string | null
  check_interval?: number
  position_x?: number
  position_y?: number
  width?: number
  height?: number
}

interface UploadIconBody {
  data: string
  content_type: string
}

interface ImportServiceItem {
  name: string
  url: string
  icon?: string | null
  description?: string | null
  tags?: string[]
  group_id?: string | null
  check_enabled?: boolean
  check_url?: string | null
  check_interval?: number
}

interface ImportServicesBody {
  services: ImportServiceItem[]
}

export async function servicesRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/services — filtered by the caller's group visibility
  app.get('/api/services', async (req, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')
    reply.header('Surrogate-Control', 'no-store')

    let groupId = 'grp_guest'
    try {
      await req.jwtVerify()
      groupId = req.user.groupId ?? 'grp_guest'
    } catch { /* unauthenticated — apply guest group visibility */ }

    // Admin group sees everything
    if (groupId === 'grp_admin') {
      return (db.prepare('SELECT * FROM services ORDER BY position_y, position_x').all() as ServiceRow[]).map(mapServiceRow)
    }

    // All other groups: LEFT JOIN filters hidden services in SQL (avoids loading all rows into memory)
    return (db.prepare(`
      SELECT s.* FROM services s
      LEFT JOIN group_service_visibility g ON s.id = g.service_id AND g.group_id = ?
      WHERE g.service_id IS NULL
      ORDER BY s.position_y, s.position_x
    `).all(groupId) as ServiceRow[]).map(mapServiceRow)
  })

  // GET /api/services/:id
  app.get<{ Params: { id: string } }>('/api/services/:id', async (req, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')

    const row = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })

    // Visibility check — return 404 (not 403) to avoid leaking existence info
    let groupId = 'grp_guest'
    try {
      await req.jwtVerify()
      groupId = req.user.groupId ?? 'grp_guest'
    } catch { /* unauthenticated */ }

    if (groupId !== 'grp_admin') {
      const hidden = db.prepare(
        'SELECT 1 FROM group_service_visibility WHERE group_id = ? AND service_id = ?'
      ).get(groupId, row.id)
      if (hidden) return reply.status(404).send({ error: 'Not found' })
    }

    return mapServiceRow(row)
  })

  // POST /api/services
  app.post<{ Body: CreateServiceBody }>('/api/services', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, url, icon, description, group_id, tags, check_enabled, check_url, check_interval, position_x, position_y, width, height } = req.body
    if (!name || !url) return reply.status(400).send({ error: 'name and url are required' })
    if (!isValidHttpUrl(url)) return reply.status(400).send({ error: 'url must be a valid http or https URL' })
    if (check_url && !isValidHttpUrl(check_url)) return reply.status(400).send({ error: 'check_url must be a valid http or https URL' })

    const id = nanoid()
    db.prepare(`
      INSERT INTO services (id, group_id, name, url, icon, description, tags, check_enabled, check_url, check_interval, position_x, position_y, width, height)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, group_id ?? null, name, url,
      icon ?? null, description ?? null,
      JSON.stringify(tags ?? []),
      check_enabled !== false ? 1 : 0,
      check_url ?? null,
      check_interval ?? 60,
      position_x ?? 0, position_y ?? 0,
      width ?? 1, height ?? 1
    )

    app.log.info({ id, name }, 'Service created')
    return reply.status(201).send(mapServiceRow(db.prepare('SELECT * FROM services WHERE id = ?').get(id) as ServiceRow))
  })

  // PATCH /api/services/:id
  app.patch<{ Params: { id: string }; Body: PatchServiceBody }>('/api/services/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    if (req.body.url !== undefined && !isValidHttpUrl(req.body.url)) {
      return reply.status(400).send({ error: 'url must be a valid http or https URL' })
    }
    if (req.body.check_url !== undefined && req.body.check_url !== null && !isValidHttpUrl(req.body.check_url)) {
      return reply.status(400).send({ error: 'check_url must be a valid http or https URL' })
    }

    const fields: (keyof PatchServiceBody)[] = ['name', 'url', 'icon', 'icon_url', 'description', 'group_id', 'tags', 'check_enabled', 'check_url', 'check_interval', 'position_x', 'position_y', 'width', 'height']
    const updates: string[] = ['updated_at = datetime(\'now\')']
    const values: unknown[] = []

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`)
        if (field === 'tags') {
          values.push(JSON.stringify(req.body[field]))
        } else if (field === 'check_enabled') {
          values.push(req.body[field] ? 1 : 0)
        } else {
          values.push(req.body[field] ?? null)
        }
      }
    }

    values.push(req.params.id)
    db.prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`).run(...values)

    return mapServiceRow(db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow)
  })

  // DELETE /api/services/:id
  app.delete<{ Params: { id: string } }>('/api/services/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    // Delete icon file if present
    if (existing.icon_url) {
      const filename = path.basename(existing.icon_url)
      const filePath = path.join(DATA_DIR, 'icons', filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id)
    app.log.info({ id: req.params.id, name: existing.name }, 'Service deleted')
    return reply.status(204).send()
  })

  // POST /api/services/:id/check - manual health check
  app.post<{ Params: { id: string } }>('/api/services/:id/check', async (req, reply) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    if (!service) return reply.status(404).send({ error: 'Not found' })

    const checkUrl = service.check_url || service.url
    const oldStatus = service.last_status
    const status = await pingService(checkUrl)

    if (status !== oldStatus) {
      if (status === 'offline') {
        app.log.warn({ id: service.id, name: service.name, url: checkUrl }, 'Service went offline')
      } else if (status === 'online') {
        app.log.info({ id: service.id, name: service.name }, 'Service back online')
      }
    }

    db.prepare('UPDATE services SET last_status = ?, last_checked = datetime(\'now\') WHERE id = ?')
      .run(status, req.params.id)

    // Log status changes (health history written by server-side scheduler only)
    if (status !== oldStatus) {
      if (status === 'offline') {
        logActivity('system', `${service.name} ist offline gegangen`, 'warning', { serviceId: service.id, url: checkUrl })
      } else if (status === 'online') {
        logActivity('system', `${service.name} ist wieder online`, 'info', { serviceId: service.id })
      }
    }

    return { id: service.id, status, checked_at: new Date().toISOString() }
  })

  // POST /api/services/check-all
  app.post('/api/services/check-all', async () => {
    const services = db.prepare('SELECT * FROM services WHERE check_enabled = 1').all() as ServiceRow[]
    const limit = pLimit(5)
    const results = await Promise.all(
      services.map(s => limit(async () => {
        const checkUrl = s.check_url || s.url
        const oldStatus = s.last_status
        const status = await pingService(checkUrl)

        if (status !== oldStatus) {
          if (status === 'offline') {
            app.log.warn({ id: s.id, name: s.name, url: checkUrl }, 'Service went offline')
          } else if (status === 'online') {
            app.log.info({ id: s.id, name: s.name }, 'Service back online')
          }
        }

        db.prepare('UPDATE services SET last_status = ?, last_checked = datetime(\'now\') WHERE id = ?')
          .run(status, s.id)

        // Log status changes (health history written by server-side scheduler only)
        if (status !== oldStatus) {
          if (status === 'offline') {
            logActivity('system', `${s.name} ist offline gegangen`, 'warning', { serviceId: s.id, url: checkUrl })
          } else if (status === 'online') {
            logActivity('system', `${s.name} ist wieder online`, 'info', { serviceId: s.id })
          }
        }

        return { id: s.id, status }
      }))
    )
    return results
  })

  // POST /api/services/:id/icon - upload icon image (base64 JSON)
  app.post<{ Params: { id: string }; Body: UploadIconBody }>(
    '/api/services/:id/icon',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
      if (!service) return reply.status(404).send({ error: 'Not found' })

      const { data, content_type } = req.body
      if (!data || !content_type) return reply.status(400).send({ error: 'data and content_type required' })

      const extMap: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/svg+xml': 'svg',
      }
      const ext = extMap[content_type]
      if (!ext) return reply.status(415).send({ error: 'Unsupported type. Use PNG, JPG or SVG.' })

      const buffer = Buffer.from(data, 'base64')
      if (buffer.length > 512 * 1024) return reply.status(413).send({ error: 'Image too large (max 512 KB)' })

      const iconsDir = path.join(DATA_DIR, 'icons')
      fs.mkdirSync(iconsDir, { recursive: true })

      // Delete old icon file if it exists and differs from the new one
      if (service.icon_url) {
        const oldFilename = path.basename(service.icon_url)
        const oldPath = path.join(iconsDir, oldFilename)
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath) } catch { /* ignore */ }
        }
      }

      const filename = `${req.params.id}.${ext}`
      fs.writeFileSync(path.join(iconsDir, filename), buffer)

      const icon_url = `/icons/${filename}`
      db.prepare('UPDATE services SET icon_url = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(icon_url, req.params.id)

      return { icon_url }
    }
  )

  // GET /api/services/export — admin only, export all services as JSON
  app.get<{ Querystring: { group_id?: string } }>(
    '/api/services/export',
    { onRequest: app.requireAdmin },
    async (req, reply) => {
      const groupId = (req.query as Record<string, string>).group_id

      let services: ServiceRow[]
      if (groupId) {
        // Export only services in a specific group
        services = db.prepare('SELECT * FROM services WHERE group_id = ? ORDER BY position_x').all(groupId) as ServiceRow[]
      } else {
        // Export all services
        services = db.prepare('SELECT * FROM services ORDER BY position_y, position_x').all() as ServiceRow[]
      }

      // Convert to export format (parse tags, exclude icon_url binary path)
      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        services: services.map(s => ({
          name: s.name,
          url: s.url,
          icon: s.icon,
          description: s.description,
          tags: safeJson(s.tags, [] as string[]),
          group_id: s.group_id,
          check_enabled: s.check_enabled === 1,
          check_url: s.check_url,
          check_interval: s.check_interval,
        })),
      }

      // Send as attachment
      reply.type('application/json')
      reply.header('Content-Disposition', `attachment; filename="heldash-services-${new Date().toISOString().split('T')[0]}.json"`)
      return exportData
    }
  )

  // POST /api/services/import — admin only, import services from JSON
  app.post<{ Body: ImportServicesBody }>(
    '/api/services/import',
    { onRequest: app.requireAdmin },
    async (req, reply) => {
      const { services: importedServices } = req.body

      if (!Array.isArray(importedServices)) {
        return reply.status(400).send({ error: 'Invalid format: expected { services: [...] }' })
      }

      let imported = 0
      let skipped = 0
      const errors: string[] = []

      const insertStmt = db.prepare(`
        INSERT INTO services (id, name, url, icon, description, tags, group_id, check_enabled, check_url, check_interval, position_x, position_y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const importTxn = db.transaction(() => {
        importedServices.forEach((svc: ImportServiceItem, idx: number) => {
          try {
            // Validate required fields
            if (!svc.name || typeof svc.name !== 'string') throw new Error('name required (string)')
            if (!svc.url || typeof svc.url !== 'string') throw new Error('url required (string)')

            // Check for duplicates by URL
            const existing = db.prepare('SELECT id FROM services WHERE url = ?').get(svc.url)
            if (existing) {
              skipped++
              return
            }

            const id = nanoid()
            const tags = JSON.stringify(Array.isArray(svc.tags) ? svc.tags : [])
            const checkEnabled = svc.check_enabled === true ? 1 : 0
            const maxPos = db.prepare('SELECT MAX(position_x) as m FROM services').get() as { m: number | null }
            const posX = (maxPos.m ?? -1) + 1

            insertStmt.run(
              id,
              svc.name,
              svc.url,
              svc.icon || null,
              svc.description || null,
              tags,
              svc.group_id || null,
              checkEnabled,
              svc.check_url || null,
              svc.check_interval || 60,
              posX,
              0
            )

            imported++
          } catch (err) {
            errors.push(`Service ${idx}: ${(err as Error).message}`)
          }
        })
      })

      importTxn()

      return {
        imported,
        skipped,
        total: importedServices.length,
        errors: errors.length > 0 ? errors : undefined,
      }
    }
  )

  // GET /api/services/:id/health-history — last 7 days, grouped by hour
  app.get<{ Params: { id: string } }>(
    '/api/services/:id/health-history',
    async (req, reply) => {
      const serviceId = req.params.id
      const service = db.prepare('SELECT id FROM services WHERE id = ?').get(serviceId) as { id: string } | undefined
      if (!service) return reply.status(404).send({ error: 'Not found' })

      interface HealthRow { hour: string; online_count: number; total_count: number }
      const rows = db.prepare(`
        SELECT strftime('%Y-%m-%dT%H:00:00', checked_at) as hour,
          SUM(status) as online_count,
          COUNT(*) as total_count
        FROM service_health_history
        WHERE service_id = ?
          AND checked_at >= datetime('now', '-7 days')
        GROUP BY hour
        ORDER BY hour ASC
      `).all(serviceId) as HealthRow[]

      const history = rows.map(r => ({
        hour: r.hour.endsWith('Z') ? r.hour : r.hour + 'Z',
        uptime: r.total_count > 0 ? Math.round((r.online_count / r.total_count) * 100) : 0,
      }))

      const totalOnline = rows.reduce((s, r) => s + r.online_count, 0)
      const totalChecks = rows.reduce((s, r) => s + r.total_count, 0)
      const uptimePercent7d = totalChecks > 0 ? Math.round((totalOnline / totalChecks) * 1000) / 10 : null

      return { history, uptimePercent7d }
    }
  )
}

async function pingService(url: string): Promise<string> {
  try {
    const res = await request(url, {
      method: 'GET',
      dispatcher: pingAgent,
    })
    const status = res.statusCode < 500 ? 'online' : 'offline'
    // Drain response body to release the socket back to the connection pool
    try {
      for await (const _ of res.body) { /* drain */ }
    } catch { /* ignore body read errors */ }
    return status
  } catch {
    return 'offline'
  }
}
