import { FastifyInstance } from 'fastify'
import { request as undiciRequest } from 'undici'

interface Release {
  tag_name: string
  name: string
  body: string
  published_at: string
}

let changelogCache: Release[] | null = null
let changelogCachedAt = 0
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export async function changelogRoutes(app: FastifyInstance) {
  app.get('/api/changelog', async () => {
    const now = Date.now()
    if (changelogCache && now - changelogCachedAt < CACHE_TTL) {
      return changelogCache
    }
    try {
      const res = await undiciRequest(
        'https://api.github.com/repos/Kreuzbube88/heldash/releases',
        {
          method: 'GET',
          headers: { 'User-Agent': 'heldash/1.0', 'Accept': 'application/vnd.github.v3+json' },
          headersTimeout: 5_000,
          bodyTimeout: 5_000,
        }
      )
      const data = await res.body.json() as unknown
      if (Array.isArray(data)) {
        const releases = (data as Array<Record<string, unknown>>).map(r => ({
          tag_name: String(r.tag_name ?? ''),
          name: String(r.name ?? ''),
          body: String(r.body ?? ''),
          published_at: String(r.published_at ?? ''),
        }))
        changelogCache = releases
        changelogCachedAt = now
        return releases
      }
    } catch {
      // Return cached or empty
    }
    return changelogCache ?? []
  })
}
