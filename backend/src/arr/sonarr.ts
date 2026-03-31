import { ArrBaseClient } from './base-client'

export interface SonarrStatusRow {
  version: string
  instanceName?: string
  isProduction: boolean
}

export interface SonarrSeriesRow {
  id: number
  title: string
  monitored: boolean
  statistics: {
    episodeFileCount: number
    totalEpisodeCount: number
    sizeOnDisk: number
  }
  images?: { coverType: string; remoteUrl: string }[]
}

export interface SonarrQueueItem {
  id: number
  title: string
  status: string
  trackedDownloadStatus: string
  size: number
  sizeleft: number
  protocol: string
  downloadClient?: string
  episode?: { title: string; seasonNumber: number; episodeNumber: number }
}

export interface SonarrQueueResponse {
  totalRecords: number
  records: SonarrQueueItem[]
}

export interface SonarrCalendarItem {
  id: number
  title: string
  seasonNumber: number
  episodeNumber: number
  airDateUtc?: string
  hasFile: boolean
  monitored: boolean
  series: { title: string; id: number }
}

export interface SonarrHealthItem {
  source: string
  type: string   // 'ok' | 'notice' | 'warning' | 'error'
  message: string
  wikiUrl?: string
}

export interface SonarrDiskSpace {
  path: string
  label: string
  freeSpace: number
  totalSpace: number
}

export interface SonarrWantedResponse {
  totalRecords: number
  records: SonarrCalendarItem[]
}

export interface ArrCustomFormat {
  id: number
  name: string
  specifications: object[]
}

export interface ArrQualityProfile {
  id: number
  name: string
  formatItems: { format: number; score: number; name: string }[]
}

export class SonarrClient extends ArrBaseClient {
  constructor(url: string, apiKey: string) {
    super(url, apiKey, 'v3')
  }

  getSeries() {
    return this.get<SonarrSeriesRow[]>('series')
  }

  getQueue() {
    return this.get<SonarrQueueResponse>('queue', { pageSize: '50', sortKey: 'timeleft', sortDir: 'asc' })
  }

  getCalendar(start: string, end: string) {
    return this.get<SonarrCalendarItem[]>('calendar', { start, end, unmonitored: 'false', includeSeries: 'true' })
  }

  getHealth() {
    return this.get<SonarrHealthItem[]>('health')
  }

  getDiskSpace() {
    return this.get<SonarrDiskSpace[]>('diskspace')
  }

  getWantedMissing() {
    return this.get<SonarrWantedResponse>('wanted/missing', { pageSize: '1', monitored: 'true' })
  }

  getCustomFormats() {
    return this.get<ArrCustomFormat[]>('customformat')
  }

  createCustomFormat(cf: { name: string; specifications: object[] }) {
    return this.post<ArrCustomFormat>('customformat', cf)
  }

  updateCustomFormat(id: number, cf: { name: string; specifications: object[] }) {
    return this.put<ArrCustomFormat>(`customformat/${id}`, cf)
  }

  deleteCustomFormat(id: number) {
    return this.del(`customformat/${id}`)
  }

  getQualityProfiles() {
    return this.get<ArrQualityProfile[]>('qualityprofile')
  }

  updateQualityProfile(id: number, profile: ArrQualityProfile) {
    return this.put<ArrQualityProfile>(`qualityprofile/${id}`, profile)
  }

}
