import { FastifyInstance } from 'fastify'
import { getDb } from '../db/database'

interface ResourceHistoryRow {
  id: string
  recorded_at: string
  resolution: string
  cpu_percent: number | null
  ram_percent: number | null
  ram_used_gb: number | null
  net_rx_mbps: number | null
  net_tx_mbps: number | null
}

export async function resourcesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { range?: string } }>(
    '/api/resources/history',
    { logLevel: 'silent', onRequest: [app.authenticate] },
    async (req) => {
      const range = req.query.range || '24h'
      const db = getDb()
      let rows: ResourceHistoryRow[]

      if (range === '1h') {
        rows = db.prepare(`
          SELECT * FROM resource_history
          WHERE resolution = '1min' AND recorded_at >= datetime('now', '-1 hour')
          ORDER BY recorded_at ASC
          LIMIT 60
        `).all() as ResourceHistoryRow[]
      } else if (range === '7d') {
        rows = db.prepare(`
          SELECT * FROM resource_history
          WHERE resolution = '15min' AND recorded_at >= datetime('now', '-7 days')
          ORDER BY recorded_at ASC
          LIMIT 672
        `).all() as ResourceHistoryRow[]
      } else {
        // 24h default
        rows = db.prepare(`
          SELECT * FROM resource_history
          WHERE resolution = '1min' AND recorded_at >= datetime('now', '-24 hours')
          ORDER BY recorded_at ASC
        `).all() as ResourceHistoryRow[]
      }

      if (!rows.length) {
        return []
      }

      return rows.map(r => ({
        recorded_at: r.recorded_at.endsWith('Z') ? r.recorded_at : r.recorded_at + 'Z',
        resolution: r.resolution,
        cpu_percent: r.cpu_percent ?? 0,
        ram_percent: r.ram_percent ?? 0,
        ram_used_gb: r.ram_used_gb ?? 0,
        net_rx_mbps: r.net_rx_mbps ?? 0,
        net_tx_mbps: r.net_tx_mbps ?? 0,
      }))
    }
  )
}
