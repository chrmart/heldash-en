import { useState } from 'react'
import type { Service } from '../types'
import { useStore } from '../store/useStore'
import { useConfirm } from './ConfirmDialog'
import { RefreshCw, Pencil, Trash2 } from 'lucide-react'

interface Props {
  service: Service
  onEdit: (service: Service) => void
  hideAdminActions?: boolean
}

export function ServiceCard({ service, onEdit, hideAdminActions }: Props) {
  const { checkService, deleteService, isAdmin } = useStore()
  const { confirm: confirmDlg } = useConfirm()
  const liveStatus = useStore(state => state.services.find(s => s.id === service.id)?.last_status)
  const liveCheckEnabled = useStore(state => state.services.find(s => s.id === service.id)?.check_enabled)
  const [checking, setChecking] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [imgError, setImgError] = useState(false)

  const checkEnabled = liveCheckEnabled ?? service.check_enabled
  const status = checkEnabled ? (liveStatus ?? service.last_status ?? 'unknown') : 'unknown'

  const handleCheck = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setChecking(true)
    try {
      await checkService(service.id)
    } catch {
      // ignore – status stays unchanged on error
    } finally {
      setChecking(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirmDlg({ title: `Delete "${service.name}"?`, danger: true, confirmLabel: 'Delete' })
    if (ok) await deleteService(service.id)
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onEdit(service)
  }

  return (
    <a
      href={service.url}
      target="_blank"
      rel="noopener noreferrer"
      className="service-card glass"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/*
        Action buttons – right side, vertically centered.
        flex-direction: column-reverse → JSX order [Delete, Edit, Refresh]
        renders as: Refresh (top), Edit (middle), Delete (bottom)
      */}
      {isAdmin && !hideAdminActions && (
        <div style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 4,
          opacity: showActions ? 1 : 0,
          transition: 'opacity 150ms ease',
          zIndex: 2,
        }}>
          <button
            className="btn btn-danger btn-icon btn-sm"
            onClick={handleDelete}
            title="Löschen"
            style={{ padding: '4px', width: 26, height: 26 }}
          >
            <Trash2 size={12} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={handleEdit}
            title="Bearbeiten"
            style={{ padding: '4px', width: 26, height: 26 }}
          >
            <Pencil size={12} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={handleCheck}
            title="Status prüfen"
            style={{ padding: '4px', width: 26, height: 26 }}
          >
            {checking
              ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
              : <RefreshCw size={12} />
            }
          </button>
        </div>
      )}

      <div className="service-card-header">
        <div className="service-icon">
          {service.icon_url && !imgError
            ? (
              <img
                src={service.icon_url}
                alt={service.name}
                style={{ width: 28, height: 28, objectFit: 'contain' }}
                onError={() => setImgError(true)}
              />
            )
            : (service.icon ?? '🔗')
          }
        </div>
        <div
          className={`service-status ${status}`}
          data-tooltip={status !== 'unknown' ? status : undefined}
        />
      </div>

      <div>
        <div className="service-name">{service.name}</div>
        {service.description && (
          <div className="service-description">{service.description}</div>
        )}
        <div className="service-url">{service.url.replace(/^https?:\/\//, '')}</div>
      </div>
    </a>
  )
}
