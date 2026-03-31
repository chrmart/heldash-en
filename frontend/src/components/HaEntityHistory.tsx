import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store/useStore'
import { formatTemperature } from '../utils'
import { X, Clock } from 'lucide-react'
import { api } from '../api'
import type { HaEntityFull, HaHistoryEntry } from '../types'

interface Props {
  entity: HaEntityFull
  instanceId: string
  onClose: () => void
}

const HOUR_OPTIONS = [
  { labelKey: 'ha.history.hours.6h',  value: 6 },
  { labelKey: 'ha.history.hours.24h', value: 24 },
  { labelKey: 'ha.history.hours.7d',  value: 168 },
  { labelKey: 'ha.history.hours.30d', value: 720 },
]

function isNumeric(value: string): boolean {
  return value !== '' && !isNaN(parseFloat(value)) && isFinite(Number(value))
}

// Simple SVG line chart for numeric history
function NumericChart({ entries, rawUnit, tempUnit }: { entries: HaHistoryEntry[]; rawUnit: string; tempUnit: 'celsius'|'fahrenheit' }) {
  if (entries.length < 2) return null

  const rawValues = entries.map(e => parseFloat(e.state)).filter(v => !isNaN(v))
  const isTempSensor = rawUnit === '°C' || rawUnit.toLowerCase() === 'c'
  const values = isTempSensor && tempUnit === 'fahrenheit'
    ? rawValues.map(v => parseFloat(formatTemperature(v, rawUnit, tempUnit).value))
    : rawValues
  if (values.length < 2) return null
  const displayUnit = isTempSensor ? (tempUnit === 'fahrenheit' ? '°F' : '°C') : rawUnit
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  const W = 560
  const H = 100
  const PAD = 8

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - (v - minVal) / range) * (H - PAD * 2)
    return `${x},${y}`
  })

  const avg = values.reduce((a, b) => a + b, 0) / values.length

  return (
    <div style={{ marginBottom: 16 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 110, display: 'block' }}>
        {/* Area fill */}
        <defs>
          <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polyline
          points={[
            `${PAD},${H - PAD}`,
            ...points,
            `${W - PAD},${H - PAD}`,
          ].join(' ')}
          fill="url(#histGrad)"
          stroke="none"
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        <span>Min: <strong style={{ color: 'var(--text-primary)' }}>{minVal.toFixed(1)}{displayUnit}</strong></span>
        <span>Max: <strong style={{ color: 'var(--text-primary)' }}>{maxVal.toFixed(1)}{displayUnit}</strong></span>
        <span>Avg: <strong style={{ color: 'var(--text-primary)' }}>{avg.toFixed(1)}{displayUnit}</strong></span>
      </div>
    </div>
  )
}

// Color bands chart for state history
function StateChart({ entries, fmtTime }: { entries: HaHistoryEntry[]; fmtTime: (iso: string) => string }) {
  if (entries.length === 0) return null

  const W = 560
  const H = 32

  const stateColors: Record<string, string> = {
    on: 'var(--status-online)',
    off: 'var(--text-muted)',
    open: 'var(--status-online)',
    closed: 'var(--text-muted)',
    locked: 'var(--status-offline)',
    unlocked: 'var(--status-online)',
    playing: 'var(--status-online)',
    paused: 'var(--text-muted)',
    unavailable: 'var(--surface-3)',
    unknown: 'var(--surface-3)',
  }

  if (entries.length === 0) return null
  const first = entries[0]
  const last = entries[entries.length - 1]
  if (!first || !last) return null
  const tStart = new Date(first.last_changed).getTime()
  const tEnd = new Date(last.last_changed).getTime() || tStart + 1

  return (
    <div style={{ marginBottom: 16 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H + 10, display: 'block' }}>
        {entries.map((entry, i) => {
          const nextEntry = entries[i + 1]
          const t0 = new Date(entry.last_changed).getTime()
          const t1 = nextEntry ? new Date(nextEntry.last_changed).getTime() : tEnd
          const x = ((t0 - tStart) / (tEnd - tStart)) * W
          const w = Math.max(2, ((t1 - t0) / (tEnd - tStart)) * W)
          const color = stateColors[entry.state] ?? 'var(--accent)'
          return (
            <rect key={i} x={x} y={0} width={w} height={H} fill={color} opacity={0.75}>
              <title>{entry.state} – {fmtTime(entry.last_changed)}</title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}

export function HaEntityHistory({ entity, instanceId, onClose }: Props) {
  const { t } = useTranslation()
  const { settings } = useStore()
  const locale = settings?.language ?? 'de'
  const use12h = settings?.time_format === '12h'
  const tempUnit = settings?.temp_unit ?? 'celsius'
  const [hours, setHours] = useState(24)
  const [entries, setEntries] = useState<HaHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fmtTime = (iso: string): string => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleString(locale, {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: use12h,
      })
    } catch { return iso }
  }

  const loadHistory = async (h: number) => {
    setLoading(true)
    setError('')
    try {
      const data = await api.ha.history(instanceId, entity.entity_id, h)
      setEntries(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('ha.history.load_error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory(hours)
  }, [])

  const handleHoursChange = (h: number) => {
    setHours(h)
    loadHistory(h)
  }

  const numeric = entries.length > 0 && isNumeric(entries[0]?.state ?? '')
  const name = (entity.attributes.friendly_name as string | undefined) ?? entity.entity_id
  const rawUnit = (entity.attributes.unit_of_measurement as string | undefined) ?? ''
  const isTempSensor = entity.attributes.device_class === 'temperature' || rawUnit === '°C'
  const displayUnit = isTempSensor ? (tempUnit === 'fahrenheit' ? '°F' : '°C') : rawUnit

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 600,
          borderRadius: 'var(--radius-xl)',
          padding: '32px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Clock size={16} style={{ color: 'var(--accent)' }} />
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
            {t('ha.history.title')}: {name}
          </h2>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 20 }}>
          {entity.entity_id}
        </div>

        {/* Time range selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {HOUR_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`btn ${hours === opt.value ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => handleHoursChange(opt.value)}
            >
              {t(opt.labelKey)}
            </button>
          ))}
          {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, alignSelf: 'center', marginLeft: 8 }} />}
        </div>

        {error && <div className="setup-error" style={{ marginBottom: 12 }}>{error}</div>}

        {!loading && !error && (
          <>
            {numeric
              ? <NumericChart entries={entries} rawUnit={rawUnit} tempUnit={tempUnit} />
              : <StateChart entries={entries} fmtTime={fmtTime} />
            }

            {/* State changes table */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {entries.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  {t('ha.history.no_data')}
                </p>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                      <th style={{ padding: '4px 8px', fontWeight: 600 }}>{t('ha.history.time_header')}</th>
                      <th style={{ padding: '4px 8px', fontWeight: 600 }}>{t('ha.history.state_header')}{displayUnit ? ` (${displayUnit})` : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.slice().reverse().map((entry, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', opacity: 0.85 }}>
                        <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          {fmtTime(entry.last_changed)}
                        </td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {isTempSensor && !isNaN(parseFloat(entry.state)) ? formatTemperature(entry.state, rawUnit, tempUnit).value : entry.state}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
