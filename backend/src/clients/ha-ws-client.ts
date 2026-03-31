import { WebSocket } from 'undici'
import { logActivity } from '../routes/activity'
import { getDb } from '../db/database'
import { emitAlert } from '../routes/ha-alerts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HaEntityState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

type StateListener = (entityId: string, newState: HaEntityState) => void

// Domains to log (never: sensor, binary_sensor, sun, weather, zone, person, device_tracker)
const LOGGABLE_DOMAINS = new Set(['light', 'switch', 'input_boolean', 'climate', 'cover', 'media_player', 'automation', 'scene'])
const RATE_LIMIT_MS = 60_000

interface PendingCommand {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

// ── HA WebSocket Client ───────────────────────────────────────────────────────
// Manages a single persistent WebSocket connection to one HA instance.
// Subscribes to `state_changed` events and fans them out to registered listeners.
// Also supports one-shot request/response via sendCommand().
// Auto-reconnects with exponential backoff. Stops when all listeners unsubscribe
// and no commands are pending.

export class HaWsClient {
  private ws: WebSocket | null = null
  private msgId = 1
  private listeners = new Set<StateListener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 5_000
  private destroyed = false
  private isAuthed = false
  private pendingCommands = new Map<number, PendingCommand>()
  private commandQueue: { id: number; msg: string }[] = []
  private activityRateLimit = new Map<string, number>()
  private persistent = false

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly instanceId: string = '',
  ) {}

  /** Start a persistent always-on connection — stays connected even without SSE listeners. */
  startPersistent(): void {
    this.persistent = true
    if (!this.ws) this.connect()
  }

  /** Register a listener. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    if (!this.ws) this.connect()
    return () => {
      this.listeners.delete(listener)
      this.maybeDisconnect()
    }
  }

  /** Send a one-shot WS command and await its result. Rejects after 10s. */
  sendCommand(type: string, payload?: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.destroyed) { reject(new Error('Client destroyed')); return }
      const id = this.msgId++
      const msg = JSON.stringify({ id, type, ...payload })
      const timer = setTimeout(() => {
        if (this.pendingCommands.delete(id)) {
          this.maybeDisconnect()
          reject(new Error('Command timeout'))
        }
      }, 10_000)
      this.pendingCommands.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); this.maybeDisconnect() },
        reject: (e) => { clearTimeout(timer); reject(e); this.maybeDisconnect() },
      })
      if (this.isAuthed && this.ws) {
        this.ws.send(msg)
      } else {
        this.commandQueue.push({ id, msg })
        if (!this.ws) this.connect()
      }
    })
  }

  private maybeDisconnect(): void {
    if (this.persistent) return
    if (!this.destroyed && this.listeners.size === 0 && this.pendingCommands.size === 0 && this.commandQueue.length === 0) {
      this.disconnect()
    }
  }

  private connect(): void {
    if (this.destroyed) return
    // Convert http(s):// → ws(s)://
    const wsUrl = this.url.replace(/^http/, 'ws') + '/api/websocket'
    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onmessage = (event: MessageEvent) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(event.data as string) as Record<string, unknown> }
      catch { return }
      this.handleMessage(msg)
    }

    this.ws.onerror = () => { /* handled in onclose */ }

    this.ws.onclose = () => {
      this.ws = null
      this.isAuthed = false
      // Reject pending commands — connection lost before we got their response
      for (const [, { reject }] of this.pendingCommands) {
        reject(new Error('Connection closed'))
      }
      this.pendingCommands.clear()
      if (!this.destroyed && (this.persistent || this.listeners.size > 0 || this.commandQueue.length > 0)) {
        this.scheduleReconnect()
      }
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'auth_required':
        this.ws?.send(JSON.stringify({ type: 'auth', access_token: this.token }))
        break

      case 'auth_ok':
        this.reconnectDelay = 5_000
        this.isAuthed = true
        // Flush queued commands now that we're authenticated
        for (const { msg: m } of this.commandQueue) {
          this.ws?.send(m)
        }
        this.commandQueue = []
        // Subscribe to state_changed events
        this.ws?.send(JSON.stringify({
          id: this.msgId++,
          type: 'subscribe_events',
          event_type: 'state_changed',
        }))
        break

      case 'auth_invalid':
        this.destroyed = true
        // Reject queued (not yet sent) commands
        for (const { id } of this.commandQueue) {
          const pending = this.pendingCommands.get(id)
          if (pending) {
            this.pendingCommands.delete(id)
            pending.reject(new Error('auth_invalid'))
          }
        }
        this.commandQueue = []
        // Reject already-sent pending commands
        for (const [, { reject }] of this.pendingCommands) {
          reject(new Error('auth_invalid'))
        }
        this.pendingCommands.clear()
        this.ws?.close()
        break

      case 'result': {
        const id = msg.id as number
        const pending = this.pendingCommands.get(id)
        if (pending) {
          this.pendingCommands.delete(id)
          if (msg.success) {
            pending.resolve(msg.result)
          } else {
            const error = msg.error as Record<string, unknown> | undefined
            pending.reject(new Error((error?.message as string) ?? 'Command failed'))
          }
        }
        break
      }

      case 'event': {
        const ev = msg.event as Record<string, unknown> | undefined
        if (!ev) break
        const data = ev.data as Record<string, unknown> | undefined
        if (!data) break
        const entityId = data.entity_id as string | undefined
        const newState = data.new_state as HaEntityState | null | undefined
        const oldState = data.old_state as HaEntityState | null | undefined
        if (entityId && newState) {
          for (const fn of this.listeners) fn(entityId, newState)
          this.maybeLogHaActivity(entityId, newState, oldState ?? null)
          this.checkAlerts(entityId, newState)
        }
        break
      }
    }
  }

  private maybeLogHaActivity(entityId: string, newState: HaEntityState, oldState: HaEntityState | null): void {
    const domain = entityId.split('.')[0]
    if (!LOGGABLE_DOMAINS.has(domain)) return
    if (!oldState) return
    if (oldState.state === newState.state) return

    // Rate limit: max 1 entry per entity+direction per 60s
    const now = Date.now()
    const directionKey = `${entityId}:${oldState.state}→${newState.state}`
    const lastLogged = this.activityRateLimit.get(directionKey) ?? 0
    if (now - lastLogged < RATE_LIMIT_MS) return
    this.activityRateLimit.set(directionKey, now)

    const friendly = (newState.attributes.friendly_name as string | undefined) ?? entityId
    const message = `${friendly} — ${oldState.state} → ${newState.state}`
    logActivity('ha', message, 'info', { instanceId: this.instanceId, entityId, domain })
  }

  private checkAlerts(entityId: string, newState: HaEntityState): void {
    try {
      const db = getDb()
      interface AlertRow {
        id: string
        condition_type: string
        condition_value: string | null
        message: string
        last_triggered_at: string | null
      }
      const alerts = db.prepare(
        'SELECT id, condition_type, condition_value, message, last_triggered_at FROM ha_alerts WHERE entity_id = ? AND enabled = 1'
      ).all(entityId) as AlertRow[]

      const nowMs = Date.now()
      for (const alert of alerts) {
        let conditionMet = false
        if (alert.condition_type === 'state_changes') {
          conditionMet = true
        } else if (alert.condition_type === 'state_equals') {
          conditionMet = newState.state === alert.condition_value
        } else if (alert.condition_type === 'state_above') {
          const threshold = parseFloat(alert.condition_value ?? '')
          const val = parseFloat(newState.state)
          conditionMet = !isNaN(threshold) && !isNaN(val) && val > threshold
        } else if (alert.condition_type === 'state_below') {
          const threshold = parseFloat(alert.condition_value ?? '')
          const val = parseFloat(newState.state)
          conditionMet = !isNaN(threshold) && !isNaN(val) && val < threshold
        }

        if (!conditionMet) continue

        // Rate limit: min 60s between triggers for same alert
        if (alert.last_triggered_at) {
          const lastMs = new Date(alert.last_triggered_at + 'Z').getTime()
          if (nowMs - lastMs < 60_000) continue
        }

        // Update last_triggered_at
        db.prepare("UPDATE ha_alerts SET last_triggered_at = datetime('now') WHERE id = ?").run(alert.id)

        // Emit SSE event
        const friendly = (newState.attributes.friendly_name as string | undefined) ?? entityId
        emitAlert({
          type: 'ha_alert',
          alertId: alert.id,
          entityId,
          entityName: friendly,
          message: alert.message,
          entityState: newState.state,
          triggeredAt: new Date().toISOString(),
        })
      }
    } catch { /* don't crash WS client on alert errors */ }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000)
      if (!this.destroyed && (this.persistent || this.listeners.size > 0 || this.commandQueue.length > 0)) {
        this.connect()
      }
    }, this.reconnectDelay)
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.isAuthed = false
  }

  destroy(): void {
    this.destroyed = true
    this.listeners.clear()
    for (const [, { reject }] of this.pendingCommands) {
      reject(new Error('Client destroyed'))
    }
    this.pendingCommands.clear()
    this.commandQueue = []
    this.disconnect()
  }
}
