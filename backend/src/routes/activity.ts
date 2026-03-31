import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'

export interface ActivityLogRow {
  id: string
  created_at: string
  category: string
  message: string
  severity: string
  meta: string | null
}

export function logActivity(
  category: string,
  message: string,
  severity: 'info' | 'warning' | 'error' = 'info',
  meta?: Record<string, unknown>
): void {
  try {
    const db = getDb()
    const id = nanoid()
    db.prepare('INSERT INTO activity_log (id, category, message, severity, meta) VALUES (?, ?, ?, ?, ?)')
      .run(id, category, message, severity, meta ? JSON.stringify(meta) : null)
    // Keep max 100 rows
    db.prepare('DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY created_at DESC LIMIT 100)').run()
  } catch { /* ignore if db not ready */ }
}

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/activity
  app.get<{ Querystring: { category?: string } }>(
    '/api/activity',
    { preHandler: [app.authenticate] },
    async (req) => {
      const db = getDb()
      const { category } = req.query
      let rows: ActivityLogRow[]
      if (category && category !== 'all') {
        rows = db.prepare('SELECT * FROM activity_log WHERE category = ? ORDER BY created_at DESC LIMIT 50').all(category) as ActivityLogRow[]
      } else {
        rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50').all() as ActivityLogRow[]
      }
      return {
        entries: rows.map(r => ({
          ...r,
          created_at: r.created_at.endsWith('Z') ? r.created_at : r.created_at.replace(' ', 'T') + 'Z',
        }))
      }
    }
  )
}
