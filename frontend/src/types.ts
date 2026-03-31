export interface Service {
  id: string
  group_id: string | null
  name: string
  url: string
  icon: string | null
  icon_url: string | null
  description: string | null
  tags: string[] // parsed from JSON string
  position_x: number
  check_enabled: boolean
  check_url: string | null
  check_interval: number
  last_status: 'online' | 'offline' | 'unknown' | null
  last_checked: string | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  name: string
  icon: string | null
  position: number
  created_at: string
  updated_at: string
}

export type ThemeMode = 'dark' | 'light'
export type ThemeAccent = 'cyan' | 'orange' | 'magenta'

export interface Settings {
  theme_mode: ThemeMode
  theme_accent: ThemeAccent
  dashboard_title: string
  auth_enabled: boolean
  auth_mode: 'none' | 'local' | 'oidc'
  auto_theme_enabled?: boolean
  auto_theme_light_start?: string  // HH:MM e.g. "08:00"
  auto_theme_dark_start?: string   // HH:MM e.g. "20:00"
  design_border_radius?: 'sharp' | 'default' | 'rounded'
  design_glass_blur?: 'subtle' | 'medium' | 'strong'
  design_density?: 'compact' | 'comfortable' | 'spacious'
  design_animations?: 'full' | 'reduced' | 'none'
  design_sidebar_style?: 'default' | 'minimal' | 'floating'
  design_custom_css?: string
  tmdb_api_key?: string
  recyclarr_container_name?: string
  recyclarr_config_path?: string
  // Localization
  language?: string              // i18next language code: 'de' | 'en' | …
  time_format?: '12h' | '24h'   // clock display in topbar
  temp_unit?: 'celsius' | 'fahrenheit'
}

export interface AuthUser {
  sub: string
  username: string
  role: 'admin' | 'user'
  groupId: string | null
}

export interface UserRecord {
  id: string
  username: string
  email: string | null
  first_name: string | null
  last_name: string | null
  user_group_id: string | null
  is_active: boolean
  last_login: string | null
  created_at: string
}

// ── Dashboard item types ──────────────────────────────────────────────────────
export interface DashboardServiceItem {
  id: string
  type: 'service'
  position: number
  ref_id: string
  group_id?: string | null
  service: Service
}

export interface DashboardArrItem {
  id: string
  type: 'arr_instance'
  position: number
  ref_id: string
  group_id?: string | null
  instance: {
    id: string
    type: string
    name: string
    url: string
    enabled: boolean
  }
}

export interface DashboardPlaceholderItem {
  id: string
  type: 'placeholder' | 'placeholder_app' | 'placeholder_widget' | 'placeholder_row'
  position: number
  group_id?: string | null
}

export interface ServerStatusConfig {
  disks: { path: string; name: string }[]
}

export interface AdGuardHomeConfig {
  url: string
  username: string
  // password intentionally omitted — never sent to frontend
}

export interface CustomButtonConfig {
  buttons: { id: string; label: string; url: string; method: 'GET' | 'POST' }[]
}

export interface HomeAssistantConfig {
  url: string
  entities: { entity_id: string; label: string }[]
  // token intentionally omitted — never sent to frontend
}

export interface PiholeConfig {
  url: string
  // password intentionally omitted — never sent to frontend
}

export interface HaEntityState {
  entity_id: string
  label: string
  state: string
  unit: string | null
  device_class: string | null
  friendly_name: string | null
}

export interface NginxPMConfig {
  url: string
  username: string
  // password intentionally omitted — never sent to frontend
}

export interface HomeAssistantEnergyConfig {
  instance_id: string
  period: 'day' | 'week' | 'month'
}

export interface CalendarWidgetConfig {
  instance_ids: string[]
  days_ahead: number
}

export interface CalendarEntry {
  id: string
  title: string
  type: 'movie' | 'episode'
  date: string        // YYYY-MM-DD
  instanceId: string
  instanceName: string
  instanceType: 'radarr' | 'sonarr'
  season_number?: number
  episode_number?: number
}

export interface EnergyData {
  configured: boolean
  period?: string
  grid_consumption?: number
  solar_production?: number
  battery_charge?: number
  grid_return?: number
  gas_consumption?: number
  self_sufficiency?: number
  chart_data?: {
    labels: string[]
    consumption: number[]
    solar: number[]
    battery: number[]
    grid_return: number[]
  }
  period_label?: string
  error?: string
}

export interface Widget {
  id: string
  type: 'server_status' | 'adguard_home' | 'docker_overview' | 'custom_button' | 'home_assistant' | 'pihole' | 'nginx_pm' | 'home_assistant_energy' | 'calendar'
  name: string
  config: ServerStatusConfig | AdGuardHomeConfig | CustomButtonConfig | HomeAssistantConfig | PiholeConfig | NginxPMConfig | CalendarWidgetConfig | Record<string, never>
  position: number
  show_in_topbar: boolean  // deprecated: use display_location
  display_location: 'topbar' | 'sidebar' | 'none'
  icon_url: string | null
  created_at: string
  updated_at: string
}

export interface ServerStats {
  cpu: { load: number }
  ram: { total: number; used: number; free: number }
  disks: { path: string; name: string; total: number; used: number; free: number; error?: 'not_mounted'; duplicate?: boolean; duplicateOf?: string }[]
}

export interface AdGuardStats {
  total_queries: number    // -1 = unreachable/error
  blocked_queries: number
  blocked_percent: number
  protection_enabled: boolean
}

export interface NpmStats {
  proxy_hosts: number
  streams: number
  certificates: number
  cert_expiring_soon: number  // expires within 30 days
}

export type WidgetStats = ServerStats | AdGuardStats | HaEntityState[] | NpmStats | CalendarEntry[]

export interface DashboardWidgetItem {
  id: string
  type: 'widget'
  position: number
  ref_id: string
  group_id?: string | null
  widget: Pick<Widget, 'id' | 'type' | 'name' | 'config' | 'show_in_topbar' | 'icon_url'>
}

export type DashboardItem = DashboardServiceItem | DashboardArrItem | DashboardPlaceholderItem | DashboardWidgetItem

export interface DashboardGroup {
  id: string
  name: string
  position: number
  col_span: number
  items: DashboardItem[]
}

export interface DashboardResponse {
  groups: DashboardGroup[]
  items: DashboardItem[]
}

export interface UserGroup {
  id: string
  name: string
  description: string | null
  is_system: boolean
  docker_access: boolean
  docker_widget_access: boolean
  background_id: string | null
  created_at: string
  hidden_service_ids: string[]
  hidden_arr_ids: string[]
  hidden_widget_ids: string[]
}

export interface Background {
  id: string
  name: string
  file_path: string
}

// ── Home Assistant ────────────────────────────────────────────────────────────

export interface HaInstance {
  id: string
  name: string
  url: string
  enabled: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface HaPanel {
  id: string
  instance_id: string
  entity_id: string
  label: string | null
  panel_type: string
  position: number
  owner_id: string
  area_id: string | null
  created_at: string
}

export interface HaArea {
  area_id: string
  name: string
  icon: string | null
}

export interface HaEntityFull {
  entity_id: string
  state: string
  attributes: {
    friendly_name?: string
    unit_of_measurement?: string
    device_class?: string
    icon?: string
    // Light
    brightness?: number
    color_temp?: number
    min_color_temp_kelvin?: number
    max_color_temp_kelvin?: number
    // Climate
    temperature?: number
    current_temperature?: number
    hvac_mode?: string
    hvac_modes?: string[]
    min_temp?: number
    max_temp?: number
    // Media player
    media_title?: string
    media_artist?: string
    entity_picture?: string
    volume_level?: number
    source?: string
    source_list?: string[]
    // Cover
    current_position?: number
    [key: string]: unknown
  }
  last_changed: string
  last_updated: string
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  state: string   // 'running' | 'exited' | 'paused' | 'restarting' | 'dead' | 'created'
  status: string  // human-readable e.g. "Up 3 days"
  startedAt: string | null
}

export interface ContainerStats {
  cpuPercent: number
  memUsed: number   // bytes
  memTotal: number  // bytes
}

export interface DockerLogEvent {
  stream: 'stdout' | 'stderr'
  log: string
  timestamp: string
}

export interface HaPersonEnriched {
  entity_id: string
  name: string
  state: string
  latitude: number | null
  longitude: number | null
  last_updated: string
  source: string | null
  battery_level: number | null
  tracker_last_updated: string | null
}

// ── HA Floorplan ──────────────────────────────────────────────────────────────

export interface HaFloorplan {
  id: string
  instance_id: string
  name: string
  type: 'indoor' | 'outdoor'
  level: number
  icon: string
  orientation: 'landscape' | 'portrait'
  image_path: string | null
  image_url: string | null
  entity_count: number
  created_at: string
}

export interface HaFloorplanEntity {
  id: string
  floorplan_id: string
  entity_id: string
  pos_x: number
  pos_y: number
  display_size: 'small' | 'medium' | 'large'
  show_label: boolean
  created_at: string
}

export type FloorplanAction =
  | { type: 'place'; entity: HaFloorplanEntity }
  | { type: 'move'; entityId: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | { type: 'remove'; entity: HaFloorplanEntity }
  | { type: 'resize'; entityId: string; from: string; to: string }

// ── HA Alerts ─────────────────────────────────────────────────────────────────

export interface HaAlert {
  id: string
  instance_id: string
  entity_id: string
  condition_type: 'state_equals' | 'state_above' | 'state_below' | 'state_changes'
  condition_value: string | null
  message: string
  enabled: boolean
  last_triggered_at: string | null
  created_at: string
}

export interface HaHistoryEntry {
  state: string
  last_changed: string
}

// ── Network Monitor ───────────────────────────────────────────────────────────

export interface NetworkDevice {
  id: string
  name: string
  ip: string
  mac: string | null
  wol_enabled: boolean
  wol_broadcast: string | null
  check_port: number | null
  subnet: string | null
  group_name: string | null
  icon: string
  last_status: string | null
  last_checked: string | null
  created_at: string
}

export interface NetworkDeviceHistory {
  status: string
  checked_at: string
}

export interface ScanResult {
  ip: string
  latency: number
  open_ports: number[]
}

// ── Backup Center ─────────────────────────────────────────────────────────────

export interface BackupSource {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  enabled: boolean
  last_checked_at: string | null
  last_status: string | null
  created_at: string
}

export interface BackupStatusResult {
  id: string
  name: string
  type: string
  lastRun: string | null
  success: boolean | null
  size: string | null
  error: string | null
}

// ── Resource History ──────────────────────────────────────────────────────────

export interface ResourceSnapshot {
  recorded_at: string
  resolution: string
  cpu_percent: number
  ram_percent: number
  ram_used_gb: number
  net_rx_mbps: number
  net_tx_mbps: number
}

// ── Changelog ─────────────────────────────────────────────────────────────────

export interface ChangelogRelease {
  tag_name: string
  name: string
  body: string
  published_at: string
}
