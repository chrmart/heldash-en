export interface TmdbResult {
  id: number
  media_type?: 'movie' | 'tv' | 'person'
  title?: string
  name?: string
  poster_path?: string | null
  backdrop_path?: string | null
  overview?: string
  release_date?: string
  first_air_date?: string
  vote_average: number
  vote_count: number
  genre_ids: number[]
  popularity: number
}

export interface TmdbPage {
  page: number
  total_pages: number
  total_results: number
  results: TmdbResult[]
}

export interface TmdbGenre {
  id: number
  name: string
}

export interface TmdbProvider {
  provider_id: number
  provider_name: string
  logo_path: string
}

export interface TmdbTvDetail {
  id: number
  name: string
  seasons: TmdbSeason[]
}

export interface TmdbSeason {
  season_number: number
  episode_count: number
  air_date: string | null
  poster_path: string | null
  name: string
}

export interface TmdbDiscoverFilters {
  language?: string
  genreIds?: number[]
  watchProviderIds?: number[]
  voteAverageGte?: number
  releaseYearFrom?: string
  releaseYearTo?: string
}

export interface TmdbFilters extends TmdbDiscoverFilters {
  mediaType: 'all' | 'movie' | 'tv'
  sortBy: string
}
