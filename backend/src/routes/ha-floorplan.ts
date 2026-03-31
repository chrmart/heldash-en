import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import path from 'path'
import fs from 'fs'
import { getDb } from '../db/database'

const DATA_DIR = process.env.DATA_DIR ?? '/data'

// ── DB row types ──────────────────────────────────────────────────────────────

interface FloorplanRow {
  id: string
  instance_id: string
  name: string
  type: string
  level: number
  icon: string
  orientation: string
  image_path: string | null
  created_at: string
}

interface FloorplanEntityRow {
  id: string
  floorplan_id: string
  entity_id: string
  pos_x: number
  pos_y: number
  display_size: string
  show_label: number
  created_at: string
}

// ── Request body types ────────────────────────────────────────────────────────

interface CreateFloorplanBody {
  name: string
  type?: string
  level?: number
  icon?: string
  orientation?: string
}

interface PatchFloorplanBody {
  name?: string
  type?: string
  level?: number
  icon?: string
  orientation?: string
}

interface UploadImageBody {
  data: string
  content_type: string
}

interface AddEntityBody {
  entity_id: string
  pos_x: number
  pos_y: number
  display_size?: string
  show_label?: boolean
}

interface PatchEntityBody {
  pos_x?: number
  pos_y?: number
  display_size?: string
  show_label?: boolean
}

interface ImportBody {
  floorplans?: unknown[]
  entities?: Record<string, unknown[]>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeFloorplan(r: FloorplanRow, entityCount: number) {
  return {
    id: r.id,
    instance_id: r.instance_id,
    name: r.name,
    type: r.type,
    level: r.level,
    icon: r.icon,
    orientation: r.orientation,
    image_path: r.image_path,
    image_url: r.image_path ? `/floorplan-images/${path.basename(r.image_path)}` : null,
    entity_count: entityCount,
    created_at: r.created_at,
  }
}

function sanitizeEntity(r: FloorplanEntityRow) {
  return {
    id: r.id,
    floorplan_id: r.floorplan_id,
    entity_id: r.entity_id,
    pos_x: r.pos_x,
    pos_y: r.pos_y,
    display_size: r.display_size,
    show_label: r.show_label === 1,
    created_at: r.created_at,
  }
}

function getFloorplanDir(): string {
  const dir = path.join(DATA_DIR, 'floorplans')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getFirstInstance(db: ReturnType<typeof getDb>): { id: string } | undefined {
  return db.prepare(
    'SELECT id FROM ha_instances WHERE enabled = 1 ORDER BY position, created_at LIMIT 1'
  ).get() as { id: string } | undefined
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

const MAX_IMAGE_BYTES = 5_242_880 // 5MB

// ── Route registration ────────────────────────────────────────────────────────

export async function haFloorplanRoutes(app: FastifyInstance) {

  // GET /api/ha/floorplans/export  ← static segment, register BEFORE /:id
  app.get('/api/ha/floorplans/export', async (_req, _reply) => {
    const db = getDb()
    const instance = getFirstInstance(db)
    if (!instance) return { floorplans: [], entities: {} }
    const floorplans = db.prepare(
      'SELECT * FROM ha_floorplans WHERE instance_id = ? ORDER BY level, name'
    ).all(instance.id) as FloorplanRow[]
    const entities: Record<string, ReturnType<typeof sanitizeEntity>[]> = {}
    for (const fp of floorplans) {
      const rows = db.prepare(
        'SELECT * FROM ha_floorplan_entities WHERE floorplan_id = ? ORDER BY created_at'
      ).all(fp.id) as FloorplanEntityRow[]
      entities[fp.id] = rows.map(sanitizeEntity)
    }
    return {
      floorplans: floorplans.map(fp => sanitizeFloorplan(fp, (entities[fp.id] ?? []).length)),
      entities,
    }
  })

  // POST /api/ha/floorplans/import  ← static segment, register BEFORE /:id
  app.post<{ Body: ImportBody }>(
    '/api/ha/floorplans/import',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const instance = getFirstInstance(db)
      if (!instance) return reply.status(400).send({ error: 'No HA instance configured' })
      if (!Array.isArray(req.body.floorplans)) {
        return reply.status(400).send({ error: 'Invalid import data' })
      }
      let imported = 0
      let skipped = 0
      const importAll = db.transaction(() => {
        for (const fp of req.body.floorplans!) {
          const f = fp as Record<string, unknown>
          try {
            const fpId = nanoid()
            db.prepare(
              'INSERT INTO ha_floorplans (id, instance_id, name, type, level, icon, orientation) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(fpId, instance.id, f.name, f.type ?? 'indoor', f.level ?? 0, f.icon ?? '🏠', f.orientation ?? 'landscape')
            imported++
            const originalId = String(f.id ?? '')
            const fpEntities = (req.body.entities?.[originalId] ?? []) as Record<string, unknown>[]
            for (const e of fpEntities) {
              try {
                db.prepare(
                  'INSERT INTO ha_floorplan_entities (id, floorplan_id, entity_id, pos_x, pos_y, display_size, show_label) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).run(nanoid(), fpId, e.entity_id, e.pos_x, e.pos_y, e.display_size ?? 'medium', e.show_label ? 1 : 0)
              } catch { /* ignore individual entity errors */ }
            }
          } catch {
            skipped++
          }
        }
      })
      importAll()
      return { imported, skipped }
    }
  )

  // GET /api/ha/floorplans
  app.get('/api/ha/floorplans', async (_req, _reply) => {
    const db = getDb()
    const instance = getFirstInstance(db)
    if (!instance) return []
    const floorplans = db.prepare(
      'SELECT * FROM ha_floorplans WHERE instance_id = ? ORDER BY level, name'
    ).all(instance.id) as FloorplanRow[]
    return floorplans.map(fp => {
      const count = (db.prepare(
        'SELECT COUNT(*) as c FROM ha_floorplan_entities WHERE floorplan_id = ?'
      ).get(fp.id) as { c: number }).c
      return sanitizeFloorplan(fp, count)
    })
  })

  // POST /api/ha/floorplans
  app.post<{ Body: CreateFloorplanBody }>(
    '/api/ha/floorplans',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const instance = getFirstInstance(db)
      if (!instance) return reply.status(400).send({ error: 'No HA instance configured' })
      const { name, type = 'indoor', level = 0, icon = '🏠', orientation = 'landscape' } = req.body
      if (!name?.trim()) return reply.status(400).send({ error: 'Name required' })
      const id = nanoid()
      db.prepare(
        'INSERT INTO ha_floorplans (id, instance_id, name, type, level, icon, orientation) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, instance.id, name.trim(), type, level, icon, orientation)
      const row = db.prepare('SELECT * FROM ha_floorplans WHERE id = ?').get(id) as FloorplanRow
      return sanitizeFloorplan(row, 0)
    }
  )

  // PATCH /api/ha/floorplans/:id
  app.patch<{ Params: { id: string }; Body: PatchFloorplanBody }>(
    '/api/ha/floorplans/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const { id } = req.params
      const row = db.prepare('SELECT * FROM ha_floorplans WHERE id = ?').get(id) as FloorplanRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })
      const { name, type, level, icon, orientation } = req.body
      db.prepare(`UPDATE ha_floorplans SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        level = COALESCE(?, level),
        icon = COALESCE(?, icon),
        orientation = COALESCE(?, orientation)
        WHERE id = ?`
      ).run(name ?? null, type ?? null, level !== undefined ? level : null, icon ?? null, orientation ?? null, id)
      const updated = db.prepare('SELECT * FROM ha_floorplans WHERE id = ?').get(id) as FloorplanRow
      const count = (db.prepare(
        'SELECT COUNT(*) as c FROM ha_floorplan_entities WHERE floorplan_id = ?'
      ).get(id) as { c: number }).c
      return sanitizeFloorplan(updated, count)
    }
  )

  // DELETE /api/ha/floorplans/:id
  app.delete<{ Params: { id: string } }>(
    '/api/ha/floorplans/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const { id } = req.params
      const row = db.prepare('SELECT * FROM ha_floorplans WHERE id = ?').get(id) as FloorplanRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })
      if (row.image_path && fs.existsSync(row.image_path)) {
        try { fs.unlinkSync(row.image_path) } catch { /* ignore */ }
      }
      // CASCADE DELETE handles entities
      db.prepare('DELETE FROM ha_floorplans WHERE id = ?').run(id)
      return reply.status(204).send()
    }
  )

  // POST /api/ha/floorplans/:id/image
  app.post<{ Params: { id: string }; Body: UploadImageBody }>(
    '/api/ha/floorplans/:id/image',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const { id } = req.params
      const row = db.prepare('SELECT * FROM ha_floorplans WHERE id = ?').get(id) as FloorplanRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })
      const { data, content_type } = req.body
      if (!data || !content_type) return reply.status(400).send({ error: 'data and content_type required' })
      // Validate size BEFORE decode: base64 length * 0.75 gives approx decoded bytes
      if (data.length * 0.75 > MAX_IMAGE_BYTES) {
        return reply.status(413).send({ error: 'Image too large (max 5MB)' })
      }
      const ext = CONTENT_TYPE_EXT[content_type]
      if (!ext) return reply.status(415).send({ error: 'Unsupported image type' })
      const dir = getFloorplanDir()
      const filename = `${id}.${ext}`
      const filePath = path.join(dir, filename)
      // Delete old image if different extension
      if (row.image_path && row.image_path !== filePath && fs.existsSync(row.image_path)) {
        try { fs.unlinkSync(row.image_path) } catch { /* ignore */ }
      }
      const base64Data = data.replace(/^data:[^;]+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(filePath, buffer)
      db.prepare('UPDATE ha_floorplans SET image_path = ? WHERE id = ?').run(filePath, id)
      return { url: `/floorplan-images/${filename}` }
    }
  )

  // DELETE /api/ha/floorplans/:id/image
  app.delete<{ Params: { id: string } }>(
    '/api/ha/floorplans/:id/image',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const { id } = req.params
      const row = db.prepare('SELECT * FROM ha_floorplans WHERE id = ?').get(id) as FloorplanRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })
      if (row.image_path && fs.existsSync(row.image_path)) {
        try { fs.unlinkSync(row.image_path) } catch { /* ignore */ }
      }
      db.prepare('UPDATE ha_floorplans SET image_path = NULL WHERE id = ?').run(id)
      return { ok: true }
    }
  )

  // GET /api/ha/floorplans/:id/entities
  app.get<{ Params: { id: string } }>(
    '/api/ha/floorplans/:id/entities',
    async (req, _reply) => {
      const db = getDb()
      const entities = db.prepare(
        'SELECT * FROM ha_floorplan_entities WHERE floorplan_id = ? ORDER BY created_at'
      ).all(req.params.id) as FloorplanEntityRow[]
      return entities.map(sanitizeEntity)
    }
  )

  // POST /api/ha/floorplans/:id/entities
  app.post<{ Params: { id: string }; Body: AddEntityBody }>(
    '/api/ha/floorplans/:id/entities',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const { id } = req.params
      const fp = db.prepare('SELECT id FROM ha_floorplans WHERE id = ?').get(id)
      if (!fp) return reply.status(404).send({ error: 'Floorplan not found' })
      const { entity_id, pos_x, pos_y, display_size = 'medium', show_label = false } = req.body
      if (!entity_id) return reply.status(400).send({ error: 'entity_id required' })
      if (pos_x === undefined || pos_y === undefined) {
        return reply.status(400).send({ error: 'pos_x and pos_y required' })
      }
      const entityId = nanoid()
      db.prepare(
        'INSERT INTO ha_floorplan_entities (id, floorplan_id, entity_id, pos_x, pos_y, display_size, show_label) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(entityId, id, entity_id, pos_x, pos_y, display_size, show_label ? 1 : 0)
      const row = db.prepare(
        'SELECT * FROM ha_floorplan_entities WHERE id = ?'
      ).get(entityId) as FloorplanEntityRow
      return sanitizeEntity(row)
    }
  )

  // PATCH /api/ha/floorplans/:id/entities/:entityId
  app.patch<{ Params: { id: string; entityId: string }; Body: PatchEntityBody }>(
    '/api/ha/floorplans/:id/entities/:entityId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const { id, entityId } = req.params
      const row = db.prepare(
        'SELECT * FROM ha_floorplan_entities WHERE id = ? AND floorplan_id = ?'
      ).get(entityId, id) as FloorplanEntityRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })
      const { pos_x, pos_y, display_size, show_label } = req.body
      db.prepare(`UPDATE ha_floorplan_entities SET
        pos_x = COALESCE(?, pos_x),
        pos_y = COALESCE(?, pos_y),
        display_size = COALESCE(?, display_size),
        show_label = COALESCE(?, show_label)
        WHERE id = ?`
      ).run(
        pos_x !== undefined ? pos_x : null,
        pos_y !== undefined ? pos_y : null,
        display_size ?? null,
        show_label !== undefined ? (show_label ? 1 : 0) : null,
        entityId
      )
      const updated = db.prepare(
        'SELECT * FROM ha_floorplan_entities WHERE id = ?'
      ).get(entityId) as FloorplanEntityRow
      return sanitizeEntity(updated)
    }
  )

  // DELETE /api/ha/floorplans/:id/entities/:entityId
  app.delete<{ Params: { id: string; entityId: string } }>(
    '/api/ha/floorplans/:id/entities/:entityId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const { id, entityId } = req.params
      const row = db.prepare(
        'SELECT id FROM ha_floorplan_entities WHERE id = ? AND floorplan_id = ?'
      ).get(entityId, id)
      if (!row) return reply.status(404).send({ error: 'Not found' })
      db.prepare('DELETE FROM ha_floorplan_entities WHERE id = ?').run(entityId)
      return reply.status(204).send()
    }
  )
}
