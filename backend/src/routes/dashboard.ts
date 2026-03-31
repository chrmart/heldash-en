import { FastifyInstance, FastifyRequest } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb, safeJson } from '../db/database'
import type Database from 'better-sqlite3'

// ── DB row types ──────────────────────────────────────────────────────────────
interface DashboardItemRow {
  id: string
  type: string
  ref_id: string | null
  position: number
  owner_id: string
  group_id: string | null
  created_at: string
}

interface DashboardGroupRow {
  id: string
  name: string
  owner_id: string
  position: number
  col_span: number
}

interface WidgetRow {
  id: string
  type: string
  name: string
  config: string
  position: number
  show_in_topbar: number
  icon_url: string | null
  created_at: string
  updated_at: string
}

interface ServiceRow {
  id: string
  group_id: string | null
  name: string
  url: string
  icon: string | null
  icon_url: string | null
  description: string | null
  last_status: string | null
  last_checked: string | null
  check_enabled: number
  check_url: string | null
  check_interval: number
  position_x: number
  position_y: number
  tags: string
}

interface ArrInstanceRow {
  id: string
  type: string
  name: string
  url: string
  enabled: number
}

// ── Request body types ────────────────────────────────────────────────────────
interface AddItemBody {
  type: string
  ref_id?: string
}

interface ReorderBody {
  ids: string[]
}

interface CreateGroupBody {
  name: string
}

interface UpdateGroupBody {
  name?: string
  col_span?: number
}

interface MoveItemGroupBody {
  group_id: string | null
}

interface ReorderItemsBody {
  ids: string[]
}

// ── Helper ────────────────────────────────────────────────────────────────────
interface CallerInfo {
  ownerId: string
  filterGroupId: string | null  // null = admin (no visibility filtering)
  canWrite: boolean
}

/**
 * Determines who is making the request and what they can do:
 * - Admin (own dashboard):     ownerId=sub,     filterGroupId=null,       canWrite=true
 * - Admin (?as=guest):         ownerId='guest',  filterGroupId='grp_guest', canWrite=true
 * - Regular user (own dash):   ownerId=sub,     filterGroupId=groupId,    canWrite=true
 * - grp_guest user:            ownerId='guest',  filterGroupId='grp_guest', canWrite=false
 * - Unauthenticated:           ownerId='guest',  filterGroupId='grp_guest', canWrite=false
 */
async function callerInfo(req: FastifyRequest): Promise<CallerInfo> {
  const asGuest = (req.query as Record<string, string>).as === 'guest'
  try {
    await req.jwtVerify()
    if (req.user.role === 'admin') {
      if (asGuest) return { ownerId: 'guest', filterGroupId: 'grp_guest', canWrite: true }
      return { ownerId: req.user.sub, filterGroupId: null, canWrite: true }
    }
    // Non-admin authenticated user
    const groupId = req.user.groupId ?? 'grp_guest'
    if (groupId === 'grp_guest') {
      return { ownerId: 'guest', filterGroupId: 'grp_guest', canWrite: false }
    }
    return { ownerId: req.user.sub, filterGroupId: groupId, canWrite: true }
  } catch {
    return { ownerId: 'guest', filterGroupId: 'grp_guest', canWrite: false }
  }
}

// ── Helper to build enriched dashboard item ────────────────────────────────────
function buildItem(
  item: DashboardItemRow,
  filterGroupId: string | null,
  db: Database.Database
): Record<string, unknown> | null {
  if (item.type === 'placeholder' || item.type === 'placeholder_app' || item.type === 'placeholder_widget' || item.type === 'placeholder_row') {
    return { id: item.id, type: item.type, position: item.position, group_id: item.group_id }
  }

  if (item.type === 'widget' && item.ref_id) {
    const widget = db.prepare('SELECT * FROM widgets WHERE id = ?').get(item.ref_id) as WidgetRow | undefined
    if (!widget) return null
    if (filterGroupId !== null) {
      // docker_overview widgets require docker_widget_access — not controlled by group_widget_visibility
      if (widget.type === 'docker_overview') {
        const grp = db.prepare('SELECT docker_widget_access FROM user_groups WHERE id = ?').get(filterGroupId) as { docker_widget_access: number } | undefined
        if (!grp || grp.docker_widget_access !== 1) return null
      } else {
        const hidden = db.prepare(
          'SELECT 1 FROM group_widget_visibility WHERE group_id = ? AND widget_id = ?'
        ).get(filterGroupId, item.ref_id)
        if (hidden) return null
      }
    }
    return {
      id: item.id,
      type: 'widget',
      position: item.position,
      ref_id: item.ref_id,
      group_id: item.group_id,
      widget: {
        id: widget.id,
        type: widget.type,
        name: widget.name,
        config: safeJson(widget.config, {} as Record<string, unknown>),
        show_in_topbar: widget.show_in_topbar === 1,
        icon_url: widget.icon_url ?? null,
      },
    }
  }

  if (item.type === 'service' && item.ref_id) {
    if (filterGroupId !== null) {
      const hidden = db.prepare(
        'SELECT 1 FROM group_service_visibility WHERE group_id = ? AND service_id = ?'
      ).get(filterGroupId, item.ref_id)
      if (hidden) return null
    }
    const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(item.ref_id) as ServiceRow | undefined
    if (!svc) return null
    return {
      id: item.id,
      type: 'service',
      position: item.position,
      ref_id: item.ref_id,
      group_id: item.group_id,
      service: {
        ...svc,
        check_enabled: svc.check_enabled === 1,
        tags: safeJson(svc.tags, [] as string[]),
      },
    }
  }

  if (item.type === 'arr_instance' && item.ref_id) {
    if (filterGroupId !== null) {
      const hidden = db.prepare(
        'SELECT 1 FROM group_arr_visibility WHERE group_id = ? AND instance_id = ?'
      ).get(filterGroupId, item.ref_id)
      if (hidden) return null
    }
    const inst = db.prepare(
      'SELECT id, type, name, url, enabled FROM arr_instances WHERE id = ?'
    ).get(item.ref_id) as ArrInstanceRow | undefined
    if (!inst) return null
    return {
      id: item.id,
      type: 'arr_instance',
      position: item.position,
      ref_id: item.ref_id,
      group_id: item.group_id,
      instance: { ...inst, enabled: inst.enabled === 1 },
    }
  }

  return null
}

// ── Routes ────────────────────────────────────────────────────────────────────
export async function dashboardRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/dashboard — ordered groups and items with embedded data, filtered by owner and group visibility
  app.get('/api/dashboard', async (req) => {
    const { ownerId, filterGroupId } = await callerInfo(req)
    const groupRows = db.prepare('SELECT * FROM dashboard_groups WHERE owner_id = ? ORDER BY position').all(ownerId) as DashboardGroupRow[]
    const items = db.prepare('SELECT * FROM dashboard_items WHERE owner_id = ? ORDER BY position').all(ownerId) as DashboardItemRow[]

    // Build all enriched items
    const allEnriched = items.map(i => buildItem(i, filterGroupId, db)).filter(Boolean)

    // Build groups with their items
    const groups = groupRows.map(g => ({
      id: g.id,
      name: g.name,
      position: g.position,
      col_span: g.col_span,
      items: allEnriched.filter(i => i!.group_id === g.id),
    }))

    // Get ungrouped items
    const ungroupedItems = allEnriched.filter(i => !i!.group_id)

    return { groups, items: ungroupedItems }
  })

  // POST /api/dashboard/groups — create group
  app.post('/api/dashboard/groups', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { name } = req.body as CreateGroupBody
    if (!name || typeof name !== 'string') return reply.status(400).send({ error: 'name required' })

    const maxPos = db.prepare('SELECT MAX(position) as m FROM dashboard_groups WHERE owner_id = ?').get(ownerId) as { m: number | null }
    const position = (maxPos.m ?? -1) + 1
    const id = nanoid()

    db.prepare('INSERT INTO dashboard_groups (id, name, owner_id, position, col_span) VALUES (?, ?, ?, ?, ?)').run(
      id, name, ownerId, position, 6
    )

    return reply.status(201).send({ id, name, position, col_span: 6 })
  })

  // PATCH /api/dashboard/groups/reorder — reorder groups (REGISTER BEFORE :id)
  app.patch('/api/dashboard/groups/reorder', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { ids } = req.body as ReorderItemsBody
    if (!Array.isArray(ids)) return reply.status(400).send({ error: 'ids must be an array' })
    const update = db.prepare('UPDATE dashboard_groups SET position = ? WHERE id = ? AND owner_id = ?')
    const runAll = db.transaction(() => { ids.forEach((id, i) => update.run(i, id, ownerId)) })
    runAll()
    return { ok: true }
  })

  // PATCH /api/dashboard/groups/:id — update group name/col_span
  app.patch('/api/dashboard/groups/:id', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { id } = req.params as { id: string }
    const { name, col_span } = req.body as UpdateGroupBody

    const group = db.prepare('SELECT id FROM dashboard_groups WHERE id = ? AND owner_id = ?').get(id, ownerId) as DashboardGroupRow | undefined
    if (!group) return reply.status(404).send({ error: 'Not found' })

    if (name !== undefined) {
      db.prepare('UPDATE dashboard_groups SET name = ? WHERE id = ?').run(name, id)
    }
    if (col_span !== undefined && col_span >= 1 && col_span <= 12) {
      db.prepare('UPDATE dashboard_groups SET col_span = ? WHERE id = ?').run(col_span, id)
    }

    return { ok: true }
  })

  // DELETE /api/dashboard/groups/:id — delete group and move items to ungrouped
  app.delete('/api/dashboard/groups/:id', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { id } = req.params as { id: string }
    const group = db.prepare('SELECT id FROM dashboard_groups WHERE id = ? AND owner_id = ?').get(id, ownerId) as DashboardGroupRow | undefined
    if (!group) return reply.status(404).send({ error: 'Not found' })

    const txn = db.transaction(() => {
      db.prepare('UPDATE dashboard_items SET group_id = NULL WHERE group_id = ? AND owner_id = ?').run(id, ownerId)
      db.prepare('DELETE FROM dashboard_groups WHERE id = ?').run(id)
    })
    txn()

    return reply.status(204).send()
  })

  // PATCH /api/dashboard/items/:id/group — move item to group
  app.patch('/api/dashboard/items/:id/group', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { id } = req.params as { id: string }
    const { group_id } = req.body as MoveItemGroupBody

    const item = db.prepare('SELECT id FROM dashboard_items WHERE id = ? AND owner_id = ?').get(id, ownerId) as DashboardItemRow | undefined
    if (!item) return reply.status(404).send({ error: 'Not found' })

    if (group_id !== null) {
      const group = db.prepare('SELECT id FROM dashboard_groups WHERE id = ? AND owner_id = ?').get(group_id, ownerId) as DashboardGroupRow | undefined
      if (!group) return reply.status(404).send({ error: 'Group not found' })
    }

    db.prepare('UPDATE dashboard_items SET group_id = ? WHERE id = ?').run(group_id, id)
    return { ok: true }
  })

  // PATCH /api/dashboard/groups/:id/reorder-items — reorder items within group
  app.patch('/api/dashboard/groups/:id/reorder-items', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { id } = req.params as { id: string }
    const { ids } = req.body as ReorderItemsBody

    const group = db.prepare('SELECT id FROM dashboard_groups WHERE id = ? AND owner_id = ?').get(id, ownerId) as DashboardGroupRow | undefined
    if (!group) return reply.status(404).send({ error: 'Not found' })

    if (!Array.isArray(ids)) return reply.status(400).send({ error: 'ids must be an array' })
    const update = db.prepare('UPDATE dashboard_items SET position = ? WHERE id = ? AND owner_id = ?')
    const runAll = db.transaction(() => { ids.forEach((itemId, i) => update.run(i, itemId, ownerId)) })
    runAll()
    return { ok: true }
  })

  // POST /api/dashboard/items — add item (authenticated, own dashboard)
  app.post('/api/dashboard/items', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { type, ref_id } = req.body as AddItemBody

    if (!['service', 'arr_instance', 'placeholder', 'placeholder_app', 'placeholder_widget', 'placeholder_row', 'widget'].includes(type)) {
      return reply.status(400).send({ error: 'Invalid type' })
    }
    const isPlaceholderType = type === 'placeholder' || type === 'placeholder_app' || type === 'placeholder_widget' || type === 'placeholder_row'
    if (!isPlaceholderType && !ref_id) {
      return reply.status(400).send({ error: 'ref_id required for service and arr_instance' })
    }

    // Prevent duplicates per owner
    if (ref_id) {
      const existing = db.prepare(
        'SELECT id FROM dashboard_items WHERE type = ? AND ref_id = ? AND owner_id = ?'
      ).get(type, ref_id, ownerId)
      if (existing) return reply.status(409).send({ error: 'Already on dashboard' })
    }

    const maxRow = db.prepare('SELECT MAX(position) as m FROM dashboard_items WHERE owner_id = ?').get(ownerId) as { m: number | null }
    const position = (maxRow.m ?? -1) + 1
    const id = nanoid()

    db.prepare('INSERT INTO dashboard_items (id, type, ref_id, position, owner_id) VALUES (?, ?, ?, ?, ?)').run(
      id, type, ref_id ?? null, position, ownerId
    )

    return reply.status(201).send({ id, type, ref_id: ref_id ?? null, position })
  })

  // DELETE /api/dashboard/items/by-ref — remove by ref_id + type
  // Registered BEFORE :id to avoid parametric route capturing "by-ref"
  app.delete('/api/dashboard/items/by-ref', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { type, ref_id } = req.body as { type: string; ref_id: string }
    db.prepare('DELETE FROM dashboard_items WHERE type = ? AND ref_id = ? AND owner_id = ?').run(type, ref_id, ownerId)
    return reply.status(204).send()
  })

  // DELETE /api/dashboard/items/:id — remove item
  app.delete('/api/dashboard/items/:id', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { id } = req.params as { id: string }
    const item = db.prepare('SELECT id FROM dashboard_items WHERE id = ? AND owner_id = ?').get(id, ownerId)
    if (!item) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM dashboard_items WHERE id = ?').run(id)
    return reply.status(204).send()
  })

  // PATCH /api/dashboard/reorder — bulk position update
  app.patch('/api/dashboard/reorder', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { ids } = req.body as ReorderBody
    if (!Array.isArray(ids)) return reply.status(400).send({ error: 'ids must be an array' })
    const update = db.prepare('UPDATE dashboard_items SET position = ? WHERE id = ? AND owner_id = ?')
    const runAll = db.transaction(() => { ids.forEach((id, i) => update.run(i, id, ownerId)) })
    runAll()
    return { ok: true }
  })
}
