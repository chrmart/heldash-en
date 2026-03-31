import { useState, useEffect, useCallback } from 'react'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { LS_ABOUT_TAB } from '../constants'
import { api } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────
type AboutTab = 'overview' | 'setup' | 'docker' | 'logbuch' | 'media' | 'recyclarr' | 'cfmanager' | 'ha' | 'unraid' | 'netzwerk' | 'backup' | 'widgets' | 'design'

// ── CodeBlock ─────────────────────────────────────────────────────────────────
function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [children])

  return (
    <div style={{ position: 'relative' }}>
      <pre style={{
        background: 'var(--bg-surface)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.7,
        padding: 'var(--spacing-lg)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--glass-border)',
        overflowX: 'auto',
        margin: 0,
        whiteSpace: 'pre',
        color: 'var(--text-primary)',
      }}>
        {children.trim()}
      </pre>
      <button
        onClick={handleCopy}
        title="Kopieren"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          background: copied ? 'rgba(16,185,129,0.15)' : 'var(--glass-bg)',
          color: copied ? '#10b981' : 'var(--text-secondary)',
          border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'var(--glass-border)'}`,
          transition: 'all var(--transition-fast)',
        }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Kopiert!' : 'Kopieren'}
      </button>
    </div>
  )
}

// ── DocSection ────────────────────────────────────────────────────────────────
function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--spacing-2xl)', marginBottom: 'var(--spacing-xl)' }}>
      <div className="section-header">{title}</div>
      {children}
    </div>
  )
}

// ── SimpleTable ───────────────────────────────────────────────────────────────
function SimpleTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="table-responsive">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--glass-border)',
                background: 'var(--glass-bg)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '10px 12px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  borderBottom: ri < rows.length - 1 ? '1px solid var(--glass-border)' : 'none',
                  fontFamily: typeof cell === 'string' && cell.startsWith('`') ? 'var(--font-mono)' : undefined,
                }}>{typeof cell === 'string' && cell.startsWith('`') ? cell.slice(1, -1) : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Collapsible ───────────────────────────────────────────────────────────────
function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', marginTop: 'var(--spacing-xl)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacing-lg) var(--spacing-2xl)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          textAlign: 'left',
        }}
      >
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div style={{ padding: '0 var(--spacing-2xl) var(--spacing-2xl)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Tab: Unraid ───────────────────────────────────────────────────────────────
function TabUnraid() {
  return (
    <>
      <DocSection title="Übersicht">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          HELDASH verbindet sich direkt mit der nativen Unraid GraphQL API (Unraid 7.2+).<br />
          Kein Plugin erforderlich. Mehrere Server gleichzeitig verwaltbar.
        </p>
      </DocSection>

      <DocSection title="Verbindung einrichten">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Unraid WebGUI → <strong>Settings → Management Access → API Keys → „Create"</strong></li>
          <li>Name vergeben (z.B. „HELDASH"), Rolle: <strong>admin</strong>, Key kopieren</li>
          <li>In HELDASH: <strong>Unraid-Seite → Server hinzufügen</strong> → URL + API Key eingeben → Verbindung testen</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">🔒 API-Key wird serverseitig gespeichert — nie an den Browser übertragen</span>
        </div>
      </DocSection>

      <DocSection title="Unterstützte Funktionen">
        <SimpleTable
          headers={['Bereich', 'Funktionen']}
          rows={[
            ['Übersicht', 'Hostname, OS, Uptime, CPU, RAM, Mainboard'],
            ['HDD', 'Array start/stop, Parity Check, Disk-Tabelle mit Temp & Belegung, Cache Pools'],
            ['Docker', 'Container starten, stoppen, neustarten, pausieren'],
            ['VMs', 'Virtuelle Maschinen starten, stoppen, pausieren, fortsetzen'],
            ['Freigaben', 'Größe, Belegung, Cache & LUKS-Status'],
            ['Benachrichtigungen', 'Lesen, archivieren, Detail-Ansicht'],
            ['System', 'Hardware, Versionen, Lizenz, Benutzer'],
          ]}
        />
      </DocSection>

      <DocSection title="Bekannte Einschränkungen">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Erfordert Unraid 7.2 oder neuer</li>
          <li>Disk Spin Up/Down: nicht von der Unraid API unterstützt</li>
          <li>VM-Details (CPU-Kerne, RAM): nicht über die API verfügbar</li>
          <li>Container-Icons und WebUI-Links: abhängig von der installierten API-Version</li>
        </ul>
      </DocSection>
    </>
  )
}

// ── Tab 1: Übersicht ──────────────────────────────────────────────────────────
function TabOverview({ version, onShowChangelog }: { version: string | null; onShowChangelog?: () => void }) {
  const features = [
    { icon: '🗂️', title: 'Dashboard', desc: 'Modulares Grid, Drag & Drop, Gruppen' },
    { icon: '🐳', title: 'Docker', desc: 'Container verwalten, Logs, Start/Stop' },
    { icon: '🎬', title: 'Media', desc: 'Radarr, Sonarr, Prowlarr, SABnzbd' },
    { icon: '🔎', title: 'Discover', desc: 'TMDB-Suche, Seerr-Requests' },
    { icon: '📋', title: 'Recyclarr', desc: 'TRaSH Guides Sync, CF Groups, Vergleich' },
    { icon: '⚙️', title: 'CF-Manager', desc: 'CFs erstellen, importieren, kopieren' },
    { icon: '🏠', title: 'Home Assistant', desc: 'Entities, Panels, Energy, Areas' },
    { icon: '🧩', title: 'Widgets', desc: 'Systemstatus, AdGuard, Nginx PM' },
    { icon: '📋', title: 'Logbuch', desc: 'Health Score, Aktivitäten, Uptime, Anomalien' },
    { icon: '🎨', title: 'Design', desc: 'Anpassbares Erscheinungsbild' },
  ]

  return (
    <>
      <DocSection title="HELDASH">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2xl)', flexWrap: 'wrap' }}>
          <img src="/logo.png" alt="HELDASH" style={{ width: 180, maxWidth: '100%', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
              Persönliches Homelab-Dashboard mit Glass-Morphism Design.<br />
              Verwalte Services, Docker-Container, Media-Automation, Home Assistant<br />
              und mehr — alles in einer Oberfläche.
            </p>
          </div>
        </div>
      </DocSection>

      <DocSection title="Features Übersicht">
        <div className="card-grid-sm">
          {features.map(f => (
            <div key={f.title} className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text-primary)' }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Version & Links">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', alignItems: 'center' }}>
          <span className="badge badge-neutral">
            Version: {version === null ? <span style={{ opacity: 0.5 }}>…</span> : version || '–'}
          </span>
          <a
            href="https://github.com/Kreuzbube88/heldash"
            target="_blank"
            rel="noopener noreferrer"
            className="badge badge-accent"
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            GitHub: Kreuzbube88/heldash
          </a>
          <a
            href="https://github.com/Kreuzbube88/heldash/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="badge badge-neutral"
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            i18n / Weitere Sprachen: siehe CONTRIBUTING.md
          </a>
          {onShowChangelog && (
            <button
              onClick={onShowChangelog}
              className="badge badge-neutral"
              style={{ cursor: 'pointer', background: 'none', border: '1px solid var(--glass-border)' }}
            >
              Changelog anzeigen
            </button>
          )}
        </div>
      </DocSection>
    </>
  )
}

// ── Tab 2: Installation & Setup ───────────────────────────────────────────────
function TabSetup() {
  return (
    <>
      <DocSection title="Docker Run">
        <CodeBlock>{`
docker run -d \\
  --name heldash \\
  -p 8282:8282 \\
  -v /mnt/cache/appdata/heldash:/data \\
  -e SECRET_KEY=$(openssl rand -hex 32) \\
  -e SECURE_COOKIES=false \\
  ghcr.io/kreuzbube88/heldash:latest
        `}</CodeBlock>
      </DocSection>

      <DocSection title="Docker Compose">
        <CodeBlock>{`
services:
  heldash:
    image: ghcr.io/kreuzbube88/heldash:latest
    container_name: heldash
    ports:
      - 8282:8282
    volumes:
      - /mnt/cache/appdata/heldash:/data
      # Für Docker-Verwaltung:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # Für Recyclarr-Integration:
      - /mnt/cache/appdata/recyclarr:/recyclarr
    environment:
      - SECRET_KEY=DEIN_GEHEIMER_SCHLUESSEL
      - SECURE_COOKIES=false
    restart: unless-stopped
        `}</CodeBlock>
      </DocSection>

      <DocSection title="Umgebungsvariablen">
        <SimpleTable
          headers={['Variable', 'Pflicht', 'Standard', 'Beschreibung']}
          rows={[
            ['SECRET_KEY', '✅ Ja', '(unsicher)', 'JWT-Signierungsschlüssel. Generieren: openssl rand -hex 32'],
            ['SECURE_COOKIES', '✅ Ja', 'false', 'false = HTTP (LAN), true = HTTPS (hinter Reverse Proxy mit SSL)'],
            ['PORT', 'Nein', '8282', 'Fastify Listen-Port'],
            ['DATA_DIR', 'Nein', '/data', 'Datenbankpfad und Icon-Verzeichnis'],
            ['LOG_LEVEL', 'Nein', 'info', 'debug · info · warn · error'],
            ['LOG_FORMAT', 'Nein', 'pretty', 'pretty = lesbare Ausgabe, json = strukturiert für Log-Aggregatoren'],
            ['RECYCLARR_CONFIG_PATH', 'Nein', '/recyclarr/recyclarr.yml', 'Pfad zur Recyclarr-Konfigurationsdatei'],
            ['RECYCLARR_CONTAINER_NAME', 'Nein', 'recyclarr', 'Name des Recyclarr Docker-Containers'],
          ]}
        />
      </DocSection>

      <DocSection title="Erster Start">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Container starten</li>
          <li><code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>http://server-ip:8282</code> öffnen</li>
          <li>Admin-Account anlegen (erscheint automatisch beim ersten Start)</li>
          <li>Unter <strong>Settings → General</strong>: Dashboard-Titel anpassen</li>
          <li>Unter <strong>Apps</strong>: erste Services hinzufügen</li>
        </ol>
      </DocSection>

      <DocSection title="Unraid">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Community Applications Template verfügbar: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>heldash.xml</code>
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Import über <strong>Community Applications → Import</strong>
        </p>
      </DocSection>

      <Collapsible title="Technische Details">
        <SimpleTable
          headers={['Schicht', 'Technologie']}
          rows={[
            ['Frontend', 'React 18, TypeScript, Vite 5'],
            ['State', 'Zustand'],
            ['Drag & Drop', '@dnd-kit'],
            ['Icons', 'lucide-react'],
            ['Styling', 'Vanilla CSS, Glass Morphism'],
            ['Backend', 'Fastify 4, TypeScript'],
            ['Datenbank', 'SQLite (WAL-Modus)'],
            ['Container', 'Docker, node:20-alpine'],
            ['Registry', 'ghcr.io/kreuzbube88/heldash'],
          ]}
        />
      </Collapsible>
    </>
  )
}

// ── Tab 3: Docker ─────────────────────────────────────────────────────────────
function TabDocker() {
  return (
    <>
      <DocSection title="Voraussetzungen">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Der Docker-Socket muss in den Container gemountet werden:
        </p>
        <CodeBlock>{`-v /var/run/docker.sock:/var/run/docker.sock:ro`}</CodeBlock>
      </DocSection>

      <DocSection title="Docker-Seite aktivieren">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Settings → Groups</strong> → Gruppe auswählen</li>
          <li>Tab <strong>"Docker"</strong> → Docker-Seitenzugriff aktivieren</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">ℹ️ Admins haben immer Zugriff</span>
        </div>
      </DocSection>

      <DocSection title="Funktionen">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Container-Liste mit CPU/RAM-Auslastung</li>
          <li>Echtzeit-Statusupdates via Docker Events stream — kein Polling</li>
          <li>Live-Log-Stream pro Container (stdout + stderr)</li>
          <li>Start / Stop / Restart (nur Admins)</li>
          <li>Docker Overview Widget für Dashboard/Topbar/Sidebar</li>
        </ul>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">ℹ️ Statuswechsel (start/stop/restart) werden automatisch im Aktivitäten-Feed erfasst</span>
        </div>
      </DocSection>

      <DocSection title="Docker Overview Widget">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Widgets → + Widget hinzufügen → Typ: Docker Overview</strong></li>
          <li>Widget auf Dashboard, Topbar oder Sidebar platzieren</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-warning">⚠️ Docker Widget-Zugriff muss pro Gruppe separat aktiviert werden (Settings → Groups → Docker)</span>
        </div>
      </DocSection>
    </>
  )
}

// ── Tab 4: Media & Seerr ──────────────────────────────────────────────────────
function TabMedia() {
  return (
    <>
      <DocSection title="Unterstützte Services">
        <SimpleTable
          headers={['Service', 'Typ', 'Funktion']}
          rows={[
            ['Radarr', 'Arr', 'Film-Verwaltung, Queue, Kalender'],
            ['Sonarr', 'Arr', 'Serien-Verwaltung, Queue, Kalender'],
            ['Prowlarr', 'Arr', 'Indexer-Verwaltung'],
            ['SABnzbd', 'Downloader', 'Download-Queue, Verlauf'],
            ['Seerr', 'Request', 'Medien-Requests, Discover'],
          ]}
        />
      </DocSection>

      <DocSection title="Arr-Instanz hinzufügen">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Media-Seite → + Instance</strong> (Topbar)</li>
          <li>Typ wählen: Radarr / Sonarr / Prowlarr / SABnzbd / Seerr</li>
          <li>URL und API-Key eintragen</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">🔒 API-Keys werden serverseitig gespeichert — nie an den Browser übertragen</span>
        </div>
      </DocSection>

      <DocSection title="Discover Tab (TMDB)">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Voraussetzungen</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Seerr-Instanz konfiguriert</li>
          <li>TMDB API-Key hinterlegt</li>
        </ul>

        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>TMDB API-Key einrichten</p>
        <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Kostenlosen Account auf <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>themoviedb.org</code> erstellen</li>
          <li>Unter <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>themoviedb.org/settings/api</code> → API-Key kopieren</li>
          <li>In HELDASH: <strong>Settings → General → TMDB API Key</strong> eintragen</li>
        </ol>

        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Funktionen</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Trending-Inhalte browsen (Heute / Diese Woche)</li>
          <li>Filter: Genre, Streaming-Dienst, Sprache, Bewertung, Erscheinungsjahr</li>
          <li>Suche nach Filmen und Serien</li>
          <li>Request per Klick → wird direkt an Seerr gesendet</li>
          <li>TV-Serien: Staffelauswahl vor dem Request</li>
        </ul>
      </DocSection>

      <DocSection title="Icon-Vererbung">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          Media-Karten übernehmen automatisch das Icon des passenden Service-Eintrags
          (Abgleich über URL). Service in Apps mit gleicher URL → Icon wird übernommen.
        </p>
      </DocSection>
    </>
  )
}

// ── Tab 5: Recyclarr ──────────────────────────────────────────────────────────
function TabTrash() {
  return (
    <>
      <DocSection title="Voraussetzungen">
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 13, color: 'var(--text-secondary)' }}>
          <li>Recyclarr Docker-Container läuft</li>
          <li>CRON_SCHEDULE deaktiviert: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>CRON_SCHEDULE=0 0 1 1 0</code></li>
          <li>Volume-Mount in HELDASH-Container:</li>
        </ul>
        <CodeBlock>{`-v /pfad/zu/recyclarr/config:/recyclarr`}</CodeBlock>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '16px 0 8px' }}>Umgebungsvariablen in HELDASH setzen:</p>
        <CodeBlock>{`RECYCLARR_CONFIG_PATH=/recyclarr/recyclarr.yml
RECYCLARR_CONTAINER_NAME=recyclarr`}</CodeBlock>
      </DocSection>

      <DocSection title="Recyclarr Container (falls nicht vorhanden)">
        <CodeBlock>{`
services:
  recyclarr:
    image: ghcr.io/recyclarr/recyclarr:latest
    container_name: recyclarr
    volumes:
      - /mnt/cache/appdata/recyclarr:/config
    environment:
      - TZ=Europe/Berlin
      - CRON_SCHEDULE=0 0 1 1 0
        `}</CodeBlock>
      </DocSection>

      <DocSection title="Ersteinrichtung — Wizard">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 13, color: 'var(--text-secondary)' }}>
          <li>Media → Recyclarr-Tab → Wizard</li>
          <li>Instanz wählen</li>
          <li>Qualitätsprofile wählen (Standard/Deutsch/Anime)</li>
          <li>"Nur deutsche Releases" Toggle (setzt min. Score 10000)</li>
          <li>Eigene CFs zuweisen (vorher im CF-Manager erstellen)</li>
          <li>Konfiguration erstellen → ersten Sync ausführen</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">Score-Overrides und erweiterte Einstellungen nach erstem Sync im Recyclarr-Tab</span>
        </div>
      </DocSection>

      <DocSection title="Profile verwalten">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 13, color: 'var(--text-secondary)' }}>
          <li>Profil auswählen → TRaSH CFs mit Guide-Scores anzeigen</li>
          <li>Score-Override pro CF pro Profil (leer = Guide-Score)</li>
          <li>Eigene CFs pro Profil aktivieren + Score setzen</li>
          <li>Erweiterte Einstellungen: except, except_patterns (Regex), min_format_score, preferred_ratio, delete_old_custom_formats</li>
        </ul>
      </DocSection>

      <DocSection title="Schutz eigener Custom Formats">
        <SimpleTable
          headers={['Einstellung', 'Wert', 'Wo']}
          rows={[
            ['Nicht mehr verwendete CFs löschen', 'AUS (Standard)', 'Erweiterte Einstellungen'],
            ['User CFs aktivieren', 'Mit Score eintragen', 'Recyclarr-Tab → Profil'],
          ]}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <span className="badge badge-success">User CFs mit Score in trash_ids werden nie zurückgesetzt</span>
          <span className="badge badge-neutral">except-Liste nur für CFs komplett außerhalb Recyclarr's Kontrolle</span>
        </div>
      </DocSection>

      <DocSection title="Sync-Zeitplan">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Zeitplan-Tab: manuell, täglich, wöchentlich oder Cron-Ausdruck.
          Der Zeitplan wird sofort nach dem Speichern aktiv — kein Neustart des Containers erforderlich.
        </p>
        <div>
          <span className="badge badge-warning">CRON_SCHEDULE im Recyclarr-Container = 0 0 1 1 0 (deaktiviert)</span>
        </div>
      </DocSection>

      <DocSection title="TRaSH Custom Format Groups">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          CFs werden automatisch nach Gruppen gefiltert und gruppiert:
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Nur Gruppen mit ≥50% Überschneidung zum konfigurierten Profil werden angezeigt</li>
          <li>Jede Gruppe ist ein-/ausklappbar</li>
          <li>Gruppen-Header zeigt: Name, CF-Anzahl, aktive Overrides, Sync-Toggle</li>
          <li>"Reset Group": alle Overrides dieser Gruppe zurücksetzen</li>
          <li>Suche filtert über alle Gruppen und klappt Treffer automatisch auf</li>
          <li>Eigene CFs (CF-Manager) werden separat angezeigt und im Profil zugewiesen</li>
        </ul>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-neutral">CFs die keiner Gruppe angehören erscheinen unter "Nicht gruppiert"</span>
          <span className="badge badge-neutral">CFs die in Radarr/Sonarr sind aber nicht zum Profil gehören erscheinen unter "Nicht im Profil" (schreibgeschützt)</span>
        </div>
      </DocSection>

      <DocSection title="Profil-Vergleich">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Nur verfügbar wenn 2+ Profile für eine Instanz konfiguriert sind.
          "Profile vergleichen" Button → Vollbild-Overlay
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Alle Profile nebeneinander</li>
          <li>Gleiche Scores: grau (kein Unterschied)</li>
          <li>Unterschiedliche Scores: farblich hervorgehoben</li>
          <li>Toggle "Nur Unterschiede anzeigen" (Standard: an)</li>
          <li>Schreibgeschützt — Bearbeitung im normalen Tab</li>
        </ul>
      </DocSection>

      <DocSection title="Score-Heatmap">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Toggle [Tabelle / Heatmap] pro Profil. Heatmap zeigt CFs als farbige Kacheln:
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><span style={{ color: '#22c55e', fontWeight: 600 }}>Grün</span> = hoher positiver Score</li>
          <li><span style={{ color: '#ef4444', fontWeight: 600 }}>Rot</span> = hoher negativer Score</li>
          <li><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Grau</span> = 0</li>
          <li>Hover: vollständiger Name, Gruppe, Guide-Score vs. Override</li>
          <li>Klick: Score-Override direkt bearbeiten</li>
        </ul>
      </DocSection>

      <DocSection title="Sync-Verlauf & Backups">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Sync läuft im Hintergrund — kein Stream während des Syncs.
          Nach Abschluss: kompakte Zusammenfassung ("3 CFs erstellt, 12 Scores aktualisiert").
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>"Verlauf anzeigen": letzte 10 Syncs mit Timestamp, Ergebnis, Details auf Anfrage</li>
          <li>Automatisches Backup vor jedem Sync</li>
          <li>Max 5 Backups werden behalten</li>
          <li>Wiederherstellung per Klick unter "Backups" im Recyclarr-Tab</li>
        </ul>
      </DocSection>

    </>
  )
}

// ── Tab 6: CF-Manager ─────────────────────────────────────────────────────────
function TabCFManager() {
  return (
    <>
      <DocSection title="CF-Manager">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Custom Formats direkt in Radarr und Sonarr verwalten —
          ohne die Oberfläche der Arr-Instanzen zu öffnen.
          Daten werden live aus der Instanz geladen.
        </p>
      </DocSection>

      <DocSection title="Instanz auswählen">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Pill-Buttons oben — eine Schaltfläche pro Radarr/Sonarr-Instanz.
          Prowlarr, SABnzbd und Seerr werden nicht unterstützt.
        </p>
      </DocSection>

      <DocSection title="Custom Formats verwalten (linke Spalte)">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Liste aller CFs die in der Instanz vorhanden sind.
          Suchfeld zum Filtern nach Name.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Pro CF wird angezeigt</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Name</li>
          <li>Anzahl Conditions <span className="badge badge-neutral" style={{ fontSize: 11 }}>badge-neutral</span></li>
          <li>Score pro Qualitätsprofil <span className="badge badge-success" style={{ fontSize: 11, marginRight: 4 }}>positiv</span><span className="badge badge-error" style={{ fontSize: 11 }}>negativ</span></li>
          <li><span className="badge badge-accent" style={{ fontSize: 11 }}>Recyclarr: geschützt</span> wenn der CF-Name in der Recyclarr Ausnahmen-Liste (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>reset_unmatched_scores.except</code>) steht</li>
        </ul>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Aktionen (nur Admins)</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Stift-Icon → CF bearbeiten</li>
          <li>Papierkorb-Icon → CF löschen (mit Bestätigung)</li>
        </ul>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          <strong>"+ Erstellen"</strong> Button (nur Admins) → Neues CF anlegen
        </p>
      </DocSection>

      <DocSection title="CF erstellen / bearbeiten">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Felder</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Name (Pflicht)</li>
          <li>"Umbenennen wenn angewendet" Toggle</li>
        </ul>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Conditions</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 8px' }}>
          Pro Condition: Typ, Name, Negate, Pflicht, Wert<br />
          + Condition hinzufügen / × entfernen
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Unterstützte Typen</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Release-Titel (Regex)</li>
          <li>Sprache</li>
          <li>Quelle</li>
          <li>Auflösung</li>
          <li>Release-Gruppe</li>
          <li>Qualitäts-Modifier</li>
          <li>Dateigröße</li>
          <li>Indexer-Flag</li>
        </ul>
        <span className="badge badge-neutral">Änderungen werden direkt in Radarr/Sonarr gespeichert.</span>
      </DocSection>

      <DocSection title="Scores im Qualitätsprofil setzen (rechte Spalte)">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Tabs — ein Tab pro Qualitätsprofil in der Instanz.
          Mehrere Profile pro Instanz werden vollständig unterstützt.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Pro Profil: Tabelle aller CFs mit aktuellem Score.
          Score-Eingabe pro CF — positiv, negativ oder 0.
          <strong>"Alle Scores speichern"</strong> speichert alle Änderungen auf einmal.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-warning">Scores die von Recyclarr verwaltet werden können beim nächsten Sync überschrieben werden — außer der CF-Name steht in der Ausnahmen-Liste unter Recyclarr → Advanced Settings.</span>
          <span className="badge badge-accent">Recyclarr: geschützt neben CFs die in der Ausnahmen-Liste stehen — diese Scores werden nicht überschrieben.</span>
        </div>
      </DocSection>

      <DocSection title="Zusammenspiel mit Recyclarr">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Empfohlener Workflow für eigene CFs (z.B. Tdarr):
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>CF hier im CF-Manager erstellen (Name + Conditions)</li>
          <li>Score im gewünschten Qualitätsprofil setzen</li>
          <li>In <strong>Recyclarr → Instanz → Advanced Settings</strong> des Profils: CF-Namen zur Ausnahmen-Liste hinzufügen</li>
          <li>Recyclarr überschreibt diesen Score beim Sync nicht mehr</li>
        </ol>
      </DocSection>

      <DocSection title="Import, Export & Kopieren">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Import aus Radarr/Sonarr</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 8px' }}>
          "Importieren" Button → zeigt alle CFs die nicht von TRaSH verwaltet werden.
          Auswahl per Checkbox — nur ausgewählte werden übernommen.
          Bereits verwaltete CFs mit Unterschieden: "Lokal abweichend" Badge + Option zu sync.
        </p>
        <div style={{ marginBottom: 16 }}>
          <span className="badge badge-warning">TRaSH-verwaltete CFs werden automatisch gefiltert und nicht angeboten</span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Export</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Pro CF-Zeile: Download-Icon → exportiert CF als JSON.
          Format kompatibel mit Radarr/Sonarr Export und TRaSH Guides.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>CF kopieren</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Pro CF-Zeile: Kopier-Icon → öffnet Kopier-Dialog</li>
          <li>Ziel: gleiche Instanz ODER andere Instanz (Radarr → Sonarr möglich)</li>
          <li>Neuer Name vorausgefüllt: "{'{Name}'} (Kopie)"</li>
          <li>CF wird direkt in Ziel-Instanz erstellt + JSON-Datei angelegt</li>
        </ul>
      </DocSection>

      <DocSection title="Condition-Vorlagen">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Beim "+ Condition hinzufügen" → Auswahl: "Aus Vorlage" oder "Leer beginnen".
          Vorlagen gruppiert nach Typ:
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Release-Titel: Deutsch, x265, Netflix, Amazon, Disney+, Remux, IMAX, HDR, Atmos...</li>
          <li>Sprache: Deutsch, Englisch, Französisch, Japanisch, Multi</li>
          <li>Quelle: BluRay, WEB-DL, WEBRip, HDTV, DVD</li>
          <li>Auflösung: 480p, 720p, 1080p, 2160p</li>
          <li>Dateigröße: Klein (&lt;2GB), Mittel (2–10GB), Groß (&gt;30GB)</li>
          <li>Qualitäts-Modifier, Indexer-Flag, Edition: IMAX, Director's Cut, Extended</li>
          <li>Alle Felder nach Auswahl bearbeitbar</li>
        </ul>
      </DocSection>
    </>
  )
}

// ── Tab 7: Home Assistant ─────────────────────────────────────────────────────
function TabHA() {
  return (
    <>
      <DocSection title="HA-Instanz hinzufügen">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Home Assistant Seite → + Instance</strong></li>
          <li>Name, URL (z.B. <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>http://homeassistant.local:8123</code>), Long-Lived Token eintragen</li>
          <li><strong>"Test"</strong> Button → Verbindung prüfen</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">🔒 Tokens werden serverseitig gespeichert — nie an den Browser übertragen</span>
        </div>
      </DocSection>

      <DocSection title="Long-Lived Token erstellen (in HA)">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Home Assistant öffnen</li>
          <li><strong>Profil → Sicherheit → Long-Lived Access Tokens → Token erstellen</strong></li>
          <li>Token kopieren und in HELDASH eintragen</li>
        </ol>
      </DocSection>

      <DocSection title="Panels hinzufügen">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Entity Browser öffnen (Lupe-Icon)</li>
          <li>Domain-Tab wählen (Lichter, Klima, Sensoren, etc.)</li>
          <li>Entity suchen und auswählen → Panel wird hinzugefügt</li>
          <li>Panels per Drag & Drop anordnen</li>
        </ol>
      </DocSection>

      <DocSection title="Räume / Areas">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Voraussetzung: Areas müssen in Home Assistant konfiguriert sein
          (<strong>Einstellungen → Bereiche &amp; Zonen → Bereiche</strong>)
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Ansicht wechseln</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Toggle <strong>"Flach"</strong> | <strong>"Nach Raum"</strong> — erscheint ausschließlich im Tab <strong>"Panels"</strong>.<br />
          Preference wird lokal gespeichert
        </p>
        <SimpleTable
          headers={['Ansicht', 'Beschreibung']}
          rows={[
            ['Flach', 'Alle Panels in einem Grid — bisheriges Verhalten'],
            ['Nach Raum', 'Panels werden nach HA-Bereich gruppiert. Jeder Raum als eigener Abschnitt mit Raumname. Panels ohne Raum-Zuweisung erscheinen unter "Ohne Raum". Reihenfolge: alphabetisch, "Ohne Raum" immer zuletzt. Auf Mobile: Räume kollabierbar per Tipp auf den Header'],
          ]}
        />
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 8px' }}>Raum automatisch erkennen</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Beim Hinzufügen eines Panels wird der Raum automatisch
          aus der HA Entity-Registry übernommen (falls konfiguriert).
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Raum manuell zuweisen</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Panel bearbeiten (Stift-Icon) → <strong>"Raum"</strong> Dropdown<br />
          "Kein Raum" = Panel erscheint in "Ohne Raum"
        </p>
        <span className="badge badge-neutral">Wenn keine Areas in HA konfiguriert sind, wird der Toggle ausgeblendet und die Flach-Ansicht verwendet.</span>
      </DocSection>

      <DocSection title="Unterstützte Entity-Typen">
        <SimpleTable
          headers={['Domain', 'Steuerung']}
          rows={[
            ['light.*', 'Toggle, Helligkeit, Farbtemperatur'],
            ['climate.*', 'Zieltemperatur, HVAC-Modus'],
            ['media_player.*', 'Play/Pause, Lautstärke, Quelle, Album-Cover'],
            ['cover.*', 'Öffnen/Schließen, Position'],
            ['switch.*, automation.*, fan.*', 'Toggle'],
            ['sensor.*, binary_sensor.*', 'Anzeige (schreibgeschützt)'],
            ['script.*, scene.*', 'Ausführen-Button'],
          ]}
        />
      </DocSection>

      <DocSection title="Energy Dashboard">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Voraussetzungen</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.7 }}>
          HA Energy Dashboard muss in Home Assistant konfiguriert sein.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Panel hinzufügen</p>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>+ Panel → Panel-Typ: Energy</strong></li>
          <li>Panel zeigt: Netzverbrauch, Solar, Autarkie, optional Gas/Einspeisung</li>
          <li>Zeitraum wählen: Heute / Diese Woche / Dieser Monat</li>
        </ol>
      </DocSection>

      <DocSection title="HA Widget">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          <strong>Settings → Widgets → + Widget → Typ: Home Assistant</strong><br />
          Entities für Topbar/Sidebar-Anzeige auswählen.
        </p>
      </DocSection>

      <DocSection title="Hausübersicht">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Interaktive Etagen-/Außenbereichsansicht mit Live-State via WebSocket. Die Ausrichtung ist fest auf <strong>Landscape</strong> gesetzt.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Hausübersicht anlegen</p>
        <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Home Assistant → Tab "Hausübersicht" → Etage hinzufügen</li>
          <li>Bild hochladen (PNG/JPG/SVG — Grundriss-Zeichnung oder Foto)</li>
          <li>Edit-Modus aktivieren → Entities per Klick auf die Karte platzieren</li>
          <li>Entities zeigen Live-State: Lichter pulsieren wenn an, Sensoren zeigen Wert</li>
        </ol>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Steuerung</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Zoom/Pan via CSS transform (kein Canvas-Element)</li>
          <li>Undo/Redo für Entity-Placement</li>
          <li>Snap-to-Grid optional aktivierbar</li>
          <li>Entity-Positionen werden als % der Canvas-Größe gespeichert (responsiv)</li>
        </ul>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-neutral">Bilder werden in {'{DATA_DIR}'}/floorplans/ gespeichert, via /floorplan-images/ serviert</span>
          <span className="badge badge-neutral">Erste HA-Instanz wird automatisch verwendet — kein Instanz-Selektor</span>
        </div>
      </DocSection>

      <DocSection title="Presence Tracking">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Personen-Entities (person.*) mit Status-Anzeige: home / not_home / away.
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Presence Bar zeigt alle konfigurierten Personen mit Status-Badge</li>
          <li>GPS-Karte optional: per Toggle in localStorage aktivieren</li>
          <li>Karte: OpenStreetMap (Leaflet), dynamisch geladen — keine API-Key erforderlich</li>
          <li>GPS-Koordinaten kommen aus HA-Attributen (latitude/longitude)</li>
        </ul>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-neutral">GPS-Karte ist opt-in — standardmäßig deaktiviert (Datenschutz)</span>
        </div>
      </DocSection>

      <DocSection title="GPS-Tab">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Zeigt alle Personen (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>person.*</code>-Entities) aus Home Assistant als Marker auf einer Karte.
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Klick auf einen Marker öffnet ein Popup mit Gerätedetails</li>
          <li>Über ein einklappbares Auswahlmenü können einzelne Personen ein- oder ausgeblendet werden</li>
        </ul>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-neutral">Datenschutzfreundlich: standardmäßig deaktiviert — opt-in pro Nutzer</span>
        </div>
      </DocSection>

      <DocSection title="Automationen-Tab">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Listet alle in Home Assistant konfigurierten Automationen.
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Automationen können direkt aus HELDASH heraus ausgeführt werden</li>
          <li>Aktivieren und Deaktivieren einzelner Automationen per Toggle möglich</li>
          <li>Suchfeld zum schnellen Filtern nach Name</li>
        </ul>
      </DocSection>

      <DocSection title="Lock & Alarm Karten">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Gesicherte Bedienung für Schlösser (lock.*) und Alarmanlagen (alarm_control_panel.*).
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Lock-Karten: Öffnen/Schließen erfordert PIN-Eingabe im Popover</li>
          <li>Alarm-Karten: Scharf stellen / Deaktivieren mit PIN-Bestätigung</li>
          <li>PIN wird direkt an HA übergeben — nicht in HELDASH gespeichert</li>
        </ul>
        <div>
          <span className="badge badge-warning">⚠️ PIN-Schutz ist UI-seitig — HELDASH nur im lokalen Netzwerk betreiben</span>
        </div>
      </DocSection>

      <DocSection title="HA Alerts">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Entity-basierte Benachrichtigungen als Toast-Overlay.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Alert erstellen</p>
        <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Home Assistant → Tab "Alerts" → Alert hinzufügen</li>
          <li>Entity auswählen, Bedingung (z.B. state = "on"), Nachricht eingeben</li>
          <li>Alert wird ausgelöst wenn Entity den Zustand erreicht</li>
        </ol>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-neutral">Rate-Limit: min 60s zwischen zwei Auslösungen pro Alert</span>
          <span className="badge badge-neutral">Max 20 Alerts gesamt</span>
          <span className="badge badge-neutral">Delivery via SSE stream GET /api/ha/alerts/stream</span>
        </div>
      </DocSection>

      <DocSection title="Szenarien">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          HA Szenen und Scripts direkt aus HELDASH ausführen.
        </p>
        <SimpleTable
          headers={['Typ', 'Beschreibung']}
          rows={[
            ['Szene (scene.*)', 'Setzt vordefinierte Gerätezustände — kein Feedback'],
            ['Script (script.*)', 'Führt eine Abfolge von Aktionen aus — kann Parameter haben'],
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">Szenarien-Tab: Liste aller Szenen + Scripts mit Ausführen-Button</span>
        </div>
      </DocSection>

      <DocSection title="Entity-Verlauf">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          24h/7T Graph für beliebige Entities. Daten kommen aus HA History API.
        </p>
        <SimpleTable
          headers={['Zeitraum', 'Auflösung']}
          rows={[
            ['24 Stunden', 'Alle Datenpunkte'],
            ['7 Tage', 'Stündliche Aggregation'],
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">Chart-Bibliothek: Recharts — verfügbar für alle Entity-Typen (Sensoren, Binär, Klima etc.)</span>
        </div>
      </DocSection>

      <DocSection title="Aktivitäten-Feed">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          HA-Events werden automatisch im Logbuch-Aktivitäten-Feed erfasst.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Erfasste Domains</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          light, switch, climate, cover, media_player, automation, scene, input_boolean
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <span className="badge badge-neutral">Sensoren (sensor.*, binary_sensor.*) werden nicht erfasst — zu viele Updates</span>
          <span className="badge badge-neutral">Rate-Limit: max 1 Eintrag pro Entity pro 60 Sekunden</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Anzeige: Logbuch → Tab "Aktivitäten" → Filter "HA"
        </p>
      </DocSection>
    </>
  )
}

// ── Tab: Netzwerk ─────────────────────────────────────────────────────────────
function TabNetzwerk() {
  return (
    <>
      <DocSection title="Übersicht">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Netzwerk-Geräte per TCP-Ping überwachen, Subnetze scannen und
          Geräte per Wake-on-LAN aufwecken — alles ohne externe Abhängigkeiten.
        </p>
      </DocSection>

      <DocSection title="Gerät hinzufügen">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Felder</p>
        <SimpleTable
          headers={['Feld', 'Beschreibung']}
          rows={[
            ['Name', 'Anzeigename des Geräts'],
            ['IP-Adresse', 'IPv4-Adresse (z.B. 192.168.1.1)'],
            ['Port', 'TCP-Port für Ping (leer = automatisch: 80, 443, 22, 8080)'],
            ['MAC-Adresse', 'Optional — für Wake-on-LAN (Format: AA:BB:CC:DD:EE:FF)'],
            ['Gruppe', 'Optional — zur Kategorisierung'],
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">Subnet wird manuell konfiguriert — nie automatisch erkannt (Docker-Container hat eigene IP)</span>
        </div>
      </DocSection>

      <DocSection title="IP-Scanner">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Subnetz im CIDR-Format scannen, erreichbare Geräte anzeigen und direkt hinzufügen.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Verwendung</p>
        <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>CIDR-Notation eingeben (z.B. <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>192.168.1.0/24</code>)</li>
          <li>Scan starten — erreichbare Hosts werden aufgelistet</li>
          <li>Gerät auswählen → direkt als Netzwerk-Gerät hinzufügen</li>
        </ol>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-neutral">Max /22 (1024 Hosts) — größere Subnetze werden abgelehnt</span>
          <span className="badge badge-neutral">TCP-Ping auf Ports 80, 443, 22, 8080 in Reihenfolge</span>
        </div>
      </DocSection>

      <DocSection title="Wake-on-LAN">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Gerät per Magic Packet (UDP Broadcast, Port 9) aufwecken.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Voraussetzungen</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>BIOS/UEFI: Wake-on-LAN aktivieren</li>
          <li>Netzwerkkarte: WoL aktivieren (ethtool oder Treiber-Einstellung)</li>
          <li>MAC-Adresse des Geräts im Netzwerk-Gerät hinterlegen</li>
        </ul>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-neutral">Magic Packet: 6×0xFF + 16× MAC-Bytes (102 Bytes gesamt)</span>
          <span className="badge badge-neutral">Kein WoL-Button wenn keine MAC-Adresse hinterlegt</span>
        </div>
      </DocSection>

      <DocSection title="Aktivitäten & History">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Statuswechsel (online → offline / offline → online) erscheinen im Aktivitäten-Feed</li>
          <li>Filter "Netzwerk" im Logbuch → Tab "Aktivitäten"</li>
          <li>Pro Gerät: 24h Uptime-Verlauf als Miniaturgraph</li>
          <li>Status-History wird 7 Tage aufbewahrt</li>
        </ul>
      </DocSection>
    </>
  )
}

// ── Tab: Backup Center ────────────────────────────────────────────────────────
function TabBackup() {
  return (
    <>
      <DocSection title="Übersicht">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Zentrale Backup-Übersicht für alle Backup-Quellen im Homelab.
          Warnungen bei veralteten oder fehlgeschlagenen Backups.
        </p>
        <SimpleTable
          headers={['Quelle', 'Voraussetzung']}
          rows={[
            ['CA Backup (Unraid)', '/boot:/boot:ro Mount erforderlich'],
            ['Duplicati', 'URL + API-Key'],
            ['Kopia', 'URL + optionale Authentifizierung'],
            ['Docker Config Export', 'Docker-Socket gemountet'],
            ['Unraid VMs', 'Via CA Backup Log erkannt'],
          ]}
        />
      </DocSection>

      <DocSection title="CA Backup">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          CA Backup schreibt Logs nach <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>/boot/logs/</code>.
          HELDASH liest diese Logs um Backup-Status und Zeitpunkt zu ermitteln.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Mount konfigurieren</p>
        <CodeBlock>{`# docker run:
-v /boot:/boot:ro

# docker-compose:
volumes:
  - /boot:/boot:ro`}</CodeBlock>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-warning">⚠️ Ohne /boot Mount: klare Fehlermeldung — kein Absturz</span>
        </div>
      </DocSection>

      <DocSection title="Duplicati">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Duplicati-Instanz per URL und API-Key anbinden.
        </p>
        <SimpleTable
          headers={['Feld', 'Beschreibung']}
          rows={[
            ['URL', 'z.B. http://192.168.1.10:8200'],
            ['API-Key', 'Unter Duplicati → Einstellungen → API-Schlüssel'],
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">Timeout 5s — bei Nichterreichbarkeit: Fehler-State (kein Absturz)</span>
        </div>
      </DocSection>

      <DocSection title="Kopia">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Kopia Server per URL und optionaler HTTP-Authentifizierung anbinden.
        </p>
        <SimpleTable
          headers={['Feld', 'Beschreibung']}
          rows={[
            ['URL', 'z.B. http://192.168.1.10:51515'],
            ['Benutzername', 'Optional (wenn Kopia-Auth aktiv)'],
            ['Passwort', 'Optional'],
          ]}
        />
      </DocSection>

      <DocSection title="Docker Config Export">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Alle laufenden Container-Konfigurationen als JSON exportieren.
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Exportiert: Container-Name, Image, Ports, Volumes, Umgebungsvariablen, Labels</li>
          <li>Format: JSON (application/json), direkt downloadbar</li>
          <li>Zum Importieren: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>docker create</code> oder Compose-Datei manuell erstellen</li>
        </ul>
        <div>
          <span className="badge badge-neutral">Nutzt bestehende Docker-Socket-Verbindung — kein zusätzlicher Mount erforderlich</span>
        </div>
      </DocSection>

      <DocSection title="Warnungen & Aktivitäten">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Warnung wenn letztes Backup {">"} 7 Tage alt</li>
          <li>Warnung bei fehlgeschlagenem Backup (Fehler-Status in Logs)</li>
          <li>Warnungen erscheinen in der Backup-Übersicht als hervorgehobene Karte</li>
          <li>Backup-Events im Logbuch → Tab "Aktivitäten" → Filter "Backup"</li>
        </ul>
      </DocSection>

      <DocSection title="Integrierter Leitfaden">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Der Backup Center enthält einen integrierten Leitfaden: <strong>Unraid vollständig sichern</strong>.
          Themen: 3-2-1 Regel, CA Backup, Duplicati, Kopia, Datenbanken, Disaster Recovery.
          Erreichbar über den Tab "Leitfaden" im Backup Center.
        </p>
      </DocSection>
    </>
  )
}

// ── Tab 7: Widgets ────────────────────────────────────────────────────────────
function TabWidgets() {
  const widgetTypes = [
    {
      icon: '🖥️',
      title: 'Server Status',
      desc: 'CPU, RAM, Festplatten-Auslastung (Linux-Host)',
      setup: 'Pfade im Widget-Editor konfigurieren (Name + Pfad). Jede Festplatte als Volume einbinden: -v /mnt/cache:/mnt/cache:ro',
      badge: 'neutral' as const,
      badgeText: 'Nicht erreichbare Pfade werden mit Warnung markiert. Mögliche Duplikate (gleicher Mount) werden erkannt.',
    },
    {
      icon: '🛡️',
      title: 'AdGuard Home',
      desc: 'DNS-Statistiken, Blockierrate, Schutz-Toggle',
      setup: 'URL + Benutzername + Passwort eintragen',
      badge: null,
    },
    {
      icon: '🔐',
      title: 'Nginx Proxy Manager',
      desc: 'Aktive Proxies, Zertifikate, Ablauf-Warnungen',
      setup: 'NPM-URL + Benutzername + Passwort (Token-Authentifizierung)',
      badge: null,
    },
    {
      icon: '🐳',
      title: 'Docker Overview',
      desc: 'Container-Counts, Start/Stop/Restart',
      setup: 'Docker-Socket muss gemountet sein',
      badge: 'warning' as const,
      badgeText: 'Docker Widget-Zugriff pro Gruppe aktivieren',
    },
    {
      icon: '🏠',
      title: 'Home Assistant',
      desc: 'Entity-States in Topbar/Sidebar',
      setup: 'HA-Instanz + Entities auswählen',
      badge: null,
    },
    {
      icon: '⚡',
      title: 'HA Energy',
      desc: 'Kompakte Energie-Zusammenfassung',
      setup: 'HA-Instanz + Zeitraum auswählen. Voraussetzung: HA Energy Dashboard konfiguriert',
      badge: null,
    },
    {
      icon: '📅',
      title: 'Kalender',
      desc: 'Upcoming Radarr/Sonarr Releases',
      setup: 'Arr-Instanzen auswählen + Tage-Vorschau (1–30)',
      badge: null,
    },
  ]

  return (
    <>
      <DocSection title="Verfügbare Widget-Typen">
        <div className="card-grid-sm">
          {widgetTypes.map(w => (
            <div key={w.title} className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{w.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text-primary)' }}>{w.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{w.desc}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: w.badge ? 8 : 0 }}>
                <span style={{ fontWeight: 600 }}>Einrichtung:</span> {w.setup}
              </div>
              {w.badge && (
                <span className={`badge badge-${w.badge}`} style={{ fontSize: 11 }}>{w.badge === 'warning' ? '⚠️ ' : ''}{w.badgeText}</span>
              )}
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Widget-Anzeigeorte">
        <SimpleTable
          headers={['Ort', 'Beschreibung']}
          rows={[
            ['Dashboard', 'Vollständige Karte im Widget-Bereich'],
            ['Topbar', 'Kompakte Stats in der oberen Leiste'],
            ['Sidebar', 'Mini-Widget in der linken Navigation'],
          ]}
        />
      </DocSection>

      <DocSection title="Gruppen-Berechtigungen für Widgets">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          <strong>Settings → Groups → Gruppe → Tab "Widgets"</strong><br />
          Einzelne Widgets für Gruppen ein-/ausblenden.
        </p>
      </DocSection>
    </>
  )
}

// ── Tab 8: Logbuch ────────────────────────────────────────────────────────────
function TabLogbuch() {
  return (
    <>
      <DocSection title="Übersicht">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Das Logbuch ist das zentrale Monitoring-Center von HELDASH.
          Alle Aktivitäten, Service-Zustände, Sync-Verläufe und Docker-Events
          sind hier an einem Ort zusammengefasst.
        </p>
      </DocSection>

      <DocSection title="Homelab Health Score">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Der Health Score (0–100) gibt einen schnellen Überblick über den Zustand des Homelabs.
          Er wird aus vier Bereichen berechnet:
        </p>
        <SimpleTable
          headers={['Bereich', 'Gewichtung', 'Kriterium']}
          rows={[
            ['Services', '40 Punkte', 'Anteil online / gesamt'],
            ['Docker', '30 Punkte', 'Anteil laufend / gesamt'],
            ['Recyclarr', '20 Punkte', 'Letzter Sync erfolgreich'],
            ['Home Assistant', '10 Punkte', 'Verbindung aktiv'],
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">Score wird bei jedem Seitenaufruf neu berechnet — kein Caching</span>
        </div>
      </DocSection>

      <DocSection title="Ereignis-Kalender">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Der Kalender zeigt die Aktivitätsdichte der letzten 84 Tage im GitHub-Contribution-Graph-Stil.
          Jede Zelle steht für einen Tag — dunklere Farbe = mehr Ereignisse.
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Datenbasis: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>activity_log</code> Tabelle, nach Datum gruppiert</li>
          <li>Hover über eine Zelle zeigt Datum und Ereignis-Anzahl</li>
          <li>Standardmäßig eingeklappt — per Klick ausklappen</li>
        </ul>
      </DocSection>

      <DocSection title="Anomalie-Erkennung">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Services mit auffälligem Verhalten werden automatisch markiert.
        </p>
        <SimpleTable
          headers={['Kriterium', 'Wert']}
          rows={[
            ['Kategorie', 'system'],
            ['Schwere', 'warning'],
            ['Schwellwert', 'mehr als 3 Offline-Ereignisse in 24 Stunden'],
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-warning">⚠️ Anomalien erscheinen oben im Logbuch als hervorgehobene Karte</span>
        </div>
      </DocSection>

      <DocSection title="Tabs">
        <SimpleTable
          headers={['Tab', 'Inhalt']}
          rows={[
            ['Aktivitäten', 'Chronologischer Feed: HA Events, Docker Statuswechsel, Service-Ausfälle, Recyclarr Syncs'],
            ['Uptime', 'Service-Verfügbarkeit: 7-Tage-Prozent, 24h-Graph pro Service'],
            ['Sync-Verlauf', 'Letzte 10 Recyclarr-Syncs mit Timestamp, Ergebnis und Output auf Anfrage'],
            ['Docker Events', 'Rohe Container-Ereignisse aus dem Docker Events stream'],
          ]}
        />
      </DocSection>

      <DocSection title="Filter">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Kategorie</strong>: Alle · HA · Docker · System · Recyclarr · Netzwerk · Backup</li>
          <li><strong>Zeitraum</strong>: Letzte Stunde · 24h · 7 Tage · 30 Tage</li>
          <li><strong>Freitext</strong>: Suche in Ereignis-Beschreibungen</li>
        </ul>
      </DocSection>

      <DocSection title="Ressourcen-Verlauf">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          CPU, RAM und Netzwerk-Auslastung als historischer Graph.
        </p>
        <SimpleTable
          headers={['Zeitraum', 'Auflösung', 'Aufbewahrung']}
          rows={[
            ['1 Stunde', '1-Minuten-Einträge', '25 Stunden'],
            ['24 Stunden', '1-Minuten-Einträge', '25 Stunden'],
            ['7 Tage', '15-Minuten-Aggregation', '8 Tage'],
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">Aggregation läuft alle 15min serverseitig — keine Lücken bei Browser-Reload</span>
        </div>
      </DocSection>

      <DocSection title="Erweiterbarkeit">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Das Logbuch ist modular aufgebaut. Neue Integrationen (z.B. Unraid API) werden
          als eigener Tab in das <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>TABS</code> Array
          in <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>LogbuchPage.tsx</code> eingetragen.
        </p>
      </DocSection>
    </>
  )
}

// ── Tab 9: Design & Einstellungen ─────────────────────────────────────────────
function TabDesign() {
  return (
    <>
      <DocSection title="Design-Tab (nur Admins)">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.7 }}>
          <strong>Settings → Design</strong> — Änderungen gelten global für alle Nutzer.
        </p>
        <SimpleTable
          headers={['Einstellung', 'Optionen', 'Beschreibung']}
          rows={[
            ['Ecken-Stil', 'Scharf / Standard / Abgerundet', 'Radius aller Karten und Elemente'],
            ['Hintergrund-Blur', 'Subtil / Mittel / Stark', 'Stärke des Glass-Morphism Effekts'],
            ['Abstände', 'Kompakt / Komfortabel / Geräumig', 'Padding und Spacing im Layout'],
            ['Sidebar-Stil', 'Standard / Minimal / Schwebend', 'Aussehen der Navigation'],
            ['Animationen', 'Voll / Reduziert / Keine', 'Transitions und Animationen'],
            ['Custom CSS', 'Freitextfeld', 'Globale CSS-Overrides'],
          ]}
        />
      </DocSection>

      <DocSection title="Themes">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.7 }}>
          <strong>Topbar → Mond/Sonne Icon</strong> → Hell / Dunkel umschalten<br />
          <strong>Topbar → Farbkreis</strong> → Akzentfarbe: Cyan / Orange / Magenta
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Auto-Theme (Settings → General)</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          Automatischer Wechsel nach Uhrzeit.<br />
          Z.B. Hell ab 08:00, Dunkel ab 20:00.
        </p>
      </DocSection>

      <DocSection title="Hintergrundbilder">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.7 }}>
          <strong>Settings → Design → Hintergrundbilder</strong>
        </p>
        <ol style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Bild hochladen (PNG/JPG/SVG/WebP, max. 5 MB)</li>
          <li>Unter <strong>Settings → Groups → Gruppe → Tab "Background"</strong> zuweisen</li>
        </ol>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Jede Gruppe kann ein eigenes Hintergrundbild haben.
        </p>
      </DocSection>

      <DocSection title="Benutzer & Gruppen">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.7 }}>
          <strong>Settings → Users</strong>: Nutzer anlegen, Passwort setzen, Gruppe zuweisen<br />
          <strong>Settings → Groups</strong>: Gruppen-Tabs: Apps · Media · Widgets · Docker · Background<br />
          Sichtbarkeit pro Gruppe individuell einstellbar.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 8px' }}>Eingebaute Gruppen</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className="badge badge-accent">Admin — Vollzugriff, nicht löschbar</span>
          <span className="badge badge-neutral">Guest — Lesezugriff, kein Docker</span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Gast-Modus für Admins</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          <strong>Topbar → "Switch to Guest View"</strong><br />
          → Dashboard so einrichten wie Gäste es sehen sollen.
        </p>
      </DocSection>
    </>
  )
}

// ── AboutPage ─────────────────────────────────────────────────────────────────
const TAB_ORDER: AboutTab[] = ['overview', 'setup', 'docker', 'logbuch', 'media', 'recyclarr', 'cfmanager', 'ha', 'unraid', 'netzwerk', 'backup', 'widgets', 'design']

const TAB_LABELS: Record<AboutTab, string> = {
  overview: 'Übersicht',
  setup: 'Installation',
  docker: 'Docker',
  logbuch: 'Logbuch',
  media: 'Media & Seerr',
  recyclarr: 'Recyclarr',
  cfmanager: 'CF-Manager',
  ha: 'Home Assistant',
  unraid: 'Unraid',
  netzwerk: 'Netzwerk',
  backup: 'Backup',
  widgets: 'Widgets',
  design: 'Design',
}

export function AboutPage({ onShowChangelog }: { onShowChangelog?: () => void } = {}) {
  const [activeTab, setActiveTab] = useState<AboutTab>(() => {
    const saved = localStorage.getItem(LS_ABOUT_TAB)
    return (saved && TAB_ORDER.includes(saved as AboutTab) ? saved : 'overview') as AboutTab
  })
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    api.health()
      .then(data => setVersion(data.version ?? '–'))
      .catch(() => setVersion('–'))
  }, [])

  const handleTabChange = (tab: AboutTab) => {
    setActiveTab(tab)
    localStorage.setItem(LS_ABOUT_TAB, tab)
  }

  return (
    <div className="about-layout">
      {/* Left sticky navigation */}
      <nav className="about-nav glass">
        {TAB_ORDER.map(tab => (
          <button
            key={tab}
            className={`nav-item${activeTab === tab ? ' active' : ''}`}
            onClick={() => handleTabChange(tab)}
            style={{ width: '100%', textAlign: 'left', background: 'none', fontFamily: 'var(--font-sans)', justifyContent: 'flex-start' }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {/* Right scrollable content */}
      <div className="about-content">
        {activeTab === 'overview'   && <TabOverview version={version} onShowChangelog={onShowChangelog} />}
        {activeTab === 'setup'      && <TabSetup />}
        {activeTab === 'docker'     && <TabDocker />}
        {activeTab === 'logbuch'    && <TabLogbuch />}
        {activeTab === 'media'      && <TabMedia />}
        {activeTab === 'recyclarr'  && <TabTrash />}
        {activeTab === 'cfmanager'  && <TabCFManager />}
        {activeTab === 'ha'         && <TabHA />}
        {activeTab === 'unraid'     && <TabUnraid />}
        {activeTab === 'netzwerk'   && <TabNetzwerk />}
        {activeTab === 'backup'     && <TabBackup />}
        {activeTab === 'widgets'    && <TabWidgets />}
        {activeTab === 'design'     && <TabDesign />}
      </div>
    </div>
  )
}
