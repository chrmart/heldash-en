import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { promises as fsp } from 'fs'
import fs from 'fs'
import path from 'path'
import { getDb, safeJson } from '../db/database'
import { Agent, request as undiciRequest } from 'undici'

interface BackupSourceRow {
  id: string
  name: string
  type: string
  config: string
  enabled: number
  last_checked_at: string | null
  last_status: string | null
  created_at: string
}

interface CreateBackupSourceBody {
  name: string
  type: string
  config?: Record<string, unknown>
  enabled?: boolean
}

interface PatchBackupSourceBody {
  name?: string
  type?: string
  config?: Record<string, unknown>
  enabled?: boolean
}

function sanitizeSource(row: BackupSourceRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: safeJson<Record<string, unknown>>(row.config, {} as Record<string, unknown>),
    enabled: row.enabled === 1,
    last_checked_at: row.last_checked_at,
    last_status: row.last_status,
    created_at: row.created_at,
  }
}

const httpAgent = new Agent({
  headersTimeout: 5_000,
  bodyTimeout: 5_000,
  connect: { rejectUnauthorized: false },
})

async function checkCaBackup(config: Record<string, unknown>): Promise<{
  lastRun: string | null; success: boolean | null; size: string | null; error: string | null; details?: unknown
}> {
  const logPath = (config.logPath as string | undefined) || '/boot/logs/CA_backup.log'
  try {
    const content = await fsp.readFile(logPath, 'utf-8')
    const lines = content.split('\n').filter(l => l.trim())
    let lastRun: string | null = null
    let success: boolean | null = null
    let size: string | null = null
    for (const line of lines) {
      const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/)
      if (dateMatch) lastRun = dateMatch[0]
      if (/success|completed|done/i.test(line)) success = true
      if (/error|fail|failed/i.test(line)) success = false
      const sizeMatch = line.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|KB))/i)
      if (sizeMatch) size = sizeMatch[1]
    }
    if (lastRun) {
      const diff = Date.now() - new Date(lastRun).getTime()
      if (diff > 7 * 24 * 60 * 60 * 1000) success = false
    }
    return { lastRun, success, size, error: null, details: { lines: lines.slice(-20) } }
  } catch {
    return { lastRun: null, success: null, size: null, error: `Log nicht gefunden — ${logPath} verfügbar?` }
  }
}

async function checkDuplicati(config: Record<string, unknown>): Promise<{
  lastRun: string | null; success: boolean | null; size: string | null; error: string | null; details?: unknown
}> {
  const url = (config.url as string | undefined) || ''
  const apiKey = (config.apiKey as string | undefined) || ''
  if (!url) return { lastRun: null, success: null, size: null, error: 'URL nicht konfiguriert' }
  try {
    const res = await undiciRequest(`${url.replace(/\/$/, '')}/api/v1/backups`, {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey },
      dispatcher: httpAgent,
    })
    const body = await res.body.json() as unknown[]
    const backups = Array.isArray(body) ? body : []
    let lastRun: string | null = null
    let success: boolean | null = null
    for (const b of backups as Array<Record<string, unknown>>) {
      const lastResult = b.Backup as Record<string, unknown> | undefined
      if (lastResult?.LastBackupDate) lastRun = String(lastResult.LastBackupDate)
      if (lastResult?.LastBackupStarted) success = true
    }
    return { lastRun, success, size: null, error: null, details: backups }
  } catch {
    return { lastRun: null, success: null, size: null, error: 'Nicht erreichbar' }
  }
}

async function checkKopia(config: Record<string, unknown>): Promise<{
  lastRun: string | null; success: boolean | null; size: string | null; error: string | null; details?: unknown
}> {
  const url = (config.url as string | undefined) || ''
  const user = (config.user as string | undefined) || 'kopia'
  const pass = (config.pass as string | undefined) || ''
  if (!url) return { lastRun: null, success: null, size: null, error: 'URL nicht konfiguriert' }
  try {
    const auth = Buffer.from(`${user}:${pass}`).toString('base64')
    const res = await undiciRequest(`${url.replace(/\/$/, '')}/api/v1/snapshots`, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` },
      dispatcher: httpAgent,
    })
    const body = await res.body.json() as Record<string, unknown>
    const snapshots = (body.snapshots ?? []) as Array<Record<string, unknown>>
    const last = snapshots[0]
    const lastRun = last?.startTime ? String(last.startTime) : null
    const statsObj = last?.stats as Record<string, unknown> | undefined
    const size = statsObj ? String(statsObj.totalSize ?? '') : null
    return { lastRun, success: snapshots.length > 0, size, error: null, details: snapshots.slice(0, 3) }
  } catch {
    return { lastRun: null, success: null, size: null, error: 'Nicht erreichbar' }
  }
}

export async function backupRoutes(app: FastifyInstance) {
  // GET /api/backup/sources
  app.get('/api/backup/sources', { onRequest: [app.authenticate] }, async () => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM backup_sources ORDER BY created_at').all() as BackupSourceRow[]
    return rows.map(sanitizeSource)
  })

  // POST /api/backup/sources
  app.post<{ Body: CreateBackupSourceBody }>(
    '/api/backup/sources',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const { name, type, config = {}, enabled = true } = req.body
      if (!name || !type) return reply.status(400).send({ error: 'name and type required' })
      const db = getDb()
      const id = nanoid()
      db.prepare(
        'INSERT INTO backup_sources (id, name, type, config, enabled) VALUES (?, ?, ?, ?, ?)'
      ).run(id, name, type, JSON.stringify(config), enabled ? 1 : 0)
      const row = db.prepare('SELECT * FROM backup_sources WHERE id = ?').get(id) as BackupSourceRow
      return sanitizeSource(row)
    }
  )

  // PATCH /api/backup/sources/:id
  app.patch<{ Params: { id: string }; Body: PatchBackupSourceBody }>(
    '/api/backup/sources/:id',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const db = getDb()
      const row = db.prepare('SELECT * FROM backup_sources WHERE id = ?').get(req.params.id) as BackupSourceRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })
      const b = req.body
      const newConfig = b.config !== undefined ? JSON.stringify(b.config) : row.config
      db.prepare(`
        UPDATE backup_sources SET name = ?, type = ?, config = ?, enabled = ? WHERE id = ?
      `).run(
        b.name ?? row.name,
        b.type ?? row.type,
        newConfig,
        b.enabled !== undefined ? (b.enabled ? 1 : 0) : row.enabled,
        req.params.id
      )
      const updated = db.prepare('SELECT * FROM backup_sources WHERE id = ?').get(req.params.id) as BackupSourceRow
      return sanitizeSource(updated)
    }
  )

  // DELETE /api/backup/sources/:id
  app.delete<{ Params: { id: string } }>(
    '/api/backup/sources/:id',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const db = getDb()
      if (!db.prepare('SELECT id FROM backup_sources WHERE id = ?').get(req.params.id)) {
        return reply.status(404).send({ error: 'Not found' })
      }
      db.prepare('DELETE FROM backup_sources WHERE id = ?').run(req.params.id)
      return reply.status(204).send()
    }
  )

  // GET /api/backup/status
  app.get('/api/backup/status', { onRequest: [app.authenticate] }, async () => {
    const db = getDb()
    const sources = db.prepare(
      'SELECT * FROM backup_sources WHERE enabled = 1 ORDER BY created_at'
    ).all() as BackupSourceRow[]

    const results = await Promise.all(sources.map(async source => {
      const config = safeJson<Record<string, unknown>>(source.config, {} as Record<string, unknown>)
      let result: { lastRun: string | null; success: boolean | null; size: string | null; error: string | null; details?: unknown }

      if (source.type === 'ca_backup') {
        result = await checkCaBackup(config)
      } else if (source.type === 'duplicati') {
        result = await checkDuplicati(config)
      } else if (source.type === 'kopia') {
        result = await checkKopia(config)
      } else if (source.type === 'docker') {
        result = { lastRun: null, success: true, size: null, error: null, details: { note: 'Docker via Socket verfügbar' } }
      } else if (source.type === 'vm') {
        const backupPath = (config.backupPath as string | undefined) || ''
        if (!backupPath) {
          result = { lastRun: null, success: null, size: null, error: 'Kein Backup-Pfad konfiguriert' }
        } else {
          try {
            const files = await fsp.readdir(backupPath)
            const relevant = files.filter(f => f.endsWith('.xml') || f.endsWith('.img'))
            if (relevant.length === 0) {
              result = { lastRun: null, success: null, size: null, error: 'Keine VM-Backups gefunden', details: { path: backupPath } }
            } else {
              const stats = await Promise.all(relevant.map(async f => {
                const stat = await fsp.stat(path.join(backupPath, f))
                return { file: f, mtime: stat.mtime.toISOString() }
              }))
              stats.sort((a, b) => b.mtime.localeCompare(a.mtime))
              result = { lastRun: stats[0]?.mtime ?? null, success: true, size: null, error: null, details: stats.slice(0, 10) }
            }
          } catch {
            result = { lastRun: null, success: null, size: null, error: `Pfad nicht gefunden: ${backupPath}` }
          }
        }
      } else {
        result = { lastRun: null, success: null, size: null, error: 'Unbekannter Backup-Typ' }
      }

      const newStatus = result.error ? 'error' : result.success === false ? 'warning' : result.success === true ? 'ok' : null
      db.prepare("UPDATE backup_sources SET last_checked_at = datetime('now'), last_status = ? WHERE id = ?")
        .run(newStatus, source.id)

      return {
        id: source.id,
        name: source.name,
        type: source.type,
        ...result,
      }
    }))

    return { sources: results }
  })

  // POST /api/backup/docker/export
  app.post(
    '/api/backup/docker/export',
    { onRequest: [app.authenticate] },
    async (_req, reply) => {
      const DOCKER_SOCKET = '/var/run/docker.sock'
      if (!fs.existsSync(DOCKER_SOCKET)) {
        return reply.status(503).send({ error: 'Docker socket nicht verfügbar' })
      }
      const { Pool } = await import('undici')
      const dockerPool = new Pool('http://localhost', {
        socketPath: DOCKER_SOCKET,
        connections: 2,
      })
      try {
        const listRes = await dockerPool.request({ method: 'GET', path: '/v1.41/containers/json?all=true' })
        const containers = await listRes.body.json() as Array<Record<string, unknown>>
        const inspects = await Promise.all(containers.map(async c => {
          const id = c.Id as string
          const inspectRes = await dockerPool.request({ method: 'GET', path: `/v1.41/containers/${id}/json` })
          return inspectRes.body.json() as Promise<Record<string, unknown>>
        }))
        const exportData = {
          exported_at: new Date().toISOString(),
          container_count: inspects.length,
          containers: inspects,
        }
        const now = new Date().toISOString().split('T')[0]
        reply.header('Content-Type', 'application/json')
        reply.header('Content-Disposition', `attachment; filename="heldash-docker-export-${now}.json"`)
        return exportData
      } finally {
        await dockerPool.destroy()
      }
    }
  )
}

export async function checkAllBackupSources(): Promise<void> {
  const db = getDb()
  const sources = db.prepare('SELECT * FROM backup_sources WHERE enabled = 1').all() as BackupSourceRow[]
  for (const source of sources) {
    try {
      const config = safeJson<Record<string, unknown>>(source.config, {} as Record<string, unknown>)
      let status: string | null = null
      if (source.type === 'ca_backup') {
        const r = await checkCaBackup(config)
        status = r.error ? 'error' : r.success === false ? 'warning' : r.success === true ? 'ok' : null
      } else if (source.type === 'duplicati') {
        const r = await checkDuplicati(config)
        status = r.error ? 'error' : r.success === true ? 'ok' : 'warning'
      } else if (source.type === 'kopia') {
        const r = await checkKopia(config)
        status = r.error ? 'error' : r.success === true ? 'ok' : 'warning'
      }
      if (status) {
        db.prepare("UPDATE backup_sources SET last_checked_at = datetime('now'), last_status = ? WHERE id = ?")
          .run(status, source.id)
      }
    } catch { /* ignore per-source errors */ }
  }
}
