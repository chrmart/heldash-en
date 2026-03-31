import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Tag, ExternalLink } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store/useStore'
import type { ChangelogRelease } from '../types'

interface Props {
  onClose: () => void
}

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let listItems: string[] = []
  let inList = false

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`list-${nodes.length}`} style={{ margin: '4px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {listItems.map((item, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item}</li>
          ))}
        </ul>
      )
      listItems = []
      inList = false
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }
    if (trimmed.startsWith('### ')) {
      flushList()
      nodes.push(<h4 key={`h4-${nodes.length}`} style={{ margin: '10px 0 4px', fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>{trimmed.slice(4)}</h4>)
    } else if (trimmed.startsWith('## ')) {
      flushList()
      nodes.push(<h3 key={`h3-${nodes.length}`} style={{ margin: '12px 0 4px', fontSize: 14, fontFamily: 'var(--font-display)' }}>{trimmed.slice(3)}</h3>)
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true
      listItems.push(trimmed.slice(2))
    } else {
      flushList()
      nodes.push(<p key={`p-${nodes.length}`} style={{ margin: '4px 0', fontSize: 13, color: 'var(--text-secondary)' }}>{trimmed}</p>)
    }
  }
  flushList()
  return nodes
}

export function ChangelogModal({ onClose }: Props) {
  const { t } = useTranslation()
  const { settings } = useStore()
  const locale = settings?.language ?? 'de'
  const [releases, setReleases] = useState<ChangelogRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.changelog.list()
      .then(data => {
        setReleases(data)
        // Auto-expand first release
        if (data.length > 0 && data[0]) {
          setExpanded(new Set([data[0].tag_name]))
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : t('changelog.load_error')))
      .finally(() => setLoading(false))
  }, [])

  const toggleExpanded = (tag: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
    } catch { return iso }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="glass modal" style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', padding: 0, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Changelog</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>HELDASH Release Notes</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href="https://github.com/Kreuzbube88/heldash/releases"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              <ExternalLink size={13} /> GitHub
            </a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px 24px' }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner" />
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <p style={{ marginBottom: 8 }}>Releases konnten nicht geladen werden.</p>
              <p style={{ fontSize: 12 }}>{error}</p>
            </div>
          )}

          {!loading && !error && releases.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Keine Releases gefunden
            </div>
          )}

          {releases.map((release, idx) => {
            const isOpen = expanded.has(release.tag_name)
            const isLatest = idx === 0
            return (
              <div key={release.tag_name} style={{ marginBottom: 12 }}>
                <button
                  onClick={() => toggleExpanded(release.tag_name)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: isOpen ? 'var(--radius-sm) var(--radius-sm) 0 0' : 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Tag size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, flex: 1 }}>{release.tag_name}</span>
                  {release.name && release.name !== release.tag_name && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{release.name}</span>
                  )}
                  {isLatest && (
                    <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--accent-subtle)', color: 'var(--accent)', borderRadius: 'var(--radius-sm)', fontWeight: 600, flexShrink: 0 }}>LATEST</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(release.published_at)}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '12px 16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderTop: 'none', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)' }}>
                    {release.body ? (
                      <div>{parseMarkdown(release.body)}</div>
                    ) : (
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Keine Release Notes verfügbar.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
