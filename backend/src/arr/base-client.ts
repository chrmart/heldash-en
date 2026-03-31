import { request, Agent } from 'undici'

const agent = new Agent({
  headersTimeout: 8_000,
  bodyTimeout: 15_000,
  connect: { rejectUnauthorized: false }, // homelab self-signed certs
})

export class ArrBaseClient {
  private readonly apiBase: string

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    apiVersion: 'v1' | 'v3',
  ) {
    this.apiBase = `${baseUrl.replace(/\/$/, '')}/api/${apiVersion}`
  }

  protected async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.apiBase}/${endpoint}`
    if (params && Object.keys(params).length > 0) {
      url += '?' + new URLSearchParams(params).toString()
    }

    const res = await request(url, {
      method: 'GET',
      headers: { 'X-Api-Key': this.apiKey },
      dispatcher: agent,
    })

    if (res.statusCode >= 400) {
      const errChunks: Buffer[] = []
      for await (const chunk of res.body) errChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      const errBody = errChunks.length ? Buffer.concat(errChunks).toString('utf-8') : ''
      let msg = `HTTP ${res.statusCode}`
      try { const j = JSON.parse(errBody); msg += ': ' + (j.message ?? j.error ?? errBody.slice(0, 200)) } catch { if (errBody) msg += ': ' + errBody.slice(0, 200) }
      throw new Error(msg)
    }

    const chunks: Buffer[] = []
    for await (const chunk of res.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return JSON.parse(chunks.length ? Buffer.concat(chunks).toString('utf-8') : 'null') as T
  }

  protected async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.apiBase}/${endpoint}`
    const res = await request(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      dispatcher: agent,
    })
    if (res.statusCode >= 400) {
      const errChunks: Buffer[] = []
      for await (const chunk of res.body) errChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      const errBody = errChunks.length ? Buffer.concat(errChunks).toString('utf-8') : ''
      let msg = `HTTP ${res.statusCode}`
      try { const j = JSON.parse(errBody); msg += ': ' + (j.message ?? j.error ?? errBody.slice(0, 200)) } catch { if (errBody) msg += ': ' + errBody.slice(0, 200) }
      throw new Error(msg)
    }
    const chunks: Buffer[] = []
    for await (const chunk of res.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return JSON.parse(chunks.length ? Buffer.concat(chunks).toString('utf-8') : 'null') as T
  }

  protected async put<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.apiBase}/${endpoint}`
    const res = await request(url, {
      method: 'PUT',
      headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      dispatcher: agent,
    })
    if (res.statusCode >= 400) {
      const errChunks: Buffer[] = []
      for await (const chunk of res.body) errChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      const errBody = errChunks.length ? Buffer.concat(errChunks).toString('utf-8') : ''
      let msg = `HTTP ${res.statusCode}`
      try { const j = JSON.parse(errBody); msg += ': ' + (j.message ?? j.error ?? errBody.slice(0, 200)) } catch { if (errBody) msg += ': ' + errBody.slice(0, 200) }
      throw new Error(msg)
    }
    const chunks: Buffer[] = []
    for await (const chunk of res.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return JSON.parse(chunks.length ? Buffer.concat(chunks).toString('utf-8') : 'null') as T
  }

  protected async del(endpoint: string): Promise<void> {
    const url = `${this.apiBase}/${endpoint}`
    const res = await request(url, {
      method: 'DELETE',
      headers: { 'X-Api-Key': this.apiKey },
      dispatcher: agent,
    })
    for await (const _ of res.body) { /* drain */ }
    if (res.statusCode >= 400) {
      throw new Error(`HTTP ${res.statusCode} from ${url}`)
    }
  }

  /** Quick reachability check — returns true if /system/status responds */
  async ping(): Promise<boolean> {
    try {
      await this.get<unknown>('system/status')
      return true
    } catch {
      return false
    }
  }

  getSystemStatus(): Promise<{ version: string; instanceName?: string }> {
    return this.get('system/status')
  }

  // ── Custom Formats & Quality Profiles (Radarr/Sonarr v3 shared) ─────────────

  getCustomFormats(): Promise<unknown[]> {
    return this.get<unknown[]>('customformat')
  }

  getCustomFormatSchema(): Promise<unknown[]> {
    return this.get<unknown[]>('customformat/schema')
  }

  createCustomFormat(data: unknown): Promise<unknown> {
    return this.post<unknown>('customformat', data)
  }

  updateCustomFormat(cfId: number, data: unknown): Promise<unknown> {
    return this.put<unknown>(`customformat/${cfId}`, data)
  }

  deleteCustomFormat(cfId: number): Promise<void> {
    return this.del(`customformat/${cfId}`)
  }

  getQualityProfiles(): Promise<unknown[]> {
    return this.get<unknown[]>('qualityprofile')
  }

  getQualityProfile(profileId: number): Promise<unknown> {
    return this.get<unknown>(`qualityprofile/${profileId}`)
  }

  updateQualityProfile(profileId: number, data: unknown): Promise<unknown> {
    return this.put<unknown>(`qualityprofile/${profileId}`, data)
  }
}
