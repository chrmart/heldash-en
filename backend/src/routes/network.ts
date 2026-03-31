import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import net from 'net'
import dgram from 'dgram'
import { getDb } from '../db/database'

interface NetworkDeviceRow {
  id: string
  name: string
  ip: string
  mac: string | null
  wol_enabled: number
  wol_broadcast: string | null
  check_port: number | null
  subnet: string | null
  group_name: string | null
  icon: string
  last_status: string | null
  last_checked: string | null
  created_at: string
}

interface CreateNetworkDeviceBody {
  name: string
  ip: string
  mac?: string
  wol_enabled?: boolean
  wol_broadcast?: string
  check_port?: number
  group_name?: string
  icon?: string
  subnet?: string
}

interface PatchNetworkDeviceBody {
  name?: string
  ip?: string
  mac?: string
  wol_enabled?: boolean
  wol_broadcast?: string
  check_port?: number | null
  group_name?: string
  icon?: string
  subnet?: string
}

function sanitizeDevice(row: NetworkDeviceRow) {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    mac: row.mac,
    wol_enabled: row.wol_enabled === 1,
    wol_broadcast: row.wol_broadcast,
    check_port: row.check_port,
    subnet: row.subnet,
    group_name: row.group_name,
    icon: row.icon,
    last_status: row.last_status,
    last_checked: row.last_checked,
    created_at: row.created_at,
  }
}

function cidrToIpList(cidr: string): string[] | null {
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!match) return null
  const [, a, b, c, d, p] = match
  const octets = [Number(a), Number(b), Number(c), Number(d)]
  const prefix = Number(p)
  if (octets.some(o => o > 255) || prefix < 0 || prefix > 32) return null
  if (prefix < 20) return Array(9999) // will be caught as > 4096 by caller
  const networkInt = (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const network = (networkInt & mask) >>> 0
  const count = (1 << (32 - prefix)) >>> 0
  const ips: string[] = []
  // skip network (.0) and broadcast (last)
  for (let i = 1; i < count - 1; i++) {
    const ip = (network + i) >>> 0
    ips.push(`${(ip >>> 24) & 0xff}.${(ip >>> 16) & 0xff}.${(ip >>> 8) & 0xff}.${ip & 0xff}`)
  }
  return ips
}

export function tcpPing(ip: string, port: number, timeoutMs: number): Promise<number | null> {
  return new Promise(resolve => {
    const start = Date.now()
    const socket = new net.Socket()
    let done = false

    const cleanup = (result: number | null) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => cleanup(Date.now() - start))
    socket.once('error', () => cleanup(null))
    socket.once('timeout', () => cleanup(null))
    socket.connect(port, ip)
  })
}

export async function networkRoutes(app: FastifyInstance) {
  // GET /api/network/devices
  app.get('/api/network/devices', async () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM network_devices ORDER BY group_name NULLS LAST, name'
    ).all() as NetworkDeviceRow[]
    return rows.map(sanitizeDevice)
  })

  // POST /api/network/devices
  app.post<{ Body: CreateNetworkDeviceBody }>(
    '/api/network/devices',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { name, ip, mac, wol_enabled = false, wol_broadcast, check_port, group_name, icon = '🖥️', subnet } = req.body
      if (!name || !ip) return reply.status(400).send({ error: 'name and ip required' })
      const db = getDb()
      const id = nanoid()
      db.prepare(`
        INSERT INTO network_devices (id, name, ip, mac, wol_enabled, wol_broadcast, check_port, group_name, icon, subnet)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, ip, mac ?? null, wol_enabled ? 1 : 0, wol_broadcast ?? null, check_port ?? null, group_name ?? null, icon, subnet ?? null)
      const row = db.prepare('SELECT * FROM network_devices WHERE id = ?').get(id) as NetworkDeviceRow
      return sanitizeDevice(row)
    }
  )

  // PATCH /api/network/devices/:id
  app.patch<{ Params: { id: string }; Body: PatchNetworkDeviceBody }>(
    '/api/network/devices/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const row = db.prepare('SELECT * FROM network_devices WHERE id = ?').get(req.params.id) as NetworkDeviceRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })
      const b = req.body
      db.prepare(`
        UPDATE network_devices SET
          name = ?, ip = ?, mac = ?, wol_enabled = ?, wol_broadcast = ?,
          check_port = ?, group_name = ?, icon = ?, subnet = ?
        WHERE id = ?
      `).run(
        b.name ?? row.name,
        b.ip ?? row.ip,
        b.mac !== undefined ? (b.mac || null) : row.mac,
        b.wol_enabled !== undefined ? (b.wol_enabled ? 1 : 0) : row.wol_enabled,
        b.wol_broadcast !== undefined ? (b.wol_broadcast || null) : row.wol_broadcast,
        b.check_port !== undefined ? (b.check_port ?? null) : row.check_port,
        b.group_name !== undefined ? (b.group_name || null) : row.group_name,
        b.icon ?? row.icon,
        b.subnet !== undefined ? (b.subnet || null) : row.subnet,
        req.params.id
      )
      const updated = db.prepare('SELECT * FROM network_devices WHERE id = ?').get(req.params.id) as NetworkDeviceRow
      return sanitizeDevice(updated)
    }
  )

  // DELETE /api/network/devices/:id
  app.delete<{ Params: { id: string } }>(
    '/api/network/devices/:id',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const db = getDb()
      const row = db.prepare('SELECT id FROM network_devices WHERE id = ?').get(req.params.id)
      if (!row) return reply.status(404).send({ error: 'Not found' })
      db.prepare('DELETE FROM network_devices WHERE id = ?').run(req.params.id)
      return reply.status(204).send()
    }
  )

  // POST /api/network/devices/:id/wol
  app.post<{ Params: { id: string } }>(
    '/api/network/devices/:id/wol',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const device = db.prepare('SELECT * FROM network_devices WHERE id = ?').get(req.params.id) as NetworkDeviceRow | undefined
      if (!device) return reply.status(404).send({ error: 'Not found' })
      if (!device.mac) return reply.status(400).send({ ok: false, error: 'Keine MAC-Adresse konfiguriert' })
      const macStr = device.mac.replace(/[:\-]/g, '')
      if (macStr.length !== 12) return reply.status(400).send({ ok: false, error: 'Ungültige MAC-Adresse' })
      const macBytes = Buffer.from(macStr, 'hex')
      // Build 102-byte magic packet
      const packet = Buffer.alloc(102)
      packet.fill(0xff, 0, 6)
      for (let i = 0; i < 16; i++) {
        macBytes.copy(packet, 6 + i * 6)
      }
      const broadcast = device.wol_broadcast || '255.255.255.255'
      await new Promise<void>((resolve, reject) => {
        const client = dgram.createSocket('udp4')
        client.once('error', reject)
        client.bind(() => {
          client.setBroadcast(true)
          client.send(packet, 0, packet.length, 9, broadcast, err => {
            client.close()
            if (err) reject(err)
            else resolve()
          })
        })
      })
      return { ok: true }
    }
  )

  // GET /api/network/scan
  app.get<{ Querystring: { subnet?: string } }>(
    '/api/network/scan',
    { logLevel: 'silent', onRequest: [app.authenticate] },
    async (req, reply) => {
      const subnetParam = req.query.subnet?.trim()
      if (!subnetParam) {
        return reply.status(400).send({ error: 'Subnetz erforderlich' })
      }

      // Accept either CIDR (e.g. 10.10.0.0/20) or simple prefix (e.g. 192.168.1 → 192.168.1.0/24)
      let ipList: string[]
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnetParam)) {
        // Legacy simple format → convert to /24
        const base = subnetParam
        ipList = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`)
      } else {
        const parsed = cidrToIpList(subnetParam)
        if (parsed === null) {
          return reply.status(400).send({ error: 'Ungültiges CIDR-Format (z.B. 192.168.1.0/24 oder 10.10.0.0/20)' })
        }
        if (parsed.length > 4096) {
          return reply.status(400).send({ error: 'Subnetz zu groß — mindestens /20 erforderlich' })
        }
        ipList = parsed
      }

      // Common homelab ports: SSH, HTTP/S, alt-HTTP/S, Proxmox, Synology, Portainer, Grafana, Jellyfin, Plex
      const scanPorts = [22, 80, 443, 8080, 8443, 8006, 5000, 5001, 9000, 9443, 3000, 8096, 32400]
      const results: { ip: string; latency: number; open_ports: number[] }[] = []

      // Process in batches to avoid exhausting OS socket limits on large subnets
      const BATCH = 64
      const deadline = Date.now() + 28_000

      for (let b = 0; b < ipList.length && Date.now() < deadline; b += BATCH) {
        const batch = ipList.slice(b, b + BATCH)
        await Promise.allSettled(batch.map(async ip => {
          const open_ports: number[] = []
          let firstLatency: number | null = null
          await Promise.allSettled(scanPorts.map(async port => {
            const lat = await tcpPing(ip, port, 800)
            if (lat !== null) {
              open_ports.push(port)
              if (firstLatency === null) firstLatency = lat
            }
          }))
          if (open_ports.length > 0 && firstLatency !== null) {
            results.push({ ip, latency: firstLatency, open_ports })
          }
        }))
      }

      return results.sort((a, b) => {
        const aParts = a.ip.split('.').map(Number)
        const bParts = b.ip.split('.').map(Number)
        for (let i = 0; i < 4; i++) {
          if (aParts[i] !== bParts[i]) return (aParts[i] ?? 0) - (bParts[i] ?? 0)
        }
        return 0
      })
    }
  )

  // GET /api/network/devices/:id/history
  app.get<{ Params: { id: string } }>(
    '/api/network/devices/:id/history',
    async (req, reply) => {
      const db = getDb()
      const device = db.prepare('SELECT id FROM network_devices WHERE id = ?').get(req.params.id)
      if (!device) return reply.status(404).send({ error: 'Not found' })
      const rows = db.prepare(
        'SELECT status, checked_at FROM network_device_history WHERE device_id = ? ORDER BY checked_at DESC LIMIT 48'
      ).all(req.params.id) as { status: string; checked_at: string }[]
      return rows
    }
  )
}
