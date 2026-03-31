import { ArrBaseClient } from './base-client'

interface SeerrRequestCount {
  total: number
  movie: number
  tv: number
  pending: number
  approved: number
  declined: number
  processing: number
  available: number
}

interface SeerrRequestResult {
  id: number
  status: number  // 1=pending, 2=approved, 3=declined
  createdAt: string
  updatedAt: string
  requestedBy: { id: number; displayName?: string; username?: string; email: string }
  media: {
    id: number
    mediaType: 'movie' | 'tv'
    tmdbId: number
    tvdbId?: number | null
    status: number  // 1=unknown, 2=pending, 3=processing, 4=partially_available, 5=available
  }
  seasons?: { seasonNumber: number }[]
}

interface SeerrRequestsResponse {
  pageInfo: { pages: number; pageSize: number; results: number; page: number }
  results: SeerrRequestResult[]
}

interface SeerrStatus {
  version: string
  commitTag?: string
  updateAvailable?: boolean
  commitsBehind?: number
  restartRequired?: boolean
}

export interface SeerrMediaInfo {
  id: number
  mediaType: 'movie' | 'tv'
  tmdbId: number
  tvdbId?: number | null
  // 1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE, 6=DELETED
  status: number
  requests?: { id: number; status: number }[]
}

export interface SeerrDiscoverResult {
  id: number  // TMDB ID
  mediaType: 'movie' | 'tv'
  title?: string       // movies
  name?: string        // TV
  posterPath?: string
  backdropPath?: string
  releaseDate?: string
  firstAirDate?: string
  voteAverage?: number
  overview?: string
  mediaInfo?: SeerrMediaInfo
}

export interface SeerrDiscoverResponse {
  pageInfo?: { pages: number; pageSize: number; results: number; page: number }
  results: SeerrDiscoverResult[]
}

interface SeerrGenreItem {
  id: number
  name: string
}

interface SeerrWatchProviderItem {
  displayPriority: number
  logoPath: string
  id: number
  name: string
}

export interface SeerrMediaSeasonStatus {
  seasonNumber: number
  status: number
}

export interface SeerrMovieDetailRaw {
  id: number
  title: string
  releaseDate?: string
  mediaInfo?: {
    id: number
    status: number
    requests?: { id: number; status: number }[]
  }
}

export interface SeerrTvDetailRaw {
  id: number
  name: string
  seasons: {
    id: number
    name: string
    seasonNumber: number
    episodeCount: number
    airDate?: string
  }[]
  mediaInfo?: {
    id: number
    status: number
    seasons?: SeerrMediaSeasonStatus[]
    requests?: { id: number; status: number; seasons?: { seasonNumber: number }[] }[]
  }
}

interface DiscoverFilterParams {
  language?: string
  genre?: string
  watchProviders?: string
  watchRegion?: string
  voteAverageGte?: string
  primaryReleaseDateGte?: string
  primaryReleaseDateLte?: string
}

export class SeerrClient extends ArrBaseClient {
  constructor(baseUrl: string, apiKey: string) {
    super(baseUrl, apiKey, 'v1')
  }

  // Seerr status endpoint is /api/v1/status (not /api/v1/system/status)
  async ping(): Promise<boolean> {
    try {
      await this.get<unknown>('status')
      return true
    } catch {
      return false
    }
  }

  getStatus(): Promise<SeerrStatus> {
    return this.get<SeerrStatus>('status')
  }

  getRequestCount(): Promise<SeerrRequestCount> {
    return this.get<SeerrRequestCount>('request/count')
  }

  getRequests(page = 1, filter?: string): Promise<SeerrRequestsResponse> {
    const params: Record<string, string> = { take: '20', skip: String((page - 1) * 20) }
    if (filter && filter !== 'all') params.filter = filter
    return this.get<SeerrRequestsResponse>('request', params)
  }

  approveRequest(id: number): Promise<SeerrRequestResult> {
    return this.post<SeerrRequestResult>(`request/${id}/approve`)
  }

  declineRequest(id: number): Promise<SeerrRequestResult> {
    return this.post<SeerrRequestResult>(`request/${id}/decline`)
  }

  deleteRequest(id: number): Promise<void> {
    return this.del(`request/${id}`)
  }

  getMovieDetails(tmdbId: number): Promise<{ title: string }> {
    return this.get<{ title: string }>(`movie/${tmdbId}`)
  }

  // Full movie detail with mediaInfo (status + request tracking)
  getMovieDetailFull(tmdbId: number): Promise<SeerrMovieDetailRaw> {
    return this.get<SeerrMovieDetailRaw>(`movie/${tmdbId}`)
  }

  // Kept for backward compatibility with request enrichment
  getTvDetails(tmdbId: number): Promise<{ name: string }> {
    return this.get<{ name: string }>(`tv/${tmdbId}`)
  }

  // Full TV detail with season list and per-season availability
  getTvDetailFull(tmdbId: number): Promise<SeerrTvDetailRaw> {
    return this.get<SeerrTvDetailRaw>(`tv/${tmdbId}`)
  }

  getGenres(mediaType: 'movie' | 'tv'): Promise<{ genres: SeerrGenreItem[] }> {
    return this.get<{ genres: SeerrGenreItem[] }>(`genres/${mediaType}`)
  }

  getWatchProviders(mediaType: 'movie' | 'tv'): Promise<{ results: SeerrWatchProviderItem[] }> {
    const endpoint = mediaType === 'movie' ? 'watchproviders/movies' : 'watchproviders/tv'
    return this.get<{ results: SeerrWatchProviderItem[] }>(endpoint, { watchRegion: 'DE' })
  }

  getDiscoverMovies(page = 1, sortBy = 'popularity.desc', filters?: DiscoverFilterParams): Promise<SeerrDiscoverResponse> {
    const params: Record<string, string> = { page: String(page), sortBy }
    if (filters) {
      if (filters.language) params.language = filters.language
      if (filters.genre) params.genre = filters.genre
      if (filters.watchProviders) params.watchProviders = filters.watchProviders
      if (filters.watchRegion) params.watchRegion = filters.watchRegion
      if (filters.voteAverageGte) params.voteAverageGte = filters.voteAverageGte
      if (filters.primaryReleaseDateGte) params.primaryReleaseDateGte = filters.primaryReleaseDateGte
      if (filters.primaryReleaseDateLte) params.primaryReleaseDateLte = filters.primaryReleaseDateLte
    }
    return this.get<SeerrDiscoverResponse>('discover/movies', params)
  }

  getDiscoverTv(page = 1, sortBy = 'popularity.desc', filters?: DiscoverFilterParams): Promise<SeerrDiscoverResponse> {
    const params: Record<string, string> = { page: String(page), sortBy }
    if (filters) {
      if (filters.language) params.language = filters.language
      if (filters.genre) params.genre = filters.genre
      if (filters.watchProviders) params.watchProviders = filters.watchProviders
      if (filters.watchRegion) params.watchRegion = filters.watchRegion
      if (filters.voteAverageGte) params.voteAverageGte = filters.voteAverageGte
      if (filters.primaryReleaseDateGte) params.primaryReleaseDateGte = filters.primaryReleaseDateGte
      if (filters.primaryReleaseDateLte) params.primaryReleaseDateLte = filters.primaryReleaseDateLte
    }
    return this.get<SeerrDiscoverResponse>('discover/tv', params)
  }

  getTrending(): Promise<SeerrDiscoverResponse> {
    return this.get<SeerrDiscoverResponse>('discover/trending')
  }

  search(query: string, language?: string, page = 1): Promise<SeerrDiscoverResponse> {
    const params: Record<string, string> = { query, page: String(page) }
    if (language) params.language = language
    return this.get<SeerrDiscoverResponse>('search', params)
  }

  requestMedia(mediaType: 'movie' | 'tv', mediaId: number, seasons?: number[]): Promise<unknown> {
    const body: Record<string, unknown> = { mediaType, mediaId }
    if (seasons && seasons.length > 0) {
      body.seasons = seasons
    }
    return this.post<unknown>('request', body)
  }
}
