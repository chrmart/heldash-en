import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useConfirm } from '../components/ConfirmDialog'
import { useTmdbStore } from '../store/useTmdbStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { useRecyclarrStore } from '../store/useRecyclarrStore'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, Trash2, Check, X, RefreshCw, GripVertical, LayoutGrid, CalendarDays, Search, Compass, Database, AlertTriangle, Sliders, Plus, ChevronDown, ChevronRight, Clock, Shield, Download, Copy, Upload, BookOpen } from 'lucide-react'
import type { ArrInstance, ArrCalendarItem, RadarrCalendarItem, SonarrCalendarItem, ProwlarrStats, ArrCFSpecification, ArrCustomFormat, ArrCFSchema, ArrCFSchemaField, RadarrMovie, SonarrSeries } from '../types/arr'
import type { UserCfFile, UserCfSpecification } from '../types/recyclarr'
import type { TmdbResult, TmdbFilters, TmdbDiscoverFilters } from '../types/tmdb'
import { ArrCardContent, SabnzbdCardContent, SeerrCardContent } from '../components/MediaCard'
import { LS_RECYCLARR_GROUPS_COLLAPSED } from '../constants'
// ── Tab type ──────────────────────────────────────────────────────────────────

type MediaTab = 'instances' | 'library' | 'calendar' | 'indexers' | 'discover' | 'recyclarr' | 'cf-manager'

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: MediaTab; onChange: (t: MediaTab) => void }) {
  const tabs: { id: MediaTab; label: string; icon: React.ReactNode }[] = [
    { id: 'instances',  label: 'Instances',  icon: <LayoutGrid size={13} /> },
    { id: 'library',    label: 'Library',    icon: <Database size={13} /> },
    { id: 'calendar',   label: 'Calendar',   icon: <CalendarDays size={13} /> },
    { id: 'indexers',   label: 'Indexers',   icon: <Search size={13} /> },
    { id: 'discover' as MediaTab, label: 'Discover', icon: <Compass size={13} /> },
    { id: 'recyclarr' as MediaTab, label: 'Recyclarr', icon: <Sliders size={13} /> },
    { id: 'cf-manager' as MediaTab, label: 'CF-Manager', icon: <Shield size={13} /> },
  ]
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13, fontWeight: active === t.id ? 600 : 400,
            background: active === t.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
            color: active === t.id ? 'var(--accent)' : 'var(--text-secondary)',
            border: active === t.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Sortable card wrapper ─────────────────────────────────────────────────────

function SortableInstanceCard({
  instance,
  isAdmin,
  isEditing,
  onEdit,
  onDelete,
}: {
  instance: ArrInstance
  isAdmin: boolean
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.id })
  const [hovered, setHovered] = useState(false)

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <div
        className="glass"
        style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {isAdmin && (
          <div
            {...attributes}
            {...listeners}
            style={{
              position: 'absolute', top: 12, left: 12, cursor: 'grab', padding: 4,
              opacity: hovered ? 0.5 : 0, transition: 'opacity 150ms ease', color: 'var(--text-muted)', zIndex: 1,
            }}
          >
            <GripVertical size={14} />
          </div>
        )}

        <div style={{ paddingLeft: isAdmin ? 16 : 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {instance.type === 'sabnzbd'
            ? <SabnzbdCardContent instance={instance} />
            : instance.type === 'seerr'
              ? <SeerrCardContent instance={instance} />
              : <ArrCardContent instance={instance} />
          }
        </div>

        {isAdmin && !isEditing && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 4,
            opacity: hovered ? 1 : 0, transition: 'opacity 150ms ease',
          }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} style={{ width: 26, height: 26, padding: 4 }}>
              <Pencil size={11} />
            </button>
            <button className="btn btn-danger btn-icon btn-sm" onClick={onDelete} style={{ width: 26, height: 26, padding: 4 }}>
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Instance edit form ────────────────────────────────────────────────────────

function InstanceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ArrInstance> & { api_key?: string }
  onSave: (data: { type: string; name: string; url: string; api_key: string; showOnDashboard: boolean }) => Promise<void>
  onCancel: () => void
}) {
  const { isOnDashboard } = useDashboardStore()
  const [type, setType] = useState(initial?.type ?? 'radarr')
  const [name, setName] = useState(initial?.name ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [showOnDashboard, setShowOnDashboard] = useState(
    initial?.id ? isOnDashboard('arr_instance', initial.id) : false
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (!name.trim()) return setError('Name required')
    if (!url.trim()) return setError('URL required')
    if (!apiKey.trim() && !initial?.id) return setError('API Key required')
    setSaving(true)
    try {
      await onSave({ type, name: name.trim(), url: url.trim(), api_key: apiKey.trim(), showOnDashboard })
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass" style={{ padding: 16, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="form-input" value={type} onChange={e => setType(e.target.value)} style={{ fontSize: 13, padding: '5px 8px', flexShrink: 0 }} disabled={!!initial?.id}>
          <option value="radarr">Radarr</option>
          <option value="sonarr">Sonarr</option>
          <option value="prowlarr">Prowlarr</option>
          <option value="sabnzbd">SABnzbd</option>
          <option value="seerr">Seerr</option>
        </select>
        <input className="form-input" placeholder="Name *" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
      </div>
      <input className="form-input" placeholder="URL (e.g. http://192.168.1.100:7878) *" value={url} onChange={e => setUrl(e.target.value)} />
      <input className="form-input" type="password" placeholder={initial?.id ? 'API Key (leave empty to keep)' : 'API Key *'} value={apiKey} onChange={e => setApiKey(e.target.value)} />
      <label className="form-toggle">
        <input type="checkbox" checked={showOnDashboard} onChange={e => setShowOnDashboard(e.target.checked)} />
        <span className="form-label" style={{ margin: 0, fontSize: 13 }}>Show on Dashboard</span>
      </label>
      {error && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ fontSize: 12, gap: 4 }}>
          <Check size={12} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ fontSize: 12, gap: 4 }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

// ── Instances tab ─────────────────────────────────────────────────────────────

function InstancesTab({ showAddForm: showFromParent, onFormClose }: { showAddForm?: boolean; onFormClose?: () => void }) {
  const { isAdmin } = useStore()
  const { instances, loadInstances, loadAllStats, loadSabQueue, createInstance, updateInstance, deleteInstance, reorderInstances } = useArrStore()
  const { addArrInstance, removeByRef, isOnDashboard, getDashboardItemId, removeItem } = useDashboardStore()
  const { confirm: confirmDlg } = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (showFromParent) {
      setShowAddForm(true)
      onFormClose?.()
    }
  }, [showFromParent])

  useEffect(() => {
    loadInstances().then(() => loadAllStats()).catch(() => {})
  }, [])

  const sabIds = instances.filter(i => i.type === 'sabnzbd' && i.enabled).map(i => i.id).join(',')

  useEffect(() => {
    if (!sabIds) return
    const ids = sabIds.split(',')
    ids.forEach(id => loadSabQueue(id).catch(() => {}))
    const interval = setInterval(() => ids.forEach(id => loadSabQueue(id).catch(() => {})), 2000)
    return () => clearInterval(interval)
  }, [sabIds])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const sorted = [...instances].sort((a, b) => a.position - b.position)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sorted.findIndex(i => i.id === active.id)
    const newIndex = sorted.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(sorted, oldIndex, newIndex)
    reorderInstances(reordered.map(i => i.id))
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadAllStats().catch(() => {})
    setRefreshing(false)
  }

  const handleCreate = async (data: { type: string; name: string; url: string; api_key: string; showOnDashboard: boolean }) => {
    const newId = await createInstance({ type: data.type, name: data.name, url: data.url, api_key: data.api_key, position: instances.length })
    if (data.showOnDashboard) await addArrInstance(newId).catch(() => {})
    setShowAddForm(false)
    await loadAllStats()
  }

  const handleUpdate = async (id: string, data: { type: string; name: string; url: string; api_key: string; showOnDashboard: boolean }) => {
    await updateInstance(id, { name: data.name, url: data.url, ...(data.api_key ? { api_key: data.api_key } : {}) })
    const wasOnDashboard = isOnDashboard('arr_instance', id)
    if (data.showOnDashboard && !wasOnDashboard) {
      await addArrInstance(id).catch(() => {})
    } else if (!data.showOnDashboard && wasOnDashboard) {
      const itemId = getDashboardItemId('arr_instance', id)
      if (itemId) await removeItem(itemId).catch(() => {})
      else await removeByRef('arr_instance', id).catch(() => {})
    }
    setEditingId(null)
  }

  const handleDeleteInstance = async (name: string, id: string) => {
    const ok = await confirmDlg({ title: `Delete "${name}"?`, danger: true, confirmLabel: 'Delete' })
    if (ok) deleteInstance(id)
  }

  if (instances.length === 0 && !isAdmin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No media instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Instances</h3>
        <button className="btn btn-ghost btn-icon" data-tooltip="Refresh stats" onClick={handleRefresh} disabled={refreshing}>
          {refreshing
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : <RefreshCw size={16} />
          }
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map(i => i.id)} strategy={rectSortingStrategy}>
          <div className="card-grid" style={{ gap: 14 }}>
            {sorted.map(inst => (
              editingId === inst.id
                ? (
                  <InstanceForm
                    key={inst.id}
                    initial={inst}
                    onSave={(data) => handleUpdate(inst.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                )
                : (
                  <SortableInstanceCard
                    key={inst.id}
                    instance={inst}
                    isAdmin={isAdmin}
                    isEditing={editingId === inst.id}
                    onEdit={() => setEditingId(inst.id)}
                    onDelete={() => handleDeleteInstance(inst.name, inst.id)}
                  />
                )
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {isAdmin && showAddForm && (
        <InstanceForm onSave={handleCreate} onCancel={() => setShowAddForm(false)} />
      )}
    </div>
  )
}

// ── Calendar tab ──────────────────────────────────────────────────────────────

type CalendarView = 'day' | 'week' | 'month' | 'list' | 'grid'

function CalendarTab() {
  const { t } = useTranslation()
  const { settings } = useStore()
  const locale = settings?.language ?? 'de'
  const { instances, calendars, loadCalendar } = useArrStore()
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<CalendarView>('week')
  const [filterInstanceId, setFilterInstanceId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [loadedUntil, setLoadedUntil] = useState(new Date())

  const radarrSonarrInstances = instances.filter(i => (i.type === 'radarr' || i.type === 'sonarr') && i.enabled)

  // Initial load
  useEffect(() => {
    if (radarrSonarrInstances.length === 0) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(radarrSonarrInstances.map(i => loadCalendar(i.id)))
      setLoading(false)
      setLoadedUntil(new Date(Date.now() + 365 * 86400000)) // Assume ~1 year of data loaded
    }
    loadAll()
  }, [radarrSonarrInstances.map(i => i.id).join(',')])

  // Reload if navigating beyond loaded data
  useEffect(() => {
    if (radarrSonarrInstances.length === 0 || selectedDate <= loadedUntil) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(radarrSonarrInstances.map(i => loadCalendar(i.id)))
      setLoading(false)
      setLoadedUntil(new Date(Date.now() + 365 * 86400000))
    }
    const timer = setTimeout(loadAll, 300) // Debounce rapid navigation
    return () => clearTimeout(timer)
  }, [selectedDate, radarrSonarrInstances.map(i => i.id).join('')])

  // Helper: format date as "Mo, 07.03.2026"
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Helper: short date for calendar items "Mo, 07.03"
  const formatShortDate = (date: Date): string => {
    return date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })
  }

  // Helper: get date range for a given view
  const getDateRange = (): { start: Date; end: Date; label: string } => {
    const d = new Date(selectedDate)
    d.setHours(0, 0, 0, 0)

    if (view === 'day') {
      return {
        start: d,
        end: new Date(d.getTime() + 86400000),
        label: formatDate(d),
      }
    } else if (view === 'week') {
      const start = new Date(d)
      // Start at Monday (1 = Monday, 0 = Sunday)
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1)
      start.setDate(diff)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return {
        start,
        end,
        label: `${formatDate(start)} — ${formatDate(end)}`,
      }
    } else {
      // month view
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      return {
        start,
        end,
        label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      }
    }
  }

  const dateRange = getDateRange()

  // Navigation handlers
  const goToday = () => setSelectedDate(new Date())
  const goPrev = () => {
    const d = new Date(selectedDate)
    if (view === 'day') d.setDate(d.getDate() - 1)
    else if (view === 'week') d.setDate(d.getDate() - 7)
    else d.setMonth(d.getMonth() - 1)
    setSelectedDate(d)
  }
  const goNext = () => {
    const d = new Date(selectedDate)
    if (view === 'day') d.setDate(d.getDate() + 1)
    else if (view === 'week') d.setDate(d.getDate() + 7)
    else d.setMonth(d.getMonth() + 1)
    setSelectedDate(d)
  }

  // Build unified calendar: group events by date
  const events: Array<{ date: string; items: Array<{ title: string; type: 'movie' | 'episode'; instanceId: string; instanceName: string; hasFile: boolean }> }> = []

  radarrSonarrInstances.forEach(inst => {
    const items = calendars[inst.id] ?? []
    items.forEach(item => {
      let dateStr: string | undefined
      let type: 'movie' | 'episode'
      let title: string

      if (inst.type === 'radarr') {
        const radarrItem = item as RadarrCalendarItem
        dateStr = radarrItem.inCinemas || radarrItem.digitalRelease
        type = 'movie'
        title = radarrItem.title
      } else {
        const sonarrItem = item as SonarrCalendarItem
        dateStr = sonarrItem.airDateUtc?.split('T')[0]
        type = 'episode'
        title = `${sonarrItem.series.title} S${String(sonarrItem.seasonNumber).padStart(2, '0')}E${String(sonarrItem.episodeNumber).padStart(2, '0')}`
      }

      if (!dateStr) return

      let event = events.find(e => e.date === dateStr)
      if (!event) {
        event = { date: dateStr, items: [] }
        events.push(event)
      }
      event.items.push({
        title,
        type,
        instanceId: inst.id,
        instanceName: inst.name,
        hasFile: 'hasFile' in item ? item.hasFile : false,
      })
    })
  })

  events.sort((a, b) => a.date.localeCompare(b.date))

  // Filter by date range and instance (use string comparison for date accuracy)
  const startStr = dateRange.start.getFullYear() + '-' + String(dateRange.start.getMonth() + 1).padStart(2, '0') + '-' + String(dateRange.start.getDate()).padStart(2, '0')
  const endStr = dateRange.end.getFullYear() + '-' + String(dateRange.end.getMonth() + 1).padStart(2, '0') + '-' + String(dateRange.end.getDate()).padStart(2, '0')

  const dateFilteredEvents = events.filter(e => {
    return e.date >= startStr && e.date < endStr
  })

  const filteredEvents = filterInstanceId
    ? dateFilteredEvents.map(e => ({
        ...e,
        items: e.items.filter(i => i.instanceId === filterInstanceId),
      })).filter(e => e.items.length > 0)
    : dateFilteredEvents

  if (radarrSonarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Radarr/Sonarr instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* View selector */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {(['day', 'week', 'month', 'list', 'grid'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: view === v ? 600 : 400,
                background: view === v ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: view === v ? 'var(--accent)' : 'var(--text-secondary)',
                border: view === v ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                textTransform: 'capitalize',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {v === 'day' && '📅'}
              {v === 'week' && '📆'}
              {v === 'month' && '🗓'}
              {v === 'list' && '☰'}
              {v === 'grid' && '▦'}
              {' '}{v}
            </button>
          ))}
        </div>

        {/* Date navigation (hidden for list/grid views) */}
        {(['day', 'week', 'month'] as const).includes(view) && (
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2, alignItems: 'center' }}>
            <button
              onClick={goPrev}
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              ←
            </button>
            <button
              onClick={goToday}
              style={{
                padding: '7px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Today
            </button>
            <button
              onClick={goNext}
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              →
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid rgba(var(--accent-rgb), 0.2)' }}>
              {dateRange.label}
            </div>
          </div>
        )}

        {/* Instance filter */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          <button
            onClick={() => setFilterInstanceId(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13, fontWeight: !filterInstanceId ? 600 : 400,
              background: !filterInstanceId ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
              color: !filterInstanceId ? 'var(--accent)' : 'var(--text-secondary)',
              border: !filterInstanceId ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              fontFamily: 'var(--font-sans)',
            }}
          >
            All
          </button>
          {radarrSonarrInstances.map(inst => (
            <button
              key={inst.id}
              onClick={() => setFilterInstanceId(inst.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: filterInstanceId === inst.id ? 600 : 400,
                background: filterInstanceId === inst.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: filterInstanceId === inst.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: filterInstanceId === inst.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{ fontSize: 12 }}>{inst.type === 'radarr' ? '🎬' : '📺'}</span>
              {inst.name}
            </button>
          ))}
        </div>

        {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
      </div>

      {/* Content - scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          </div>
        )}
        {filteredEvents.length === 0 && !loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No releases scheduled for this period.</p>
          </div>
        )}

        {(['list'] as const).includes(view) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredEvents.map(event => (
              <div key={event.date} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                  {formatDate(new Date(event.date))}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {event.items.map((item, idx) => (
                    <div key={`${event.date}-${idx}`} className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 18 }}>
                        {item.type === 'movie' ? '🎬' : '📺'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {item.instanceName}
                        </div>
                      </div>
                      {item.hasFile && (
                        <div style={{ fontSize: 11, background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                          ✓ Got it
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {(['grid'] as const).includes(view) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {filteredEvents.flatMap(event =>
              event.items.map((item, idx) => (
                <div
                  key={`${event.date}-${idx}`}
                  className="glass"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 16 }}>
                      {item.type === 'movie' ? '🎬' : '📺'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {formatShortDate(new Date(event.date))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {item.instanceName}
                    </div>
                  </div>
                  {item.hasFile && (
                    <div style={{ fontSize: 11, background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      ✓ Downloaded
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {(['day', 'week', 'month'] as const).includes(view) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredEvents.map(event => (
              <div key={event.date} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                  {formatDate(new Date(event.date))}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {event.items.map((item, idx) => (
                    <div key={`${event.date}-${idx}`} className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 18 }}>
                        {item.type === 'movie' ? '🎬' : '📺'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {item.instanceName}
                        </div>
                      </div>
                      {item.hasFile && (
                        <div style={{ fontSize: 11, background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                          ✓ Got it
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Indexers tab ──────────────────────────────────────────────────────────────

function IndexersTab() {
  const { instances, indexers, stats, loadIndexers } = useArrStore()
  const [loading, setLoading] = useState(false)

  const prowlarrInstances = instances.filter(i => i.type === 'prowlarr' && i.enabled)

  useEffect(() => {
    if (prowlarrInstances.length === 0) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(prowlarrInstances.map(i => loadIndexers(i.id)))
      setLoading(false)
    }
    loadAll()
  }, [prowlarrInstances.map(i => i.id).join(',')])

  if (prowlarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Prowlarr instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading indexers…</span>
        </div>
      )}

      {prowlarrInstances.map(inst => {
        const instIndexers = indexers[inst.id] ?? []
        const enabledCount = instIndexers.filter(i => i.enable).length

        return (
          <div key={inst.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔍</span>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>{inst.name}</h3>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {enabledCount} enabled
              </span>
              {(() => {
                const s = stats[inst.id]
                const failing = s?.type === 'prowlarr' ? (s as ProwlarrStats).failingIndexers : 0
                return failing > 0 ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <AlertTriangle size={11} /> {failing} failing
                  </span>
                ) : null
              })()}
            </div>

            {instIndexers.length === 0 && !loading && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No indexers configured.</div>
            )}

            {instIndexers.length > 0 && (
              <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(var(--text-rgb), 0.1)' }}>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Protocol</th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Privacy</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instIndexers.map((indexer, idx) => (
                      <tr key={indexer.id} style={{ borderTop: idx > 0 ? '1px solid rgba(var(--text-rgb), 0.05)' : 'none' }}>
                        <td style={{ padding: '12px 14px' }}>{indexer.name}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{indexer.protocol}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{indexer.privacy}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 12,
                            background: indexer.enable ? 'rgba(34, 197, 94, 0.15)' : 'rgba(var(--text-rgb), 0.08)',
                            color: indexer.enable ? '#22c55e' : 'var(--text-secondary)',
                          }}>
                            {indexer.enable ? 'Enabled' : 'Disabled'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Library tab ───────────────────────────────────────────────────────────────

type LibrarySortKey = 'az' | 'za' | 'year' | 'missing'
type LibraryFilter = 'all' | 'missing' | 'unmonitored'

function getTypeLabel(type?: string): string {
  return type === 'radarr' ? '🎬' : type === 'sonarr' ? '📺' : '🎥'
}

function LibraryTab() {
  const { instances, movies, series, loadMovies, loadSeries } = useArrStore()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<LibrarySortKey>('az')
  const [filter, setFilter] = useState<LibraryFilter>('all')

  const radarrSonarrInstances = instances.filter(i => (i.type === 'radarr' || i.type === 'sonarr') && i.enabled)

  useEffect(() => {
    if (radarrSonarrInstances.length === 0) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(radarrSonarrInstances.map(i => (
        i.type === 'radarr' ? loadMovies(i.id) : loadSeries(i.id)
      )))
      if (!selectedInstanceId && radarrSonarrInstances.length > 0) {
        setSelectedInstanceId(radarrSonarrInstances[0].id)
      }
      setLoading(false)
    }
    loadAll()
  }, [radarrSonarrInstances.map(i => i.id).join(',')])

  if (radarrSonarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Radarr/Sonarr instances configured.</p>
      </div>
    )
  }

  const selected = selectedInstanceId ? radarrSonarrInstances.find(i => i.id === selectedInstanceId) : radarrSonarrInstances[0]
  const isRadarr = selected?.type === 'radarr'
  const items: (RadarrMovie | SonarrSeries)[] = selected ? (isRadarr ? (movies[selected.id] ?? []) : (series[selected.id] ?? [])) : []

  const isMissing = (item: RadarrMovie | SonarrSeries): boolean => {
    if (isRadarr) return item.monitored && !(item as RadarrMovie).hasFile
    return item.monitored && ((item as SonarrSeries).statistics?.episodeFileCount ?? 0) < ((item as SonarrSeries).statistics?.episodeCount ?? 0)
  }

  const filtered = items
    .filter((item: RadarrMovie | SonarrSeries) => {
      const title: string = item.title ?? ''
      if (!title.toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'missing') return isMissing(item)
      if (filter === 'unmonitored') return !item.monitored
      return true
    })
    .sort((a: RadarrMovie | SonarrSeries, b: RadarrMovie | SonarrSeries) => {
      if (sortKey === 'za') return (b.title ?? '').localeCompare(a.title ?? '')
      if (sortKey === 'year') return ((b as RadarrMovie).year ?? 0) - ((a as RadarrMovie).year ?? 0)
      if (sortKey === 'missing') {
        const am = isMissing(a) ? 0 : 1
        const bm = isMissing(b) ? 0 : 1
        return am - bm || (a.title ?? '').localeCompare(b.title ?? '')
      }
      return (a.title ?? '').localeCompare(b.title ?? '')
    })

  const missingCount = items.filter(isMissing).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Instance selector */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {radarrSonarrInstances.map(i => (
            <button
              key={i.id}
              onClick={() => { setSelectedInstanceId(i.id); setFilter('all'); setSearch('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: selectedInstanceId === i.id ? 600 : 400,
                background: selectedInstanceId === i.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: selectedInstanceId === i.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: selectedInstanceId === i.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{ fontSize: 14 }}>{getTypeLabel(i.type)}</span>
              {i.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ flex: 1, minWidth: 150, fontSize: 13, padding: '5px 10px' }}
        />

        {/* Filter chips */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {(['all', 'missing', 'unmonitored'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 12,
                fontWeight: filter === f ? 600 : 400,
                background: filter === f ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
                border: filter === f ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                textTransform: 'capitalize',
              }}
            >
              {f === 'missing' && missingCount > 0 ? `Missing (${missingCount})` : f === 'all' ? 'All' : f === 'unmonitored' ? 'Unmonitored' : f}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          className="form-input"
          value={sortKey}
          onChange={e => setSortKey(e.target.value as LibrarySortKey)}
          style={{ fontSize: 12, padding: '6px 10px', flexShrink: 0 }}
        >
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="year">Newest first</option>
          <option value="missing">Missing first</option>
        </select>

        {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
      </div>

      {/* Results count */}
      {!loading && items.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} of {items.length} {isRadarr ? 'movies' : 'series'}
          {missingCount > 0 && filter !== 'missing' && (
            <span style={{ marginLeft: 10, color: '#f59e0b' }}>• {missingCount} missing</span>
          )}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No results found.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {filtered.map((item: RadarrMovie | SonarrSeries) => {
          const posterUrl = item.images?.find((i: { coverType: string; remoteUrl: string }) => i.coverType === 'poster')?.remoteUrl
          const title: string = item.title ?? 'Unknown'
          const missing = isMissing(item)

          // Radarr: hasFile boolean. Sonarr: episodeFileCount / episodeCount (aired, no specials/unaired)
          const radarrItem = item as RadarrMovie
          const sonarrItem = item as SonarrSeries
          const fileLabel = isRadarr
            ? (radarrItem.hasFile ? 'Downloaded' : 'Missing')
            : (() => {
                const got = sonarrItem.statistics?.episodeFileCount ?? 0
                const total = sonarrItem.statistics?.episodeCount ?? 0
                return total > 0 ? `${got} / ${total} ep` : '—'
              })()
          const fileColor = isRadarr
            ? (radarrItem.hasFile ? '#22c55e' : (item.monitored ? '#ef4444' : 'var(--text-muted)'))
            : (() => {
                const got = sonarrItem.statistics?.episodeFileCount ?? 0
                const total = sonarrItem.statistics?.episodeCount ?? 0
                if (total === 0) return 'var(--text-muted)'
                return got >= total ? '#22c55e' : (item.monitored ? '#ef4444' : '#f59e0b')
              })()

          return (
            <div
              key={item.id}
              className="glass"
              style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'all 200ms ease', cursor: 'default' }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'none'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              {/* Poster */}
              <div style={{
                aspectRatio: '2 / 3',
                background: posterUrl ? undefined : 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--text-rgb), 0.1))',
                backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>
                {!posterUrl && <span style={{ fontSize: 32 }}>{getTypeLabel(selected?.type)}</span>}

                {/* Badges top-right */}
                <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                  {!item.monitored && (
                    <span style={{
                      background: 'rgba(0,0,0,0.75)', color: 'var(--text-muted)',
                      padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600,
                      backdropFilter: 'blur(4px)',
                    }}>Unmonitored</span>
                  )}
                  {missing && (
                    <span style={{
                      background: 'rgba(239,68,68,0.85)', color: '#fff',
                      padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600,
                      backdropFilter: 'blur(4px)',
                    }}>Missing</span>
                  )}
                </div>
              </div>

              {/* Info */}
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
                  {title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                  {item.year > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.year}</span>
                  )}
                  <span style={{ fontSize: 11, color: fileColor, marginLeft: 'auto' }}>{fileLabel}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Discover tab (TMDB) ────────────────────────────────────────────────────────

const DISCOVER_LANGUAGES = [
  { code: '', label: 'Any language' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ru', label: 'Russian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tr', label: 'Turkish' },
]

const SORT_OPTIONS = [
  { label: 'Popularity', value: 'popularity.desc' },
  { label: 'Rating', value: 'vote_average.desc' },
  { label: 'Release date', value: 'release_date.desc' },
  { label: 'Title A–Z', value: 'original_title.asc' },
]

const DEFAULT_FILTERS: TmdbFilters = {
  mediaType: 'all',
  language: '',
  genreIds: [],
  watchProviderIds: [],
  voteAverageGte: 0,
  releaseYearFrom: '',
  releaseYearTo: '',
  sortBy: 'popularity.desc',
}

function DiscoverTab({ hasTmdbKey, onNavigate }: { hasTmdbKey: boolean; onNavigate: (page: string) => void }) {
  const { instances, seerrRequests, seerrTvStatus, seerrMovieStatus, discoverRequest, loadSeerrRequests, loadSeerrTvStatus, loadSeerrMovieStatus } = useArrStore()
  const {
    trending, discoverMovies, discoverTv, searchResults, genres, watchProviders, tvDetail,
    loadTrending, loadDiscoverMovies, loadDiscoverTv, search: searchTmdb,
    loadGenres, loadWatchProviders, loadTvDetail, clearSearch,
  } = useTmdbStore()

  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'trending' | 'movies' | 'tv' | 'search'>('trending')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<TmdbFilters>({ ...DEFAULT_FILTERS })
  const [requesting, setRequesting] = useState<string | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<{ item: TmdbResult; mediaType: 'movie' | 'tv'; mediaId: number } | null>(null)
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([])
  const [tvDetailLoading, setTvDetailLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const seerrInstances = instances.filter(i => i.type === 'seerr' && i.enabled)
  const seerrInstance = seerrInstances[0]

  // Serialize filters for use in effect deps
  const filtersJson = JSON.stringify(filters)

  // Build server-side filter params
  const buildFilters = (f: TmdbFilters): TmdbDiscoverFilters => ({
    language: f.language || undefined,
    genreIds: f.genreIds.length > 0 ? f.genreIds : undefined,
    watchProviderIds: f.watchProviderIds.length > 0 ? f.watchProviderIds : undefined,
    voteAverageGte: f.voteAverageGte > 0 ? f.voteAverageGte : undefined,
    releaseYearFrom: f.releaseYearFrom || undefined,
    releaseYearTo: f.releaseYearTo || undefined,
  })

  const hasMounted = useRef(false)

  // Initial load
  useEffect(() => {
    hasMounted.current = false
    setPage(1)
    const sf = buildFilters(DEFAULT_FILTERS)
    const load = async () => {
      setLoading(true)
      await Promise.all([
        loadTrending('all', 'day'),
        loadDiscoverMovies(1, DEFAULT_FILTERS.sortBy, sf),
        loadDiscoverTv(1, DEFAULT_FILTERS.sortBy, sf),
        loadGenres(),
        loadWatchProviders(),
        ...(seerrInstance ? [loadSeerrRequests(seerrInstance.id, 'all')] : []),
      ])
      setLoading(false)
      hasMounted.current = true
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload movies/tv when filters change
  useEffect(() => {
    if (!hasMounted.current) return
    if (tab !== 'movies' && tab !== 'tv') return
    setPage(1)
    const sf = buildFilters(filters)
    const load = async () => {
      setLoading(true)
      if (tab === 'movies') await loadDiscoverMovies(1, filters.sortBy, sf)
      else await loadDiscoverTv(1, filters.sortBy, sf)
      setLoading(false)
    }
    load()
  }, [filtersJson]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when tab switches to movies/tv
  useEffect(() => {
    if (!hasMounted.current) return
    if (tab !== 'movies' && tab !== 'tv') return
    setPage(1)
    const sf = buildFilters(filters)
    const load = async () => {
      setLoading(true)
      if (tab === 'movies') await loadDiscoverMovies(1, filters.sortBy, sf)
      else await loadDiscoverTv(1, filters.sortBy, sf)
      setLoading(false)
    }
    load()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search debounce
  useEffect(() => {
    if (tab !== 'search' || !searchQuery.trim()) return
    const timer = setTimeout(async () => {
      setPage(1)
      setLoading(true)
      try {
        await searchTmdb(searchQuery, 1, filters.language || undefined)
        setSearchError(null)
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : 'Search failed')
      }
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [tab, searchQuery, filters.language]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss notification
  useEffect(() => {
    if (!notification) return
    const timer = setTimeout(() => setNotification(null), 4000)
    return () => clearTimeout(timer)
  }, [notification])

  // Background-load Seerr status for all visible items (enables accurate card indicators)
  useEffect(() => {
    if (!seerrInstance) return
    // discoverMovies/discoverTv have no media_type on items — handle by source
    ;(discoverMovies?.results ?? []).forEach(item => {
      if (seerrMovieStatus[item.id] === undefined) loadSeerrMovieStatus(seerrInstance.id, item.id)
    });
    (discoverTv?.results ?? []).forEach(item => {
      if (seerrTvStatus[item.id] === undefined) loadSeerrTvStatus(seerrInstance.id, item.id)
    });
    // trending and search include media_type
    [...(trending?.results ?? []), ...(searchResults?.results ?? [])].forEach(item => {
      if (item.media_type === 'movie' && seerrMovieStatus[item.id] === undefined) {
        loadSeerrMovieStatus(seerrInstance.id, item.id)
      } else if (item.media_type === 'tv' && seerrTvStatus[item.id] === undefined) {
        loadSeerrTvStatus(seerrInstance.id, item.id)
      }
    })
  }, [discoverMovies, discoverTv, trending, searchResults, seerrInstance?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select seasons when TV detail loads
  useEffect(() => {
    if (!confirmRequest || confirmRequest.mediaType !== 'tv') return
    const detail = tvDetail[confirmRequest.mediaId]
    if (!detail) return
    const realSeasons = detail.seasons.filter(s => s.season_number > 0)
    // Seasons already in Sonarr (available) or pending/processing via Seerr TV status
    const seerrSeasons = seerrTvStatus[confirmRequest.mediaId]?.seasons ?? []
    const availableNums = seerrSeasons.filter(s => s.status === 5).map(s => s.seasonNumber)
    const pendingFromSeerr = seerrSeasons.filter(s => s.status === 2 || s.status === 3).map(s => s.seasonNumber)
    // Fallback: seasons from explicit Seerr requests (for pending seasons not yet reflected in seerrTvStatus)
    const pendingFromRequests = seerrInstance
      ? (seerrRequests[seerrInstance.id]?.results ?? [])
          .filter(r => r.media.mediaType === 'tv' && r.media.tmdbId === confirmRequest.mediaId)
          .flatMap(r => r.seasons?.map(s => s.seasonNumber) ?? [])
      : []
    const excludeNums = [...new Set([...availableNums, ...pendingFromSeerr, ...pendingFromRequests])]
    setSelectedSeasons(realSeasons.filter(s => !excludeNums.includes(s.season_number)).map(s => s.season_number))
  }, [confirmRequest?.mediaId, tvDetail, seerrTvStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve raw results
  const rawResults: TmdbResult[] = tab === 'search'
    ? (searchResults?.results ?? [])
    : tab === 'trending'
    ? (trending?.results ?? [])
    : tab === 'movies'
    ? (discoverMovies?.results ?? [])
    : (discoverTv?.results ?? [])

  // Total pages for Load More
  const totalPages = tab === 'movies'
    ? (discoverMovies?.total_pages ?? 1)
    : tab === 'tv'
    ? (discoverTv?.total_pages ?? 1)
    : tab === 'search'
    ? (searchResults?.total_pages ?? 1)
    : 1

  // Client-side filter for trending/search (mediaType, rating, genre)
  const allResults: TmdbResult[] = (() => {
    let results = rawResults.filter(r => r.media_type !== 'person')
    if (tab === 'trending' || tab === 'search') {
      if (filters.mediaType !== 'all') {
        results = results.filter(r => r.media_type === filters.mediaType)
      }
      if (filters.voteAverageGte > 0) {
        results = results.filter(r => (r.vote_average ?? 0) >= filters.voteAverageGte)
      }
      if (filters.genreIds.length > 0) {
        results = results.filter(r => r.genre_ids?.some(g => filters.genreIds.includes(g)))
      }
      switch (filters.sortBy) {
        case 'vote_average.desc':
          results.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0)); break
        case 'release_date.desc':
          results.sort((a, b) =>
            (b.release_date ?? b.first_air_date ?? '').localeCompare(a.release_date ?? a.first_air_date ?? '')
          ); break
        case 'original_title.asc':
          results.sort((a, b) => (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '')); break
      }
    }
    return results
  })()

  // Infer effective media type — discover/movie and discover/tv endpoints don't include media_type
  const getEffectiveMediaType = (item: TmdbResult): 'movie' | 'tv' | null => {
    if (item.media_type === 'movie' || item.media_type === 'tv') return item.media_type
    if (tab === 'movies') return 'movie'
    if (tab === 'tv') return 'tv'
    return null
  }

  // Determine per-item request status
  const getItemStatus = (item: TmdbResult): 'available' | 'pending' | 'missing_seasons' | 'missing_seasons_all_requested' | null => {
    if (!seerrInstance) return null
    const mt = getEffectiveMediaType(item)
    if (!mt) return null

    // Use Seerr media status when loaded — accurate for both direct-library and requested items
    if (mt === 'movie' && seerrMovieStatus[item.id] !== undefined) {
      const s = seerrMovieStatus[item.id].status
      if (s === 5) return 'available'
      if (s === 2 || s === 3) return 'pending'
      return null  // status 1 = not in Radarr
    }
    if (mt === 'tv' && seerrTvStatus[item.id] !== undefined) {
      const tvStatus = seerrTvStatus[item.id]
      const s = tvStatus.status
      if (s === 5) return 'available'
      if (s === 2 || s === 3) return 'pending'
      if (s === 4) {
        const seasonList = tvStatus.seasons ?? []
        const nonAvailable = seasonList.filter(se => se.status !== 5)
        if (nonAvailable.length > 0 && nonAvailable.every(se => se.status === 2 || se.status === 3)) {
          return 'missing_seasons_all_requested'
        }
        return 'missing_seasons'
      }
      return null  // status 1 = not in Sonarr
    }

    // Fallback while Seerr status not yet loaded: check seerrRequests
    const requests = seerrRequests[seerrInstance.id]?.results ?? []
    const req = requests.find(r => r.media.mediaType === mt && r.media.tmdbId === item.id)
    if (!req) return null
    if (req.media.status === 5) return 'available'
    if (req.media.status === 4) return 'missing_seasons'
    if (req.media.status === 2 || req.media.status === 3) return 'pending'
    return null
  }

  // Genre/provider lists depend on current tab
  const genreList = tab === 'tv'
    ? (genres?.tv ?? [])
    : (genres?.movie ?? [])

  const providerList = tab === 'tv'
    ? (watchProviders?.tv ?? [])
    : (watchProviders?.movie ?? [])

  const activeFilterCount = [
    filters.mediaType !== 'all',
    !!filters.language,
    filters.genreIds.length > 0,
    filters.watchProviderIds.length > 0,
    filters.voteAverageGte > 0,
    !!filters.releaseYearFrom || !!filters.releaseYearTo,
  ].filter(Boolean).length

  const handleLoadMore = async () => {
    const nextPage = page + 1
    setPage(nextPage)
    const sf = buildFilters(filters)
    setLoading(true)
    if (tab === 'movies') {
      await loadDiscoverMovies(nextPage, filters.sortBy, sf, true)
    } else if (tab === 'tv') {
      await loadDiscoverTv(nextPage, filters.sortBy, sf, true)
    } else if (tab === 'search' && searchQuery.trim()) {
      await searchTmdb(searchQuery, nextPage, filters.language || undefined, true)
    }
    setLoading(false)
  }

  const openRequestModal = async (item: TmdbResult, mediaType: 'movie' | 'tv') => {
    setConfirmRequest({ item, mediaType, mediaId: item.id })
    setSelectedSeasons([])
    if (mediaType === 'tv') {
      const needsTmdb = !tvDetail[item.id]
      const needsSeerr = !!seerrInstance && seerrTvStatus[item.id] === undefined
      if (needsTmdb || needsSeerr) {
        setTvDetailLoading(true)
        await Promise.all([
          needsTmdb ? loadTvDetail(item.id) : Promise.resolve(),
          needsSeerr ? loadSeerrTvStatus(seerrInstance!.id, item.id) : Promise.resolve(),
        ])
        setTvDetailLoading(false)
      }
    }
  }

  if (!hasTmdbKey) {
    return (
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 300 }}>
        <Search size={40} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>TMDB API Key required</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Add your free TMDB API key in Settings → General to enable Discover.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('settings')}>
            Go to Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>

      {/* Notification Toast */}
      {notification && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 500,
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          fontSize: 13, fontWeight: 500,
          backgroundColor: notification.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: notification.type === 'success' ? '#22c55e' : '#ef4444',
          border: `1px solid ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}>
          {notification.message}
        </div>
      )}

      {/* Tab bar + sort + search + filters toggle */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Tabs */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {(['trending', 'movies', 'tv', 'search'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); if (t !== 'search') { setSearchInput(''); setSearchQuery('') } }}
              style={{
                padding: '7px 14px', borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: tab === t ? 600 : 400,
                background: tab === t ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                border: tab === t ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 150ms ease', textTransform: 'capitalize',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={filters.sortBy}
          onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))}
          className="form-input"
          style={{ fontSize: 13, padding: '6px 8px', width: 'auto' }}
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Search input — only active on search tab */}
        {tab === 'search' && (
          <input
            type="text"
            placeholder="Search movies and TV shows…"
            value={searchInput}
            onChange={e => {
              const v = e.target.value
              setSearchInput(v)
              setSearchQuery(v)
              if (!v) { clearSearch(); setSearchError(null) }
            }}
            className="form-input"
            style={{ flex: 1, minWidth: 180, fontSize: 13, padding: '6px 8px' }}
            autoFocus
          />
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
          {/* Filters toggle */}
          <button
            onClick={() => setFiltersOpen(o => !o)}
            className={activeFilterCount > 0 ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            <span style={{ fontSize: 10, lineHeight: 1 }}>{filtersOpen ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* Search error */}
      {tab === 'search' && searchError && (
        <p style={{ fontSize: 12, color: '#ef4444', margin: '-8px 0 0' }}>{searchError}</p>
      )}

      {/* Collapsible filter panel */}
      {filtersOpen && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Row 1: media type, language, rating, years */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>

            {/* Media type toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Type</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['all', 'movie', 'tv'] as const).map(mt => (
                  <button
                    key={mt}
                    onClick={() => setFilters(f => ({ ...f, mediaType: mt }))}
                    style={{
                      padding: '5px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
                      background: filters.mediaType === mt ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(var(--text-rgb), 0.08)',
                      color: filters.mediaType === mt ? 'var(--accent)' : 'var(--text-secondary)',
                      border: filters.mediaType === mt ? '1px solid rgba(var(--accent-rgb), 0.4)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {mt === 'all' ? 'All' : mt === 'movie' ? 'Movies' : 'TV'}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Language</span>
              <select
                value={filters.language}
                onChange={e => setFilters(f => ({ ...f, language: e.target.value }))}
                className="form-input"
                style={{ fontSize: 12, padding: '5px 8px', width: 'auto' }}
              >
                {DISCOVER_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>

            {/* Min rating slider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Min rating{filters.voteAverageGte > 0 ? `: ${filters.voteAverageGte.toFixed(1)}` : ': any'}
              </span>
              <input
                type="range" min={0} max={10} step={0.5}
                value={filters.voteAverageGte}
                onChange={e => setFilters(f => ({ ...f, voteAverageGte: parseFloat(e.target.value) }))}
                style={{ width: 120, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>

            {/* Year range */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Year</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text" placeholder="from" maxLength={4}
                  value={filters.releaseYearFrom}
                  onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) setFilters(f => ({ ...f, releaseYearFrom: e.target.value })) }}
                  className="form-input"
                  style={{ width: 60, fontSize: 12, padding: '5px 8px' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>–</span>
                <input
                  type="text" placeholder="to" maxLength={4}
                  value={filters.releaseYearTo}
                  onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) setFilters(f => ({ ...f, releaseYearTo: e.target.value })) }}
                  className="form-input"
                  style={{ width: 60, fontSize: 12, padding: '5px 8px' }}
                />
              </div>
            </div>

            {/* Reset button */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 12, alignSelf: 'flex-end' }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Row 2: Genres */}
          {genreList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Genres</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {genreList.map(g => {
                  const active = filters.genreIds.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      onClick={() => setFilters(f => ({
                        ...f,
                        genreIds: active ? f.genreIds.filter(id => id !== g.id) : [...f.genreIds, g.id],
                      }))}
                      style={{
                        padding: '4px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
                        background: active ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(var(--text-rgb), 0.08)',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        border: active ? '1px solid rgba(var(--accent-rgb), 0.4)' : '1px solid transparent',
                        cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {g.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Row 3: Streaming providers */}
          {providerList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Streaming service</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {providerList.map(p => {
                  const active = filters.watchProviderIds.includes(p.id)
                  const logoUrl = p.logoPath ? `https://image.tmdb.org/t/p/w45${p.logoPath}` : null
                  return (
                    <button
                      key={p.id}
                      onClick={() => setFilters(f => ({
                        ...f,
                        watchProviderIds: active ? f.watchProviderIds.filter(id => id !== p.id) : [...f.watchProviderIds, p.id],
                      }))}
                      title={p.name}
                      style={{
                        padding: 4, borderRadius: 'var(--radius-md)',
                        background: active ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(var(--text-rgb), 0.06)',
                        border: active ? '2px solid var(--accent)' : '2px solid transparent',
                        cursor: 'pointer', transition: 'all 150ms ease',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {logoUrl
                        ? <img src={logoUrl} alt={p.name} style={{ width: 32, height: 32, borderRadius: 6, display: 'block' }} />
                        : <span style={{ fontSize: 11, padding: '4px 8px', color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>{p.name}</span>
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {allResults.length === 0 && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {tab === 'search' ? (searchQuery ? 'No results found.' : 'Enter a search term…') : 'No results found.'}
          </p>
        </div>
      )}

      {/* Results grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {allResults.map(item => {
          const mt = getEffectiveMediaType(item)
          const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null
          const title = item.title ?? item.name ?? 'Unknown'
          const year = item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? ''
          const rating = item.vote_average ? Math.round(item.vote_average * 10) / 10 : null
          const overview = item.overview ? item.overview.slice(0, 100) + (item.overview.length > 100 ? '...' : '') : ''
          const itemStatus = getItemStatus(item)
          const canRequest = !!seerrInstance && !!mt && (itemStatus === null || itemStatus === 'missing_seasons')
          const isYellowStatus = itemStatus === 'pending' || itemStatus === 'missing_seasons' || itemStatus === 'missing_seasons_all_requested'
          const itemKey = `${mt ?? item.media_type ?? 'unknown'}-${item.id}`

          const btnLabel = requesting === itemKey
            ? 'Requesting…'
            : itemStatus === 'available' ? '✓ Available'
            : itemStatus === 'pending' || itemStatus === 'missing_seasons_all_requested' ? '⏳ Pending'
            : '+ Request'

          return (
            <div
              key={itemKey}
              className="glass"
              style={{
                borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                transition: 'all 200ms ease',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'none'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              {/* Poster */}
              <div style={{
                aspectRatio: '2/3',
                background: posterUrl ? undefined : 'linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(var(--text-rgb),0.1))',
                backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>
                {!posterUrl && <span style={{ fontSize: 32 }}>{mt === 'movie' ? '🎬' : '📺'}</span>}

                {/* Media type badge */}
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  background: 'rgba(0,0,0,0.7)', color: 'var(--accent)',
                  padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', backdropFilter: 'blur(8px)',
                }}>
                  {mt === 'movie' ? 'Movie' : 'TV'}
                </div>

                {/* Rating badge */}
                {rating !== null && rating > 0 && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'rgba(0,0,0,0.7)',
                    color: rating >= 7 ? '#22c55e' : rating >= 5 ? '#eab308' : '#ef4444',
                    padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                    fontSize: 11, fontWeight: 600, backdropFilter: 'blur(8px)',
                  }}>
                    ★ {rating}
                  </div>
                )}

                {/* Status badge */}
                {itemStatus && (
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    background: itemStatus === 'available' ? 'rgba(34,197,94,0.9)' : 'rgba(234,179,8,0.9)',
                    color: '#fff', padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', backdropFilter: 'blur(8px)',
                  }}>
                    {itemStatus === 'available' ? '✓ Available'
                      : itemStatus === 'missing_seasons' ? '⚠ Partial'
                      : '⏳ Pending'}
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {title}
                  </div>
                  {year && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{year}</div>}
                </div>

                {overview && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {overview}
                  </div>
                )}

                {seerrInstance && !!mt && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (!canRequest) return
                      openRequestModal(item, mt)
                    }}
                    disabled={!canRequest || requesting === itemKey}
                    className={itemStatus === 'available' ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                    style={{
                      fontSize: 12, padding: '6px 12px', marginTop: 'auto',
                      pointerEvents: canRequest ? undefined : 'none',
                      ...(isYellowStatus ? {
                        color: '#f59e0b',
                        borderColor: canRequest ? '#f59e0b' : 'rgba(245,158,11,0.4)',
                        opacity: canRequest ? 1 : 0.7,
                      } : !canRequest ? { opacity: 0.6 } : {}),
                    }}
                  >
                    {btnLabel}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Load more */}
      {tab !== 'trending' && allResults.length > 0 && page < totalPages && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, minWidth: 120 }}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {/* Request modal */}
      {confirmRequest && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)',
        }} onClick={() => setConfirmRequest(null)}>
          <div className="glass" style={{
            borderRadius: 'var(--radius-xl)', padding: 24,
            width: 420, maxWidth: 'calc(100vw - 32px)',
            maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Confirm Request</h3>

            {/* Preview */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {confirmRequest.item.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w92${confirmRequest.item.poster_path}`}
                  alt=""
                  style={{ width: 60, borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {confirmRequest.item.title ?? confirmRequest.item.name}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {confirmRequest.mediaType === 'movie' ? 'Movie' : 'TV Series'}
                  {(confirmRequest.item.release_date ?? confirmRequest.item.first_air_date) &&
                    ` · ${(confirmRequest.item.release_date ?? confirmRequest.item.first_air_date ?? '').slice(0, 4)}`}
                </p>
              </div>
            </div>

            {/* Season selection for TV */}
            {confirmRequest.mediaType === 'tv' && (() => {
              const detail = tvDetail[confirmRequest.mediaId]
              if (tvDetailLoading) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading seasons…</span>
                  </div>
                )
              }
              if (!detail) {
                return (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Could not load season list. The request will include all seasons.
                  </p>
                )
              }
              const realSeasons = detail.seasons.filter(s => s.season_number > 0)
              // Seasons available in Sonarr or pending/processing (from Seerr TV status)
              const seerrSeasonData = seerrTvStatus[confirmRequest.mediaId]?.seasons ?? []
              const availableSeasonNums = seerrSeasonData.filter(s => s.status === 5).map(s => s.seasonNumber)
              const pendingSeasonNums = seerrSeasonData.filter(s => s.status === 2 || s.status === 3).map(s => s.seasonNumber)
              // Fallback: seasons from explicit Seerr requests
              const requestedSeasonNums = seerrInstance
                ? (seerrRequests[seerrInstance.id]?.results ?? [])
                    .filter(r => r.media.mediaType === 'tv' && r.media.tmdbId === confirmRequest.mediaId)
                    .flatMap(r => r.seasons?.map(s => s.seasonNumber) ?? [])
                : []
              const unavailableNums = [...new Set([...availableSeasonNums, ...pendingSeasonNums, ...requestedSeasonNums])]
              const missingSeasons = realSeasons.filter(s => !unavailableNums.includes(s.season_number))
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Seasons</span>
                    {missingSeasons.length > 0 && (
                      <button
                        onClick={() => setSelectedSeasons(missingSeasons.map(s => s.season_number))}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11 }}
                      >
                        Select all missing
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {realSeasons.map(s => {
                      const isAvailable = availableSeasonNums.includes(s.season_number)
                      const isPending = !isAvailable && (pendingSeasonNums.includes(s.season_number) || requestedSeasonNums.includes(s.season_number))
                      const isUnavailable = isAvailable || isPending
                      const isSelected = selectedSeasons.includes(s.season_number)

                      return (
                        <button
                          key={s.season_number}
                          disabled={isUnavailable}
                          onClick={() => {
                            if (isUnavailable) return
                            setSelectedSeasons(prev =>
                              prev.includes(s.season_number)
                                ? prev.filter(n => n !== s.season_number)
                                : [...prev, s.season_number]
                            )
                          }}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
                            background: isUnavailable
                              ? 'rgba(var(--text-rgb), 0.05)'
                              : isSelected
                              ? 'rgba(var(--accent-rgb), 0.25)'
                              : 'rgba(var(--text-rgb), 0.1)',
                            color: isUnavailable
                              ? 'var(--text-muted)'
                              : isSelected
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                            border: isSelected && !isUnavailable ? '1px solid var(--accent)' : '1px solid transparent',
                            cursor: isUnavailable ? 'default' : 'pointer',
                            opacity: isUnavailable ? 0.5 : 1,
                            transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          S{s.season_number}
                          {isAvailable && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.75 }}>· In Sonarr</span>}
                          {isPending && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.75 }}>· Pending</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmRequest(null)}
                className="btn btn-ghost btn-sm"
                style={{ flex: 1, fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!seerrInstance) return
                  const key = `${confirmRequest.mediaType}-${confirmRequest.item.id}`
                  setRequesting(key)
                  try {
                    const seasons = confirmRequest.mediaType === 'tv' && selectedSeasons.length > 0
                      ? selectedSeasons
                      : undefined
                    await discoverRequest(
                      seerrInstance.id,
                      confirmRequest.mediaType,
                      confirmRequest.mediaId,
                      seasons,
                    )
                    setNotification({ type: 'success', message: `✓ ${confirmRequest.mediaType === 'movie' ? 'Movie' : 'Series'} requested!` })
                    setConfirmRequest(null)
                  } catch (e: unknown) {
                    setNotification({ type: 'error', message: `Error: ${(e as Error).message ?? 'Request failed'}` })
                  } finally {
                    setRequesting(null)
                  }
                }}
                disabled={
                  !seerrInstance ||
                  (confirmRequest.mediaType === 'tv' &&
                  !!tvDetail[confirmRequest.mediaId] &&
                  selectedSeasons.length === 0)
                }
                className="btn btn-primary btn-sm"
                style={{ flex: 1, fontSize: 12 }}
              >
                Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Recyclarr Setup Wizard ────────────────────────────────────────────────────

interface WizardConfig {
  instanceId: string
  enabled: boolean
  selectedProfiles: string[]
  scoreOverrides: import('../types/recyclarr').RecyclarrScoreOverride[]
  userCfNames: import('../types/recyclarr').RecyclarrUserCf[]
  preferredRatio: number
  profilesConfig: import('../types/recyclarr').RecyclarrProfileConfig[]
  syncSchedule: string
  deleteOldCfs: boolean
  qualityDefType: string
}

function RecyclarrWizard({ instances, onClose, onComplete }: {
  instances: import('../types/arr').ArrInstance[]
  onClose: () => void
  onComplete: (cfg: WizardConfig) => Promise<void>
}) {
  const [step, setStep] = useState(1)
  const [selectedInstanceId, setSelectedInstanceId] = useState(instances[0]?.id ?? '')
  const [profilesList, setProfilesList] = useState<{ trash_id: string; name: string }[]>([])
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([])
  const [qualDef, setQualDef] = useState(true)
  const [germanOnly, setGermanOnly] = useState(false)
  const [userCfs, setUserCfs] = useState<import('../types/recyclarr').UserCfFile[]>([])
  const [selectedUserCfs, setSelectedUserCfs] = useState<string[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [loadingUserCfs, setLoadingUserCfs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const selectedInstance = instances.find(i => i.id === selectedInstanceId)

  function sanitizeKey(name: string): string {
    return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').replace(/^_+|_+$/g, '') || 'instance'
  }

  useEffect(() => {
    if (step === 2 && selectedInstanceId) {
      setLoadingProfiles(true)
      api.recyclarr.listProfiles(selectedInstanceId)
        .then(r => setProfilesList(r.profiles))
        .catch(() => {})
        .finally(() => setLoadingProfiles(false))
    }
    if (step === 4 && selectedInstance) {
      setLoadingUserCfs(true)
      api.recyclarr.listUserCfs(selectedInstance.type as 'radarr' | 'sonarr')
        .then(r => setUserCfs(r.cfs))
        .catch(() => {})
        .finally(() => setLoadingUserCfs(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedInstanceId])

  const handleComplete = async () => {
    setSaving(true)
    const profilesConfig: import('../types/recyclarr').RecyclarrProfileConfig[] = selectedProfiles.map(tid => ({
      trash_id: tid,
      name: profilesList.find(p => p.trash_id === tid)?.name ?? tid,
      min_format_score: germanOnly ? 10000 : undefined,
      reset_unmatched_scores_enabled: true,
      reset_unmatched_scores_except: [],
      reset_unmatched_scores_except_patterns: [],
    }))
    const userCfNames: import('../types/recyclarr').RecyclarrUserCf[] = selectedUserCfs.flatMap(trashId => {
      const cf = userCfs.find(c => c.trash_id === trashId)
      if (!cf) return []
      return selectedProfiles.map(profId => ({
        trash_id: cf.trash_id,
        name: cf.name,
        score: 0,
        profileTrashId: profId,
        profileName: profilesList.find(p => p.trash_id === profId)?.name ?? profId,
      }))
    })
    const cfg: WizardConfig = {
      instanceId: selectedInstanceId,
      enabled: true,
      selectedProfiles,
      scoreOverrides: [],
      userCfNames,
      preferredRatio: 0,
      profilesConfig,
      syncSchedule: 'manual',
      deleteOldCfs: false,
      qualityDefType: selectedInstance?.type === 'radarr' ? 'movie' : 'series',
    }
    try { await onComplete(cfg) } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 28, width: '100%', maxWidth: 700, maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Recyclarr einrichten</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 12 }}>Schritt {step} von 5</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClose(true)} style={{ fontSize: 12 }}><X size={14} /></button>
        </div>

        {confirmClose && (
          <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,0.08)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ fontSize: 13, marginBottom: 8 }}>Einrichtung abbrechen? Eingaben gehen verloren.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClose(false)} style={{ fontSize: 12 }}>Weitermachen</button>
              <button className="btn btn-sm" onClick={onClose} style={{ fontSize: 12, background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: 'pointer' }}>Beenden</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Instanz wählen</h4>
            {instances.map(inst => (
              <label key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: selectedInstanceId === inst.id ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-md)', cursor: 'pointer', border: selectedInstanceId === inst.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent' }}>
                <input type="radio" name="wizard-inst" checked={selectedInstanceId === inst.id} onChange={() => setSelectedInstanceId(inst.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{inst.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inst.type} · {inst.url}</div>
                </div>
                <span className="badge-neutral" style={{ fontSize: 10 }}>{inst.type}</span>
              </label>
            ))}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Profile wählen</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 4 }}>
              <input type="checkbox" checked={qualDef} onChange={e => setQualDef(e.target.checked)} />
              Quality Definition aktivieren
              <span className="badge-neutral" style={{ fontSize: 10 }}>Empfohlen</span>
            </label>
            {loadingProfiles ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /><span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade Profile…</span></div>
            ) : (
              profilesList.map(p => (
                <label key={p.trash_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: selectedProfiles.includes(p.trash_id) ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-md)', cursor: 'pointer', border: selectedProfiles.includes(p.trash_id) ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent' }}>
                  <input type="checkbox" checked={selectedProfiles.includes(p.trash_id)}
                    onChange={e => setSelectedProfiles(prev => e.target.checked ? [...prev, p.trash_id] : prev.filter(id => id !== p.trash_id))} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.trash_id}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Basis-Einstellungen</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={germanOnly} onChange={e => setGermanOnly(e.target.checked)} />
              Nur deutsche Releases (min. Score 10000)
              <span className="badge-neutral" style={{ fontSize: 10 }}>Releases ohne deutschen Ton werden ignoriert</span>
            </label>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>User CFs zuweisen</h4>
            {loadingUserCfs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /><span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade User CFs…</span></div>
            ) : userCfs.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Noch keine eigenen CFs vorhanden.</p>
            ) : (
              userCfs.map(cf => (
                <label key={cf.trash_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: selectedUserCfs.includes(cf.trash_id) ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-md)', cursor: 'pointer', border: selectedUserCfs.includes(cf.trash_id) ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent' }}>
                  <input type="checkbox" checked={selectedUserCfs.includes(cf.trash_id)}
                    onChange={e => setSelectedUserCfs(prev => e.target.checked ? [...prev, cf.trash_id] : prev.filter(id => id !== cf.trash_id))} />
                  <span style={{ fontSize: 13 }}>{cf.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>{cf.trash_id}</span>
                </label>
              ))
            )}
          </div>
        )}

        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Zusammenfassung</h4>
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><strong>Instanz:</strong> {selectedInstance?.name} ({selectedInstance?.type})</div>
              <div><strong>Profile:</strong> {selectedProfiles.map(tid => profilesList.find(p => p.trash_id === tid)?.name).join(', ') || '–'}</div>
              <div><strong>Quality Definition:</strong> {qualDef ? t('common.yes') : t('common.no')}</div>
              <div><strong>Nur deutsch:</strong> {germanOnly ? 'Ja (min. 10000)' : t('common.no')}</div>
              <div><strong>User CFs:</strong> {selectedUserCfs.length}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {step > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setStep(s => s - 1)} style={{ fontSize: 12 }}>Zurück</button>}
          <div style={{ flex: 1 }} />
          {step < 5 && (
            <button className="btn btn-primary btn-sm"
              onClick={() => setStep(s => s + 1)}
              disabled={(step === 1 && !selectedInstanceId) || (step === 2 && selectedProfiles.length === 0)}
              style={{ fontSize: 12 }}>
              Weiter
            </button>
          )}
          {step === 5 && (
            <button className="btn btn-primary btn-sm" onClick={handleComplete} disabled={saving} style={{ fontSize: 12, gap: 4 }}>
              {saving ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Check size={12} />}
              {saving ? 'Erstelle…' : 'Konfiguration erstellen'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Recyclarr tab ─────────────────────────────────────────────────────────────

type ScheduleMode = 'manual' | 'daily' | 'weekly' | 'custom'

function parseCronExpression(expr: string): { mode: ScheduleMode; time: string; weekday: string; custom: string } {
  if (!expr || expr === 'manual') return { mode: 'manual', time: '04:00', weekday: '1', custom: '' }
  const parts = expr.trim().split(/\s+/)
  if (parts.length === 5) {
    const [m, h, dom, mon, dow] = parts
    if (dom === '*' && mon === '*' && m !== undefined && h !== undefined) {
      const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
      if (dow === '*') return { mode: 'daily', time, weekday: '1', custom: '' }
      if (/^[0-6]$/.test(dow ?? '')) return { mode: 'weekly', time, weekday: dow ?? '1', custom: '' }
    }
  }
  return { mode: 'custom', time: '04:00', weekday: '1', custom: expr }
}

function buildCronExpression(mode: ScheduleMode, time: string, weekday: string, custom: string): string {
  if (mode === 'manual') return 'manual'
  if (mode === 'custom') return custom.trim()
  const colonIdx = time.indexOf(':')
  const h = colonIdx >= 0 ? time.slice(0, colonIdx) : '4'
  const m = colonIdx >= 0 ? time.slice(colonIdx + 1) : '0'
  const hNum = parseInt(h, 10) || 0
  const mNum = parseInt(m, 10) || 0
  if (mode === 'daily') return `${mNum} ${hNum} * * *`
  return `${mNum} ${hNum} * * ${weekday}`
}

function isValidCron(expr: string): boolean {
  if (!expr || expr === 'manual') return true
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const ranges = [[0,59],[0,23],[1,31],[1,12],[0,7]]
  return parts.every((p, i) => {
    if (p === '*') return true
    const n = parseInt(p, 10)
    return !isNaN(n) && n >= (ranges[i]?.[0] ?? 0) && n <= (ranges[i]?.[1] ?? 0)
  })
}

function describeCron(expr: string): string {
  if (!expr || expr === 'manual') return ''
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return ''
  const [m, h, dom, , dow] = parts
  if (!m || !h) return ''
  const time = `${String(parseInt(h, 10)).padStart(2, '0')}:${String(parseInt(m, 10)).padStart(2, '0')} Uhr`
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  if (dom === '*' && dow === '*') return `Jeden Tag um ${time}`
  if (dom === '*' && /^[0-7]$/.test(dow ?? '')) return `Jeden ${days[parseInt(dow!, 10)] ?? dow} um ${time}`
  return expr
}

function formatRelativeTime(isoStr: string | null): string {
  if (!isoStr) return ''
  const ms = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `vor ${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `vor ${hrs}h`
  return `vor ${Math.floor(hrs / 24)}d`
}

function RecyclarrTab() {
  const { t } = useTranslation()
  const { settings } = useStore()
  const locale = settings?.language ?? 'de'
  const use12h = settings?.time_format === '12h'
  const { isAdmin } = useStore()
  const { instances } = useArrStore()
  const {
    configs, syncLines, syncDone, syncing, loading,
    syncSchedule: globalSyncSchedule,
    loadConfigs, saveConfig, saveSchedule, sync, adoptCfs, resetConfig,
    arrData, arrDataLoading, loadArrData, checkScoreChanges, acceptScoreChanges,
    syncHistory, backups, loadSyncHistory, loadBackups, restoreBackup,
  } = useRecyclarrStore()

  // ── Service tab state ──
  const [activeServiceTab, setActiveServiceTab] = useState<'radarr' | 'sonarr' | 'zeitplan'>(() => {
    const saved = localStorage.getItem('recyclarr_tab')
    return (saved as 'radarr' | 'sonarr' | 'zeitplan') || 'radarr'
  })

  // ── Profile selection ──
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')

  // ── Reset / wizard ──
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  // ── YAML preview ──
  const [showYamlPreview, setShowYamlPreview] = useState(false)
  const [yamlPreview, setYamlPreview] = useState('')

  // ── Container status ──
  const [containerRunning, setContainerRunning] = useState<boolean | null>(null)

  // ── Add profile mini-wizard ──
  const [showAddProfile, setShowAddProfile] = useState(false)
  const [addProfileProfiles, setAddProfileProfiles] = useState<{ trash_id: string; name: string }[]>([])
  const [addProfileSelected, setAddProfileSelected] = useState<string[]>([])
  const [addProfileQualDef, setAddProfileQualDef] = useState(true)
  const [addProfileMinScore, setAddProfileMinScore] = useState(false)
  const [addProfileLoading, setAddProfileLoading] = useState(false)
  const [addProfileStep, setAddProfileStep] = useState(1)

  // ── Score changes ──
  const [scoreChanges, setScoreChanges] = useState<import('../types/recyclarr').ScoreChange[]>([])
  const [scoreChangesChecked, setScoreChangesChecked] = useState(false)
  const [acceptingChanges, setAcceptingChanges] = useState(false)

  // ── Section collapse ──
  const [trashCfsCollapsed, setTrashCfsCollapsed] = useState(false)
  const [userCfsCollapsed, setUserCfsCollapsed] = useState(false)
  const [advancedCollapsed, setAdvancedCollapsed] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)

  const [backupsOpen, setBackupsOpen] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState('')
  const [restoreSuccess, setRestoreSuccess] = useState('')

  // ── Profile comparison ──
  const [showProfileComparison, setShowProfileComparison] = useState(false)

  // ── Score heatmap ──
  const [heatmapView, setHeatmapView] = useState(false)

  // ── User CFs from filesystem ──
  const [userCfsFromFs, setUserCfsFromFs] = useState<import('../types/recyclarr').UserCfFile[]>([])
  const [userCfsFromFsLoading, setUserCfsFromFsLoading] = useState(false)

  // ── CF groups (for grouped TRaSH CF view) ──
  const [profileCfs, setProfileCfs] = useState<{ arrId: number; name: string; currentScore: number; groups: string[]; inMultipleGroups: boolean; managedByRecyclarr: boolean; isUserCf: boolean }[]>([])
  const [profileCfGroups, setProfileCfGroups] = useState<{ name: string; cfNames: string[]; syncEnabled: boolean }[]>([])
  const [profileCfNotInProfile, setProfileCfNotInProfile] = useState<{ arrId: number; name: string; currentScore: number }[]>([])
  const [profileCfGroupsWarning, setProfileCfGroupsWarning] = useState(false)
  const [profileCfGroupsWarningMsg, setProfileCfGroupsWarningMsg] = useState<string | undefined>(undefined)
  const [profileCfGroupsLoading, setProfileCfGroupsLoading] = useState(false)

  // ── Local config state init tracking ──
  const localStateInstanceRef = useRef<string | null>(null)

  // ── Local config state ──
  const [localProfilesConfig, setLocalProfilesConfig] = useState<import('../types/recyclarr').RecyclarrProfileConfig[]>([])
  const [localScoreOverrides, setLocalScoreOverrides] = useState<import('../types/recyclarr').RecyclarrScoreOverride[]>([])
  const [localUserCfs, setLocalUserCfs] = useState<import('../types/recyclarr').RecyclarrUserCf[]>([])
  const [localEnabled, setLocalEnabled] = useState(true)
  const [localPreferredRatio, setLocalPreferredRatio] = useState(0.0)
  const [localDeleteOldCfs, setLocalDeleteOldCfs] = useState(false)
  const [localQualityDefType, setLocalQualityDefType] = useState('movie')

  // ── Per-instance schedule (used in handleSave) ──
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('manual')
  const [scheduleTime, setScheduleTime] = useState('04:00')
  const [scheduleWeekday, setScheduleWeekday] = useState('1')
  const [scheduleCustom, setScheduleCustom] = useState('')

  // ── Global schedule (Zeitplan tab) ──
  const [globalScheduleMode, setGlobalScheduleMode] = useState<ScheduleMode>('manual')
  const [globalScheduleTime, setGlobalScheduleTime] = useState('04:00')
  const [globalScheduleWeekday, setGlobalScheduleWeekday] = useState('1')
  const [globalScheduleCustom, setGlobalScheduleCustom] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleSaveSuccess, setScheduleSaveSuccess] = useState(false)
  const [scheduleSaveError, setScheduleSaveError] = useState('')

  // ── Save state ──
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Except tag inputs ──
  const [newExceptInput, setNewExceptInput] = useState('')
  const [newExceptPatternInput, setNewExceptPatternInput] = useState('')

  // ── Score sets ──
  const [scoreSets, setScoreSets] = useState<string[]>([])

  // ── Delete profile confirm ──
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState<string | null>(null)

  const syncOutputRef = useRef<HTMLPreElement>(null)

  // ── Derived values ──
  const radarrSonarrInstances = instances.filter(i => (i.type === 'radarr' || i.type === 'sonarr') && i.enabled)
  const radarrInstances = radarrSonarrInstances.filter(i => i.type === 'radarr')
  const sonarrInstances = radarrSonarrInstances.filter(i => i.type === 'sonarr')

  const currentServiceInstances = activeServiceTab === 'radarr' ? radarrInstances
    : activeServiceTab === 'sonarr' ? sonarrInstances : []
  const currentInstance = currentServiceInstances[0] ?? null
  const instanceId = currentInstance?.id ?? null

  const currentConfig = instanceId ? configs.find(c => c.instanceId === instanceId) : null
  const currentArrData = instanceId ? (arrData[instanceId] ?? null) : null
  const currentArrDataLoading = instanceId ? (arrDataLoading[instanceId] ?? false) : false

  const configuredProfiles = currentConfig?.profilesConfig ?? []
  const activeProfileConfig = configuredProfiles.find(pc => pc.trash_id === selectedProfileId) ?? null

  const hasUnsavedChanges = useMemo(() => {
    if (!currentConfig) return localProfilesConfig.length > 0
    return (
      JSON.stringify(currentConfig.profilesConfig) !== JSON.stringify(localProfilesConfig) ||
      JSON.stringify(currentConfig.scoreOverrides) !== JSON.stringify(localScoreOverrides) ||
      JSON.stringify(currentConfig.userCfNames) !== JSON.stringify(localUserCfs) ||
      currentConfig.enabled !== localEnabled ||
      currentConfig.preferredRatio !== localPreferredRatio ||
      currentConfig.deleteOldCfs !== localDeleteOldCfs ||
      currentConfig.qualityDefType !== localQualityDefType
    )
  }, [currentConfig, localProfilesConfig, localScoreOverrides, localUserCfs, localEnabled, localPreferredRatio, localDeleteOldCfs, localQualityDefType])

  const syncExitCode = syncDone ? (syncLines.some(l => l.type === 'error') ? 1 : 0) : null

  // ── Per-group collapse (TRaSH CFs) — must be after instanceId is derived ──
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!instanceId || !selectedProfileId) { setCollapsedGroups(new Set()); return }
    try {
      const stored = localStorage.getItem(LS_RECYCLARR_GROUPS_COLLAPSED)
      const map = stored ? (JSON.parse(stored) as Record<string, string[]>) : {}
      setCollapsedGroups(new Set(map[`${instanceId}:${selectedProfileId}`] ?? []))
    } catch { setCollapsedGroups(new Set()) }
  }, [instanceId, selectedProfileId])

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      if (instanceId && selectedProfileId) {
        try {
          const stored = localStorage.getItem(LS_RECYCLARR_GROUPS_COLLAPSED)
          const map: Record<string, string[]> = stored ? JSON.parse(stored) : {}
          map[`${instanceId}:${selectedProfileId}`] = Array.from(next)
          localStorage.setItem(LS_RECYCLARR_GROUPS_COLLAPSED, JSON.stringify(map))
        } catch {}
      }
      return next
    })
  }

  // ── Helper functions ──
  function getOverride(cfTrashId: string, profileTrashId: string): number | null {
    const o = localScoreOverrides.find(o => o.trash_id === cfTrashId && o.profileTrashId === profileTrashId)
    return o ? o.score : null
  }

  function setOverride(cf: { id: number; name: string; trash_id?: string }, profileTrashId: string, score: number | null) {
    const cfTid = cf.trash_id || String(cf.id)
    setLocalScoreOverrides(prev => {
      const without = prev.filter(o => !(o.trash_id === cfTid && o.profileTrashId === profileTrashId))
      if (score === null) return without
      return [...without, { trash_id: cfTid, name: cf.name, score, profileTrashId }]
    })
  }

  // ── Effects ──
  useEffect(() => { loadConfigs().catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const parsed = parseCronExpression(globalSyncSchedule)
    setGlobalScheduleMode(parsed.mode)
    setGlobalScheduleTime(parsed.time)
    setGlobalScheduleWeekday(parsed.weekday)
    setGlobalScheduleCustom(parsed.custom)
  }, [globalSyncSchedule])

  useEffect(() => { localStorage.setItem('recyclarr_tab', activeServiceTab) }, [activeServiceTab])

  useEffect(() => {
    if (syncOutputRef.current) syncOutputRef.current.scrollTop = syncOutputRef.current.scrollHeight
  }, [syncLines])

  // Effect 1: side effects on instance change — reset init tracking + defaults + async loads
  useEffect(() => {
    localStateInstanceRef.current = null // mark local state as uninitialized for this instance
    if (!instanceId || !currentInstance) return
    // Reset to defaults immediately; Effect 2 will override with saved config once configs load
    setLocalProfilesConfig([])
    setLocalScoreOverrides([])
    setLocalUserCfs([])
    setLocalEnabled(true)
    setLocalPreferredRatio(0)
    setLocalDeleteOldCfs(false)
    setLocalQualityDefType(currentInstance.type === 'radarr' ? 'movie' : 'series')
    setScheduleMode('manual')
    setScheduleTime('04:00')
    setScheduleWeekday('1')
    setScheduleCustom('')
    setSelectedProfileId('')
    setScoreChanges([])
    setScoreChangesChecked(false)
    loadArrData(instanceId).then(ad => {
      if (ad.profiles.length > 0) {
        checkScoreChanges(instanceId).then(res => {
          setScoreChanges(res.changes)
          setScoreChangesChecked(true)
        }).catch(() => {})
      }
    }).catch(() => {})
    setUserCfsFromFsLoading(true)
    api.recyclarr.listUserCfs(currentInstance.type as 'radarr' | 'sonarr')
      .then(r => setUserCfsFromFs(r.cfs))
      .catch(() => {})
      .finally(() => setUserCfsFromFsLoading(false))
    api.recyclarr.listScoreSets(instanceId).then(r => setScoreSets(r.scoreSets)).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId])

  // Effect 2: initialize local state from config — waits for configs to load, runs once per instance
  useEffect(() => {
    if (!instanceId || !currentInstance) return
    if (localStateInstanceRef.current === instanceId) return // already initialized for this instance
    const cfg = configs.find(c => c.instanceId === instanceId)
    if (!cfg) return // configs not loaded yet — will re-run when configs change
    localStateInstanceRef.current = instanceId
    setLocalProfilesConfig(cfg.profilesConfig ?? [])
    setLocalScoreOverrides(cfg.scoreOverrides ?? [])
    setLocalUserCfs(cfg.userCfNames ?? [])
    setLocalEnabled(cfg.enabled)
    setLocalPreferredRatio(cfg.preferredRatio ?? 0)
    setLocalDeleteOldCfs(cfg.deleteOldCfs ?? false)
    setLocalQualityDefType(cfg.qualityDefType ?? (currentInstance.type === 'radarr' ? 'movie' : 'series'))
    const parsed = parseCronExpression(cfg.syncSchedule ?? 'manual')
    setScheduleMode(parsed.mode)
    setScheduleTime(parsed.time)
    setScheduleWeekday(parsed.weekday)
    setScheduleCustom(parsed.custom)
    setSelectedProfileId(prev => cfg.profilesConfig.find(pc => pc.trash_id === prev) ? prev : cfg.profilesConfig[0]?.trash_id ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, configs])

  useEffect(() => {
    api.recyclarr.containerStatus('recyclarr')
      .then(r => setContainerRunning(r.running))
      .catch(() => setContainerRunning(null))
  }, [])

  // Effect: fetch CF groups when profile selection changes
  useEffect(() => {
    if (!instanceId || !selectedProfileId) {
      setProfileCfs([])
      setProfileCfGroups([])
      setProfileCfNotInProfile([])
      setProfileCfGroupsWarning(false)
      setProfileCfGroupsWarningMsg(undefined)
      return
    }
    setProfileCfGroupsLoading(true)
    api.recyclarr.profileCfs(instanceId, selectedProfileId)
      .then(r => {
        setProfileCfs(r.cfs)
        setProfileCfGroups(r.groups)
        setProfileCfNotInProfile(r.notInProfile)
        setProfileCfGroupsWarning(r.warning)
        setProfileCfGroupsWarningMsg(r.warningMessage)
      })
      .catch(() => {
        setProfileCfs([])
        setProfileCfGroups([])
        setProfileCfNotInProfile([])
        setProfileCfGroupsWarning(true)
        setProfileCfGroupsWarningMsg(undefined)
      })
      .finally(() => setProfileCfGroupsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, selectedProfileId])

  // ── handleSave ──
  const handleSave = async () => {
    if (!instanceId) return
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      const syncSchedule = buildCronExpression(scheduleMode, scheduleTime, scheduleWeekday, scheduleCustom)
      const savePayload = {
        enabled: localEnabled,
        selectedProfiles: localProfilesConfig.map(pc => pc.trash_id),
        scoreOverrides: localScoreOverrides,
        userCfNames: localUserCfs,
        preferredRatio: localPreferredRatio,
        profilesConfig: localProfilesConfig,
        syncSchedule,
        deleteOldCfs: localDeleteOldCfs,
        qualityDefType: localQualityDefType,
      }
      console.log('[RecyclarrTab] handleSave payload:', JSON.stringify(savePayload))
      await saveConfig(instanceId, savePayload)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleScheduleSave = async () => {
    setScheduleSaving(true)
    setScheduleSaveError('')
    setScheduleSaveSuccess(false)
    try {
      const expr = buildCronExpression(globalScheduleMode, globalScheduleTime, globalScheduleWeekday, globalScheduleCustom)
      if (expr !== 'manual' && !isValidCron(expr)) {
        setScheduleSaveError('Ungültiger Cron-Ausdruck')
        return
      }
      await saveSchedule(expr)
      setScheduleSaveSuccess(true)
      setTimeout(() => setScheduleSaveSuccess(false), 3000)
    } catch (e) {
      setScheduleSaveError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      setScheduleSaving(false)
    }
  }

  if (radarrSonarrInstances.length === 0 && activeServiceTab !== 'zeitplan') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Radarr- oder Sonarr-Instanzen konfiguriert.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Top bar (admin only) ── */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: containerRunning === null ? 'var(--text-muted)' : containerRunning ? '#10b981' : '#f87171' }} />
            <span style={{ color: 'var(--text-secondary)' }}>
              {containerRunning === null ? 'Container…' : containerRunning ? 'Läuft' : 'Gestoppt'}
            </span>
          </div>

          {currentConfig?.lastSyncedAt && (
            <span className={`badge ${currentConfig.lastSyncSuccess ? 'badge-success' : 'badge-error'}`} style={{ fontSize: 10 }}>
              Letzter Sync: {formatRelativeTime(currentConfig.lastSyncedAt)}
            </span>
          )}

          <div style={{ flex: 1 }} />

          <button className="btn btn-ghost btn-sm" onClick={async () => {
            if (!showYamlPreview) {
              try {
                const res = await api.recyclarr.previewYaml()
                setYamlPreview(res.yaml)
              } catch { setYamlPreview(t('common.error')) }
            }
            setShowYamlPreview(v => !v)
          }} style={{ fontSize: 12, gap: 4 }}>
            <ChevronDown size={12} style={{ transform: showYamlPreview ? 'rotate(180deg)' : undefined, transition: '150ms' }} />
            YAML anzeigen
          </button>

          {instanceId && (
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setAddProfileStep(1)
              setAddProfileSelected([])
              setAddProfileLoading(true)
              setShowAddProfile(true)
              const existing = new Set(configuredProfiles.map(p => p.trash_id))
              api.recyclarr.listProfiles(instanceId).then(r => {
                setAddProfileProfiles(r.profiles.filter(p => !existing.has(p.trash_id)))
              }).catch(() => {}).finally(() => setAddProfileLoading(false))
            }} style={{ fontSize: 12, gap: 4 }}>
              <Plus size={12} />
              Profil hinzufügen
            </button>
          )}

          <button className="btn btn-ghost btn-sm" onClick={() => setShowWizard(true)} style={{ fontSize: 12, gap: 4 }}>
            Wizard
          </button>

          {!showResetConfirm ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowResetConfirm(true)}
              style={{ fontSize: 12, gap: 4, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}>
              <X size={12} /> Config zurücksetzen
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Wirklich?</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowResetConfirm(false)} style={{ fontSize: 12 }}>Cancel</button>
              <button className="btn btn-sm" onClick={async () => {
                setResetting(true)
                try { await resetConfig() } catch { /* ignore */ } finally { setResetting(false); setShowResetConfirm(false) }
              }} disabled={resetting}
                style={{ fontSize: 12, background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer' }}>
                {resetting ? '…' : 'Yes, reset'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── YAML preview ── */}
      {showYamlPreview && (
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>recyclarr.yml</span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(yamlPreview)} style={{ fontSize: 11 }}>Kopieren</button>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, overflowX: 'auto', overflowY: 'auto', maxHeight: 400, margin: 0, whiteSpace: 'pre', color: 'var(--text-primary)' }}>
            {yamlPreview.replace(/api_key:\s*(\S{4})(\S+)/g, (_, last4) => `api_key: ••••••••${last4}`)}
          </pre>
        </div>
      )}

      {/* ── Container stopped warning ── */}
      {containerRunning === false && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-md)' }}>
          <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#f87171' }}>Recyclarr-Container läuft nicht. Sync nicht möglich.</span>
        </div>
      )}

      {/* ── Sync section ── */}
      {isAdmin && (
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Synchronisation</h4>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => sync(undefined)} disabled={syncing}
              style={{ fontSize: 12, gap: 4 }}>
              {syncing ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Check size={12} />}
              {syncing ? 'Syncing…' : 'Global Sync'}
            </button>
            {!loading && (
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                try { await adoptCfs() } catch { /* ignore */ }
              }} disabled={syncing} style={{ fontSize: 12, gap: 4 }}>
                <Check size={12} />
                Adopt CFs
              </button>
            )}
            {syncDone && syncExitCode !== null && (
              syncExitCode === 0
                ? <span className="badge-success" style={{ fontSize: 11 }}>Sync abgeschlossen</span>
                : <span className="badge-error" style={{ fontSize: 11 }}>Sync fehlgeschlagen</span>
            )}
          </div>
          {/* Sync history collapsible */}
          {isAdmin && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 8 }}>
              <button
                onClick={() => {
                  const next = !historyOpen
                  setHistoryOpen(next)
                  if (next && syncHistory.length === 0) loadSyncHistory().catch(() => {})
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, padding: '4px 0', width: '100%' }}
              >
                <ChevronRight size={12} style={{ transform: historyOpen ? 'rotate(90deg)' : 'none', transition: 'transform var(--transition-base)' }} />
                Verlauf anzeigen
              </button>
              {historyOpen && (
                <>
                  {!syncing && syncLines.length > 0 && (
                    <pre ref={syncOutputRef} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, overflowY: 'auto', whiteSpace: 'pre-wrap', maxHeight: 240, margin: '8px 0 0' }}>
                      {syncLines.map((sl, i) => (
                        <span key={i} style={{ display: 'block', color: sl.type === 'stderr' ? 'var(--status-offline)' : 'var(--text-primary)' }}>{sl.line}</span>
                      ))}
                    </pre>
                  )}
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {syncHistory.length === 0
                      ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Kein Verlauf vorhanden</div>
                      : syncHistory.map(h => (
                          <div key={h.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.15)' }}>
                            <span className={h.success ? 'badge-success' : 'badge-error'} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                              {h.success ? 'OK' : t('common.error')}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                              {new Date(h.synced_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short', hour12: use12h })}
                            </span>
                            {h.changes_summary && (
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
                                {h.changes_summary.created > 0 && `+${h.changes_summary.created} `}
                                {h.changes_summary.updated > 0 && `~${h.changes_summary.updated} `}
                                {h.changes_summary.deleted > 0 && `-${h.changes_summary.deleted}`}
                              </span>
                            )}
                          </div>
                        ))
                    }
                  </div>
                </>
              )}
            </div>
          )}

          {/* Backups collapsible (admin only) */}
          {isAdmin && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 8 }}>
              <button
                onClick={() => {
                  const next = !backupsOpen
                  setBackupsOpen(next)
                  if (next && backups.length === 0) loadBackups().catch(() => {})
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, padding: '4px 0', width: '100%' }}
              >
                <ChevronRight size={12} style={{ transform: backupsOpen ? 'rotate(90deg)' : 'none', transition: 'transform var(--transition-base)' }} />
                Backups
              </button>
              {backupsOpen && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {backups.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Backups vorhanden</div>
                    : backups.map(b => (
                        <div key={b.filename} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.15)' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, fontFamily: 'var(--font-mono)' }}>{b.filename}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(b.size / 1024).toFixed(1)} KB</span>
                          {restoreSuccess === b.filename
                            ? <span className="badge-success" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>Wiederhergestellt</span>
                            : (
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={restoringBackup === b.filename}
                                onClick={async () => {
                                  setRestoringBackup(b.filename)
                                  setRestoreSuccess('')
                                  try {
                                    await restoreBackup(b.filename)
                                    setRestoreSuccess(b.filename)
                                  } catch { /* ignore */ } finally {
                                    setRestoringBackup('')
                                  }
                                }}
                                style={{ fontSize: 11, padding: '2px 8px' }}
                              >
                                {restoringBackup === b.filename ? '…' : 'Wiederherstellen'}
                              </button>
                            )
                          }
                        </div>
                      ))
                  }
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Service tabs: Radarr / Sonarr / Zeitplan ── */}
      <div style={{ display: 'flex', gap: 4 }}>
        {radarrInstances.length > 0 && (
          <button onClick={() => setActiveServiceTab('radarr')}
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-md)', fontSize: 13,
              fontWeight: activeServiceTab === 'radarr' ? 600 : 400,
              background: activeServiceTab === 'radarr' ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
              color: activeServiceTab === 'radarr' ? 'var(--accent)' : 'var(--text-secondary)',
              border: activeServiceTab === 'radarr' ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>Radarr</button>
        )}
        {sonarrInstances.length > 0 && (
          <button onClick={() => setActiveServiceTab('sonarr')}
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-md)', fontSize: 13,
              fontWeight: activeServiceTab === 'sonarr' ? 600 : 400,
              background: activeServiceTab === 'sonarr' ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
              color: activeServiceTab === 'sonarr' ? 'var(--accent)' : 'var(--text-secondary)',
              border: activeServiceTab === 'sonarr' ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>Sonarr</button>
        )}
        <button onClick={() => setActiveServiceTab('zeitplan')}
          style={{
            padding: '7px 16px', borderRadius: 'var(--radius-md)', fontSize: 13,
            fontWeight: activeServiceTab === 'zeitplan' ? 600 : 400,
            background: activeServiceTab === 'zeitplan' ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
            color: activeServiceTab === 'zeitplan' ? 'var(--accent)' : 'var(--text-secondary)',
            border: activeServiceTab === 'zeitplan' ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>Zeitplan</button>
      </div>

      {/* ── Service tab content ── */}
      {activeServiceTab !== 'zeitplan' && currentInstance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Score change prompt */}
          {scoreChanges.length > 0 && scoreChangesChecked && (
            <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid rgba(245,158,11,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <span className="badge-warning" style={{ fontSize: 12 }}>Scores wurden manuell in {activeServiceTab === 'radarr' ? 'Radarr' : 'Sonarr'} geändert</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {scoreChanges.slice(0, 5).map((ch, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {ch.cfName}: {ch.oldScore} → {ch.newScore} ({ch.profileName})
                  </div>
                ))}
                {scoreChanges.length > 5 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>…und {scoreChanges.length - 5} weitere</div>}
              </div>
              <span className="badge-neutral" style={{ fontSize: 10 }}>Nicht übernommene Änderungen werden beim nächsten Sync zurückgesetzt</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  setAcceptingChanges(true)
                  try { await acceptScoreChanges(instanceId!, scoreChanges); setScoreChanges([]) } catch { /* ignore */ }
                  setAcceptingChanges(false)
                }} disabled={acceptingChanges} style={{ fontSize: 12 }}>
                  {acceptingChanges ? '…' : 'Accept changes'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setScoreChanges([])} style={{ fontSize: 12 }}>Ignorieren</button>
              </div>
            </div>
          )}

          {/* Profile selector / empty state */}
          {configuredProfiles.length === 0 ? (
            <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 32, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Keine Profile konfiguriert.</p>
              {isAdmin && (
                <button className="btn btn-primary btn-sm" onClick={() => {
                  setAddProfileStep(1)
                  setAddProfileSelected([])
                  setAddProfileLoading(true)
                  setShowAddProfile(true)
                  api.recyclarr.listProfiles(instanceId!).then(r => {
                    setAddProfileProfiles(r.profiles)
                  }).catch(() => {}).finally(() => setAddProfileLoading(false))
                }} style={{ fontSize: 12, gap: 4 }}>
                  <Plus size={12} /> Profil hinzufügen
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Profile buttons or dropdown */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {configuredProfiles.length <= 4 ? (
                  configuredProfiles.map(pc => (
                    <button key={pc.trash_id} onClick={() => setSelectedProfileId(pc.trash_id)}
                      className={selectedProfileId === pc.trash_id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                      style={{ fontSize: 12 }}>
                      {pc.name}
                    </button>
                  ))
                ) : (
                  <select value={selectedProfileId} onChange={e => setSelectedProfileId(e.target.value)}
                    className="form-input" style={{ maxWidth: 250 }}>
                    {configuredProfiles.map(pc => (
                      <option key={pc.trash_id} value={pc.trash_id}>{pc.name}</option>
                    ))}
                  </select>
                )}
                {configuredProfiles.length > 1 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowProfileComparison(true)}
                    style={{ fontSize: 11, marginLeft: 'auto', gap: 4 }}
                    title="Profile vergleichen"
                  >
                    <LayoutGrid size={11} />
                    Vergleichen
                  </button>
                )}
              </div>

              {/* Active profile detail panel */}
              {selectedProfileId && activeProfileConfig && (
                <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Profile header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{activeProfileConfig.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{activeProfileConfig.trash_id}</div>
                    </div>
                    {isAdmin && !confirmDeleteProfile && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteProfile(selectedProfileId)}
                        style={{ fontSize: 12, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                    {isAdmin && confirmDeleteProfile === selectedProfileId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Profil entfernen?</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteProfile(null)} style={{ fontSize: 11 }}>Cancel</button>
                        <button className="btn btn-sm" onClick={() => {
                          setLocalProfilesConfig(prev => prev.filter(pc => pc.trash_id !== selectedProfileId))
                          setLocalScoreOverrides(prev => prev.filter(o => o.profileTrashId !== selectedProfileId))
                          setLocalUserCfs(prev => prev.filter(u => u.profileTrashId !== selectedProfileId))
                          setSelectedProfileId(configuredProfiles.find(pc => pc.trash_id !== selectedProfileId)?.trash_id ?? '')
                          setConfirmDeleteProfile(null)
                        }}
                          style={{ fontSize: 11, background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer' }}>
                          Entfernen
                        </button>
                      </div>
                    )}
                  </div>

                  {/* TRaSH Custom Formats section */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
                      <button onClick={() => setTrashCfsCollapsed(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 0, flex: 1, textAlign: 'left' }}>
                        {trashCfsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        TRaSH Custom Formats
                        {profileCfs.length > 0 && (
                          <span className="badge-neutral" style={{ fontSize: 10 }}>{profileCfs.length}</span>
                        )}
                      </button>
                      {!trashCfsCollapsed && (
                        <button
                          className={heatmapView ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                          onClick={() => setHeatmapView(v => !v)}
                          style={{ fontSize: 10, padding: '2px 8px', gap: 4, flexShrink: 0 }}
                          title="Heatmap-Ansicht"
                        >
                          <LayoutGrid size={10} />
                          Heatmap
                        </button>
                      )}
                    </div>
                    {!trashCfsCollapsed && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {currentArrDataLoading || profileCfGroupsLoading ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lade CFs…</span>
                          </div>
                        ) : !currentArrData || currentArrData.profiles.length === 0 ? (
                          <span className="badge-neutral" style={{ fontSize: 11, alignSelf: 'flex-start' }}>
                            Noch kein Sync — CFs werden nach dem ersten Sync angezeigt
                          </span>
                        ) : profileCfs.length === 0 && profileCfGroupsWarning ? (
                          <span className="badge-warning" style={{ fontSize: 11, alignSelf: 'flex-start' }}>
                            {profileCfGroupsWarningMsg ?? 'CF-Gruppen nicht verfügbar — alle verwalteten CFs werden angezeigt'}
                          </span>
                        ) : (() => {
                          if (profileCfs.length === 0) return (
                            <span className="badge-neutral" style={{ fontSize: 11, alignSelf: 'flex-start' }}>Keine CFs in diesem Profil</span>
                          )
                          if (heatmapView) {
                            // ── Heatmap view (uses profileCfs) ──
                            const scores = profileCfs.map(item => {
                              const override = getOverride(String(item.arrId), selectedProfileId)
                              return override !== null ? override : item.currentScore
                            })
                            const maxAbs = Math.max(1, ...scores.map(Math.abs))
                            return (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {profileCfs.map(item => {
                                  const cfTid = String(item.arrId)
                                  const override = getOverride(cfTid, selectedProfileId)
                                  const effective = override !== null ? override : item.currentScore
                                  const intensity = Math.abs(effective) / maxAbs
                                  const hue = effective >= 0 ? '142' : '0'
                                  const bg = effective === 0
                                    ? 'rgba(128,128,128,0.15)'
                                    : `hsla(${hue}, 70%, 50%, ${0.1 + intensity * 0.5})`
                                  const border = override !== null && override !== item.currentScore
                                    ? '1px solid rgba(var(--accent-rgb), 0.5)'
                                    : '1px solid transparent'
                                  return (
                                    <div
                                      key={item.arrId}
                                      title={`${item.name}: ${effective}${override !== null && override !== item.currentScore ? ` (Guide: ${item.currentScore})` : ''}${item.groups.length > 0 ? ` [${item.groups.join(', ')}]` : ''}`}
                                      style={{
                                        background: bg, border, borderRadius: 'var(--radius-sm)',
                                        padding: '4px 8px', fontSize: 10, cursor: 'default',
                                        color: 'var(--text-primary)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                        minWidth: 60, maxWidth: 120,
                                      }}
                                    >
                                      <span style={{ fontSize: 10, fontWeight: 600, color: effective > 0 ? '#4ade80' : effective < 0 ? '#f87171' : 'var(--text-muted)', lineHeight: 1 }}>
                                        {effective > 0 ? '+' : ''}{effective}
                                      </span>
                                      <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                                        {item.name}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          }

                          // ── List view: grouped or flat ──
                          const cfRow = (item: { arrId: number; name: string; currentScore: number; managedByRecyclarr?: boolean; isUserCf?: boolean }) => {
                            const cfTid = String(item.arrId)
                            const override = getOverride(cfTid, selectedProfileId)
                            const isOverridden = override !== null && override !== item.currentScore
                            const notManaged = item.managedByRecyclarr === false && !item.isUserCf
                            return (
                              <div key={item.arrId} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px', gap: 8, padding: '6px 8px', background: isOverridden ? 'rgba(var(--accent-rgb), 0.06)' : 'rgba(var(--text-rgb), 0.03)', borderRadius: 'var(--radius-sm)', alignItems: 'center', opacity: notManaged ? 0.7 : 1 }}>
                                <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {item.name}
                                  {item.isUserCf && <span className="badge-accent" style={{ fontSize: 9 }}>User CF</span>}
                                  {notManaged && <span className="badge-neutral" style={{ fontSize: 9 }}>Nicht von Recyclarr verwaltet</span>}
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{item.currentScore}</span>
                                <input
                                  type="number"
                                  className="form-input"
                                  placeholder={String(item.currentScore)}
                                  value={override !== null ? override : ''}
                                  onChange={e => {
                                    const val = e.target.value
                                    if (val === '') setOverride({ id: item.arrId, name: item.name, trash_id: cfTid }, selectedProfileId, null)
                                    else {
                                      const num = parseInt(val, 10)
                                      if (num === item.currentScore) setOverride({ id: item.arrId, name: item.name, trash_id: cfTid }, selectedProfileId, null)
                                      else setOverride({ id: item.arrId, name: item.name, trash_id: cfTid }, selectedProfileId, num)
                                    }
                                  }}
                                  style={{ width: '100%', textAlign: 'right', fontSize: 12 }}
                                />
                                <div>
                                  {isOverridden && <span className="badge-warning" style={{ fontSize: 10 }}>Override</span>}
                                  {override !== null && override === item.currentScore && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>= Guide</span>}
                                </div>
                              </div>
                            )
                          }

                          const colHeader = (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px', gap: 8, padding: '4px 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                              <span>Name</span><span style={{ textAlign: 'right' }}>Aktueller Score</span><span style={{ textAlign: 'right' }}>Override</span><span />
                            </div>
                          )

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {profileCfGroupsWarning && (
                                <span className="badge-warning" style={{ fontSize: 10, alignSelf: 'flex-start', marginBottom: 4 }}>
                                  {profileCfGroupsWarningMsg ?? 'Gruppen konnten nicht geladen werden'}
                                </span>
                              )}
                              {profileCfGroups.length > 0 ? (
                                // Grouped view
                                <>
                                  {profileCfGroups.map(group => {
                                    const groupCfs = profileCfs
                                      .filter(cf => cf.groups.includes(group.name))
                                      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
                                    if (groupCfs.length === 0) return null
                                    const isCollapsed = collapsedGroups.has(group.name)
                                    return (
                                      <div key={group.name} style={{ marginBottom: 8 }}>
                                        <button
                                          onClick={() => toggleGroup(group.name)}
                                          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, padding: '2px 8px 4px', fontFamily: 'var(--font-sans)' }}
                                        >
                                          {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                                          {group.name}
                                          <span className="badge-neutral" style={{ fontSize: 9 }}>{groupCfs.length} CFs</span>
                                        </button>
                                        {!isCollapsed && (
                                          <>
                                            {colHeader}
                                            {groupCfs.map(cfRow)}
                                          </>
                                        )}
                                      </div>
                                    )
                                  })}
                                  {/* Ungrouped CFs — shown as "Allgemein" with collapse */}
                                  {(() => {
                                    const ungrouped = profileCfs.filter(cf => cf.groups.length === 0).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
                                    if (ungrouped.length === 0) return null
                                    const isCollapsed = collapsedGroups.has('__ungrouped__')
                                    return (
                                      <div style={{ marginBottom: 8 }}>
                                        <button
                                          onClick={() => toggleGroup('__ungrouped__')}
                                          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, padding: '2px 8px 4px', fontFamily: 'var(--font-sans)' }}
                                        >
                                          {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                                          Allgemein
                                          <span className="badge-neutral" style={{ fontSize: 9 }}>{ungrouped.length} CFs</span>
                                        </button>
                                        {!isCollapsed && (
                                          <>
                                            {colHeader}
                                            {ungrouped.map(cfRow)}
                                          </>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </>
                              ) : (
                                // Flat sorted list
                                <>
                                  {colHeader}
                                  {[...profileCfs].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map(cfRow)}
                                </>
                              )}
                              {/* CFs in Arr but not managed by Recyclarr for this profile */}
                              {profileCfNotInProfile.length > 0 && (
                                <details style={{ marginTop: 8 }}>
                                  <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 0' }}>
                                    Nicht im Profil ({profileCfNotInProfile.length})
                                  </summary>
                                  <div style={{ padding: '4px 8px 2px' }}>
                                    <span className="badge-neutral" style={{ fontSize: 9 }}>CFs in Radarr/Sonarr die Recyclarr für dieses Profil nicht verwaltet</span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                                    {[...profileCfNotInProfile].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map(item => (
                                      <div key={item.arrId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: 12, color: 'var(--text-muted)', background: 'rgba(var(--text-rgb), 0.02)', borderRadius: 'var(--radius-sm)' }}>
                                        <span>{item.name}</span>
                                        <span>{item.currentScore}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>

                  {/* User CFs section */}
                  <div>
                    <button onClick={() => setUserCfsCollapsed(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '0 0 8px 0', width: '100%', textAlign: 'left' }}>
                      {userCfsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      Eigene Custom Formats
                      <span className="badge-neutral" style={{ fontSize: 10 }}>{userCfsFromFs.length}</span>
                    </button>
                    {!userCfsCollapsed && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="badge-neutral" style={{ fontSize: 10, alignSelf: 'flex-start', marginBottom: 4 }}>
                          User CFs werden von Recyclarr nie zurückgesetzt — kein Eintrag in Ausnahmen nötig
                        </span>
                        {userCfsFromFsLoading ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lade User CFs…</span>
                          </div>
                        ) : userCfsFromFs.length === 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Noch keine eigenen CFs vorhanden</span>
                        ) : (
                          [...userCfsFromFs].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map(cf => {
                            const entry = localUserCfs.find(u => u.trash_id === cf.trash_id && u.profileTrashId === selectedProfileId)
                            const checked = !!entry
                            return (
                              <div key={cf.trash_id} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                background: checked ? 'rgba(var(--accent-rgb), 0.06)' : 'rgba(var(--text-rgb), 0.03)',
                                borderRadius: 'var(--radius-sm)',
                                border: checked ? '1px solid rgba(var(--accent-rgb), 0.2)' : '1px solid transparent',
                              }}>
                                <input type="checkbox" checked={checked} onChange={e => {
                                  if (e.target.checked) {
                                    setLocalUserCfs(prev => [...prev, { trash_id: cf.trash_id, name: cf.name, score: 0, profileTrashId: selectedProfileId, profileName: activeProfileConfig.name }])
                                  } else {
                                    setLocalUserCfs(prev => prev.filter(u => !(u.trash_id === cf.trash_id && u.profileTrashId === selectedProfileId)))
                                  }
                                }} />
                                <span style={{ flex: 1, fontSize: 13 }}>{cf.name}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{cf.trash_id}</span>
                                {checked && entry ? (
                                  <input type="number" className="form-input"
                                    value={entry.score}
                                    onChange={e => setLocalUserCfs(prev => prev.map(u =>
                                      u.trash_id === cf.trash_id && u.profileTrashId === selectedProfileId
                                        ? { ...u, score: parseInt(e.target.value, 10) || 0 } : u
                                    ))}
                                    style={{ width: 80, textAlign: 'right', fontSize: 12 }}
                                  />
                                ) : <span className="badge-neutral" style={{ fontSize: 10 }}>Nicht aktiv</span>}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Save button */}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                      {hasUnsavedChanges && <span className="badge-warning" style={{ fontSize: 10 }}>Ungespeicherte Änderungen</span>}
                      {saveSuccess && <span className="badge-success" style={{ fontSize: 10 }}>Gespeichert</span>}
                      {saveError && <span style={{ fontSize: 11, color: '#f87171' }}>{saveError}</span>}
                      <div style={{ flex: 1 }} />
                      <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !hasUnsavedChanges}
                        style={{ fontSize: 12, gap: 4 }}>
                        {saving ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Check size={12} />}
                        {saving ? t('common.saving') : t('common.save')}
                      </button>
                    </div>
                  )}

                  {/* Advanced settings */}
                  {isAdmin && (
                    <div>
                      <button onClick={() => setAdvancedCollapsed(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px 0' }}>
                        {advancedCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        Erweiterte Einstellungen
                      </button>
                      {!advancedCollapsed && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-md)' }}>

                          {/* min_format_score */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Min Format Score</label>
                            <input type="number" className="form-input" style={{ width: 120 }}
                              placeholder="0 = deaktiviert"
                              value={activeProfileConfig.min_format_score ?? ''}
                              onChange={e => setLocalProfilesConfig(prev => prev.map(pc => pc.trash_id === selectedProfileId ? { ...pc, min_format_score: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0 } : pc))}
                            />
                            <span className="badge-neutral" style={{ fontSize: 10, alignSelf: 'flex-start' }}>10000 = Nur deutsche Releases</span>
                          </div>

                          {/* min_upgrade_format_score */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Min Upgrade Format Score</label>
                            <input type="number" className="form-input" style={{ width: 120 }}
                              placeholder="Optional"
                              value={activeProfileConfig.min_upgrade_format_score ?? ''}
                              onChange={e => setLocalProfilesConfig(prev => prev.map(pc => pc.trash_id === selectedProfileId ? { ...pc, min_upgrade_format_score: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0 } : pc))}
                            />
                          </div>

                          {/* score_set */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Score Set</label>
                            <select className="form-input" style={{ maxWidth: 250 }}
                              value={activeProfileConfig.score_set ?? ''}
                              onChange={e => setLocalProfilesConfig(prev => prev.map(pc => pc.trash_id === selectedProfileId ? { ...pc, score_set: e.target.value || undefined } : pc))}>
                              <option value="">Standard (default)</option>
                              {scoreSets.map(ss => <option key={ss} value={ss}>{ss}</option>)}
                            </select>
                          </div>

                          {/* reset_unmatched_scores */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                              <input type="checkbox" checked={activeProfileConfig.reset_unmatched_scores_enabled}
                                onChange={e => setLocalProfilesConfig(prev => prev.map(pc => pc.trash_id === selectedProfileId ? { ...pc, reset_unmatched_scores_enabled: e.target.checked } : pc))}
                              />
                              <span style={{ color: 'var(--text-secondary)' }}>Reset unmatched scores</span>
                            </label>
                            {activeProfileConfig.reset_unmatched_scores_enabled && (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ausnahmen (CF-Namen)</label>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                                    {(activeProfileConfig.reset_unmatched_scores_except ?? []).map((ex, idx) => (
                                      <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.25)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--accent)' }}>
                                        {ex}
                                        <button onClick={() => setLocalProfilesConfig(prev => prev.map(pc => pc.trash_id === selectedProfileId ? { ...pc, reset_unmatched_scores_except: pc.reset_unmatched_scores_except.filter((_, i) => i !== idx) } : pc))}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', lineHeight: 1 }}><X size={9} /></button>
                                      </span>
                                    ))}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <input className="form-input" style={{ flex: 1 }} placeholder='z.B. "TDARR"' value={newExceptInput}
                                      onChange={e => setNewExceptInput(e.target.value)} />
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => {
                                      if (!newExceptInput.trim()) return
                                      setLocalProfilesConfig(prev => prev.map(pc => pc.trash_id === selectedProfileId ? {
                                        ...pc, reset_unmatched_scores_except: pc.reset_unmatched_scores_except.includes(newExceptInput.trim()) ? pc.reset_unmatched_scores_except : [...pc.reset_unmatched_scores_except, newExceptInput.trim()]
                                      } : pc))
                                      setNewExceptInput('')
                                    }}><Plus size={11} /></button>
                                  </div>
                                  <span className="badge-neutral" style={{ fontSize: 10, alignSelf: 'flex-start' }}>Nur für CFs die nicht über diesen Tab konfiguriert sind</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ausnahmen (Regex-Muster)</label>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                                    {(activeProfileConfig.reset_unmatched_scores_except_patterns ?? []).map((pat, idx) => {
                                      let valid = false
                                      try { new RegExp(pat); valid = true } catch { /* invalid regex */ }
                                      return (
                                        <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.25)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--accent)' }}>
                                          {valid ? '✓' : '✗'} {pat}
                                          <button onClick={() => setLocalProfilesConfig(prev => prev.map(pc => pc.trash_id === selectedProfileId ? { ...pc, reset_unmatched_scores_except_patterns: (pc.reset_unmatched_scores_except_patterns ?? []).filter((_, i) => i !== idx) } : pc))}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', lineHeight: 1 }}><X size={9} /></button>
                                        </span>
                                      )
                                    })}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <input className="form-input" style={{ flex: 1 }} placeholder='^\\[Mein\\]' value={newExceptPatternInput}
                                      onChange={e => setNewExceptPatternInput(e.target.value)} />
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => {
                                      if (!newExceptPatternInput.trim()) return
                                      setLocalProfilesConfig(prev => prev.map(pc => pc.trash_id === selectedProfileId ? {
                                        ...pc, reset_unmatched_scores_except_patterns: [...(pc.reset_unmatched_scores_except_patterns ?? []), newExceptPatternInput.trim()]
                                      } : pc))
                                      setNewExceptPatternInput('')
                                    }}><Plus size={11} /></button>
                                  </div>
                                  <span className="badge-neutral" style={{ fontSize: 10, alignSelf: 'flex-start' }}>Reguläre Ausdrücke, Groß-/Kleinschreibung ignoriert</span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* delete_old_custom_formats */}
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={localDeleteOldCfs} onChange={e => setLocalDeleteOldCfs(e.target.checked)} />
                            <span style={{ color: 'var(--text-secondary)' }}>Nicht mehr verwendete CFs löschen</span>
                            {localDeleteOldCfs && <span className="badge-error" style={{ fontSize: 10 }}>Löscht von Recyclarr erstellte CFs</span>}
                          </label>

                          {/* preferred_ratio */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 130 }}>Preferred Ratio</label>
                            <input type="range" min={0} max={1} step={0.1} value={localPreferredRatio}
                              onChange={e => setLocalPreferredRatio(parseFloat(e.target.value))}
                              style={{ width: 120 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 30 }}>{localPreferredRatio.toFixed(1)}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>0.0 = Qualität, 1.0 = Dateigröße</span>
                          </div>

                          {/* quality_def_type (sonarr only) */}
                          {activeServiceTab === 'sonarr' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <label style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 130 }}>Quality Definition</label>
                              <select className="form-input" style={{ maxWidth: 150 }} value={localQualityDefType}
                                onChange={e => setLocalQualityDefType(e.target.value)}>
                                <option value="series">series</option>
                                <option value="anime">anime</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Zeitplan tab ── */}
      {activeServiceTab === 'zeitplan' && isAdmin && (
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h4 className="section-header" style={{ margin: 0 }}>Automatischer Sync</h4>
            <span className="badge-neutral" style={{ fontSize: 10 }}>Gilt für alle konfigurierten Instanzen gleichzeitig</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['manual', 'daily', 'weekly', 'custom'] as const).map(mode => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="globalScheduleMode" checked={globalScheduleMode === mode} onChange={() => setGlobalScheduleMode(mode)} />
                {mode === 'manual' && (
                  <span>
                    <strong>Manuell</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>Kein automatischer Sync — nur über &apos;Global Sync&apos; Button</span>
                  </span>
                )}
                {mode === 'daily' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>Täglich</strong> um
                    <input type="time" className="form-input" value={globalScheduleTime} onChange={e => setGlobalScheduleTime(e.target.value)} style={{ width: 110 }} />
                    Uhr
                  </span>
                )}
                {mode === 'weekly' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>Wöchentlich</strong> jeden
                    <select className="form-input" value={globalScheduleWeekday} onChange={e => setGlobalScheduleWeekday(e.target.value)} style={{ maxWidth: 100 }}>
                      {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d, i) => <option key={i} value={String(i + 1)}>{d}</option>)}
                    </select>
                    um
                    <input type="time" className="form-input" value={globalScheduleTime} onChange={e => setGlobalScheduleTime(e.target.value)} style={{ width: 110 }} />
                    Uhr
                  </span>
                )}
                {mode === 'custom' && (
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>Benutzerdefiniert</strong>
                      <input
                        className="form-input"
                        value={globalScheduleCustom}
                        onChange={e => setGlobalScheduleCustom(e.target.value)}
                        placeholder="0 4 * * *"
                        style={{ width: 150, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                      />
                      {globalScheduleMode === 'custom' && globalScheduleCustom && (
                        isValidCron(globalScheduleCustom)
                          ? <span className="badge-success" style={{ fontSize: 10 }}>Gültiger Ausdruck</span>
                          : <span className="badge-error" style={{ fontSize: 10 }}>Ungültiger Ausdruck</span>
                      )}
                    </span>
                    {globalScheduleMode === 'custom' && globalScheduleCustom && isValidCron(globalScheduleCustom) && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 0 }}>{describeCron(globalScheduleCustom)}</span>
                    )}
                  </span>
                )}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleScheduleSave}
              disabled={scheduleSaving || (globalScheduleMode === 'custom' && !isValidCron(globalScheduleCustom))}
              style={{ fontSize: 12, gap: 4 }}
            >
              {scheduleSaving ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Check size={12} />}
              {scheduleSaving ? t('common.saving') : t('common.save')}
            </button>
            {scheduleSaveSuccess && <span className="badge-success" style={{ fontSize: 10 }}>Gespeichert</span>}
            {scheduleSaveError && <span style={{ fontSize: 11, color: '#f87171' }}>{scheduleSaveError}</span>}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

          {configs.some(c => c.lastSyncedAt) && (() => {
            const latest = configs.reduce<typeof configs[number] | null>((acc, c) => {
              if (!c.lastSyncedAt) return acc
              if (!acc?.lastSyncedAt) return c
              return new Date(c.lastSyncedAt) > new Date(acc.lastSyncedAt) ? c : acc
            }, null)
            if (!latest?.lastSyncedAt) return null
            return (
              <div>
                {latest.lastSyncSuccess
                  ? <span className="badge-success" style={{ fontSize: 11 }}>Letzter Sync: {formatRelativeTime(latest.lastSyncedAt)}</span>
                  : <span className="badge-error" style={{ fontSize: 11 }}>Fehlgeschlagen: {formatRelativeTime(latest.lastSyncedAt)}</span>}
              </div>
            )
          })()}

          <span className="badge-warning" style={{ fontSize: 10, alignSelf: 'flex-start' }}>
            CRON_SCHEDULE im Recyclarr-Container deaktivieren: CRON_SCHEDULE=0 0 1 1 0
          </span>
        </div>
      )}

      {/* Add Profile mini modal */}
      {showAddProfile && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>Profil hinzufügen — Schritt {addProfileStep} von 2</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddProfile(false)} style={{ fontSize: 12 }}><X size={14} /></button>
            </div>
            {addProfileStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {addProfileLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /><span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade Profile…</span></div>
                ) : addProfileProfiles.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Alle verfügbaren Profile bereits konfiguriert.</p>
                ) : (
                  addProfileProfiles.map(p => (
                    <label key={p.trash_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: addProfileSelected.includes(p.trash_id) ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-md)', cursor: 'pointer', border: addProfileSelected.includes(p.trash_id) ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent' }}>
                      <input type="checkbox" checked={addProfileSelected.includes(p.trash_id)}
                        onChange={e => setAddProfileSelected(prev => e.target.checked ? [...prev, p.trash_id] : prev.filter(id => id !== p.trash_id))} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.trash_id}</div>
                      </div>
                    </label>
                  ))
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddProfile(false)} style={{ fontSize: 12 }}>Cancel</button>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm" disabled={addProfileSelected.length === 0} onClick={() => setAddProfileStep(2)} style={{ fontSize: 12 }}>Weiter</button>
                </div>
              </div>
            )}
            {addProfileStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={addProfileQualDef} onChange={e => setAddProfileQualDef(e.target.checked)} />
                  Quality Definition aktivieren
                  <span className="badge-neutral" style={{ fontSize: 10 }}>Empfohlen</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={addProfileMinScore} onChange={e => setAddProfileMinScore(e.target.checked)} />
                  Nur deutsche Releases (min. Score 10000)
                  <span className="badge-neutral" style={{ fontSize: 10 }}>Releases ohne deutschen Ton werden ignoriert</span>
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAddProfileStep(1)} style={{ fontSize: 12 }}>Zurück</button>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    const newPcs: import('../types/recyclarr').RecyclarrProfileConfig[] = addProfileSelected.map(tid => {
                      const p = addProfileProfiles.find(pr => pr.trash_id === tid)!
                      return {
                        trash_id: tid,
                        name: p.name,
                        min_format_score: addProfileMinScore ? 10000 : undefined,
                        reset_unmatched_scores_enabled: true,
                        reset_unmatched_scores_except: [],
                        reset_unmatched_scores_except_patterns: [],
                      }
                    })
                    setLocalProfilesConfig(prev => [...prev, ...newPcs])
                    setSelectedProfileId(newPcs[0]?.trash_id ?? selectedProfileId)
                    setShowAddProfile(false)
                  }} style={{ fontSize: 12 }}>Profil hinzufügen</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wizard modal */}
      {showWizard && (
        <RecyclarrWizard
          instances={radarrSonarrInstances}
          onClose={() => setShowWizard(false)}
          onComplete={async (wizardCfg) => {
            try {
              await saveConfig(wizardCfg.instanceId, wizardCfg)
              setShowWizard(false)
              await loadConfigs()
            } catch { /* ignore */ }
          }}
        />
      )}

      {/* ── Profile Comparison Modal ── */}
      {showProfileComparison && currentArrData && configuredProfiles.length > 1 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowProfileComparison(false)}>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, maxWidth: 900, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0, flex: 1 }}>Profil-Vergleich</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowProfileComparison(false)} style={{ width: 28, height: 28, padding: 0 }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {(() => {
                // Collect all CF names across profiles
                const allCfNames = new Set<string>()
                configuredProfiles.forEach(pc => {
                  const arrProfile = currentArrData.profiles.find(p => p.name === pc.name)
                  arrProfile?.formatItems.forEach(fi => allCfNames.add(fi.name))
                })
                const cfList = Array.from(allCfNames).sort()
                if (cfList.length === 0) return (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                    Noch kein Sync — Daten werden nach dem ersten Sync angezeigt
                  </div>
                )
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)' }}>
                          Custom Format
                        </th>
                        {configuredProfiles.map(pc => (
                          <th key={pc.trash_id} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: 'var(--accent)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-elevated)' }}>
                            {pc.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cfList.map(cfName => {
                        const scores = configuredProfiles.map(pc => {
                          const arrProfile = currentArrData.profiles.find(p => p.name === pc.name)
                          const fi = arrProfile?.formatItems.find(f => f.name === cfName)
                          if (!fi) return null
                          const override = getOverride(String(fi.format), pc.trash_id)
                          return override !== null ? override : fi.score
                        })
                        const allSame = scores.every(s => s === scores[0])
                        return (
                          <tr key={cfName} style={{ borderBottom: '1px solid rgba(var(--glass-border-rgb,255,255,255),0.05)' }}>
                            <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{cfName}</td>
                            {scores.map((score, i) => (
                              <td key={i} style={{ padding: '5px 8px', textAlign: 'right',
                                color: score === null ? 'var(--text-muted)'
                                  : !allSame ? (score > 0 ? '#4ade80' : score < 0 ? '#f87171' : 'var(--text-muted)')
                                  : 'var(--text-secondary)',
                                fontWeight: !allSame ? 600 : 400,
                              }}>
                                {score === null ? '—' : score > 0 ? `+${score}` : score}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CF Manager helpers ─────────────────────────────────────────────────────────

interface DraftSpec {
  implementation: string
  implementationName: string
  name: string
  negate: boolean
  required: boolean
  fields: Array<{ name: string; value: unknown }>
}

function initDraftSpec(schema: ArrCFSchema[]): DraftSpec {
  const first = schema[0]
  return {
    implementation: first?.implementation ?? 'ReleaseTitleSpecification',
    implementationName: first?.implementationName ?? 'Release Title',
    name: '',
    negate: false,
    required: false,
    fields: [],
  }
}

function toDraftSpec(spec: ArrCFSpecification): DraftSpec {
  const fields = spec.fields as unknown
  let normalizedFields: Array<{ name: string; value: unknown }>
  if (Array.isArray(fields)) {
    normalizedFields = fields as Array<{ name: string; value: unknown }>
  } else if (fields && typeof fields === 'object') {
    normalizedFields = Object.entries(fields as Record<string, unknown>).map(([n, v]) => ({ name: n, value: v }))
  } else {
    normalizedFields = []
  }
  return {
    implementation: spec.implementation,
    implementationName: spec.implementationName ?? spec.implementation,
    name: spec.name,
    negate: spec.negate,
    required: spec.required,
    fields: normalizedFields,
  }
}

function buildSpecPayload(spec: DraftSpec, schemaEntry?: ArrCFSchema): ArrCFSpecification {
  let fields: { name: string; value: unknown }[]
  if (schemaEntry && schemaEntry.fields.length > 0) {
    fields = schemaEntry.fields.map(fieldDef => ({
      name: fieldDef.name,
      value: spec.fields.find(f => f.name === fieldDef.name)?.value ?? (
        fieldDef.type === 'select' ? (fieldDef.selectOptions?.[0]?.value ?? 0) : ''
      ),
    }))
  } else {
    fields = spec.fields as { name: string; value: unknown }[]
  }
  return {
    name: spec.name,
    implementation: spec.implementation,
    implementationName: spec.implementationName,
    negate: spec.negate,
    required: spec.required,
    fields,
  }
}

function toUserSlug(name: string): string {
  return 'user-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function normalizeArrSpec(spec: {
  name: string; implementation: string; implementationName?: string
  negate: boolean; required: boolean; fields: unknown
}): ArrCFSpecification {
  const rawFields = spec.fields
  const fields: { name: string; value: unknown }[] = Array.isArray(rawFields)
    ? rawFields as { name: string; value: unknown }[]
    : Object.entries(rawFields as Record<string, unknown>).map(([name, value]) => ({ name, value }))
  return {
    name: spec.name,
    implementation: spec.implementation,
    implementationName: spec.implementationName ?? spec.implementation,
    negate: spec.negate,
    required: spec.required,
    fields,
  }
}

// ── Condition Templates ────────────────────────────────────────────────────────

interface ConditionTemplate {
  label: string
  implementation: string
  fields: Array<{ name: string; value: unknown }>
  nameHint?: string
}

interface ConditionTemplateGroup {
  group: string
  templates: ConditionTemplate[]
}

const CONDITION_TEMPLATES: ConditionTemplateGroup[] = [
  {
    group: 'Release Title (Regex)',
    templates: [
      { label: 'Deutsch/German', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(German|Deutsch|GERMAN)\\b' }] },
      { label: 'x265/HEVC', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(x265|HEVC|H\\.265)\\b' }] },
      { label: 'x264/AVC', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(x264|H\\.264|AVC)\\b' }] },
      { label: 'Netflix', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(NF|Netflix)\\b' }] },
      { label: 'Amazon', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(AMZN|Amazon)\\b' }] },
      { label: 'Disney+', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(DSNP|Disney)\\b' }] },
      { label: 'Apple TV+', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(ATVP|AppleTV)\\b' }] },
      { label: 'HBO Max', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(HMAX|HBO)\\b' }] },
      { label: 'Remux', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(Remux|REMUX)\\b' }] },
      { label: 'PROPER/REPACK', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(PROPER|REPACK)\\b' }] },
      { label: 'IMAX', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(IMAX)\\b' }] },
      { label: 'HDR', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(HDR|HDR10|HDR10Plus|DV)\\b' }] },
      { label: 'Dolby Vision', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(DV|DoVi|Dolby.?Vision)\\b' }] },
      { label: 'Atmos', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(Atmos|ATMOS)\\b' }] },
      { label: 'TrueHD', implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', value: '\\b(TrueHD|TRUEHD)\\b' }] },
    ],
  },
  {
    group: 'Language',
    templates: [
      { label: 'Deutsch', implementation: 'LanguageSpecification', fields: [{ name: 'value', value: 4 }] },
      { label: 'Englisch', implementation: 'LanguageSpecification', fields: [{ name: 'value', value: 1 }] },
      { label: 'Französisch', implementation: 'LanguageSpecification', fields: [{ name: 'value', value: 2 }] },
      { label: 'Japanisch', implementation: 'LanguageSpecification', fields: [{ name: 'value', value: 8 }] },
      { label: 'Multi', implementation: 'LanguageSpecification', fields: [{ name: 'value', value: -2 }] },
    ],
  },
  {
    group: 'Source',
    templates: [
      { label: 'BluRay', implementation: 'SourceSpecification', fields: [{ name: 'value', value: 9 }] },
      { label: 'WEB-DL', implementation: 'SourceSpecification', fields: [{ name: 'value', value: 7 }] },
      { label: 'WEBRip', implementation: 'SourceSpecification', fields: [{ name: 'value', value: 8 }] },
      { label: 'HDTV', implementation: 'SourceSpecification', fields: [{ name: 'value', value: 4 }] },
      { label: 'DVD', implementation: 'SourceSpecification', fields: [{ name: 'value', value: 2 }] },
    ],
  },
  {
    group: 'Resolution',
    templates: [
      { label: '480p', implementation: 'ResolutionSpecification', fields: [{ name: 'value', value: 480 }] },
      { label: '720p', implementation: 'ResolutionSpecification', fields: [{ name: 'value', value: 720 }] },
      { label: '1080p', implementation: 'ResolutionSpecification', fields: [{ name: 'value', value: 1080 }] },
      { label: '2160p', implementation: 'ResolutionSpecification', fields: [{ name: 'value', value: 2160 }] },
    ],
  },
  {
    group: 'Quality Modifier',
    templates: [
      { label: 'Remux', implementation: 'QualityModifierSpecification', fields: [{ name: 'value', value: 5 }] },
      { label: 'RAWHD', implementation: 'QualityModifierSpecification', fields: [{ name: 'value', value: 1 }] },
      { label: 'Telecine', implementation: 'QualityModifierSpecification', fields: [{ name: 'value', value: 2 }] },
      { label: 'Telesync', implementation: 'QualityModifierSpecification', fields: [{ name: 'value', value: 3 }] },
    ],
  },
  {
    group: 'Size',
    templates: [
      { label: 'Klein (< 2 GB)', implementation: 'SizeSpecification', fields: [{ name: 'min', value: 0 }, { name: 'max', value: 2 }] },
      { label: 'Mittel (2–10 GB)', implementation: 'SizeSpecification', fields: [{ name: 'min', value: 2 }, { name: 'max', value: 10 }] },
      { label: 'Groß (10–30 GB)', implementation: 'SizeSpecification', fields: [{ name: 'min', value: 10 }, { name: 'max', value: 30 }] },
      { label: 'Sehr groß (> 30 GB)', implementation: 'SizeSpecification', fields: [{ name: 'min', value: 30 }, { name: 'max', value: 9999 }] },
    ],
  },
  {
    group: 'Release Group',
    templates: [
      { label: 'Eigene Gruppe', nameHint: 'Release Group', implementation: 'ReleaseGroupSpecification', fields: [{ name: 'value', value: '' }] },
    ],
  },
  {
    group: 'Indexer Flag',
    templates: [
      { label: 'Freeleech', implementation: 'IndexerFlagSpecification', fields: [{ name: 'value', value: 1 }] },
      { label: 'Scene', implementation: 'IndexerFlagSpecification', fields: [{ name: 'value', value: 4 }] },
    ],
  },
  {
    group: 'Edition',
    templates: [
      { label: 'IMAX', implementation: 'EditionSpecification', fields: [{ name: 'value', value: 'IMAX' }] },
      { label: "Director's Cut", implementation: 'EditionSpecification', fields: [{ name: 'value', value: 'Director' }] },
      { label: 'Extended', implementation: 'EditionSpecification', fields: [{ name: 'value', value: 'Extended' }] },
      { label: 'Theatrical', implementation: 'EditionSpecification', fields: [{ name: 'value', value: 'Theatrical' }] },
    ],
  },
]

// ── Template Picker Modal ──────────────────────────────────────────────────────

function TemplatePickerModal({
  schema,
  onSelect,
  onClose,
}: {
  schema: ArrCFSchema[]
  onSelect: (spec: DraftSpec) => void
  onClose: () => void
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set([CONDITION_TEMPLATES[0]?.group ?? '']))

  function toggleGroup(group: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  function selectTemplate(t: ConditionTemplate) {
    const schemaEntry = schema.find(s => s.implementation === t.implementation)
    onSelect({
      implementation: t.implementation,
      implementationName: schemaEntry?.implementationName ?? t.implementation,
      name: t.nameHint ?? t.label,
      negate: false,
      required: false,
      fields: t.fields,
    })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 210, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>Condition-Vorlage auswählen</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {CONDITION_TEMPLATES.map(grp => (
            <div key={grp.group}>
              <button
                onClick={() => toggleGroup(grp.group)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, padding: '5px 2px', fontFamily: 'var(--font-sans)' }}
              >
                {openGroups.has(grp.group) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {grp.group}
              </button>
              {openGroups.has(grp.group) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 18, marginBottom: 4 }}>
                  {grp.templates.map(t => (
                    <button
                      key={t.label}
                      onClick={() => selectTemplate(t)}
                      className="btn btn-ghost"
                      style={{ fontSize: 12, textAlign: 'left', justifyContent: 'flex-start', padding: '5px 10px' }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function renderSpecField(
  fieldDef: ArrCFSchemaField,
  value: unknown,
  onChange: (v: unknown) => void,
) {
  if (fieldDef.type === 'select' && fieldDef.selectOptions) {
    const numVal = typeof value === 'number' ? value : (fieldDef.selectOptions[0]?.value ?? 0)
    return (
      <select
        className="form-input"
        value={numVal}
        style={{ fontSize: 12, width: '100%', boxSizing: 'border-box' }}
        onChange={e => onChange(parseInt(e.target.value, 10))}
      >
        {fieldDef.selectOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.name}</option>
        ))}
      </select>
    )
  }
  if (fieldDef.type === 'number') {
    return (
      <input
        type="number"
        className="form-input"
        style={{ fontSize: 12, width: '100%', boxSizing: 'border-box' }}
        value={typeof value === 'number' ? value : 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
    )
  }
  const isRegex = /regex|expression/i.test(fieldDef.label)
  return (
    <input
      type="text"
      className="form-input"
      style={{ fontSize: 12, width: '100%', boxSizing: 'border-box', fontFamily: isRegex ? 'var(--font-mono)' : undefined }}
      value={typeof value === 'string' ? value : String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      placeholder={isRegex ? 'Regex (z.B. \\bx265\\b)' : fieldDef.label}
    />
  )
}

// ── User CF Row ────────────────────────────────────────────────────────────────

function UserCfRow({
  cf,
  service,
  inUse,
  notInArr,
  isAdmin,
  confirmingDelete,
  deleteError,
  onEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onExport,
  onCopy,
  onCreateInArr,
}: {
  cf: UserCfFile
  service: 'radarr' | 'sonarr'
  inUse: boolean
  notInArr: boolean
  isAdmin: boolean
  confirmingDelete: boolean
  deleteError: string | null
  onEdit: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onExport?: () => void
  onCopy?: () => void
  onCreateInArr?: () => Promise<void>
}) {
  const [hovered, setHovered] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreateInArr() {
    if (!onCreateInArr) return
    setCreating(true)
    setCreateError(null)
    try {
      await onCreateInArr()
    } catch (e: unknown) {
      setCreateError((e as Error).message ?? t('common.error'))
    } finally {
      setCreating(false)
    }
  }

  const serviceLabel = service.charAt(0).toUpperCase() + service.slice(1)

  return (
    <div
      className="glass"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-sans)', flex: 1 }}>{cf.name}</span>
        <span className="badge-neutral" style={{ fontSize: 11 }}>{cf.specifications.length} Conditions</span>
        {notInArr && (
          <span
            className="badge-warning"
            style={{ fontSize: 11, cursor: 'default' }}
            title={`JSON-Datei vorhanden aber CF nicht in ${serviceLabel} gefunden. Importieren oder löschen.`}
          >
            Nur lokal
          </span>
        )}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity var(--transition-fast)' }}>
            {onExport && (
              <button onClick={onExport} title="Exportieren" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <Download size={12} />
              </button>
            )}
            {onCopy && (
              <button onClick={onCopy} title="Kopieren" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <Copy size={12} />
              </button>
            )}
            {notInArr && onCreateInArr && (
              <button
                onClick={handleCreateInArr}
                disabled={creating}
                title={`In ${serviceLabel} erstellen`}
                style={{ background: 'none', border: 'none', cursor: creating ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', padding: 4 }}
              >
                <Plus size={12} />
              </button>
            )}
            <button
              onClick={onEdit}
              disabled={notInArr}
              style={{ background: 'none', border: 'none', cursor: notInArr ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', padding: 4 }}
            >
              <Pencil size={12} />
            </button>
            <button onClick={onDeleteRequest} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      {createError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge-error" style={{ fontSize: 11 }}>{createError}</span>
        </div>
      )}
      {confirmingDelete && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {inUse ? (
            <span className="badge-error" style={{ fontSize: 11 }}>In Recyclarr aktiv — zuerst im Recyclarr-Tab entfernen</span>
          ) : (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {notInArr
                  ? `Nur JSON-Datei löschen — CF existiert nicht in ${serviceLabel}`
                  : 'Really delete?'}
              </span>
              <button
                onClick={onDeleteConfirm}
                className="btn btn-sm"
                style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
              >{notInArr ? t('common.delete') : t('common.yes')}</button>
              <button onClick={onDeleteCancel} className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}>{notInArr ? t('common.cancel') : t('common.no')}</button>
            </>
          )}
          {deleteError && !inUse && <span className="badge-error" style={{ fontSize: 11 }}>{deleteError}</span>}
        </div>
      )}
    </div>
  )
}

// ── CF Edit Modal ─────────────────────────────────────────────────────────────

function parseCfApiError(msg: string): string {
  if (msg.includes('Must be unique')) return 'Name bereits vergeben — ein CF mit diesem Namen existiert bereits'
  if (msg.includes('Regex Pattern must not be empty')) return 'Regex-Wert darf nicht leer sein'
  if (/Condition name.{0,5}cannot be empty/i.test(msg)) return 'Condition Name ist Pflichtfeld'
  return msg
}

function CfEditModal({
  initial,
  initialTrashId,
  schema,
  existingNames,
  onClose,
  onSave,
  onSwitchToRecyclarr,
}: {
  initial: { name: string; includeCustomFormatWhenRenaming: boolean; specifications: ArrCFSpecification[] } | null
  initialTrashId: string | null
  schema: ArrCFSchema[]
  existingNames: string[]
  onClose: () => void
  onSave: (data: { name: string; trash_id: string; includeCustomFormatWhenRenaming: boolean; specifications: ArrCFSpecification[] }) => Promise<void>
  onSwitchToRecyclarr: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [renaming, setRenaming] = useState(initial?.includeCustomFormatWhenRenaming ?? false)
  const [specs, setSpecs] = useState<DraftSpec[]>(
    initial ? initial.specifications.map(toDraftSpec) : []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [specErrors, setSpecErrors] = useState<Record<number, { name?: string; field?: string }>>({})
  const [jsonImportOpen, setJsonImportOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  const isEdit = initial !== null
  const frozenTrashId = initialTrashId
  const displayTrashId = frozenTrashId ?? (name.trim() ? toUserSlug(name.trim()) : '')

  function updateSpec(idx: number, updater: (s: DraftSpec) => DraftSpec) {
    setSpecs(prev => prev.map((s, i) => i === idx ? updater(s) : s))
  }

  function handleTypeChange(idx: number, impl: string) {
    const entry = schema.find(s => s.implementation === impl)
    updateSpec(idx, s => ({ ...s, implementation: impl, implementationName: entry?.implementationName ?? impl, fields: [] }))
  }

  function handleFieldChange(specIdx: number, fieldName: string, value: unknown) {
    updateSpec(specIdx, s => ({
      ...s,
      fields: [...s.fields.filter(f => f.name !== fieldName), { name: fieldName, value }],
    }))
  }

  function handleJsonImport() {
    setJsonError(null)
    try {
      const parsed = JSON.parse(jsonText) as {
        name?: string
        includeCustomFormatWhenRenaming?: boolean
        specifications?: ArrCFSpecification[]
        trash_id?: string
      }
      if (parsed.name) setName(parsed.name)
      if (parsed.includeCustomFormatWhenRenaming !== undefined) setRenaming(parsed.includeCustomFormatWhenRenaming)
      if (Array.isArray(parsed.specifications)) setSpecs(parsed.specifications.map(toDraftSpec))
      setJsonText('')
      setJsonImportOpen(false)
    } catch {
      setJsonError('Ungültiges JSON')
    }
  }

  async function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) { setError('Name ist erforderlich'); return }

    // Client-side duplicate check
    const isDuplicate = existingNames.some(n =>
      n.toLowerCase() === trimmedName.toLowerCase() &&
      (!isEdit || n.toLowerCase() !== (initial?.name ?? '').toLowerCase())
    )
    if (isDuplicate) {
      setError(`Ein Custom Format mit diesem Namen existiert bereits`)
      return
    }

    const errors: Record<number, { name?: string; field?: string }> = {}
    specs.forEach((spec, idx) => {
      if (!spec.name.trim()) {
        errors[idx] = { ...errors[idx], name: 'Condition Name ist Pflichtfeld' }
      }
      const entry = schema.find(s => s.implementation === spec.implementation)
      if (entry && entry.fields.length > 0) {
        const hasEmptyField = entry.fields.some(fieldDef => {
          if (fieldDef.type === 'select') return false
          const val = spec.fields.find(f => f.name === fieldDef.name)?.value
          return val === undefined || val === null || String(val).trim() === ''
        })
        if (hasEmptyField) errors[idx] = { ...errors[idx], field: 'Wert ist Pflichtfeld' }
      }
    })
    if (Object.keys(errors).length > 0) {
      setSpecErrors(errors)
      const firstIdx = parseInt(Object.keys(errors)[0], 10)
      document.getElementById(`spec-row-${firstIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }
    setSpecErrors({})

    const trashId = frozenTrashId ?? toUserSlug(name.trim())
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        trash_id: trashId,
        includeCustomFormatWhenRenaming: renaming,
        specifications: specs.map(spec => buildSpecPayload(spec, schema.find(s => s.implementation === spec.implementation))),
      })
      setSaved(true)
    } catch (e: unknown) {
      setError(parseCfApiError((e as Error).message))
      setSaving(false)
    }
  }

  if (saved && !isEdit) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: '100%', maxWidth: 440 }}>
          <div className="badge-success" style={{ fontSize: 13, display: 'inline-block', marginBottom: 16 }}>
            CF erstellt — jetzt im Recyclarr-Tab einem Profil zuweisen
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} className="btn btn-ghost">Schließen</button>
            <button onClick={() => { onClose(); onSwitchToRecyclarr() }} className="btn btn-primary">Zum Recyclarr-Tab</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: '100%', maxWidth: 600 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, fontFamily: 'var(--font-sans)' }}>
          {isEdit ? 'Custom Format bearbeiten' : 'Custom Format erstellen'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name */}
          <div>
            <label className="form-label">Name *</label>
            <input
              className="form-input"
              value={name}
              onChange={e => { setName(e.target.value); if (error) setError(null) }}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {displayTrashId && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>Trash ID:</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{displayTrashId}</span>
                {isEdit
                  ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(unveränderlich)</span>
                  : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(wird automatisch generiert)</span>
                }
              </div>
            )}
          </div>

          {/* includeCustomFormatWhenRenaming */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setRenaming(v => !v)}
              style={{
                width: 32, height: 18, borderRadius: 9,
                background: renaming ? 'var(--accent)' : 'rgba(var(--border-rgb), 0.5)',
                position: 'relative', cursor: 'pointer', transition: 'background var(--transition-fast)', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: renaming ? 16 : 2, width: 14, height: 14,
                borderRadius: '50%', background: 'white', transition: 'left var(--transition-fast)',
              }} />
            </div>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-sans)' }}>
              Im Dateinamen verwenden (includeCustomFormatWhenRenaming)
            </span>
          </label>

          {/* Conditions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>Conditions</span>
                <span className="badge-neutral" style={{ fontSize: 11 }}>{specs.length}</span>
              </div>
              {!showAddMenu ? (
                <button
                  onClick={() => setShowAddMenu(true)}
                  className="btn btn-ghost"
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Plus size={11} /> Condition hinzufügen
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => { setShowTemplatePicker(true); setShowAddMenu(false) }}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <BookOpen size={11} /> Aus Vorlage
                  </button>
                  <button
                    onClick={() => { setSpecs(prev => [...prev, initDraftSpec(schema)]); setShowAddMenu(false) }}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Plus size={11} /> Leer beginnen
                  </button>
                  <button
                    onClick={() => setShowAddMenu(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
            {specs.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px' }}>Keine Conditions definiert</p>
            )}
            {specs.map((spec, idx) => {
              const schemaEntry = schema.find(s => s.implementation === spec.implementation)
              const specErr = specErrors[idx]
              return (
                <div key={idx} id={`spec-row-${idx}`} className="glass" style={{ borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      className="form-input"
                      value={spec.implementation}
                      style={{ flex: '1 1 160px', fontSize: 12 }}
                      onChange={e => handleTypeChange(idx, e.target.value)}
                    >
                      {schema.map(s => (
                        <option key={s.implementation} value={s.implementation}>{s.implementationName}</option>
                      ))}
                      {!schema.find(s => s.implementation === spec.implementation) && (
                        <option value={spec.implementation}>{spec.implementationName}</option>
                      )}
                    </select>
                    <input
                      className="form-input"
                      placeholder="Name für diese Condition (z.B. 'x265 Release')"
                      value={spec.name}
                      style={{ flex: '1 1 120px', fontSize: 12 }}
                      onChange={e => updateSpec(idx, s => ({ ...s, name: e.target.value }))}
                    />
                    <button
                      onClick={() => setSpecs(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: schemaEntry && schemaEntry.fields.length > 0 ? 8 : 0, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={spec.negate} onChange={e => updateSpec(idx, s => ({ ...s, negate: e.target.checked }))} />
                      Nicht erfüllt
                    </label>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <input type="checkbox" checked={spec.required} onChange={e => updateSpec(idx, s => ({ ...s, required: e.target.checked }))} />
                      Pflichtbedingung
                    </label>
                  </div>
                  {schemaEntry && schemaEntry.fields.map(fieldDef => {
                    const currentVal = spec.fields.find(f => f.name === fieldDef.name)?.value
                    return (
                      <div key={fieldDef.name} style={{ marginBottom: 6 }}>
                        <label className="form-label" style={{ fontSize: 11, marginBottom: 3 }}>{fieldDef.label}</label>
                        {renderSpecField(fieldDef, currentVal, v => handleFieldChange(idx, fieldDef.name, v))}
                      </div>
                    )
                  })}
                  {specErr?.name && <span className="badge-error" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{specErr.name}</span>}
                  {specErr?.field && <span className="badge-error" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{specErr.field}</span>}
                </div>
              )
            })}
            {specs.length >= 2 && (
              <div className="badge-neutral" style={{ fontSize: 11, display: 'inline-block', marginTop: 4 }}>
                Verschiedene Typen: UND — Gleicher Typ mehrfach: ODER (außer Pflicht)
              </div>
            )}
            <div className="badge-neutral" style={{ fontSize: 11, display: 'inline-block', marginTop: 4 }}>
              Pflichtbedingung: CF greift nur wenn diese Condition erfüllt ist, unabhängig von anderen Conditions desselben Typs
            </div>
          </div>

          {/* JSON Import */}
          <div>
            <button
              onClick={() => setJsonImportOpen(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-sans)', padding: 0 }}
            >
              JSON importieren {jsonImportOpen ? '▴' : '▾'}
            </button>
            {jsonImportOpen && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  className="form-input"
                  value={jsonText}
                  onChange={e => setJsonText(e.target.value)}
                  rows={8}
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
                  placeholder="Radarr/Sonarr Custom Format JSON einfügen..."
                />
                {jsonError && <span className="badge-error" style={{ fontSize: 11 }}>{jsonError}</span>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={handleJsonImport} className="btn btn-ghost" style={{ fontSize: 12 }}>Importieren</button>
                  <span className="badge-neutral" style={{ fontSize: 11 }}>Kompatibel mit Radarr/Sonarr Export und TRaSH Guides JSON</span>
                </div>
              </div>
            )}
          </div>

          {error && <span className="badge-error" style={{ fontSize: 12 }}>{error}</span>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? t('common.saving') : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
    {showTemplatePicker && (
      <TemplatePickerModal
        schema={schema}
        onSelect={spec => setSpecs(prev => [...prev, spec])}
        onClose={() => setShowTemplatePicker(false)}
      />
    )}
    </>
  )
}

// ── Copy CF Modal ──────────────────────────────────────────────────────────────

function CopyCfModal({
  cf,
  instances,
  currentService,
  onClose,
  onCopied,
}: {
  cf: UserCfFile
  instances: ArrInstance[]
  currentService: 'radarr' | 'sonarr'
  onClose: () => void
  onCopied: (targetService: 'radarr' | 'sonarr', msg: string) => void
}) {
  const otherService: 'radarr' | 'sonarr' = currentService === 'radarr' ? 'sonarr' : 'radarr'
  const hasOtherService = instances.some(i => i.enabled && i.type === otherService)

  const [destService, setDestService] = useState<'radarr' | 'sonarr'>(currentService)
  const [newName, setNewName] = useState(`${cf.name} (Kopie)`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { createCustomFormat, loadCustomFormats, loadUserCfFiles, customFormats } = useArrStore()
  const targetInstance = useMemo(
    () => instances.find(i => i.enabled && i.type === destService) ?? null,
    [instances, destService]
  )
  const existingNames = targetInstance ? (customFormats[targetInstance.id] ?? []).map(c => c.name) : []
  const isDuplicate = newName.trim() !== '' && existingNames.some(n => n.toLowerCase() === newName.trim().toLowerCase())

  async function handleCopy() {
    if (!newName.trim()) { setError('Name ist erforderlich'); return }
    if (!targetInstance) { setError('Keine Ziel-Instanz gefunden'); return }
    if (isDuplicate) { setError('Ein CF mit diesem Namen existiert bereits'); return }
    const newTrashId = toUserSlug(newName.trim())
    const specs = cf.specifications.map(s => normalizeArrSpec(s as unknown as {
      name: string; implementation: string; implementationName?: string
      negate: boolean; required: boolean; fields: unknown
    }))
    setSaving(true)
    setError(null)
    try {
      await createCustomFormat(targetInstance.id, {
        name: newName.trim(),
        trash_id: newTrashId,
        includeCustomFormatWhenRenaming: cf.includeCustomFormatWhenRenaming,
        specifications: specs,
      })
      await Promise.all([loadCustomFormats(targetInstance.id), loadUserCfFiles(destService)])
      const msg = destService !== currentService
        ? `Kopiert nach ${destService} — wechsle zum ${destService}-Tab um ihn zu sehen`
        : `"${newName.trim()}" wurde kopiert`
      onCopied(destService, msg)
    } catch (e: unknown) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const capService = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: '100%', maxWidth: 440 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, fontFamily: 'var(--font-sans)' }}>
          '{cf.name}' kopieren
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Kopieren nach:</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                <input type="radio" name="destService" checked={destService === currentService}
                  onChange={() => { setDestService(currentService); setError(null) }} />
                Gleiche Instanz ({capService(currentService)})
              </label>
              {hasOtherService && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                  <input type="radio" name="destService" checked={destService === otherService}
                    onChange={() => { setDestService(otherService); setError(null) }} />
                  {capService(currentService)} → {capService(otherService)}
                </label>
              )}
            </div>
          </div>
          <div>
            <label className="form-label">Neuer Name *</label>
            <input
              className="form-input"
              value={newName}
              onChange={e => { setNewName(e.target.value); if (error) setError(null) }}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {isDuplicate && <span className="badge-error" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Name bereits vergeben</span>}
          </div>
          {error && <span className="badge-error" style={{ fontSize: 12 }}>{error}</span>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button onClick={handleCopy} disabled={saving || isDuplicate || !newName.trim()} className="btn btn-primary">
              {saving ? 'Kopieren…' : 'Kopieren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Import Modal ───────────────────────────────────────────────────────────────

function ImportModal({
  instanceId,
  service,
  onClose,
  onImported,
}: {
  instanceId: string
  service: 'radarr' | 'sonarr'
  onClose: () => void
  onImported: (count: number) => void
}) {
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [importable, setImportable] = useState<ArrCustomFormat[]>([])
  const [alreadyManaged, setAlreadyManaged] = useState<{ cf: ArrCustomFormat; hasChanges: boolean }[]>([])
  const [selectedImport, setSelectedImport] = useState<Set<number>>(new Set())
  const [selectedOverwrite, setSelectedOverwrite] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    api.recyclarr.importableCfs(instanceId)
      .then(data => {
        setImportable(data.importable)
        setAlreadyManaged(data.alreadyManaged)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setFetchError((e as Error).message)
        setLoading(false)
      })
  }, [instanceId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(set: Set<number>, id: number): Set<number> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }

  async function handleImport() {
    const toImport = importable.filter(c => selectedImport.has(c.id))
    const toOverwrite = alreadyManaged.filter(m => selectedOverwrite.has(m.cf.id))
    if (toImport.length === 0 && toOverwrite.length === 0) return
    setSaving(true)
    setSaveError(null)
    let count = 0
    try {
      for (const cf of toImport) {
        await api.recyclarr.createUserCf(service, {
          name: cf.name,
          specifications: cf.specifications as unknown as UserCfSpecification[],
        })
        count++
      }
      for (const { cf } of toOverwrite) {
        const trashId = toUserSlug(cf.name)
        await api.recyclarr.updateUserCf(service, trashId, {
          name: cf.name,
          specifications: cf.specifications as unknown as UserCfSpecification[],
        })
        count++
      }
      onImported(count)
    } catch (e: unknown) {
      setSaveError((e as Error).message)
      setSaving(false)
    }
  }

  const managedWithChanges = alreadyManaged.filter(m => m.hasChanges)
  const totalSelected = selectedImport.size + selectedOverwrite.size

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>Custom Formats importieren</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>Lade…</p>}

        {fetchError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 'var(--radius-sm)' }}>
            <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#f87171' }}>{fetchError}</span>
          </div>
        )}

        {!loading && !fetchError && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Importable */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                  Importierbar
                </span>
                <span className="badge-neutral" style={{ fontSize: 11 }}>{importable.length}</span>
                {importable.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button onClick={() => setSelectedImport(new Set(importable.map(c => c.id)))}
                      className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}>
                      Alle auswählen
                    </button>
                    <button onClick={() => setSelectedImport(new Set())}
                      className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}>
                      Alle abwählen
                    </button>
                  </div>
                )}
              </div>
              {importable.length === 0 ? (
                <div className="badge-neutral" style={{ fontSize: 12, display: 'block', padding: '8px 12px', lineHeight: 1.5 }}>
                  Keine importierbaren CFs gefunden — alle vorhandenen CFs werden bereits von Recyclarr verwaltet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {importable.map(cf => (
                    <label key={cf.id} className="glass"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedImport.has(cf.id)}
                        onChange={() => setSelectedImport(prev => toggle(prev, cf.id))} />
                      <span style={{ fontSize: 13, flex: 1 }}>{cf.name}</span>
                      <span className="badge-neutral" style={{ fontSize: 11 }}>{cf.specifications.length} Conditions</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Already managed with changes */}
            {managedWithChanges.length > 0 && (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                    Bereits verwaltet — Unterschied erkannt
                  </span>
                  <span className="badge-neutral" style={{ fontSize: 11, marginLeft: 6 }}>{managedWithChanges.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {managedWithChanges.map(({ cf }) => (
                    <label key={cf.id} className="glass"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedOverwrite.has(cf.id)}
                        onChange={() => setSelectedOverwrite(prev => toggle(prev, cf.id))} />
                      <span style={{ fontSize: 13, flex: 1 }}>{cf.name}</span>
                      <span className="badge-warning" style={{ fontSize: 11 }}
                        title="JSON-Datei weicht von Radarr/Sonarr ab">
                        Lokal abweichend
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {saveError && <span className="badge-error" style={{ fontSize: 12 }}>{saveError}</span>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={onClose} className="btn btn-ghost">Cancel</button>
              <button onClick={handleImport} disabled={saving || totalSelected === 0} className="btn btn-primary">
                {saving ? t('common.loading') : `Import (${totalSelected} selected)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── CF Manager Tab ─────────────────────────────────────────────────────────────

function CfManagerTab({ onSwitchTab }: { onSwitchTab: (tab: MediaTab) => void }) {
  const { isAdmin } = useStore()
  const {
    instances, customFormats, cfSchemas, userCfFiles,
    loadCustomFormats, loadCfSchema, loadUserCfFiles,
    createCustomFormat, updateCustomFormat, deleteCustomFormat, deleteUserCf,
  } = useArrStore()

  const serviceTypes = useMemo(() => {
    const types = new Set(
      instances.filter(i => i.enabled && (i.type === 'radarr' || i.type === 'sonarr')).map(i => i.type as 'radarr' | 'sonarr')
    )
    return (['radarr', 'sonarr'] as const).filter(t => types.has(t))
  }, [instances])

  const [service, setService] = useState<'radarr' | 'sonarr'>(() => serviceTypes[0] ?? 'radarr')
  const [search, setSearch] = useState('')
  const [editingCf, setEditingCf] = useState<{ file: UserCfFile; arrId: number } | 'new' | null>(null)
  const [confirmDeleteTrashId, setConfirmDeleteTrashId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteInUse, setDeleteInUse] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [copyCf, setCopyCf] = useState<UserCfFile | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const activeInstance = useMemo(() => (
    instances.find(i => i.type === service && i.enabled) ?? null
  ), [instances, service])

  useEffect(() => {
    if (!activeInstance) return
    setLoadError(null)
    Promise.all([
      loadCustomFormats(activeInstance.id),
      loadUserCfFiles(service),
      loadCfSchema(activeInstance.id),
    ]).catch((e: unknown) => setLoadError((e as Error).message ?? t('common.error')))
  }, [activeInstance?.id, service]) // eslint-disable-line react-hooks/exhaustive-deps

  const cfFiles = userCfFiles[service] ?? []
  const arrCfList = customFormats[activeInstance?.id ?? ''] ?? []
  const schema = cfSchemas[activeInstance?.id ?? ''] ?? []

  const displayItems = useMemo(() => (
    cfFiles
      .filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .map(file => ({
        file,
        arrCf: (arrCfList.find(c => c.name === file.name) as ArrCustomFormat | undefined) ?? null,
      }))
  ), [cfFiles, arrCfList, search])

  async function handleDelete(trashId: string, arrCf: ArrCustomFormat | null) {
    setDeleteError(null)
    setDeleteInUse(false)
    if (!arrCf) {
      // JSON-only CF — delete file via recyclarr endpoint
      try {
        await deleteUserCf(service, trashId)
        setConfirmDeleteTrashId(null)
        await loadUserCfFiles(service)
      } catch (e: unknown) {
        const msg = (e as Error).message ?? ''
        if (msg.includes('aktiv in Recyclarr')) {
          setDeleteInUse(true)
        } else {
          setDeleteError(msg)
        }
      }
      return
    }
    if (!activeInstance) return
    try {
      await deleteCustomFormat(activeInstance.id, arrCf.id, trashId)
      setConfirmDeleteTrashId(null)
      await Promise.all([loadCustomFormats(activeInstance.id), loadUserCfFiles(service)])
    } catch (e: unknown) {
      const msg = (e as Error).message ?? ''
      if (msg.includes('aktiv in Recyclarr')) {
        setDeleteInUse(true)
      } else {
        setDeleteError(msg)
      }
    }
  }

  async function handleCreateInArr(file: UserCfFile) {
    if (!activeInstance) return
    await createCustomFormat(activeInstance.id, {
      name: file.name,
      trash_id: file.trash_id,
      includeCustomFormatWhenRenaming: file.includeCustomFormatWhenRenaming,
      specifications: file.specifications as unknown as ArrCFSpecification[],
    })
    await Promise.all([loadCustomFormats(activeInstance.id), loadUserCfFiles(service)])
  }

  if (serviceTypes.length === 0) {
    return (
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 48, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Keine Radarr/Sonarr-Instanzen konfiguriert.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Service tabs */}
      <div className="tabs" style={{ display: 'flex', gap: 4 }}>
        {serviceTypes.map(svc => (
          <button
            key={svc}
            onClick={() => { setService(svc); setSearch(''); setConfirmDeleteTrashId(null) }}
            className={`tab ${service === svc ? 'tab-active' : ''}`}
          >
            {svc.charAt(0).toUpperCase() + svc.slice(1)}
          </button>
        ))}
      </div>

      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15, fontFamily: 'var(--font-sans)' }}>Custom Formats</span>
          <span className="badge-neutral" style={{ fontSize: 11 }}>{cfFiles.length} / {arrCfList.length}</span>
          <div style={{ flex: 1 }} />
          {actionSuccess && (
            <span className="badge-success" style={{ fontSize: 11 }}>{actionSuccess}</span>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => { setShowImport(true); setActionSuccess(null) }}
                className="btn btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                disabled={!activeInstance}
              >
                <Upload size={12} /> Importieren
              </button>
              <button
                onClick={() => setEditingCf('new')}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
              >
                <Plus size={12} /> Erstellen
              </button>
            </>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            className="form-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suchen…"
            style={{ width: '100%', boxSizing: 'border-box', paddingRight: search ? 32 : undefined }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {loadError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: 10 }}>
            <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#f87171' }}>{loadError}</span>
          </div>
        )}

        {displayItems.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: cfFiles.length === 0 && isAdmin && !search ? 16 : 0 }}>
              {search ? 'Keine Custom Formats gefunden' : 'Keine eigenen Custom Formats vorhanden'}
            </p>
            {cfFiles.length === 0 && isAdmin && !search && (
              <button
                onClick={() => setEditingCf('new')}
                className="btn btn-primary"
                style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={12} /> CF erstellen
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {displayItems.map(({ file, arrCf }) => (
              <UserCfRow
                key={file.trash_id}
                cf={file}
                service={service}
                inUse={confirmDeleteTrashId === file.trash_id && deleteInUse}
                notInArr={arrCf === null}
                isAdmin={isAdmin}
                confirmingDelete={confirmDeleteTrashId === file.trash_id}
                deleteError={confirmDeleteTrashId === file.trash_id ? deleteError : null}
                onEdit={() => { if (arrCf) setEditingCf({ file, arrId: arrCf.id }) }}
                onDeleteRequest={() => { setConfirmDeleteTrashId(file.trash_id); setDeleteError(null); setDeleteInUse(false) }}
                onDeleteConfirm={() => handleDelete(file.trash_id, arrCf)}
                onDeleteCancel={() => { setConfirmDeleteTrashId(null); setDeleteError(null); setDeleteInUse(false) }}
                onExport={() => downloadJson(`${file.name}.json`, {
                  trash_id: file.trash_id,
                  name: file.name,
                  includeCustomFormatWhenRenaming: file.includeCustomFormatWhenRenaming,
                  specifications: file.specifications,
                })}
                onCopy={() => { setCopyCf(file); setActionSuccess(null) }}
                onCreateInArr={arrCf === null ? () => handleCreateInArr(file) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit / Create Modal */}
      {editingCf != null && activeInstance && (
        <CfEditModal
          initial={editingCf === 'new' ? null : {
            name: (editingCf as { file: UserCfFile; arrId: number }).file.name,
            includeCustomFormatWhenRenaming: (editingCf as { file: UserCfFile; arrId: number }).file.includeCustomFormatWhenRenaming,
            specifications: (editingCf as { file: UserCfFile; arrId: number }).file.specifications as unknown as ArrCFSpecification[],
          }}
          initialTrashId={editingCf === 'new' ? null : (editingCf as { file: UserCfFile; arrId: number }).file.trash_id}
          schema={schema}
          existingNames={arrCfList.map(cf => cf.name)}
          onClose={() => setEditingCf(null)}
          onSwitchToRecyclarr={() => onSwitchTab('recyclarr')}
          onSave={async data => {
            if (editingCf === 'new') {
              await createCustomFormat(activeInstance.id, data)
            } else {
              const arrId = (editingCf as { file: UserCfFile; arrId: number }).arrId
              await updateCustomFormat(activeInstance.id, arrId, data)
            }
            await Promise.all([loadCustomFormats(activeInstance.id), loadUserCfFiles(service)])
            if (editingCf !== 'new') setEditingCf(null)
          }}
        />
      )}

      {/* Import Modal */}
      {showImport && activeInstance && (
        <ImportModal
          instanceId={activeInstance.id}
          service={service}
          onClose={() => setShowImport(false)}
          onImported={count => {
            setShowImport(false)
            setActionSuccess(`${count} CF${count !== 1 ? 's' : ''} importiert`)
            Promise.all([loadCustomFormats(activeInstance.id), loadUserCfFiles(service)]).catch(() => {})
          }}
        />
      )}

      {/* Copy Modal */}
      {copyCf && (
        <CopyCfModal
          cf={copyCf}
          instances={instances}
          currentService={service}
          onClose={() => setCopyCf(null)}
          onCopied={(targetService, msg) => {
            setCopyCf(null)
            setActionSuccess(msg)
            const targetInst = instances.find(i => i.enabled && i.type === targetService)
            if (targetInst) {
              Promise.all([loadCustomFormats(targetInst.id), loadUserCfFiles(targetService)]).catch(() => {})
            }
          }}
        />
      )}
    </div>
  )
}

// ── Stub tab ──────────────────────────────────────────────────────────────────

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 48, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{label} — Coming soon</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props {
  showAddForm?: boolean
  onFormClose?: () => void
  onNavigate?: (page: string) => void
}

export function MediaPage({ showAddForm: showFromParent, onFormClose, onNavigate }: Props) {
  const { settings } = useStore()
  const [activeTab, setActiveTab] = useState<MediaTab>('instances')

  // When Topbar "Add Instance" fires, switch to Instances tab
  useEffect(() => {
    if (showFromParent) {
      setActiveTab('instances')
    }
  }, [showFromParent])

  const hasTmdbKey = !!(settings?.tmdb_api_key)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Media</h2>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === 'instances' && (
        <InstancesTab showAddForm={showFromParent} onFormClose={onFormClose} />
      )}
      {activeTab === 'library' && <LibraryTab />}
      {activeTab === 'calendar' && <CalendarTab />}
      {activeTab === 'indexers' && <IndexersTab />}
      {activeTab === 'discover' && <DiscoverTab hasTmdbKey={hasTmdbKey} onNavigate={onNavigate ?? (() => {})} />}
      {activeTab === 'recyclarr' && <RecyclarrTab />}
      {activeTab === 'cf-manager' && <CfManagerTab onSwitchTab={tab => setActiveTab(tab as MediaTab)} />}
    </div>
  )
}
