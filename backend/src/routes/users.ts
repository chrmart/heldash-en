import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'

interface UserRow {
  id: string
  username: string
  password_hash: string | null
  role: string
  email: string | null
  first_name: string | null
  last_name: string | null
  user_group_id: string | null
  is_active: number
  last_login: string | null
  created_at: string
  updated_at: string
}

interface UserGroupRow {
  id: string
  name: string
  description: string | null
  is_system: number
  docker_access: number
  docker_widget_access: number
  background_id: string | null
  created_at: string
}

interface CreateUserBody {
  username: string
  password: string
  first_name: string
  last_name: string
  email?: string
  user_group_id?: string
}

interface PatchUserBody {
  username?: string
  password?: string
  first_name?: string
  last_name?: string
  email?: string
  user_group_id?: string
  is_active?: boolean
}

interface CreateGroupBody {
  name: string
  description?: string
}

interface VisibilityBody {
  hidden_service_ids: string[]
}

interface ArrVisibilityBody {
  hidden_arr_ids: string[]
}

interface WidgetVisibilityBody {
  hidden_widget_ids: string[]
}

function roleFromGroup(groupId: string | null | undefined): string {
  return groupId === 'grp_admin' ? 'admin' : 'user'
}

function sanitizeUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    user_group_id: u.user_group_id,
    is_active: u.is_active === 1,
    last_login: u.last_login,
    created_at: u.created_at,
  }
}

export async function usersRoutes(app: FastifyInstance) {
  const db = getDb()

  // ── User endpoints (admin-only) ────────────────────────────────────────────

  // GET /api/users
  app.get('/api/users', { preHandler: [app.requireAdmin] }, async () => {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[]
    return rows.map(sanitizeUser)
  })

  // POST /api/users
  app.post<{ Body: CreateUserBody }>('/api/users', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { username, password, first_name, last_name, email, user_group_id } = req.body
    if (!username?.trim()) return reply.status(400).send({ error: 'username is required' })
    if (!password || password.length < 8) return reply.status(400).send({ error: 'password must be at least 8 characters' })
    if (!first_name?.trim()) return reply.status(400).send({ error: 'first_name is required' })
    if (!last_name?.trim()) return reply.status(400).send({ error: 'last_name is required' })

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim())
    if (existing) return reply.status(409).send({ error: 'Username already taken' })

    const password_hash = await bcrypt.hash(password, 12)
    const id = nanoid()
    const groupId = user_group_id ?? 'grp_guest'
    const userRole = roleFromGroup(groupId)

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, email, first_name, last_name, user_group_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, username.trim(), password_hash, userRole, email?.trim() ?? null, first_name.trim(), last_name.trim(), groupId)

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow
    return reply.status(201).send(sanitizeUser(user))
  })

  // PATCH /api/users/:id
  app.patch<{ Params: { id: string }; Body: PatchUserBody }>('/api/users/:id', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as UserRow | undefined
    if (!user) return reply.status(404).send({ error: 'Not found' })

    const updates: string[] = ["updated_at = datetime('now')"]
    const values: unknown[] = []

    const { username, password, first_name, last_name, email, user_group_id, is_active } = req.body

    if (username !== undefined) { updates.push('username = ?'); values.push(username.trim()) }
    if (first_name !== undefined) { updates.push('first_name = ?'); values.push(first_name.trim()) }
    if (last_name !== undefined) { updates.push('last_name = ?'); values.push(last_name.trim()) }
    if (email !== undefined) { updates.push('email = ?'); values.push(email?.trim() ?? null) }
    if (user_group_id !== undefined) {
      updates.push('user_group_id = ?'); values.push(user_group_id)
      // Role is always derived from group membership
      updates.push('role = ?'); values.push(roleFromGroup(user_group_id))
    }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0) }
    if (password) {
      if (password.length < 8) return reply.status(400).send({ error: 'password must be at least 8 characters' })
      updates.push('password_hash = ?')
      values.push(await bcrypt.hash(password, 12))
    }

    values.push(req.params.id)
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as UserRow
    return sanitizeUser(updated)
  })

  // DELETE /api/users/:id
  app.delete<{ Params: { id: string } }>('/api/users/:id', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as UserRow | undefined
    if (!user) return reply.status(404).send({ error: 'Not found' })
    if (req.user.sub === req.params.id) return reply.status(400).send({ error: 'Cannot delete your own account' })
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })

  // ── User-group endpoints (admin-only) ──────────────────────────────────────

  // GET /api/user-groups — includes hidden_service_ids, hidden_arr_ids, hidden_widget_ids per group
  app.get('/api/user-groups', { preHandler: [app.requireAdmin] }, async () => {
    const groups = db.prepare('SELECT * FROM user_groups ORDER BY is_system DESC, name').all() as UserGroupRow[]
    return groups.map(g => ({
      ...g,
      is_system: g.is_system === 1,
      docker_access: g.docker_access === 1,
      docker_widget_access: g.docker_widget_access === 1,
      hidden_service_ids: (db.prepare(
        'SELECT service_id FROM group_service_visibility WHERE group_id = ?'
      ).all(g.id) as { service_id: string }[]).map(r => r.service_id),
      hidden_arr_ids: (db.prepare(
        'SELECT instance_id FROM group_arr_visibility WHERE group_id = ?'
      ).all(g.id) as { instance_id: string }[]).map(r => r.instance_id),
      hidden_widget_ids: (db.prepare(
        'SELECT widget_id FROM group_widget_visibility WHERE group_id = ?'
      ).all(g.id) as { widget_id: string }[]).map(r => r.widget_id),
    }))
  })

  // POST /api/user-groups
  app.post<{ Body: CreateGroupBody }>('/api/user-groups', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { name, description } = req.body
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    const id = nanoid()
    db.prepare('INSERT INTO user_groups (id, name, description, is_system) VALUES (?, ?, ?, 0)')
      .run(id, name.trim(), description?.trim() ?? null)
    const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id) as UserGroupRow
    return reply.status(201).send({ ...group, is_system: false, docker_access: false, docker_widget_access: false, background_id: null, hidden_service_ids: [], hidden_arr_ids: [], hidden_widget_ids: [] })
  })

  // PUT /api/user-groups/:id/visibility — set hidden app list for a group
  app.put<{ Params: { id: string }; Body: VisibilityBody }>(
    '/api/user-groups/:id/visibility',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const group = db.prepare('SELECT id FROM user_groups WHERE id = ?').get(req.params.id)
      if (!group) return reply.status(404).send({ error: 'Not found' })

      const { hidden_service_ids } = req.body
      db.prepare('DELETE FROM group_service_visibility WHERE group_id = ?').run(req.params.id)
      const insert = db.prepare('INSERT INTO group_service_visibility (group_id, service_id) VALUES (?, ?)')
      for (const serviceId of hidden_service_ids) {
        insert.run(req.params.id, serviceId)
      }
      return { ok: true, hidden_service_ids }
    }
  )

  // PUT /api/user-groups/:id/arr-visibility — set hidden arr instance list for a group
  app.put<{ Params: { id: string }; Body: ArrVisibilityBody }>(
    '/api/user-groups/:id/arr-visibility',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const group = db.prepare('SELECT id FROM user_groups WHERE id = ?').get(req.params.id)
      if (!group) return reply.status(404).send({ error: 'Not found' })
      const { hidden_arr_ids } = req.body
      db.prepare('DELETE FROM group_arr_visibility WHERE group_id = ?').run(req.params.id)
      const insert = db.prepare('INSERT INTO group_arr_visibility (group_id, instance_id) VALUES (?, ?)')
      for (const instanceId of hidden_arr_ids) {
        insert.run(req.params.id, instanceId)
      }
      return { ok: true, hidden_arr_ids }
    }
  )

  // PUT /api/user-groups/:id/widget-visibility — set hidden widget list for a group
  app.put<{ Params: { id: string }; Body: WidgetVisibilityBody }>(
    '/api/user-groups/:id/widget-visibility',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const group = db.prepare('SELECT id FROM user_groups WHERE id = ?').get(req.params.id)
      if (!group) return reply.status(404).send({ error: 'Not found' })
      const { hidden_widget_ids } = req.body
      db.prepare('DELETE FROM group_widget_visibility WHERE group_id = ?').run(req.params.id)
      const insert = db.prepare('INSERT INTO group_widget_visibility (group_id, widget_id) VALUES (?, ?)')
      for (const widgetId of hidden_widget_ids) {
        insert.run(req.params.id, widgetId)
      }
      return { ok: true, hidden_widget_ids }
    }
  )

  // PUT /api/user-groups/:id/docker-access — toggle Docker page access for a group
  app.put<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/api/user-groups/:id/docker-access',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(req.params.id) as UserGroupRow | undefined
      if (!group) return reply.status(404).send({ error: 'Not found' })
      if (req.params.id === 'grp_admin') return reply.status(400).send({ error: 'Admin group always has Docker access' })
      const { enabled } = req.body
      if (typeof enabled !== 'boolean') return reply.status(400).send({ error: 'enabled must be boolean' })
      db.prepare('UPDATE user_groups SET docker_access = ? WHERE id = ?').run(enabled ? 1 : 0, req.params.id)
      return { ok: true, docker_access: enabled }
    }
  )

  // PUT /api/user-groups/:id/docker-widget-access — toggle Docker widget visibility for a group
  app.put<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/api/user-groups/:id/docker-widget-access',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(req.params.id) as UserGroupRow | undefined
      if (!group) return reply.status(404).send({ error: 'Not found' })
      if (req.params.id === 'grp_admin') return reply.status(400).send({ error: 'Admin group always has Docker widget access' })
      const { enabled } = req.body
      if (typeof enabled !== 'boolean') return reply.status(400).send({ error: 'enabled must be boolean' })
      db.prepare('UPDATE user_groups SET docker_widget_access = ? WHERE id = ?').run(enabled ? 1 : 0, req.params.id)
      return { ok: true, docker_widget_access: enabled }
    }
  )

  // DELETE /api/user-groups/:id
  app.delete<{ Params: { id: string } }>('/api/user-groups/:id', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(req.params.id) as UserGroupRow | undefined
    if (!group) return reply.status(404).send({ error: 'Not found' })
    if (group.is_system) return reply.status(400).send({ error: 'Cannot delete system groups' })
    db.prepare('DELETE FROM group_service_visibility WHERE group_id = ?').run(req.params.id)
    db.prepare('DELETE FROM user_groups WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })
}
