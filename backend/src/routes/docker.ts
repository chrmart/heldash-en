import { FastifyInstance, FastifyRequest } from 'fastify'
import { Pool } from 'undici'
import type { Dispatcher } from 'undici'
import { getDb } from '../db/database'
import { logActivity } from './activity'

// ── Docker Engine API helper ──────────────────────────────────────────────────
// Pool with multiple connections so batch stats requests run concurrently
const dockerClient = new Pool('http://localhost', {
  socketPath: '/var/run/docker.sock',
  connections: 10,
})

async function dockerReq(path: string, method: Dispatcher.HttpMethod = 'GET', body?: object) {
  return dockerClient.request({
    path,
    method,
    ...(body
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  })
}

// ── Access control ────────────────────────────────────────────────────────────
interface UserGroupRow { docker_access: number }

async function hasDockerAccess(req: FastifyRequest): Promise<boolean> {
  try {
    await req.jwtVerify()
    if (req.user.role === 'admin') return true
    const groupId = req.user.groupId
    if (!groupId) return false
    const db = getDb()
    const row = db.prepare('SELECT docker_access FROM user_groups WHERE id = ?').get(groupId) as UserGroupRow | undefined
    return row?.docker_access === 1
  } catch {
    return false
  }
}

// ── Docker container/stats types ──────────────────────────────────────────────
interface DockerContainerJson {
  Id: string
  Names: string[]
  Image: string
  State: string
  Status: string
  Created: number
}

interface DockerStatsJson {
  cpu_stats: {
    cpu_usage: { total_usage: number; percpu_usage?: number[] }
    system_cpu_usage: number
    online_cpus?: number
  }
  precpu_stats: {
    cpu_usage: { total_usage: number }
    system_cpu_usage: number
  }
  memory_stats: {
    usage: number
    limit: number
  }
}

// ── Parse Docker multiplexed log stream ───────────────────────────────────────
// Each frame: [stream_type(1)][reserved(3)][size(4 big-endian)] + payload
// stream_type: 1=stdout, 2=stderr. If TTY=true, raw text with no header.
function parseMuxedFrame(buf: Buffer): { consumed: number; stream: 'stdout' | 'stderr'; payload: Buffer } | null {
  if (buf.length < 8) return null
  const streamByte = buf[0]
  const size = buf.readUInt32BE(4)
  if (buf.length < 8 + size) return null
  const payload = buf.subarray(8, 8 + size)
  const stream = streamByte === 2 ? 'stderr' : 'stdout'
  return { consumed: 8 + size, stream, payload }
}

// ── Docker Events stream ──────────────────────────────────────────────────────
// Persistent stream to Docker Events API — no polling overhead.
const containerNames = new Map<string, string>()  // id → name
const pendingStops = new Map<string, ReturnType<typeof setTimeout>>()  // id → timer

export function initDockerPoller(): void {
  console.log('[Docker Events] Starting event stream listener')

  const loadContainerNames = async () => {
    try {
      const res = await dockerReq('/v1.41/containers/json?all=true')
      if (res.statusCode === 200) {
        const containers = await res.body.json() as DockerContainerJson[]
        for (const c of containers) {
          const name = (c.Names[0] ?? c.Id).replace(/^\//, '')
          containerNames.set(c.Id, name)
        }
        console.log(`[Docker Events] Loaded ${containerNames.size} container names`)
      } else {
        await res.body.dump()
      }
    } catch (e) {
      console.error('[Docker Events] Failed to load container names:', e)
    }
  }

  const startEventStream = async () => {
    try {
      const res = await dockerClient.request({
        path: '/v1.41/events?filters=' + encodeURIComponent(JSON.stringify({ type: ['container'] })),
        method: 'GET',
      })

      if (!res.statusCode || res.statusCode >= 400) {
        await res.body.text().catch(() => {})
        console.error('[Docker Events] Failed to connect, retrying in 10s')
        setTimeout(() => startEventStream(), 10_000)
        return
      }

      console.log('[Docker Events] Stream connected')

      let buffer = ''
      for await (const chunk of res.body) {
        buffer += (chunk as Buffer).toString('utf8')
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const event = JSON.parse(trimmed) as {
              status: string
              id: string
              Actor: { Attributes: Record<string, string> }
            }

            const status = event.status
            const id = event.id
            const attrs = event.Actor?.Attributes ?? {}
            const name = attrs.name ?? containerNames.get(id) ?? id.slice(0, 12)

            if (attrs.name) containerNames.set(id, attrs.name)

            // Ignored events: die, kill, attach, exec_start, exec_create, exec_die,
            // health_status, network_connect, network_disconnect, copy, rename
            console.log(`[Docker Events] ${status}: ${name} | pendingStop: ${pendingStops.has(id)}`)

            if (status === 'stop') {
              // Delay logging — cancel if restart follows within 5s
              const timer = setTimeout(() => {
                pendingStops.delete(id)
                logActivity('docker', `Container '${name}' gestoppt`, 'warning', { containerId: id })
              }, 5_000)
              pendingStops.set(id, timer)
            } else if (status === 'start') {
              // Only log standalone starts (no pending stop = not part of a restart)
              if (!pendingStops.has(id)) {
                logActivity('docker', `Container '${name}' gestartet`, 'info', { containerId: id })
              }
            } else if (status === 'restart') {
              // Cancel pending stop log — this was a restart, not a stop
              const timer = pendingStops.get(id)
              if (timer) {
                clearTimeout(timer)
                pendingStops.delete(id)
              }
              logActivity('docker', `Container '${name}' neugestartet`, 'info', { containerId: id })
            } else if (status === 'die') {
              // 'die' fires during restart — ignore (stop/restart events handle logging)
            }
          } catch { /* ignore malformed JSON */ }
        }
      }

      // Stream ended — reconnect
      console.log('[Docker Events] Stream ended, reconnecting in 5s')
      setTimeout(() => startEventStream(), 5_000)

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[Docker Events] Stream error:', msg)
      setTimeout(() => startEventStream(), 10_000)
    }
  }

  setTimeout(async () => {
    await loadContainerNames()
    await startEventStream()
  }, 10_000)
}

// ── Routes ────────────────────────────────────────────────────────────────────
export async function dockerRoutes(app: FastifyInstance) {

  // GET /api/docker/containers — list all containers
  app.get('/api/docker/containers', async (req, reply) => {
    if (!(await hasDockerAccess(req))) return reply.status(403).send({ error: 'Forbidden' })

    let res
    try {
      res = await dockerReq('/v1.41/containers/json?all=true')
    } catch (err) {
      app.log.warn({ err }, 'Docker socket unavailable (container list)')
      return reply.status(503).send({ error: 'Docker unavailable' })
    }

    if (!res.statusCode || res.statusCode >= 400) {
      await res.body.text().catch(() => {})
      return reply.status(502).send({ error: 'Docker API error' })
    }

    const raw = await res.body.json() as DockerContainerJson[]
    return raw.map(c => ({
      id: c.Id,
      name: (c.Names[0] ?? c.Id).replace(/^\//, ''),
      image: c.Image,
      state: c.State,
      status: c.Status,
      startedAt: c.Created ? new Date(c.Created * 1000).toISOString() : null,
    }))
  })

  // GET /api/docker/containers/:id/stats — one-shot CPU + RAM stats
  app.get('/api/docker/containers/:id/stats', async (req, reply) => {
    if (!(await hasDockerAccess(req))) return reply.status(403).send({ error: 'Forbidden' })
    const { id } = req.params as { id: string }

    let res
    try {
      res = await dockerReq(`/v1.41/containers/${id}/stats?stream=false`)
    } catch (err) {
      app.log.warn({ id, err }, 'Docker socket unavailable (container stats)')
      return reply.status(503).send({ error: 'Docker unavailable' })
    }

    if (!res.statusCode || res.statusCode >= 400) {
      await res.body.text().catch(() => {})
      return reply.status(res.statusCode ?? 502).send({ error: 'Docker API error' })
    }

    const s = await res.body.json() as DockerStatsJson

    const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage
    const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage
    const numCPU = s.cpu_stats.online_cpus ?? s.cpu_stats.cpu_usage.percpu_usage?.length ?? 1
    const cpuPercent = sysDelta > 0 ? Math.round(((cpuDelta / sysDelta) * numCPU * 100) * 10) / 10 : 0

    return {
      cpuPercent,
      memUsed: s.memory_stats.usage ?? 0,
      memTotal: s.memory_stats.limit ?? 0,
    }
  })

  // GET /api/docker/stats — batch stats for all running containers
  app.get('/api/docker/stats', async (req, reply) => {
    if (!(await hasDockerAccess(req))) return reply.status(403).send({ error: 'Forbidden' })

    let listRes
    try {
      listRes = await dockerReq('/v1.41/containers/json?all=true')
    } catch (err) {
      app.log.warn({ err }, 'Docker socket unavailable (batch stats)')
      return reply.status(503).send({ error: 'Docker unavailable' })
    }
    if (!listRes.statusCode || listRes.statusCode >= 400) {
      await listRes.body.text().catch(() => {})
      return reply.status(502).send({ error: 'Docker API error' })
    }

    const containers = await listRes.body.json() as DockerContainerJson[]
    const running = containers.filter(c => c.State === 'running')

    const results = await Promise.all(
      running.map(async c => {
        try {
          const res = await dockerReq(`/v1.41/containers/${c.Id}/stats?stream=false`)
          if (!res.statusCode || res.statusCode >= 400) {
            await res.body.text().catch(() => {})
            return null
          }
          const s = await res.body.json() as DockerStatsJson
          const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage
          const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage
          const numCPU = s.cpu_stats.online_cpus ?? s.cpu_stats.cpu_usage.percpu_usage?.length ?? 1
          const cpuPercent = sysDelta > 0 ? Math.round(((cpuDelta / sysDelta) * numCPU * 100) * 10) / 10 : 0
          return { id: c.Id, cpuPercent, memUsed: s.memory_stats.usage ?? 0, memTotal: s.memory_stats.limit ?? 0 }
        } catch {
          return null
        }
      })
    )

    const out: Record<string, { cpuPercent: number; memUsed: number; memTotal: number }> = {}
    for (const r of results) {
      if (r) out[r.id] = { cpuPercent: r.cpuPercent, memUsed: r.memUsed, memTotal: r.memTotal }
    }
    return out
  })

  // GET /api/docker/containers/:id/logs — SSE log stream
  app.get('/api/docker/containers/:id/logs', async (req, reply) => {
    if (!(await hasDockerAccess(req))) return reply.status(403).send({ error: 'Forbidden' })
    const { id } = req.params as { id: string }
    const qs = req.query as Record<string, string>
    const tail = qs.tail ? parseInt(qs.tail, 10) : 200

    // Hijack immediately so the SSE stream opens before we wait for Docker
    reply.hijack()
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    let dockerRes
    try {
      dockerRes = await dockerReq(
        `/v1.41/containers/${id}/logs?follow=1&stdout=1&stderr=1&timestamps=1&tail=${tail}`
      )
    } catch (err) {
      app.log.warn({ id, err }, 'Docker unavailable (log stream)')
      reply.raw.write('data: {"stream":"stderr","log":"Docker unavailable","timestamp":""}\n\n')
      reply.raw.end()
      return
    }

    if (!dockerRes.statusCode || dockerRes.statusCode >= 400) {
      await dockerRes.body.text().catch(() => {})
      reply.raw.write('data: {"stream":"stderr","log":"Container not found or Docker error","timestamp":""}\n\n')
      reply.raw.end()
      return
    }

    // Cleanup on client disconnect
    req.raw.on('close', () => {
      dockerRes.body.destroy()
    })

    let buf = Buffer.alloc(0)
    let isMuxed: boolean | null = null  // null = undecided, true = muxed, false = raw TTY

    try {
      for await (const chunk of dockerRes.body) {
        if (reply.raw.destroyed) break
        buf = Buffer.concat([buf, chunk as Buffer])

        // Detect format on first data: muxed frames start with 0x01 or 0x02
        if (isMuxed === null && buf.length >= 1) {
          isMuxed = buf[0] === 1 || buf[0] === 2
        }

        if (isMuxed) {
          // Parse multiplexed frames
          while (true) {
            const frame = parseMuxedFrame(buf)
            if (!frame) break
            buf = buf.subarray(frame.consumed)
            const lines = frame.payload.toString('utf8').split('\n')
            for (const raw of lines) {
              const line = raw.replace(/\r$/, '')
              if (!line) continue
              // Docker includes RFC3339 timestamp at start when timestamps=1
              const tsMatch = line.match(/^(\S+)\s(.*)$/)
              const timestamp = tsMatch ? tsMatch[1] : ''
              const log = tsMatch ? tsMatch[2] : line
              const evt = JSON.stringify({ stream: frame.stream, log, timestamp })
              reply.raw.write(`data: ${evt}\n\n`)
            }
          }
        } else {
          // Raw TTY mode — emit line by line
          const text = buf.toString('utf8')
          const lines = text.split('\n')
          // Keep incomplete last line in buffer
          buf = Buffer.from(lines.pop() ?? '')
          for (const raw of lines) {
            const line = raw.replace(/\r$/, '')
            if (!line) continue
            const tsMatch = line.match(/^(\S+)\s(.*)$/)
            const timestamp = tsMatch ? tsMatch[1] : ''
            const log = tsMatch ? tsMatch[2] : line
            const evt = JSON.stringify({ stream: 'stdout', log, timestamp })
            reply.raw.write(`data: ${evt}\n\n`)
          }
        }
      }
    } catch {
      // Client disconnected or stream ended
    }

    if (!reply.raw.destroyed) {
      reply.raw.write('data: {"stream":"stdout","log":"[stream ended]","timestamp":""}\n\n')
      reply.raw.end()
    }
  })

  // POST /api/docker/containers/:id/start — admin only
  app.post('/api/docker/containers/:id/start', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    let res
    try { res = await dockerReq(`/v1.41/containers/${id}/start`, 'POST') }
    catch (err) {
      app.log.warn({ id, err }, 'Docker unavailable (start container)')
      return reply.status(503).send({ error: 'Docker unavailable' })
    }
    await res.body.text().catch(() => {})
    if (res.statusCode === 204 || res.statusCode === 304) {
      app.log.info({ id, user: req.user.username }, 'Container started')
      return { ok: true }
    }
    app.log.warn({ id, statusCode: res.statusCode }, 'Failed to start container')
    return reply.status(res.statusCode ?? 502).send({ error: 'Docker API error' })
  })

  // POST /api/docker/containers/:id/stop — admin only
  app.post('/api/docker/containers/:id/stop', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    let res
    try { res = await dockerReq(`/v1.41/containers/${id}/stop`, 'POST') }
    catch (err) {
      app.log.warn({ id, err }, 'Docker unavailable (stop container)')
      return reply.status(503).send({ error: 'Docker unavailable' })
    }
    await res.body.text().catch(() => {})
    if (res.statusCode === 204 || res.statusCode === 304) {
      app.log.info({ id, user: req.user.username }, 'Container stopped')
      return { ok: true }
    }
    app.log.warn({ id, statusCode: res.statusCode }, 'Failed to stop container')
    return reply.status(res.statusCode ?? 502).send({ error: 'Docker API error' })
  })

  // POST /api/docker/containers/:id/restart — admin only
  app.post('/api/docker/containers/:id/restart', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    let res
    try { res = await dockerReq(`/v1.41/containers/${id}/restart`, 'POST') }
    catch (err) {
      app.log.warn({ id, err }, 'Docker unavailable (restart container)')
      return reply.status(503).send({ error: 'Docker unavailable' })
    }
    await res.body.text().catch(() => {})
    if (res.statusCode === 204) {
      app.log.info({ id, user: req.user.username }, 'Container restarted')
      return { ok: true }
    }
    app.log.warn({ id, statusCode: res.statusCode }, 'Failed to restart container')
    return reply.status(res.statusCode ?? 502).send({ error: 'Docker API error' })
  })
}
