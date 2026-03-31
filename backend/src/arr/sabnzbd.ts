import { request, Agent } from 'undici'

const agent = new Agent({
  headersTimeout: 8_000,
  bodyTimeout: 15_000,
  connect: { rejectUnauthorized: false }, // homelab self-signed certs
})

export interface SabnzbdQueueSlot {
  nzo_id: string
  filename: string
  status: string
  mbleft: number
  mb: number
  percentage: string  // "75.2" — string from SABnzbd
  timeleft: string    // "0:12:34"
  cat: string
  avg_age: string
}

export interface SabnzbdQueueData {
  speed: string           // "1.2 MB/s"
  mbleft: string          // float as string
  mb: string              // float as string
  diskspace1: string      // GB free on first disk, as string
  diskspace2: string
  paused: boolean
  noofslots: number
  timeleft: string        // "H:MM:SS"
  speedlimit: string      // percentage, e.g. "50"
  speedlimit_abs: string  // absolute, e.g. "400 K"
  slots: SabnzbdQueueSlot[]
}

export interface SabnzbdHistorySlot {
  nzo_id: string
  name: string
  status: string      // "Completed" | "Failed" | ...
  bytes: number
  nzb_name: string
  fail_message: string
  storage: string
  cat: string
  action_line: string
  download_time: number  // seconds
}

export interface SabnzbdHistoryData {
  noofslots: number
  slots: SabnzbdHistorySlot[]
}

export interface SabnzbdServerStats {
  day: number
  week: number
  month: number
  total: number
  servers: Record<string, unknown>
}

export interface SabnzbdWarning {
  text: string
  type: string   // "WARNING" | "ERROR" | "INFO"
  time: number   // unix timestamp
}

export class SabnzbdClient {
  private readonly apiUrl: string

  constructor(baseUrl: string, private readonly apiKey: string) {
    this.apiUrl = `${baseUrl.replace(/\/$/, '')}/api`
  }

  private async call<T>(mode: string, params?: Record<string, string>): Promise<T> {
    const searchParams = new URLSearchParams({
      mode,
      apikey: this.apiKey,
      output: 'json',
      ...params,
    })
    const url = `${this.apiUrl}?${searchParams.toString()}`

    const res = await request(url, { method: 'GET', dispatcher: agent })

    if (res.statusCode >= 400) {
      for await (const _ of res.body) { /* drain */ }
      throw new Error(`HTTP ${res.statusCode} from SABnzbd`)
    }

    const chunks: Buffer[] = []
    for await (const chunk of res.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T
  }

  async ping(): Promise<boolean> {
    try {
      await this.call<unknown>('version')
      return true
    } catch {
      return false
    }
  }

  getVersion(): Promise<{ version: string }> {
    return this.call('version')
  }

  /** start/limit control which slots are returned; noofslots always reflects total queue size */
  getQueue(start = 0, limit = 20): Promise<{ queue: SabnzbdQueueData }> {
    return this.call('queue', { start: String(start), limit: String(limit) })
  }

  getHistory(start = 0, limit = 10): Promise<{ history: SabnzbdHistoryData }> {
    return this.call('history', { start: String(start), limit: String(limit) })
  }

  getServerStats(): Promise<SabnzbdServerStats> {
    return this.call('server_stats')
  }

  getWarnings(): Promise<{ warnings: SabnzbdWarning[] }> {
    return this.call('warnings')
  }
}
