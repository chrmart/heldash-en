export interface UnraidInstance {
  id: string; name: string; url: string
  enabled: boolean; position: number
  created_at: string; updated_at: string
}
export interface UnraidOs { platform?: string; distro?: string; release?: string; uptime?: string; hostname?: string; arch?: string }
export interface UnraidCpu { manufacturer?: string; brand?: string; cores?: number; threads?: number }
export interface UnraidBaseboard { manufacturer?: string; model?: string; version?: string }
export interface UnraidMemoryLayout { size?: number; type?: string; clockSpeed?: number; manufacturer?: string; formFactor?: string; partNum?: string }
export interface UnraidMetricsMemory { used?: number; total?: number; percentTotal?: number; swapTotal?: number; swapUsed?: number; swapFree?: number; percentSwapTotal?: number }
export interface UnraidMetricsCpu { percentTotal?: number; cpus?: { percentTotal?: number }[] }
export interface UnraidMetrics { memory?: UnraidMetricsMemory; cpu?: UnraidMetricsCpu }
export interface UnraidInfo {
  info?: {
    id?: string; time?: string
    os?: UnraidOs; cpu?: UnraidCpu; baseboard?: UnraidBaseboard
    memory?: { layout?: UnraidMemoryLayout[] }
    system?: { manufacturer?: string; model?: string; virtual?: boolean }
    versions?: { core?: { unraid?: string; api?: string; kernel?: string }; packages?: { docker?: string } }
  }
  metrics?: UnraidMetrics
  vars?: { version?: string; name?: string }
  online?: boolean
}
export interface UnraidDisk {
  id?: string; idx?: number; name?: string; device?: string; size?: number
  status?: string; temp?: number | null; rotational?: boolean
  fsSize?: number; fsFree?: number; fsUsed?: number
  fsUsedPercent?: number | null
  type?: string; isSpinning?: boolean | null; color?: string
}
export interface UnraidCapacity { kilobytes?: { free?: string; used?: string; total?: string } }
export interface UnraidParityCheckStatus {
  status?: string; running?: boolean; paused?: boolean; correcting?: boolean
  progress?: number; errors?: number; speed?: string; date?: string; duration?: number
}
export interface UnraidArray {
  array?: {
    state?: string
    capacity?: UnraidCapacity
    parityCheckStatus?: UnraidParityCheckStatus
    parities?: UnraidDisk[]
    disks?: UnraidDisk[]
    caches?: UnraidDisk[]
  }
}
export interface UnraidParityHistory {
  date?: string; duration?: number; speed?: string; status?: string; errors?: number
  progress?: number; correcting?: boolean; paused?: boolean; running?: boolean
}
export interface UnraidContainerPort { privatePort?: number; publicPort?: number; type?: string; ip?: string }
export interface UnraidContainer {
  id?: string; names?: string[]; state?: string; status?: string
  image?: string; autoStart?: boolean
  hostConfig?: { networkMode?: string }
  ports?: UnraidContainerPort[]
}
export interface UnraidVm {
  id?: string; name?: string; state?: string
}
export interface UnraidShare {
  id?: string; name?: string; comment?: string
  free?: number; used?: number; size?: number
  cache?: string; luksStatus?: string; color?: string
  include?: string[]; exclude?: string[]
}
export interface UnraidUser { name?: string; description?: string; role?: string }
export interface UnraidNotification {
  id?: string; title?: string; subject?: string; description?: string
  importance?: string; link?: string; type?: string
  timestamp?: string; formattedTimestamp?: string
}
export interface UnraidPhysicalDisk {
  id?: string; name?: string; vendor?: string; device?: string; type?: string
  size?: number; serialNum?: string; interfaceType?: string
  smartStatus?: string; temperature?: number | null; isSpinning?: boolean
  partitions?: { name?: string; fsType?: string; size?: number }[]
}
export interface UnraidNotificationCount { info?: number; warning?: number; alert?: number; total?: number }
export interface UnraidNotifications {
  notifications?: {
    overview?: {
      unread?:  UnraidNotificationCount
      archive?: UnraidNotificationCount
    }
    list?: UnraidNotification[]
    archive?: UnraidNotification[]
  }
}
export interface UnraidConfig {
  config?: { valid?: boolean; error?: string; registrationTo?: string; registrationType?: string }
}
export interface UnraidRegistration {
  registration?: { id?: string; type?: string; state?: string; expiration?: string }
  vars?: { version?: string; name?: string; regTo?: string }
}
