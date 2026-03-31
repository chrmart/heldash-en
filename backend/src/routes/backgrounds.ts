import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { promises as fsp } from 'fs'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db/database'

const DATA_DIR = process.env.DATA_DIR ?? '/data'

// ── DB row types ──────────────────────────────────────────────────────────────
interface BackgroundRow {
  id: string
  name: string
  file_path: string
  created_at: string
}

// ── Request body types ────────────────────────────────────────────────────────
interface CreateBackgroundBody {
  name: string
  data: string          // base64-encoded image
  content_type: string
}

interface SetGroupBackgroundBody {
  background_id: string | null
}

// ── Route plugin ──────────────────────────────────────────────────────────────
export async function backgroundsRoutes(app: FastifyInstance) {

  // List all backgrounds (admin only)
  app.get('/api/backgrounds', { preHandler: app.requireAdmin }, async () => {
    const db = getDb()
    return db.prepare('SELECT * FROM backgrounds ORDER BY created_at DESC').all() as BackgroundRow[]
  })

  // Get the background assigned to the current caller's group
  // Unauthenticated callers fall back to the grp_guest group's background
  app.get('/api/backgrounds/mine', { logLevel: 'silent' }, async (req, reply) => {
    const db = getDb()
    let groupId = 'grp_guest'
    try {
      await req.jwtVerify()
      groupId = req.user.groupId ?? 'grp_guest'
    } catch { /* not authenticated — use guest group */ }

    const row = db.prepare(`
      SELECT b.id, b.name, b.file_path
      FROM backgrounds b
      JOIN user_groups g ON g.background_id = b.id
      WHERE g.id = ?
    `).get(groupId) as BackgroundRow | undefined

    if (!row) return reply.send(null)
    return { id: row.id, name: row.name, url: row.file_path }
  })

  // Upload a new background image (admin only, base64 JSON)
  app.post<{ Body: CreateBackgroundBody }>('/api/backgrounds', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { name, data, content_type } = req.body
    if (!name?.trim()) return reply.status(400).send({ error: 'Name required' })
    if (!data) return reply.status(400).send({ error: 'Image data required' })

    const allowedTypes: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
    }
    const ext = allowedTypes[content_type]
    if (!ext) return reply.status(415).send({ error: 'Unsupported format (png/jpg/gif/webp/svg/bmp only)' })

    const buf = Buffer.from(data, 'base64')
    if (buf.length > 10 * 1024 * 1024) return reply.status(413).send({ error: 'Image too large (max 10 MB)' })

    const id = nanoid()
    const bgDir = path.join(DATA_DIR, 'backgrounds')
    if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true })

    const filePath = `/backgrounds/${id}${ext}`
    await fsp.writeFile(path.join(bgDir, `${id}${ext}`), buf)

    const db = getDb()
    db.prepare('INSERT INTO backgrounds (id, name, file_path) VALUES (?, ?, ?)').run(id, name.trim(), filePath)

    app.log.info({ id, name: name.trim() }, 'Background image uploaded')
    return reply.status(201).send({ id, name: name.trim(), file_path: filePath })
  })

  // Delete a background image (admin only)
  app.delete<{ Params: { id: string } }>('/api/backgrounds/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM backgrounds WHERE id = ?').get(req.params.id) as BackgroundRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })

    // Clear group assignments before deleting
    db.prepare('UPDATE user_groups SET background_id = NULL WHERE background_id = ?').run(row.id)
    db.prepare('DELETE FROM backgrounds WHERE id = ?').run(row.id)

    // Remove file from disk (ignore errors if file is already gone)
    const filename = path.basename(row.file_path)
    await fsp.unlink(path.join(DATA_DIR, 'backgrounds', filename)).catch(() => {})

    app.log.info({ id: row.id, name: row.name }, 'Background image deleted')
    return reply.status(204).send()
  })

  // Assign a background to a user group (admin only, background_id may be null to clear)
  app.put<{ Params: { id: string }; Body: SetGroupBackgroundBody }>(
    '/api/user-groups/:id/background',
    { preHandler: app.requireAdmin },
    async (req, reply) => {
      const db = getDb()
      const { background_id } = req.body

      if (background_id != null) {
        const exists = db.prepare('SELECT id FROM backgrounds WHERE id = ?').get(background_id)
        if (!exists) return reply.status(404).send({ error: 'Background not found' })
      }

      db.prepare('UPDATE user_groups SET background_id = ? WHERE id = ?').run(background_id ?? null, req.params.id)
      return { ok: true }
    }
  )
}
