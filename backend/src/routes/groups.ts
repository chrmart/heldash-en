import { FastifyInstance } from 'fastify'
import { getDb } from '../db/database'
import { nanoid } from 'nanoid'

interface GroupRow {
  id: string
  name: string
  icon: string | null
  position: number
  created_at: string
  updated_at: string
}

interface CreateGroupBody {
  name: string
  icon?: string | null
  position?: number
}

interface PatchGroupBody {
  name?: string
  icon?: string | null
  position?: number
}

export async function groupsRoutes(app: FastifyInstance) {
  const db = getDb()

  app.get('/api/groups', async () => {
    return db.prepare('SELECT * FROM groups ORDER BY position').all()
  })

  app.post<{ Body: CreateGroupBody }>('/api/groups', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, icon, position } = req.body
    if (!name) return reply.status(400).send({ error: 'name is required' })
    const id = nanoid()
    db.prepare('INSERT INTO groups (id, name, icon, position) VALUES (?, ?, ?, ?)').run(id, name, icon ?? null, position ?? 0)
    return reply.status(201).send(db.prepare('SELECT * FROM groups WHERE id = ?').get(id))
  })

  app.patch<{ Params: { id: string }; Body: PatchGroupBody }>('/api/groups/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id) as GroupRow | undefined
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    const { name, icon, position } = req.body
    db.prepare('UPDATE groups SET name = COALESCE(?, name), icon = COALESCE(?, icon), position = COALESCE(?, position), updated_at = datetime(\'now\') WHERE id = ?')
      .run(name ?? null, icon ?? null, position ?? null, req.params.id)
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id)
  })

  app.delete<{ Params: { id: string } }>('/api/groups/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })

  // GET /api/admin/guest-visibility — returns IDs of items hidden from grp_guest
  app.get('/api/admin/guest-visibility', { preHandler: [app.requireAdmin] }, async () => {
    const services = db.prepare(
      'SELECT service_id FROM group_service_visibility WHERE group_id = ?'
    ).all('grp_guest') as { service_id: string }[]
    const arrItems = db.prepare(
      'SELECT instance_id FROM group_arr_visibility WHERE group_id = ?'
    ).all('grp_guest') as { instance_id: string }[]
    const widgets = db.prepare(
      'SELECT widget_id FROM group_widget_visibility WHERE group_id = ?'
    ).all('grp_guest') as { widget_id: string }[]
    return {
      services: services.map(r => r.service_id),
      arr: arrItems.map(r => r.instance_id),
      widgets: widgets.map(r => r.widget_id),
    }
  })
}
