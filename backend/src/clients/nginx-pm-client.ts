import { request, Agent } from 'undici'

interface ProxyHost {
  id: number
  domain_names: string[]
  enabled: number
}

interface Stream {
  id: number
  enabled: number
}

interface RedirectionHost {
  id: number
  enabled: number
}

interface Certificate {
  id: number
  provider: string
  domain_names: string[]
  expires_on: string  // ISO date string
}

export interface NpmStats {
  proxy_hosts: number
  streams: number
  certificates: number
  cert_expiring_soon: number  // expires within 30 days
}

export class NginxPMClient {
  private baseUrl: string
  private username: string
  private password: string
  private token: string | null = null
  private tokenExpiry: number = 0
  private agent: Agent

  constructor(url: string, username: string, password: string) {
    this.baseUrl = url.replace(/\/$/, '')
    this.username = username
    this.password = password
    this.agent = new Agent({
      headersTimeout: 5_000,
      bodyTimeout: 5_000,
      connect: { rejectUnauthorized: false },
    })
  }

  private async getToken(): Promise<string> {
    // Token noch gültig? (cached für 6 Stunden)
    if (this.token && this.tokenExpiry > Date.now()) {
      return this.token
    }

    // Neuen Token holen
    const url = `${this.baseUrl}/api/tokens`
    const res = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: this.username,
        secret: this.password,
      }),
      dispatcher: this.agent,
    })

    let body = ''
    for await (const chunk of res.body) {
      body += chunk
    }

    if (res.statusCode === 401) throw new Error('NPM: Invalid credentials')
    if (res.statusCode === 403) throw new Error('NPM: Access denied')
    if (res.statusCode >= 500) throw new Error('NPM: Server error')
    if (res.statusCode >= 400) throw new Error('NPM: Auth failed')

    const data = JSON.parse(body)
    this.token = data.token as string
    // Token gültig für 6 Stunden
    this.tokenExpiry = Date.now() + (6 * 60 * 60 * 1000)
    return this.token
  }

  private async fetchApi<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}/api${path}`
    const token = await this.getToken()

    const res = await request(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      dispatcher: this.agent,
    })

    if (res.statusCode === 401) throw new Error('NPM: Invalid credentials or token expired')
    if (res.statusCode === 403) throw new Error('NPM: Access denied')
    if (res.statusCode >= 500) throw new Error('NPM: Server error')
    if (res.statusCode >= 400) throw new Error('NPM: Not found')

    let body = ''
    for await (const chunk of res.body) {
      body += chunk
    }

    return JSON.parse(body)
  }

  async getStats(): Promise<NpmStats> {
    const [proxyHosts, streams, certs, redirections] = await Promise.all([
      this.fetchApi<ProxyHost[]>('/nginx/proxy-hosts'),
      this.fetchApi<Stream[]>('/nginx/streams'),
      this.fetchApi<Certificate[]>('/nginx/certificates'),
      this.fetchApi<RedirectionHost[]>('/nginx/redirection-hosts'),
    ])

    const now = Date.now()
    const in30Days = now + 30 * 24 * 60 * 60 * 1000
    const certExpiringSoon = certs.filter(cert => {
      const expiry = new Date(cert.expires_on).getTime()
      return expiry > now && expiry <= in30Days
    }).length

    return {
      proxy_hosts: proxyHosts.length + redirections.length,
      streams: streams.length,
      certificates: certs.length,
      cert_expiring_soon: certExpiringSoon,
    }
  }
}
