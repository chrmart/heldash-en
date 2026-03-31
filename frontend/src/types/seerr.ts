export interface SeerrGenre {
  id: number
  name: string
}

export interface SeerrWatchProvider {
  id: number
  name: string
  logoPath: string
}

export interface SeerrSeason {
  id: number
  name: string
  seasonNumber: number
  episodeCount: number
  airDate?: string
}

export interface SeerrMediaSeasonStatus {
  seasonNumber: number
  status: number  // 1=unknown, 2=pending, 3=processing, 4=partial, 5=available
}

export interface SeerrMovieDetail {
  id: number
  title: string
  releaseDate?: string
  mediaInfo?: {
    id: number
    status: number  // 1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE
    requests?: { id: number; status: number }[]
  }
}

export interface SeerrTvDetail {
  id: number
  name: string
  seasons: SeerrSeason[]
  mediaInfo?: {
    id: number
    status: number
    seasons?: SeerrMediaSeasonStatus[]
    requests?: {
      id: number
      status: number
      seasons?: { seasonNumber: number }[]
    }[]
  }
}

export interface SeerrSearchResult {
  id: number
  mediaType: 'movie' | 'tv'
  title?: string
  name?: string
  originalTitle?: string
  posterPath?: string
  backdropPath?: string
  releaseDate?: string
  firstAirDate?: string
  voteAverage?: number
  overview?: string
  genreIds?: number[]
  mediaInfo?: {
    id: number
    mediaType: 'movie' | 'tv'
    tmdbId: number
    status: number
    seasons?: SeerrMediaSeasonStatus[]
    requests?: {
      id: number
      status: number
      seasons?: { seasonNumber: number }[]
    }[]
  }
}

export interface SeerrDiscoverResponse {
  pageInfo?: { pages: number; pageSize: number; results: number; page: number }
  results: SeerrSearchResult[]
}

export interface DiscoverServerFilters {
  language?: string
  genreIds?: number[]
  watchProviderIds?: number[]
  voteAverageGte?: number
  releaseYearFrom?: string
  releaseYearTo?: string
}

export interface DiscoverFilters extends DiscoverServerFilters {
  mediaType: 'all' | 'movie' | 'tv'
  sortBy: string
}
