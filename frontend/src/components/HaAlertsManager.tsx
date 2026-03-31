import { useState, useEffect } from 'react'
import { X, Plus, Bell, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../api'
import type { HaAlert, HaEntityFull } from '../types'

interface Props {
  onClose: () => void
  stateMap: Record<string, Record<string, HaEntityFull>>
  instanceId: string | null
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  state_equals: 'Status gleich',
  state_above: 'Wert über',
  state_below: 'Wert unter',
  state_changes: 'Status ändert sich',
}

export function HaAlertsManager({ onClose, stateMap, instanceId }: Props) {
  const [alerts, setAlerts] = useState<HaAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  // Form state
  const [formEntityId, setFormEntityId] = useState('')
  const [formConditionType, setFormConditionType] = useState<string>('state_changes')
  const [formConditionValue, setFormConditionValue] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // Entity search
  const [entitySearch, setEntitySearch] = useState('')

  const loadAlerts = async () => {
    try {
      const data = await api.ha.alerts.list()
      setAlerts(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlerts()
  }, [])

  // Build flat list of entities from stateMap for current instance
  const allEntities: HaEntityFull[] = instanceId
    ? Object.values(stateMap[instanceId] ?? {})
    : Object.values(stateMap).flatMap(m => Object.values(m))

  const filteredEntities = entitySearch.trim()
    ? allEntities.filter(e =>
        e.entity_id.toLowerCase().includes(entitySearch.toLowerCase()) ||
        (e.attributes.friendly_name ?? '').toLowerCase().includes(entitySearch.toLowerCase())
      ).slice(0, 10)
    : []

  const needsValue = formConditionType === 'state_equals' || formConditionType === 'state_above' || formConditionType === 'state_below'

  const handleCreate = async () => {
    if (!formEntityId.trim()) return setFormError('Entity-ID erforderlich')
    if (!formMessage.trim()) return setFormError('Nachricht erforderlich')
    if (needsValue && !formConditionValue.trim()) return setFormError('Bedingungswert erforderlich')
    setSaving(true)
    setFormError('')
    try {
      const data = await api.ha.alerts.create({
        instance_id: instanceId ?? '',
        entity_id: formEntityId.trim(),
        condition_type: formConditionType,
        condition_value: needsValue ? formConditionValue.trim() : null,
        message: formMessage.trim(),
      })
      setAlerts(prev => [data, ...prev])
      setShowAdd(false)
      setFormEntityId('')
      setFormConditionType('state_changes')
      setFormConditionValue('')
      setFormMessage('')
      setEntitySearch('')
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Fehler beim Erstellen')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (alert: HaAlert) => {
    try {
      const updated = await api.ha.alerts.update(alert.id, { enabled: !alert.enabled })
      setAlerts(prev => prev.map(a => a.id === alert.id ? updated : a))
    } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.ha.alerts.delete(id)
      setAlerts(prev => prev.filter(a => a.id !== id))
    } catch { /* ignore */ }
  }

  return (
    <div className="ha-alerts-panel glass">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Benachrichtigungen</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '1px 8px', borderRadius: 'var(--radius-sm)' }}>
            {alerts.filter(a => a.enabled).length} / 20
          </span>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
      </div>

      {error && <div className="setup-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Alert list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, margin: '0 auto' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {alerts.length === 0 && !showAdd && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
              Noch keine Benachrichtigungen konfiguriert.
            </p>
          )}
          {alerts.map(alert => (
            <div
              key={alert.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-2)',
                opacity: alert.enabled ? 1 : 0.6,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {alert.message}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {alert.entity_id}
                </div>
                <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>
                  {CONDITION_TYPE_LABELS[alert.condition_type] ?? alert.condition_type}
                  {alert.condition_value ? `: ${alert.condition_value}` : ''}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                style={{ flexShrink: 0, width: 28, height: 28, color: alert.enabled ? 'var(--status-online)' : 'var(--text-muted)' }}
                onClick={() => handleToggle(alert)}
                data-tooltip={alert.enabled ? 'Deaktivieren' : 'Aktivieren'}
              >
                {alert.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              </button>
              <button
                className="btn btn-ghost btn-icon"
                style={{ flexShrink: 0, width: 28, height: 28, color: 'var(--status-offline)' }}
                onClick={() => handleDelete(alert.id)}
                data-tooltip="Löschen"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Neue Benachrichtigung</div>

          {/* Entity search */}
          <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
            <label className="form-label">Entity-ID</label>
            <input
              className="form-input"
              placeholder="z.B. light.wohnzimmer"
              value={formEntityId || entitySearch}
              onChange={e => {
                const val = e.target.value
                setFormEntityId('')
                setEntitySearch(val)
              }}
              style={{ fontSize: 13 }}
            />
            {filteredEntities.length > 0 && !formEntityId && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)', maxHeight: 160, overflowY: 'auto',
                marginTop: 2,
              }}>
                {filteredEntities.map(e => (
                  <button
                    key={e.entity_id}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)',
                    }}
                    onClick={() => {
                      setFormEntityId(e.entity_id)
                      setEntitySearch(e.entity_id)
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{e.attributes.friendly_name ?? e.entity_id}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{e.entity_id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Bedingungstyp</label>
            <select
              className="form-input"
              value={formConditionType}
              onChange={e => setFormConditionType(e.target.value)}
              style={{ fontSize: 13 }}
            >
              {Object.entries(CONDITION_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {needsValue && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Bedingungswert</label>
              <input
                className="form-input"
                placeholder={formConditionType === 'state_equals' ? 'z.B. on' : 'z.B. 25'}
                value={formConditionValue}
                onChange={e => setFormConditionValue(e.target.value)}
                style={{ fontSize: 13 }}
              />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nachricht</label>
            <input
              className="form-input"
              placeholder="z.B. Licht wurde eingeschaltet"
              value={formMessage}
              onChange={e => setFormMessage(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>

          {formError && <div className="setup-error">{formError}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setFormError('') }} style={{ flex: 1, justifyContent: 'center' }}>
              Abbrechen
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving} style={{ flex: 1, gap: 6, justifyContent: 'center' }}>
              {saving ? <div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <Plus size={13} />}
              Erstellen
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-primary"
          onClick={() => setShowAdd(true)}
          disabled={alerts.length >= 20}
          style={{ width: '100%', gap: 6, justifyContent: 'center' }}
        >
          <Plus size={14} /> Benachrichtigung hinzufügen
        </button>
      )}
    </div>
  )
}
