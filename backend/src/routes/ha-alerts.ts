import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'

interface HaAlertRow {
  id: string
  instance_id: string
  entity_id: string
  condition_type: string
  condition_value: string | null
  message: string
  enabled: number
  last_triggered_at: string | null
  created_at: string
}

interface CreateAlertBody {
  instance_id: string
  entity_id: string
  condition_type: 'state_equals' | 'state_above' | 'state_below' | 'state_changes'
  condition_value?: string | null
  message: string
}

interface PatchAlertBody {
  condition_type?: 'state_equals' | 'state_above' | 'state_below' | 'state_changes'
  condition_value?: string | null
  message?: string
  enabled?: boolean
}

function toAlert(row: HaAlertRow) {
  return {
    ...row,
    enabled: row.enabled === 1,
  }
}

// SSE clients for alert stream
const alertClients = new Set<(data: string) => void>()

export function emitAlert(payload: Record<string, unknown>): void {
  const data = JSON.stringify(payload)
  for (const send of alertClients) {
    try { send(data) } catch { /* client gone */ }
  }
}

export async function haAlertRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/ha/alerts/stream — must be registered BEFORE /api/ha/alerts/:id
  app.get('/api/ha/alerts/stream', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    reply.hijack()
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    const send = (data: string) => {
      if (reply.raw.destroyed) return
      try { reply.raw.write(`data: ${data}\n\n`) } catch { /* gone */ }
    }
    alertClients.add(send)

    // Keep-alive ping every 30s
    const pingInterval = setInterval(() => {
      if (reply.raw.destroyed) { clearInterval(pingInterval); return }
      try { reply.raw.write(': ping\n\n') } catch { clearInterval(pingInterval) }
    }, 30_000)

    req.raw.on('close', () => {
      alertClients.delete(send)
      clearInterval(pingInterval)
      if (!reply.raw.destroyed) reply.raw.end()
    })
  })

  // GET /api/ha/alerts
  app.get('/api/ha/alerts', {
    preHandler: [app.authenticate],
  }, async () => {
    const rows = db.prepare(
      'SELECT * FROM ha_alerts ORDER BY created_at DESC'
    ).all() as HaAlertRow[]
    return rows.map(toAlert)
  })

  // POST /api/ha/alerts
  app.post<{ Body: CreateAlertBody }>('/api/ha/alerts', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { instance_id, entity_id, condition_type, condition_value, message } = req.body
    if (!instance_id?.trim()) return reply.status(400).send({ error: 'instance_id is required' })
    if (!entity_id?.trim()) return reply.status(400).send({ error: 'entity_id is required' })
    if (!['state_equals', 'state_above', 'state_below', 'state_changes'].includes(condition_type)) {
      return reply.status(400).send({ error: 'Invalid condition_type' })
    }
    if (!message?.trim()) return reply.status(400).send({ error: 'message is required' })
    const countRow = db.prepare('SELECT COUNT(*) as c FROM ha_alerts').get() as { c: number }
    if (countRow.c >= 20) return reply.status(400).send({ error: 'Maximum 20 alerts allowed' })
    const inst = db.prepare('SELECT id FROM ha_instances WHERE id = ?').get(instance_id)
    if (!inst) return reply.status(404).send({ error: 'Instance not found' })
    const id = nanoid()
    db.prepare(`
      INSERT INTO ha_alerts (id, instance_id, entity_id, condition_type, condition_value, message, enabled)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, instance_id, entity_id.trim(), condition_type, condition_value ?? null, message.trim())
    const row = db.prepare('SELECT * FROM ha_alerts WHERE id = ?').get(id) as HaAlertRow
    return reply.status(201).send(toAlert(row))
  })

  // PATCH /api/ha/alerts/:id
  app.patch<{ Params: { id: string }; Body: PatchAlertBody }>('/api/ha/alerts/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_alerts WHERE id = ?').get(req.params.id) as HaAlertRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const condition_type = req.body.condition_type ?? row.condition_type
    const condition_value = 'condition_value' in req.body ? (req.body.condition_value ?? null) : row.condition_value
    const message = req.body.message?.trim() ?? row.message
    const enabled = req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled
    db.prepare(
      'UPDATE ha_alerts SET condition_type=?, condition_value=?, message=?, enabled=? WHERE id=?'
    ).run(condition_type, condition_value, message, enabled, row.id)
    const updated = db.prepare('SELECT * FROM ha_alerts WHERE id = ?').get(row.id) as HaAlertRow
    return toAlert(updated)
  })

  // DELETE /api/ha/alerts/:id
  app.delete<{ Params: { id: string } }>('/api/ha/alerts/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT id FROM ha_alerts WHERE id = ?').get(req.params.id)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM ha_alerts WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })
}
