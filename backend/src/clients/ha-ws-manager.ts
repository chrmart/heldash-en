import { HaWsClient } from './ha-ws-client'
import { getDb } from '../db/database'

// Keyed by HA instance ID. Clients are created on first subscribe, destroyed on
// instance update/delete or when all SSE subscribers disconnect.
const pool = new Map<string, HaWsClient>()

export function getHaWsClient(instanceId: string, url: string, token: string): HaWsClient {
  let client = pool.get(instanceId)
  if (!client) {
    client = new HaWsClient(url, token, instanceId)
    pool.set(instanceId, client)
  }
  return client
}

/** Create a persistent always-on WS client for this instance (if not already present). */
export function ensureHaWsPersistent(instanceId: string, url: string, token: string): void {
  if (pool.has(instanceId)) return
  const client = new HaWsClient(url, token, instanceId)
  pool.set(instanceId, client)
  client.startPersistent()
}

export function invalidateHaWsClient(instanceId: string): void {
  const client = pool.get(instanceId)
  if (client) {
    client.destroy()
    pool.delete(instanceId)
  }
}

/** Called once after server starts — connects persistent WS for all enabled HA instances. */
export function initHaWsClients(): void {
  try {
    const db = getDb()
    const instances = db.prepare(
      'SELECT id, url, token FROM ha_instances WHERE enabled = 1'
    ).all() as { id: string; url: string; token: string }[]
    for (const inst of instances) {
      ensureHaWsPersistent(inst.id, inst.url, inst.token)
    }
  } catch { /* db not ready or no ha_instances table yet */ }
}
