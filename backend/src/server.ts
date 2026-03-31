import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import staticFiles from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import path from 'path'
import fs from 'fs'
import { initDb } from './db/database'
import { servicesRoutes } from './routes/services'
import { groupsRoutes } from './routes/groups'
import { settingsRoutes } from './routes/settings'
import { authRoutes } from './routes/auth'
import { usersRoutes } from './routes/users'
import { arrRoutes } from './routes/arr'
import { dashboardRoutes } from './routes/dashboard'
import { widgetsRoutes } from './routes/widgets'
import { dockerRoutes, initDockerPoller } from './routes/docker'
import { backgroundsRoutes } from './routes/backgrounds'
import { haRoutes } from './routes/ha'
import { haAlertRoutes } from './routes/ha-alerts'
import { haFloorplanRoutes } from './routes/ha-floorplan'
import { tmdbRoutes } from './routes/tmdb'
import recyclarrRoutes, { initRecyclarrSchedulers } from './routes/recyclarr'
import { activityRoutes, logActivity } from './routes/activity'
import { logbuchRoutes } from './routes/logbuch'
import { initHaWsClients } from './clients/ha-ws-manager'
import { getDb } from './db/database'
import { Agent, request as undiciRequest } from 'undici'
import { networkRoutes, tcpPing } from './routes/network'
import { backupRoutes, checkAllBackupSources } from './routes/backup'
import { changelogRoutes } from './routes/changelog'
import { resourcesRoutes } from './routes/resources'
import { unraidRoutes } from './routes/unraid'
import { nanoid } from 'nanoid'
import { promises as fsp } from 'fs'

let _appVersion = '0.0.0'
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')) as { version: string }
  _appVersion = pkg.version
} catch { /* ignore */ }

const PORT = parseInt(process.env.PORT ?? '8282', 10)
const DATA_DIR = process.env.DATA_DIR ?? '/data'
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'
// LOG_FORMAT=json → raw JSON (for log aggregators); default: pino-pretty
const LOG_FORMAT = process.env.LOG_FORMAT ?? 'pretty'
const NODE_ENV = process.env.NODE_ENV ?? 'development'
const SECRET_KEY = process.env.SECRET_KEY || 'heldash-dev-secret-change-in-production'
const DOCKER_SOCKET = '/var/run/docker.sock'

async function start() {
  // Remove decoy /data/heldash.db if it exists but is essentially empty (< 1KB)
  const decoyPath = path.join(DATA_DIR, 'heldash.db')
  if (fs.existsSync(decoyPath)) {
    try {
      const stat = fs.statSync(decoyPath)
      if (stat.size < 1024) {
        fs.unlinkSync(decoyPath)
        console.log('[DB] Removed empty decoy heldash.db from DATA_DIR root')
      }
    } catch { /* ignore */ }
  }

  const migrationsApplied = initDb(DATA_DIR)

  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      // Redact sensitive fields from all log output
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
      transport: LOG_FORMAT !== 'json'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  })

  // ── Startup summary ──────────────────────────────────────────────────────────
  const dockerSocketPresent = fs.existsSync(DOCKER_SOCKET)
  app.log.info({
    port: PORT,
    dataDir: DATA_DIR,
    logLevel: LOG_LEVEL,
    logFormat: LOG_FORMAT,
    dockerSocket: dockerSocketPresent ? 'present' : 'missing',
    secretKey: process.env.SECRET_KEY ? 'set' : 'DEFAULT (insecure)',
    migrationsApplied,
    nodeEnv: NODE_ENV,
  }, 'HELDASH starting')

  if (!process.env.SECRET_KEY) {
    app.log.warn('SECRET_KEY not set — using insecure default. Set SECRET_KEY env var in production!')
  }
  if (!dockerSocketPresent) {
    app.log.warn(`Docker socket not found at ${DOCKER_SOCKET} — Docker features will be unavailable`)
  }
  if (migrationsApplied > 0) {
    app.log.info({ count: migrationsApplied }, 'DB migrations applied on startup')
  }

  // ── Slow request detection ───────────────────────────────────────────────────
  app.addHook('onResponse', (req, reply, done) => {
    if (reply.elapsedTime > 1000) {
      app.log.warn({
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      }, 'Slow response')
    }
    done()
  })

  // ── Rate limiting (global: false — only applied to routes with config.rateLimit) ──
  await app.register(rateLimit, { global: false })

  // ── Security headers ─────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // Managed by nginx-proxy-manager in production
  })

  // ── CORS ─────────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: NODE_ENV === 'development' ? true : false,
  })

  // ── Cookies (must be registered before JWT) ──────────────────────────────────
  await app.register(fastifyCookie)

  // ── JWT ──────────────────────────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: SECRET_KEY,
    cookie: {
      cookieName: 'auth_token',
      signed: false,
    },
  })

  // ── Auth decorators (available on all routes registered after this point) ────
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    if (req.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  })

  // ── Override JSON parser to accept empty bodies (prevents FST_ERR_CTP_EMPTY_JSON_BODY) ──
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || body === '') {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  // ── Serve frontend static files ──────────────────────────────────────────────
  const publicPath = path.join(__dirname, '..', 'public')
  await app.register(staticFiles, {
    root: publicPath,
    prefix: '/',
  })

  // ── Serve uploaded background images ─────────────────────────────────────────
  app.get<{ Params: { filename: string } }>('/backgrounds/:filename', async (req, reply) => {
    const bgDir = path.join(DATA_DIR, 'backgrounds')
    const filePath = path.join(bgDir, path.basename(req.params.filename))
    if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'Not found' })
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    }
    const ext = path.extname(filePath).toLowerCase()
    reply.header('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.send(fs.createReadStream(filePath))
  })

  // ── Serve uploaded service icons ─────────────────────────────────────────────
  app.get<{ Params: { filename: string } }>('/icons/:filename', async (req, reply) => {
    const iconsDir = path.join(DATA_DIR, 'icons')
    // path.basename prevents path traversal attacks
    const filePath = path.join(iconsDir, path.basename(req.params.filename))
    if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'Not found' })
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    }
    const ext = path.extname(filePath).toLowerCase()
    reply.header('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.send(fs.createReadStream(filePath))
  })

  // ── Serve uploaded floorplan images ──────────────────────────────────────────
  app.get<{ Params: { filename: string } }>('/floorplan-images/:filename', async (req, reply) => {
    const fpDir = path.join(DATA_DIR, 'floorplans')
    const filePath = path.join(fpDir, path.basename(req.params.filename))
    if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'Not found' })
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }
    const ext = path.extname(filePath).toLowerCase()
    reply.header('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.send(fs.createReadStream(filePath))
  })

  // ── Health check — silent (polled every 30s by Docker healthcheck) ────────────
  app.get('/api/health', { logLevel: 'silent' }, async () => ({
    status: 'ok',
    version: _appVersion,
    uptime: process.uptime(),
  }))

  // ── Server time — silent (polled by frontend clock, ~every 30s) ──────────────
  app.get('/api/time', { logLevel: 'silent' }, async () => ({ iso: new Date().toISOString() }))

  // ── API routes ───────────────────────────────────────────────────────────────
  await app.register(authRoutes)
  await app.register(usersRoutes)
  await app.register(servicesRoutes)
  await app.register(groupsRoutes)
  await app.register(arrRoutes)
  await app.register(dashboardRoutes)
  await app.register(widgetsRoutes)
  await app.register(dockerRoutes)
  await app.register(backgroundsRoutes)
  await app.register(settingsRoutes)
  await app.register(haRoutes)
  await app.register(haAlertRoutes)
  await app.register(haFloorplanRoutes)
  await app.register(tmdbRoutes)
  await app.register(recyclarrRoutes)
  await app.register(activityRoutes)
  await app.register(logbuchRoutes)
  await app.register(networkRoutes)
  await app.register(backupRoutes)
  await app.register(changelogRoutes)
  await app.register(resourcesRoutes)
  await app.register(unraidRoutes)

  // ── Docker container state poller (logs transitions to activity feed) ─────────
  if (dockerSocketPresent) {
    initDockerPoller()
  }

  // ── Global error handler — catches unhandled throws in route handlers ─────────
  app.setErrorHandler((error, request, reply) => {
    app.log.error({
      err: error,
      url: request.url,
      method: request.method,
    }, 'Unhandled error')
    reply.status(500).send({ error: 'Internal server error', detail: error.message })
  })

  // ── SPA fallback – serve index.html for all non-API routes ───────────────────
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })

  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info({ port: PORT }, 'HELDASH ready')

  // ── Recyclarr scheduled sync ─────────────────────────────────────────────────
  initRecyclarrSchedulers(app.log)

  // ── Always-on HA WebSocket connections ────────────────────────────────────────
  initHaWsClients()

  // ── Network device scheduler (every 60s) ─────────────────────────────────────
  const NETWORK_POLL_MS = 60_000
  async function pollNetworkDevices() {
    const db = getDb()
    interface DeviceRow {
      id: string; name: string; ip: string; check_port: number | null; last_status: string | null
    }
    const devices = db.prepare('SELECT id, name, ip, check_port, last_status FROM network_devices').all() as DeviceRow[]
    await Promise.allSettled(devices.map(async device => {
      let latency: number | null = null
      if (device.check_port) {
        latency = await tcpPing(device.ip, device.check_port, 3000)
      } else {
        for (const port of [80, 443, 22, 8080]) {
          latency = await tcpPing(device.ip, port, 1000)
          if (latency !== null) break
        }
      }
      const status = latency !== null ? 'online' : 'offline'
      const prevStatus = device.last_status
      db.prepare("INSERT INTO network_device_history (id, device_id, status, checked_at) VALUES (?, ?, ?, datetime('now'))")
        .run(nanoid(), device.id, status)
      db.prepare("DELETE FROM network_device_history WHERE device_id = ? AND checked_at < datetime('now', '-7 days')")
        .run(device.id)
      db.prepare("UPDATE network_devices SET last_status = ?, last_checked = datetime('now') WHERE id = ?")
        .run(status, device.id)
      if (prevStatus !== null && prevStatus !== status) {
        logActivity(
          'system',
          `${device.name} (${device.ip}) ist ${status === 'online' ? 'wieder online' : 'offline'}`,
          status === 'online' ? 'info' : 'warning'
        )
      }
    }))
  }
  pollNetworkDevices().catch(() => {})
  setInterval(() => pollNetworkDevices().catch(() => {}), NETWORK_POLL_MS)

  // ── Resource history recorder ─────────────────────────────────────────────────
  interface NetStats { rx: number; tx: number }
  let lastNetStats: NetStats | null = null
  let lastNetTime = 0

  async function readNetworkStats(): Promise<{ rx_mbps: number; tx_mbps: number }> {
    try {
      const raw = await fsp.readFile('/proc/net/dev', 'utf8')
      const lines = raw.split('\n').slice(2)
      let totalRx = 0, totalTx = 0
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('lo:')) continue
        const parts = trimmed.split(/\s+/)
        if (parts.length < 10) continue
        const rx = parseInt(parts[1] ?? '0', 10)
        const tx = parseInt(parts[9] ?? '0', 10)
        if (!isNaN(rx)) totalRx += rx
        if (!isNaN(tx)) totalTx += tx
      }
      const now = Date.now()
      let rx_mbps = 0, tx_mbps = 0
      if (lastNetStats && lastNetTime > 0) {
        const dt = (now - lastNetTime) / 1000
        if (dt > 0) {
          rx_mbps = Math.max(0, (totalRx - lastNetStats.rx) * 8 / (1024 * 1024 * dt))
          tx_mbps = Math.max(0, (totalTx - lastNetStats.tx) * 8 / (1024 * 1024 * dt))
        }
      }
      lastNetStats = { rx: totalRx, tx: totalTx }
      lastNetTime = now
      return { rx_mbps: Math.round(rx_mbps * 100) / 100, tx_mbps: Math.round(tx_mbps * 100) / 100 }
    } catch {
      return { rx_mbps: 0, tx_mbps: 0 }
    }
  }

  async function recordResourceSnapshot() {
    try {
      const db = getDb()
      // CPU
      let cpuPercent = 0
      try {
        const raw1 = await fsp.readFile('/proc/stat', 'utf8')
        const line1 = raw1.split('\n')[0] ?? ''
        const parts1 = line1.trim().split(/\s+/).slice(1).map(Number)
        const idle1 = (parts1[3] ?? 0) + (parts1[4] ?? 0)
        const total1 = parts1.reduce((a, b) => a + b, 0)
        await new Promise(r => setTimeout(r, 200))
        const raw2 = await fsp.readFile('/proc/stat', 'utf8')
        const line2 = raw2.split('\n')[0] ?? ''
        const parts2 = line2.trim().split(/\s+/).slice(1).map(Number)
        const idle2 = (parts2[3] ?? 0) + (parts2[4] ?? 0)
        const total2 = parts2.reduce((a, b) => a + b, 0)
        const dTotal = total2 - total1
        const dIdle = idle2 - idle1
        cpuPercent = dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 1000) / 10 : 0
      } catch { /* ignore */ }
      // RAM
      let ramPercent = 0, ramUsedGb = 0
      try {
        const raw = await fsp.readFile('/proc/meminfo', 'utf8')
        const getValue = (key: string): number => {
          const match = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
          return match ? parseInt(match[1] ?? '0', 10) : 0
        }
        const totalKb = getValue('MemTotal')
        const availKb = getValue('MemAvailable')
        if (totalKb > 0) {
          const usedKb = totalKb - availKb
          ramPercent = Math.round((usedKb / totalKb) * 1000) / 10
          ramUsedGb = Math.round(usedKb / 1024 / 1024 * 100) / 100
        }
      } catch { /* ignore */ }
      // Network
      const { rx_mbps, tx_mbps } = await readNetworkStats()
      db.prepare(`
        INSERT INTO resource_history (id, resolution, cpu_percent, ram_percent, ram_used_gb, net_rx_mbps, net_tx_mbps)
        VALUES (?, '1min', ?, ?, ?, ?, ?)
      `).run(nanoid(), cpuPercent, ramPercent, ramUsedGb, rx_mbps, tx_mbps)
      // Cleanup
      db.prepare("DELETE FROM resource_history WHERE resolution = '1min' AND recorded_at < datetime('now', '-25 hours')").run()
      db.prepare("DELETE FROM resource_history WHERE resolution = '15min' AND recorded_at < datetime('now', '-8 days')").run()
    } catch { /* ignore */ }
  }

  async function aggregateResourceHistory() {
    try {
      const db = getDb()
      const windowStart = new Date(Math.floor(Date.now() / 900_000) * 900_000).toISOString().replace('T', ' ').substring(0, 19)
      const existing = db.prepare(
        "SELECT id FROM resource_history WHERE resolution = '15min' AND recorded_at >= ?"
      ).get(windowStart)
      if (existing) return
      const rows = db.prepare(`
        SELECT cpu_percent, ram_percent, ram_used_gb, net_rx_mbps, net_tx_mbps
        FROM resource_history
        WHERE resolution = '1min' AND recorded_at >= datetime(?, '-15 minutes') AND recorded_at < ?
      `).all(windowStart, windowStart) as Array<{ cpu_percent: number; ram_percent: number; ram_used_gb: number; net_rx_mbps: number; net_tx_mbps: number }>
      if (rows.length === 0) return
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
      db.prepare(`
        INSERT INTO resource_history (id, recorded_at, resolution, cpu_percent, ram_percent, ram_used_gb, net_rx_mbps, net_tx_mbps)
        VALUES (?, ?, '15min', ?, ?, ?, ?, ?)
      `).run(
        nanoid(), windowStart,
        Math.round(avg(rows.map(r => r.cpu_percent)) * 10) / 10,
        Math.round(avg(rows.map(r => r.ram_percent)) * 10) / 10,
        Math.round(avg(rows.map(r => r.ram_used_gb)) * 100) / 100,
        Math.round(avg(rows.map(r => r.net_rx_mbps)) * 100) / 100,
        Math.round(avg(rows.map(r => r.net_tx_mbps)) * 100) / 100,
      )
    } catch { /* ignore */ }
  }

  recordResourceSnapshot().catch(() => {})
  setInterval(() => recordResourceSnapshot().catch(() => {}), 60_000)
  setInterval(() => aggregateResourceHistory().catch(() => {}), 900_000)

  // ── Backup daily checker ──────────────────────────────────────────────────────
  const BACKUP_CHECK_MS = 24 * 60 * 60 * 1000
  checkAllBackupSources().catch(() => {})
  setInterval(() => checkAllBackupSources().catch(() => {}), BACKUP_CHECK_MS)

  // ── Server-side service health check scheduler (every 30 seconds) ────────────
  const HEALTH_INTERVAL_MS = 30_000
  const healthPingAgent = new Agent({
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
    connect: { rejectUnauthorized: false },
  })

  const runScheduledHealthChecks = async () => {
    const db = getDb()
    const services = db.prepare(
      'SELECT id, name, url, check_url, last_status, last_checked FROM services WHERE check_enabled = 1'
    ).all() as { id: string; name: string; url: string; check_url: string | null; last_status: string | null; last_checked: string | null }[]

    await Promise.allSettled(services.map(async (svc) => {
      const checkUrl = svc.check_url || svc.url
      const prevStatus = svc.last_status
      let status: 'online' | 'offline' = 'offline'
      try {
        const res = await undiciRequest(checkUrl, { method: 'HEAD', dispatcher: healthPingAgent })
        if (res.statusCode === 405) {
          const res2 = await undiciRequest(checkUrl, { method: 'GET', dispatcher: healthPingAgent })
          status = res2.statusCode < 500 ? 'online' : 'offline'
          for await (const _ of res2.body) { /* drain */ }
        } else {
          status = res.statusCode < 500 ? 'online' : 'offline'
          for await (const _ of res.body) { /* drain */ }
        }
      } catch { status = 'offline' }

      db.prepare("UPDATE services SET last_status = ?, last_checked = datetime('now') WHERE id = ?")
        .run(status, svc.id)
      db.prepare("INSERT INTO service_health_history (service_id, checked_at, status) VALUES (?, datetime('now'), ?)")
        .run(svc.id, status === 'online' ? 1 : 0)
      db.prepare("DELETE FROM service_health_history WHERE service_id = ? AND checked_at < datetime('now', '-7 days')")
        .run(svc.id)

      if (prevStatus !== null && prevStatus !== status) {
        logActivity(
          'system',
          status === 'online' ? `${svc.name} ist wieder online` : `${svc.name} ist offline gegangen`,
          status === 'online' ? 'info' : 'warning',
          { serviceId: svc.id }
        )
      }
    }))
  }

  runScheduledHealthChecks().catch(e => app.log.error({ err: e }, 'Health check startup run failed'))
  setInterval(
    () => runScheduledHealthChecks().catch(e => app.log.error({ err: e }, 'Health check interval failed')),
    HEALTH_INTERVAL_MS
  )

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutdown signal received, closing server...')
    try {
      await app.close()
      app.log.info('Server closed gracefully')
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown')
    }
    process.exit(0)
  }
  process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)) })
  process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)) })
}

start().catch((err) => {
  console.error('Fatal error during startup:', err)
  process.exit(1)
})
