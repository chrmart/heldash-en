import { FastifyInstance } from 'fastify'
import { Pool } from 'undici'
import { getDb } from '../db/database'

const dockerClient = new Pool('http://localhost', {
  socketPath: '/var/run/docker.sock',
  connections: 5,
})

interface DockerContainerInfo {
  State: string
}

async function getDockerCounts(): Promise<{ running: number; total: number } | null> {
  try {
    const res = await dockerClient.request({ path: '/v1.41/containers/json?all=true', method: 'GET' })
    if (res.statusCode !== 200) {
      for await (const _ of res.body) { /* drain */ }
      return null
    }
    const chunks: Buffer[] = []
    for await (const chunk of res.body) chunks.push(chunk as Buffer)
    const containers = JSON.parse(Buffer.concat(chunks).toString()) as DockerContainerInfo[]
    return {
      total: containers.length,
      running: containers.filter(c => c.State === 'running').length,
    }
  } catch {
    return null
  }
}

export async function logbuchRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/logbuch/health-score
  app.get('/api/logbuch/health-score', { preHandler: [app.authenticate] }, async () => {
    const db = getDb()

    // Services
    const serviceRows = db.prepare('SELECT last_status FROM services WHERE check_enabled = 1').all() as { last_status: string | null }[]
    const servicesTotal = serviceRows.length
    const servicesOnline = serviceRows.filter(r => r.last_status === 'online').length
    const servicesPoints = servicesTotal > 0 ? Math.round((servicesOnline / servicesTotal) * 40) : 40

    // Docker
    const dockerCounts = await getDockerCounts()
    const dockerTotal = dockerCounts?.total ?? 0
    const dockerRunning = dockerCounts?.running ?? 0
    const dockerPoints = dockerCounts
      ? (dockerCounts.total > 0 ? Math.round((dockerCounts.running / dockerCounts.total) * 30) : 30)
      : 0

    // Recyclarr
    const lastSync = db.prepare('SELECT success FROM recyclarr_sync_history ORDER BY synced_at DESC LIMIT 1').get() as { success: number } | undefined
    const recyclarrSuccess = lastSync ? lastSync.success === 1 : null
    const recyclarrPoints = recyclarrSuccess === false ? 0 : 20

    // HA
    const haTotal = (db.prepare('SELECT COUNT(*) as c FROM ha_instances').get() as { c: number }).c
    const haEnabled = (db.prepare('SELECT COUNT(*) as c FROM ha_instances WHERE enabled = 1').get() as { c: number }).c
    const haPoints = haTotal > 0 ? Math.round((haEnabled / haTotal) * 10) : 10

    const score = servicesPoints + dockerPoints + recyclarrPoints + haPoints

    return {
      score,
      breakdown: {
        services: { online: servicesOnline, total: servicesTotal, points: servicesPoints },
        docker: { running: dockerRunning, total: dockerTotal, points: dockerPoints, available: dockerCounts !== null },
        recyclarr: { lastSyncSuccess: recyclarrSuccess, points: recyclarrPoints },
        ha: { reachable: haEnabled, total: haTotal, points: haPoints },
      },
    }
  })

  // GET /api/logbuch/calendar — last 84 days event summary
  app.get('/api/logbuch/calendar', { preHandler: [app.authenticate] }, async () => {
    const db = getDb()

    const rows = db.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(*) as count,
        MAX(CASE severity WHEN 'error' THEN 3 WHEN 'warning' THEN 2 WHEN 'info' THEN 1 ELSE 0 END) as severityRank
      FROM activity_log
      WHERE created_at >= date('now', '-83 days')
      GROUP BY date(created_at)
      ORDER BY date
    `).all() as { date: string; count: number; severityRank: number }[]

    const rankToSeverity = (r: number): string => {
      if (r >= 3) return 'error'
      if (r >= 2) return 'warning'
      if (r >= 1) return 'info'
      return 'none'
    }

    return {
      days: rows.map(r => ({
        date: r.date,
        count: r.count,
        maxSeverity: rankToSeverity(r.severityRank),
      })),
    }
  })

  // GET /api/logbuch/anomalies — unstable services last 24h
  app.get('/api/logbuch/anomalies', { preHandler: [app.authenticate] }, async () => {
    const db = getDb()

    const rows = db.prepare(`
      SELECT meta, COUNT(*) as count
      FROM activity_log
      WHERE category = 'system'
        AND severity = 'warning'
        AND created_at > datetime('now', '-24 hours')
      GROUP BY meta
      HAVING count >= 3
    `).all() as { meta: string | null; count: number }[]

    const anomalies = rows.flatMap(r => {
      if (!r.meta) return []
      let serviceId: string | null = null
      try {
        const parsed = JSON.parse(r.meta) as Record<string, unknown>
        serviceId = typeof parsed.serviceId === 'string' ? parsed.serviceId : null
      } catch { return [] }
      if (!serviceId) return []
      const svc = db.prepare('SELECT name FROM services WHERE id = ?').get(serviceId) as { name: string } | undefined
      return [{ serviceId, serviceName: svc?.name ?? null, offlineCount: r.count }]
    })

    return { anomalies }
  })
}
