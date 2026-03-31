import { create } from 'zustand'
import { api } from '../api'
import type { TmdbPage, TmdbGenre, TmdbProvider, TmdbTvDetail, TmdbDiscoverFilters } from '../types/tmdb'

interface TmdbState {
  trending: TmdbPage | null
  discoverMovies: TmdbPage | null
  discoverTv: TmdbPage | null
  searchResults: TmdbPage | null
  genres: { movie: TmdbGenre[]; tv: TmdbGenre[] } | null
  watchProviders: { movie: TmdbProvider[]; tv: TmdbProvider[] } | null
  tvDetail: Record<number, TmdbTvDetail>
  loading: boolean

  loadTrending: (mediaType?: string, timeWindow?: string) => Promise<void>
  loadDiscoverMovies: (page?: number, sortBy?: string, filters?: TmdbDiscoverFilters, append?: boolean) => Promise<void>
  loadDiscoverTv: (page?: number, sortBy?: string, filters?: TmdbDiscoverFilters, append?: boolean) => Promise<void>
  search: (query: string, page?: number, language?: string, append?: boolean) => Promise<void>
  loadGenres: () => Promise<void>
  loadWatchProviders: () => Promise<void>
  loadTvDetail: (tmdbId: number) => Promise<void>
  clearSearch: () => void
}

export const useTmdbStore = create<TmdbState>((set, get) => ({
  trending: null,
  discoverMovies: null,
  discoverTv: null,
  searchResults: null,
  genres: null,
  watchProviders: null,
  tvDetail: {},
  loading: false,

  loadTrending: async (mediaType = 'all', timeWindow = 'day') => {
    try {
      const data = await api.tmdb.trending(mediaType, timeWindow)
      set({ trending: data })
    } catch { /* keep previous state */ }
  },

  loadDiscoverMovies: async (page = 1, sortBy = 'popularity.desc', filters, append = false) => {
    try {
      const data = await api.tmdb.discoverMovies(page, sortBy, filters)
      set(state => {
        const prev = state.discoverMovies
        const results = append && prev ? [...prev.results, ...data.results] : data.results
        return { discoverMovies: { ...data, results } }
      })
    } catch { /* keep previous state */ }
  },

  loadDiscoverTv: async (page = 1, sortBy = 'popularity.desc', filters, append = false) => {
    try {
      const data = await api.tmdb.discoverTv(page, sortBy, filters)
      set(state => {
        const prev = state.discoverTv
        const results = append && prev ? [...prev.results, ...data.results] : data.results
        return { discoverTv: { ...data, results } }
      })
    } catch { /* keep previous state */ }
  },

  search: async (query, page = 1, language, append = false) => {
    const data = await api.tmdb.search(query, page, language)
    set(state => {
      const prev = state.searchResults
      const results = append && prev ? [...prev.results, ...data.results] : data.results
      return { searchResults: { ...data, results } }
    })
  },

  clearSearch: () => set({ searchResults: null }),

  loadGenres: async () => {
    if (get().genres) return  // already loaded (backend caches 24h anyway)
    try {
      const [movieRes, tvRes] = await Promise.all([
        api.tmdb.genres('movie'),
        api.tmdb.genres('tv'),
      ])
      set({ genres: { movie: movieRes.genres, tv: tvRes.genres } })
    } catch { /* keep previous state */ }
  },

  loadWatchProviders: async () => {
    if (get().watchProviders) return
    try {
      const [movieRes, tvRes] = await Promise.all([
        api.tmdb.watchProviders('movie'),
        api.tmdb.watchProviders('tv'),
      ])
      set({ watchProviders: { movie: movieRes.results, tv: tvRes.results } })
    } catch { /* keep previous state */ }
  },

  loadTvDetail: async (tmdbId) => {
    if (get().tvDetail[tmdbId]) return
    try {
      const data = await api.tmdb.tvDetail(tmdbId)
      set(state => ({ tvDetail: { ...state.tvDetail, [tmdbId]: data } }))
    } catch { /* keep previous state */ }
  },
}))
