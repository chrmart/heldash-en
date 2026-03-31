import { FastifyInstance } from 'fastify'
import { getDb } from '../db/database'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const WATCH_REGION = 'DE'

// ── Module-level caches (24h) ─────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

let genreCacheEntry: CacheEntry<{ movie: unknown[]; tv: unknown[] }> | null = null
let providerCacheEntry: CacheEntry<{ movie: unknown[]; tv: unknown[] }> | null = null

const CACHE_TTL = 24 * 60 * 60 * 1000  // 24h in ms

function getApiKey(): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'tmdb_api_key'")
    .get() as { value: string } | undefined
  if (!row) return null
  try {
    const v = JSON.parse(row.value)
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
  } catch {
    return null
  }
}

async function tmdbFetch(path: string, apiKey: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${TMDB_BASE}${path}${sep}api_key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`TMDB ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

export async function tmdbRoutes(app: FastifyInstance) {

  // ── Trending ────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { mediaType?: string; timeWindow?: string } }>(
    '/api/tmdb/trending',
    async (req, reply) => {
      const apiKey = getApiKey()
      if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
      const mediaType = req.query.mediaType ?? 'all'
      const timeWindow = req.query.timeWindow ?? 'day'
      const data = await tmdbFetch(`/trending/${mediaType}/${timeWindow}`, apiKey)
      return data
    }
  )

  // ── Discover movies ─────────────────────────────────────────────────────────

  app.get<{
    Querystring: {
      page?: string; sortBy?: string; language?: string
      genreIds?: string; watchProviders?: string
      voteAverageGte?: string; releaseDateGte?: string; releaseDateLte?: string
    }
  }>('/api/tmdb/discover/movie', async (req, reply) => {
    const apiKey = getApiKey()
    if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
    const q = req.query
    const params = new URLSearchParams({
      page: q.page ?? '1',
      sort_by: q.sortBy ?? 'popularity.desc',
      include_adult: 'false',
    })
    if (q.language) params.set('language', q.language)
    if (q.genreIds) params.set('with_genres', q.genreIds)
    if (q.watchProviders) {
      params.set('with_watch_providers', q.watchProviders)
      params.set('watch_region', WATCH_REGION)
    }
    if (q.voteAverageGte) params.set('vote_average.gte', q.voteAverageGte)
    if (q.releaseDateGte) params.set('primary_release_date.gte', q.releaseDateGte)
    if (q.releaseDateLte) params.set('primary_release_date.lte', q.releaseDateLte)
    const data = await tmdbFetch(`/discover/movie?${params}`, apiKey)
    return data
  })

  // ── Discover TV ─────────────────────────────────────────────────────────────

  app.get<{
    Querystring: {
      page?: string; sortBy?: string; language?: string
      genreIds?: string; watchProviders?: string
      voteAverageGte?: string; firstAirDateGte?: string; firstAirDateLte?: string
    }
  }>('/api/tmdb/discover/tv', async (req, reply) => {
    const apiKey = getApiKey()
    if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
    const q = req.query
    const params = new URLSearchParams({
      page: q.page ?? '1',
      sort_by: q.sortBy ?? 'popularity.desc',
    })
    if (q.language) params.set('language', q.language)
    if (q.genreIds) params.set('with_genres', q.genreIds)
    if (q.watchProviders) {
      params.set('with_watch_providers', q.watchProviders)
      params.set('watch_region', WATCH_REGION)
    }
    if (q.voteAverageGte) params.set('vote_average.gte', q.voteAverageGte)
    if (q.firstAirDateGte) params.set('first_air_date.gte', q.firstAirDateGte)
    if (q.firstAirDateLte) params.set('first_air_date.lte', q.firstAirDateLte)
    const data = await tmdbFetch(`/discover/tv?${params}`, apiKey)
    return data
  })

  // ── Multi search ────────────────────────────────────────────────────────────

  app.get<{ Querystring: { query?: string; page?: string; language?: string } }>(
    '/api/tmdb/search',
    async (req, reply) => {
      const apiKey = getApiKey()
      if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
      const { query = '', page = '1', language } = req.query
      const params = new URLSearchParams({ query, page, include_adult: 'false' })
      if (language) params.set('language', language)
      const data = await tmdbFetch(`/search/multi?${params}`, apiKey)
      return data
    }
  )

  // ── TV detail ───────────────────────────────────────────────────────────────

  app.get<{ Params: { tmdbId: string } }>(
    '/api/tmdb/tv/:tmdbId',
    async (req, reply) => {
      const apiKey = getApiKey()
      if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
      const data = await tmdbFetch(`/tv/${req.params.tmdbId}`, apiKey) as Record<string, unknown>
      // Return only the fields we need
      return {
        id: data.id,
        name: data.name,
        seasons: (data.seasons as unknown[] ?? []),
      }
    }
  )

  // ── Movie detail ────────────────────────────────────────────────────────────

  app.get<{ Params: { tmdbId: string } }>(
    '/api/tmdb/movie/:tmdbId',
    async (req, reply) => {
      const apiKey = getApiKey()
      if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
      const data = await tmdbFetch(`/movie/${req.params.tmdbId}`, apiKey)
      return data
    }
  )

  // ── Genres (cached 24h) ─────────────────────────────────────────────────────

  app.get('/api/tmdb/genres/movie', async (_req, reply) => {
    const apiKey = getApiKey()
    if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
    if (genreCacheEntry && Date.now() < genreCacheEntry.expiresAt) {
      return { genres: genreCacheEntry.data.movie }
    }
    // Fetch both to populate cache
    const [movie, tv] = await Promise.all([
      tmdbFetch('/genre/movie/list', apiKey) as Promise<{ genres: unknown[] }>,
      tmdbFetch('/genre/tv/list', apiKey) as Promise<{ genres: unknown[] }>,
    ])
    genreCacheEntry = { data: { movie: movie.genres, tv: tv.genres }, expiresAt: Date.now() + CACHE_TTL }
    return { genres: genreCacheEntry.data.movie }
  })

  app.get('/api/tmdb/genres/tv', async (_req, reply) => {
    const apiKey = getApiKey()
    if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
    if (genreCacheEntry && Date.now() < genreCacheEntry.expiresAt) {
      return { genres: genreCacheEntry.data.tv }
    }
    const [movie, tv] = await Promise.all([
      tmdbFetch('/genre/movie/list', apiKey) as Promise<{ genres: unknown[] }>,
      tmdbFetch('/genre/tv/list', apiKey) as Promise<{ genres: unknown[] }>,
    ])
    genreCacheEntry = { data: { movie: movie.genres, tv: tv.genres }, expiresAt: Date.now() + CACHE_TTL }
    return { genres: genreCacheEntry.data.tv }
  })

  // ── Watch providers (cached 24h) ────────────────────────────────────────────

  app.get('/api/tmdb/watchproviders/movie', async (_req, reply) => {
    const apiKey = getApiKey()
    if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
    if (providerCacheEntry && Date.now() < providerCacheEntry.expiresAt) {
      return { results: providerCacheEntry.data.movie }
    }
    const [movie, tv] = await Promise.all([
      tmdbFetch(`/watch/providers/movie?watch_region=${WATCH_REGION}`, apiKey) as Promise<{ results: unknown[] }>,
      tmdbFetch(`/watch/providers/tv?watch_region=${WATCH_REGION}`, apiKey) as Promise<{ results: unknown[] }>,
    ])
    providerCacheEntry = { data: { movie: movie.results, tv: tv.results }, expiresAt: Date.now() + CACHE_TTL }
    return { results: providerCacheEntry.data.movie }
  })

  app.get('/api/tmdb/watchproviders/tv', async (_req, reply) => {
    const apiKey = getApiKey()
    if (!apiKey) return reply.status(503).send({ error: 'TMDB API key not configured' })
    if (providerCacheEntry && Date.now() < providerCacheEntry.expiresAt) {
      return { results: providerCacheEntry.data.tv }
    }
    const [movie, tv] = await Promise.all([
      tmdbFetch(`/watch/providers/movie?watch_region=${WATCH_REGION}`, apiKey) as Promise<{ results: unknown[] }>,
      tmdbFetch(`/watch/providers/tv?watch_region=${WATCH_REGION}`, apiKey) as Promise<{ results: unknown[] }>,
    ])
    providerCacheEntry = { data: { movie: movie.results, tv: tv.results }, expiresAt: Date.now() + CACHE_TTL }
    return { results: providerCacheEntry.data.tv }
  })
}
