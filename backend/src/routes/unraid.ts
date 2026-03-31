import { FastifyInstance, FastifyReply } from 'fastify'
import { nanoid } from 'nanoid'
import { request, Agent } from 'undici'
import { getDb } from '../db/database'
import { logActivity } from './activity'

interface UnraidInstanceRow {
  id: string; name: string; url: string; api_key: string
  enabled: number; position: number; created_at: string; updated_at: string
}
interface CreateBody  { name: string; url: string; api_key: string }
interface PatchBody   { name?: string; url?: string; api_key?: string; enabled?: boolean; position?: number }
interface ReorderBody { ids: string[] }
interface TestBody    { url: string; api_key: string }
interface ParityStartBody { correct: boolean }

type DiskRaw = Record<string, unknown>

interface ArrayGqlResult {
  array?: {
    state?: string
    capacity?: unknown
    parityCheckStatus?: unknown
    parities?: DiskRaw[]
    disks?: DiskRaw[]
    caches?: DiskRaw[]
  }
}

interface NotifCountRaw { info?: number; warning?: number; alert?: number; total?: number }
interface NotifGqlResult {
  notifications?: {
    overview?: { unread?: NotifCountRaw; archive?: NotifCountRaw }
    list?: unknown[]
  }
}

interface RegistrationGqlResult {
  registration?: { id?: string; type?: string; state?: string; expiration?: string }
  vars?: { version?: string; name?: string; regTo?: string }
}

function sanitizeInstance(row: UnraidInstanceRow) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled === 1,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

const gqlAgent = new Agent({
  connect: { rejectUnauthorized: false },
  headersTimeout: 8_000,
  bodyTimeout: 8_000,
})

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// Poll docker containers until target state is reached (handles Unraid GQL timing race)
async function pollDockerState(
  url: string, apiKey: string, containerName: string, targetStates: string[],
  retries = 10, intervalMs = 500
): Promise<{ id: string; state: string }> {
  for (let i = 0; i < retries; i++) {
    await sleep(intervalMs)
    try {
      const data = await unraidGql(url, apiKey, `query { docker { containers { id names state } } }`) as
        { docker?: { containers?: { id: string; names?: string[]; state: string }[] } }
      const found = (data?.docker?.containers ?? []).find(c =>
        c.id === containerName || c.names?.some(n => n.replace(/^\//, '') === containerName)
      )
      if (found && targetStates.includes(found.state)) return { id: found.id, state: found.state }
    } catch { /* retry */ }
  }
  throw new Error(`Container '${containerName}' hat Zielstatus ${targetStates.join('/')} nicht erreicht`)
}

// Poll VM domains until target state is reached
async function pollVmState(
  url: string, apiKey: string, vmId: string, targetStates: string[],
  retries = 20, intervalMs = 1500
): Promise<{ id: string; state: string }> {
  for (let i = 0; i < retries; i++) {
    await sleep(intervalMs)
    try {
      const data = await unraidGql(url, apiKey, `query { vms { domains { id state } } }`) as
        { vms?: { domains?: { id: string; state: string }[] } }
      const found = data?.vms?.domains?.find(v => v.id === vmId)
      if (found && targetStates.includes(found.state)) return { id: found.id, state: found.state }
    } catch { /* retry */ }
  }
  throw new Error(`VM '${vmId}' hat Zielstatus ${targetStates.join('/')} nicht erreicht`)
}

async function unraidGql(url: string, apiKey: string, query: string, variables?: object): Promise<unknown> {
  const res = await request(`${url.replace(/\/$/, '')}/graphql`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    dispatcher: gqlAgent,
  })
  const rawText = await res.body.text()
  let json: { data?: unknown; errors?: { message: string; extensions?: unknown }[] }
  try {
    json = JSON.parse(rawText) as typeof json
  } catch {
    throw new Error(`Unraid GraphQL: Invalid JSON: ${rawText.slice(0, 200)}`)
  }
  if (json.errors?.length) {
    const msg = json.errors.map(e => e.message).join('; ')
    console.error('[unraid-gql] Error from Unraid API:', JSON.stringify(json.errors), 'Query:', query.slice(0, 100))
    throw new Error(msg)
  }
  return json.data
}

async function getInstance(id: string, reply: FastifyReply): Promise<UnraidInstanceRow | null> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM unraid_instances WHERE id = ?').get(id) as UnraidInstanceRow | undefined
  if (!row) { reply.status(404).send({ error: 'Not found' }); return null }
  if (!row.enabled) { reply.status(423).send({ error: 'Instanz deaktiviert' }); return null }
  return row
}

function addPercent(disks: DiskRaw[] | undefined): DiskRaw[] {
  return (disks ?? []).map(d => {
    const fsSize = typeof d['fsSize'] === 'number' ? d['fsSize'] : null
    const fsUsed = typeof d['fsUsed'] === 'number' ? d['fsUsed'] : null
    return {
      ...d,
      fsUsedPercent: fsSize !== null && fsUsed !== null ? Math.round((fsUsed / fsSize) * 100) : null,
      isSpinning: typeof d['isSpinning'] === 'boolean' ? d['isSpinning'] : null,
    }
  })
}


export async function unraidRoutes(app: FastifyInstance) {
  const db = () => getDb()

  // GET /api/unraid/instances
  app.get('/api/unraid/instances', { onRequest: [app.authenticate] }, async () => {
    const rows = db().prepare('SELECT * FROM unraid_instances ORDER BY position ASC').all() as UnraidInstanceRow[]
    return rows.map(sanitizeInstance)
  })

  // POST /api/unraid/test  — BEFORE /:id routes
  app.post<{ Body: TestBody }>('/api/unraid/test', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { url, api_key } = req.body
    if (!url || !api_key) return reply.status(400).send({ error: 'url and api_key required' })
    try {
      await unraidGql(url, api_key, 'query { online }')
      return { ok: true }
    } catch (e) {
      return reply.status(400).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/instances  — BEFORE /instances/reorder and /instances/:id
  app.post<{ Body: CreateBody }>('/api/unraid/instances', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { name, url, api_key } = req.body
    if (!name || !url || !api_key) return reply.status(400).send({ error: 'name, url, api_key required' })
    const id = nanoid()
    const maxPos = db().prepare('SELECT MAX(position) as m FROM unraid_instances').get() as { m: number | null }
    const position = (maxPos.m ?? -1) + 1
    db().prepare(`INSERT INTO unraid_instances (id, name, url, api_key, position) VALUES (?, ?, ?, ?, ?)`).run(id, name, url, api_key, position)
    const row = db().prepare('SELECT * FROM unraid_instances WHERE id = ?').get(id) as UnraidInstanceRow
    return reply.status(201).send(sanitizeInstance(row))
  })

  // POST /api/unraid/instances/reorder  — BEFORE /instances/:id
  app.post<{ Body: ReorderBody }>('/api/unraid/instances/reorder', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { ids } = req.body
    if (!Array.isArray(ids)) return reply.status(400).send({ error: 'ids required' })
    const stmt = db().prepare("UPDATE unraid_instances SET position = ?, updated_at = datetime('now') WHERE id = ?")
    ids.forEach((id, idx) => stmt.run(idx, id))
    return { ok: true }
  })

  // PATCH /api/unraid/instances/:id
  app.patch<{ Params: { id: string }; Body: PatchBody }>('/api/unraid/instances/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = db().prepare('SELECT * FROM unraid_instances WHERE id = ?').get(req.params.id) as UnraidInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const { name, url, api_key, enabled, position } = req.body
    const updates: string[] = ["updated_at = datetime('now')"]
    const vals: unknown[] = []
    if (name !== undefined) { updates.push('name = ?'); vals.push(name) }
    if (url !== undefined) { updates.push('url = ?'); vals.push(url) }
    if (api_key !== undefined) { updates.push('api_key = ?'); vals.push(api_key) }
    if (enabled !== undefined) { updates.push('enabled = ?'); vals.push(enabled ? 1 : 0) }
    if (position !== undefined) { updates.push('position = ?'); vals.push(position) }
    db().prepare(`UPDATE unraid_instances SET ${updates.join(', ')} WHERE id = ?`).run(...vals, req.params.id)
    const updated = db().prepare('SELECT * FROM unraid_instances WHERE id = ?').get(req.params.id) as UnraidInstanceRow
    return sanitizeInstance(updated)
  })

  // DELETE /api/unraid/instances/:id
  app.delete<{ Params: { id: string } }>('/api/unraid/instances/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = db().prepare('SELECT * FROM unraid_instances WHERE id = ?').get(req.params.id) as UnraidInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    db().prepare('DELETE FROM unraid_instances WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })

  // GET /api/unraid/:id/ping
  app.get<{ Params: { id: string } }>('/api/unraid/:id/ping', { logLevel: 'silent', onRequest: [app.authenticate] }, async (req) => {
    const db2 = getDb()
    const row = db2.prepare('SELECT * FROM unraid_instances WHERE id = ?').get(req.params.id) as UnraidInstanceRow | undefined
    if (!row || !row.enabled) return { online: false }
    try {
      await unraidGql(row.url, row.api_key, 'query { online }')
      return { online: true }
    } catch {
      return { online: false }
    }
  })

  // GET /api/unraid/:id/info
  app.get<{ Params: { id: string } }>('/api/unraid/:id/info', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      return await unraidGql(row.url, row.api_key, `query {
        info {
          id
          time
          baseboard { manufacturer model version }
          cpu { manufacturer brand cores threads }
          os { platform distro release uptime hostname arch }
          memory { layout { size type clockSpeed manufacturer formFactor partNum } }
          system { manufacturer model virtual }
          versions { core { unraid api kernel } packages { docker } }
        }
        metrics {
          memory { used total percentTotal swapTotal swapUsed percentSwapTotal }
          cpu { percentTotal cpus { percentTotal } }
        }
        vars { version name }
        online
      }`)
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // GET /api/unraid/:id/array
  app.get<{ Params: { id: string } }>('/api/unraid/:id/array', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const data = await unraidGql(row.url, row.api_key, `query {
        array {
          state
          capacity { kilobytes { free used total } }
          parityCheckStatus { status running paused correcting progress errors speed date duration }
          parities { id idx name device size status temp rotational fsSize fsFree fsUsed type isSpinning color }
          disks    { id idx name device size status temp rotational fsSize fsFree fsUsed type isSpinning color }
          caches   { id idx name device size status temp rotational fsSize fsFree fsUsed type isSpinning color }
        }
      }`) as ArrayGqlResult
      return {
        array: {
          ...(data.array ?? {}),
          parities: addPercent(data.array?.parities),
          disks:    addPercent(data.array?.disks),
          caches:   addPercent(data.array?.caches),
        },
      }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/array/start
  app.post<{ Params: { id: string } }>('/api/unraid/:id/array/start', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation { array { setState(input: { desiredState: START }) { state } } }`)
      logActivity('unraid', `Array gestartet — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/array/stop
  app.post<{ Params: { id: string } }>('/api/unraid/:id/array/stop', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation { array { setState(input: { desiredState: STOP }) { state } } }`)
      logActivity('unraid', `Array gestoppt — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/parity/start
  app.post<{ Params: { id: string }; Body: ParityStartBody }>('/api/unraid/:id/parity/start', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const correct = req.body.correct ?? false
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation($correct: Boolean!) { parityCheck { start(correct: $correct) } }`, { correct })
      logActivity('unraid', `Parity Check gestartet — ${row.name}`, 'info', { instanceId: req.params.id, correct })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/parity/pause
  app.post<{ Params: { id: string } }>('/api/unraid/:id/parity/pause', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      return await unraidGql(row.url, row.api_key, `mutation { parityCheck { pause } }`)
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/parity/resume
  app.post<{ Params: { id: string } }>('/api/unraid/:id/parity/resume', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      return await unraidGql(row.url, row.api_key, `mutation { parityCheck { resume } }`)
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/parity/cancel
  app.post<{ Params: { id: string } }>('/api/unraid/:id/parity/cancel', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      return await unraidGql(row.url, row.api_key, `mutation { parityCheck { cancel } }`)
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // GET /api/unraid/:id/parityhistory
  app.get<{ Params: { id: string } }>('/api/unraid/:id/parityhistory', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const data = await unraidGql(row.url, row.api_key, `query {
        parityHistory { date duration speed status errors progress correcting paused running }
      }`) as { parityHistory?: unknown[] }
      return { parityHistory: data.parityHistory ?? [] }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/disks/:diskId/spinup — not available in this API version
  app.post<{ Params: { id: string; diskId: string } }>('/api/unraid/:id/disks/:diskId/spinup', { onRequest: [app.requireAdmin] }, async (_req, reply) => {
    return reply.status(501).send({ error: 'Disk Spin-Control ist in dieser API-Version nicht verfügbar.' })
  })

  // POST /api/unraid/:id/disks/:diskId/spindown — not available in this API version
  app.post<{ Params: { id: string; diskId: string } }>('/api/unraid/:id/disks/:diskId/spindown', { onRequest: [app.requireAdmin] }, async (_req, reply) => {
    return reply.status(501).send({ error: 'Disk Spin-Control ist in dieser API-Version nicht verfügbar.' })
  })

  // GET /api/unraid/:id/docker
  app.get<{ Params: { id: string } }>('/api/unraid/:id/docker', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const data = await unraidGql(row.url, row.api_key, `query {
        docker { containers {
          id names image state status autoStart
          hostConfig { networkMode }
          ports { privatePort publicPort type ip }
        } }
      }`) as { docker?: { containers?: unknown[] } }
      return data?.docker?.containers ?? []
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/docker/:containerName/start
  app.post<{ Params: { id: string; containerName: string } }>('/api/unraid/:id/docker/:containerName/start', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const containerId = decodeURIComponent(req.params.containerName)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { docker { start(id: $id) { id state } } }`, { id: containerId })
    } catch { /* action may still have succeeded — Unraid GQL timing race */ }
    try {
      const container = await pollDockerState(row.url, row.api_key, containerId, ['RUNNING'])
      logActivity('unraid', `Docker ${containerId} start — ${row.name}`, 'info', { instanceId: req.params.id })
      return { docker: { start: container } }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/docker/:containerName/stop
  app.post<{ Params: { id: string; containerName: string } }>('/api/unraid/:id/docker/:containerName/stop', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const containerId = decodeURIComponent(req.params.containerName)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { docker { stop(id: $id) { id state } } }`, { id: containerId })
    } catch { /* timing race — poll for confirmation */ }
    try {
      const container = await pollDockerState(row.url, row.api_key, containerId, ['EXITED', 'STOPPED', 'DEAD'])
      logActivity('unraid', `Docker ${containerId} stop — ${row.name}`, 'info', { instanceId: req.params.id })
      return { docker: { stop: container } }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/docker/:containerName/restart — sequential stop then start with polling
  app.post<{ Params: { id: string; containerName: string } }>('/api/unraid/:id/docker/:containerName/restart', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const containerId = decodeURIComponent(req.params.containerName)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { docker { stop(id: $id) { id state } } }`, { id: containerId })
    } catch { /* timing race */ }
    // Wait briefly for stop to propagate before starting
    await sleep(1000)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { docker { start(id: $id) { id state } } }`, { id: containerId })
    } catch { /* timing race */ }
    try {
      const container = await pollDockerState(row.url, row.api_key, containerId, ['RUNNING'])
      logActivity('unraid', `Docker ${containerId} restart — ${row.name}`, 'info', { instanceId: req.params.id })
      return { docker: { restart: container } }
    } catch (e) {
      return reply.status(502).send({ error: `Restart fehlgeschlagen: ${(e as Error).message}` })
    }
  })

  // POST /api/unraid/:id/docker/update-all — BEFORE /:containerName routes
  app.post<{ Params: { id: string } }>('/api/unraid/:id/docker/update-all', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation { docker { updateAllContainers { id state } } }`)
      logActivity('unraid', `Docker alle Container aktualisiert — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/docker/:containerName/pause
  app.post<{ Params: { id: string; containerName: string } }>('/api/unraid/:id/docker/:containerName/pause', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const containerId = decodeURIComponent(req.params.containerName)
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { docker { pause(id: $id) { id state } } }`, { id: containerId })
      logActivity('unraid', `Docker ${containerId} pause — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/docker/:containerName/update
  app.post<{ Params: { id: string; containerName: string } }>('/api/unraid/:id/docker/:containerName/update', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const containerId = decodeURIComponent(req.params.containerName)
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { docker { updateContainer(id: $id) { id state } } }`, { id: containerId })
      logActivity('unraid', `Docker ${containerId} update — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/docker/:containerName/unpause
  app.post<{ Params: { id: string; containerName: string } }>('/api/unraid/:id/docker/:containerName/unpause', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const containerId = decodeURIComponent(req.params.containerName)
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { docker { unpause(id: $id) { id state } } }`, { id: containerId })
      logActivity('unraid', `Docker ${containerId} unpause — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // GET /api/unraid/:id/vms
  app.get<{ Params: { id: string } }>('/api/unraid/:id/vms', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      return await unraidGql(row.url, row.api_key, `query {
        vms { domains { id name state } }
      }`)
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/vms/:uuid/start
  app.post<{ Params: { id: string; uuid: string } }>('/api/unraid/:id/vms/:uuid/start', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const vmId = decodeURIComponent(req.params.uuid)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { vms { start(id: $id) } }`, { id: vmId })
    } catch { /* timing race */ }
    try {
      const vm = await pollVmState(row.url, row.api_key, vmId, ['RUNNING', 'IDLE'])
      logActivity('unraid', `VM ${vmId} start — ${row.name}`, 'info', { instanceId: req.params.id })
      return { vms: { start: vm } }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/vms/:uuid/stop
  app.post<{ Params: { id: string; uuid: string } }>('/api/unraid/:id/vms/:uuid/stop', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const vmId = decodeURIComponent(req.params.uuid)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { vms { stop(id: $id) } }`, { id: vmId })
    } catch { /* timing race */ }
    try {
      const vm = await pollVmState(row.url, row.api_key, vmId, ['SHUTOFF', 'SHUTDOWN', 'NOSTATE'], 30, 1500)
      logActivity('unraid', `VM ${vmId} stop — ${row.name}`, 'info', { instanceId: req.params.id })
      return { vms: { stop: vm } }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/vms/:uuid/pause
  app.post<{ Params: { id: string; uuid: string } }>('/api/unraid/:id/vms/:uuid/pause', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const vmId = decodeURIComponent(req.params.uuid)
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { vms { pause(id: $id) } }`, { id: vmId })
      logActivity('unraid', `VM ${vmId} pause — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/vms/:uuid/resume
  app.post<{ Params: { id: string; uuid: string } }>('/api/unraid/:id/vms/:uuid/resume', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const vmId = decodeURIComponent(req.params.uuid)
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { vms { resume(id: $id) } }`, { id: vmId })
      logActivity('unraid', `VM ${vmId} resume — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/vms/:uuid/forcestop
  app.post<{ Params: { id: string; uuid: string } }>('/api/unraid/:id/vms/:uuid/forcestop', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const vmId = decodeURIComponent(req.params.uuid)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { vms { forceStop(id: $id) } }`, { id: vmId })
    } catch { /* timing race */ }
    try {
      const vm = await pollVmState(row.url, row.api_key, vmId, ['SHUTOFF'], 10, 500)
      logActivity('unraid', `VM ${vmId} forceStop — ${row.name}`, 'info', { instanceId: req.params.id })
      return { vms: { forceStop: vm } }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/vms/:uuid/reboot
  app.post<{ Params: { id: string; uuid: string } }>('/api/unraid/:id/vms/:uuid/reboot', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const vmId = decodeURIComponent(req.params.uuid)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { vms { reboot(id: $id) } }`, { id: vmId })
    } catch { /* timing race */ }
    try {
      const vm = await pollVmState(row.url, row.api_key, vmId, ['RUNNING', 'IDLE'], 30, 2000)
      logActivity('unraid', `VM ${vmId} reboot — ${row.name}`, 'info', { instanceId: req.params.id })
      return { vms: { reboot: vm } }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/vms/:uuid/reset
  app.post<{ Params: { id: string; uuid: string } }>('/api/unraid/:id/vms/:uuid/reset', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const vmId = decodeURIComponent(req.params.uuid)
    try {
      await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { vms { reset(id: $id) } }`, { id: vmId })
    } catch { /* timing race */ }
    try {
      const vm = await pollVmState(row.url, row.api_key, vmId, ['RUNNING', 'IDLE'], 30, 2000)
      logActivity('unraid', `VM ${vmId} reset — ${row.name}`, 'info', { instanceId: req.params.id })
      return { vms: { reset: vm } }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // GET /api/unraid/:id/physicaldisks
  app.get<{ Params: { id: string } }>('/api/unraid/:id/physicaldisks', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const data = await unraidGql(row.url, row.api_key, `query {
        disks {
          id name vendor device type size serialNum
          interfaceType smartStatus temperature isSpinning
          partitions { name fsType size }
        }
      }`) as { disks?: unknown[] }
      return { disks: data.disks ?? [] }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/disks/:diskId/mount
  app.post<{ Params: { id: string; diskId: string } }>('/api/unraid/:id/disks/:diskId/mount', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const diskId = decodeURIComponent(req.params.diskId)
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { array { mountArrayDisk(id: $id) { id status } } }`, { id: diskId })
      logActivity('unraid', `Disk ${diskId} mount — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/disks/:diskId/unmount
  app.post<{ Params: { id: string; diskId: string } }>('/api/unraid/:id/disks/:diskId/unmount', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const diskId = decodeURIComponent(req.params.diskId)
    try {
      const result = await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { array { unmountArrayDisk(id: $id) { id status } } }`, { id: diskId })
      logActivity('unraid', `Disk ${diskId} unmount — ${row.name}`, 'info', { instanceId: req.params.id })
      return result
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // GET /api/unraid/:id/notifications/archive — BEFORE /:notifId routes
  app.get<{ Params: { id: string } }>('/api/unraid/:id/notifications/archive', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const data = await unraidGql(row.url, row.api_key, `query {
        notifications {
          list(filter: { type: ARCHIVE, offset: 0, limit: 50 }) { id title subject description importance timestamp }
        }
      }`) as NotifGqlResult
      return { list: data.notifications?.list ?? [] }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // GET /api/unraid/:id/shares
  app.get<{ Params: { id: string } }>('/api/unraid/:id/shares', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      return await unraidGql(row.url, row.api_key, `query {
        shares { id name comment free used size cache color luksStatus include exclude }
      }`)
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // GET /api/unraid/:id/users
  app.get<{ Params: { id: string } }>('/api/unraid/:id/users', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      return await unraidGql(row.url, row.api_key, `query {
        users { name description role }
      }`)
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // GET /api/unraid/:id/notifications
  app.get<{ Params: { id: string } }>('/api/unraid/:id/notifications', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const data = await unraidGql(row.url, row.api_key, `query {
        notifications {
          overview { unread { info warning alert total } archive { info warning alert total } }
          list(filter: { type: UNREAD, offset: 0, limit: 30 }) { id title subject description importance link type timestamp formattedTimestamp }
        }
      }`) as NotifGqlResult
      return {
        notifications: {
          overview: {
            unread:  data.notifications?.overview?.unread,
            archive: data.notifications?.overview?.archive,
          },
          list: data.notifications?.list ?? [],
        },
      }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })

  // POST /api/unraid/:id/notifications/archive-all — BEFORE /:notifId route
  app.post<{ Params: { id: string } }>('/api/unraid/:id/notifications/archive-all', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      return await unraidGql(row.url, row.api_key, `mutation { archiveAllNotifications { id } }`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      console.error('[unraid] archiveAllNotifications failed:', msg)
      return reply.status(502).send({ error: msg })
    }
  })

  // POST /api/unraid/:id/notifications/archive/* — wildcard allows colons in notifId
  app.post<{ Params: { id: string; '*': string } }>('/api/unraid/:id/notifications/archive/*', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    const notifId = decodeURIComponent(req.params['*'])
    try {
      const data = await unraidGql(row.url, row.api_key, `mutation($id: PrefixedID!) { archiveNotification(id: $id) { id } }`, { id: notifId })
      return { ok: true, data }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      console.error('[unraid] archiveNotification failed, notifId:', notifId, 'error:', msg)
      return reply.status(502).send({ error: msg })
    }
  })

  // GET /api/unraid/:id/config
  app.get<{ Params: { id: string } }>('/api/unraid/:id/config', { onRequest: [app.authenticate] }, async (req, reply) => {
    const row = await getInstance(req.params.id, reply)
    if (!row) return
    try {
      const data = await unraidGql(row.url, row.api_key, `query {
        registration { id type state expiration }
        vars { version name regTo }
      }`) as RegistrationGqlResult
      const state = data.registration?.state
      return {
        config: {
          valid: state ? !state.startsWith('E') : undefined,
          error: state?.startsWith('E') ? state : undefined,
          registrationTo: data.vars?.regTo,
          registrationType: data.registration?.type,
        },
      }
    } catch (e) {
      return reply.status(502).send({ error: (e as Error).message })
    }
  })
}
