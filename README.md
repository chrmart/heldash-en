HELDASH
Personal homelab dashboard with glass morphism design. Manage services, Docker containers, media automation, Home Assistant and more — all in one interface.

⚠️ Use at your own risk
This project was developed entirely with Claude Code (AI-assisted programming). It has not been manually reviewed by a professional developer. The code has not been audited for security vulnerabilities, production readiness, or best practices.
It is explicitly NOT recommended to expose HELDASH publicly on the internet. The dashboard is intended exclusively for use on a local home network (LAN).
Use entirely at your own risk.


Features
Dashboard

🗂️ Modular grid — freely arrange apps, media instances and widgets
📱 Fully responsive — optimized for desktop, tablet and mobile
📏 Responsive grid — auto-fill layout adapts to screen size
🧩 Widget strip — ungrouped widgets in their own area
📦 Dashboard groups — named containers, 25–100% width, collapsible on mobile, drag & drop, double-click to rename
✅ Dashboard & health-check toggles — one-click control
🖱️ Edit mode — drag & drop with touch support on mobile
📐 Placeholder tiles — reserve space and structure rows
👥 Per-user dashboards — individual layout per user
🔗 App tiles link directly to the service URL
🔴 Live online/offline status indicators

Navigation

🖥️ Desktop: collapsible sidebar — icons + labels or icons only
📱 Mobile: bottom navigation bar, respects user permissions

Apps

📋 App list grouped by categories
➕ Add, edit, delete with icon (PNG/JPG/SVG or emoji)
🔁 Automatic health checks via HTTP — server-side scheduler (every 2 min), frontend reads every 30s
🏷️ Tags and description per app

Media

🎬 Radarr — movie stats, download queue, calendar
📺 Sonarr — series stats, download queue, calendar
🔍 Prowlarr — indexer list and 24h grab stats
⬇️ SABnzbd — queue with progress bar, download history
🖼️ Media cards inherit icons from matching app entries
🔒 API keys server-side only

Seerr / Discover

🔎 Discover tab — powered by TMDB: trending movies and series
🎛️ Advanced filters — genre, streaming service, language, rating, year
🔀 Sort by popularity, rating, date or title
📺 Real season selection — available/pending/missing seasons
📥 Request movies and seasons directly via Seerr
🟢 Smart request button — live availability from Seerr
➕ Load more pagination

Recyclarr

🔄 Recyclarr v8 GUI — recyclarr.yml auto-generated
⚙️ Setup wizard for initial configuration, then managed in the Recyclarr tab
📊 TRaSH CFs grouped by custom format groups — only profile-relevant groups shown (≥50% overlap)
🔍 CF search filters across all groups, auto-expands matches
🎚️ Score overrides per CF per profile + heatmap view
📊 Profile comparison across multiple profiles (differences highlighted)
👤 Activate custom CFs from CF Manager per profile with custom score
🛡️ reset_unmatched_scores + except + except_patterns (regex)
⏰ Sync schedule: manual, daily, weekly or cron — schedule activates immediately (no restart needed)
🔍 Score change detection on manual changes in Radarr/Sonarr
📜 Sync history of last 10 syncs with output on demand
💾 Automatic config backup before every sync (max 5 backups)

CF Manager

📝 Create, edit and delete custom formats in Radarr/Sonarr
➕ Full conditions editor (schema loaded directly from Arr API)
📥 Import from Radarr/Sonarr — automatically detects CFs not from TRaSH
📤 Export individual CFs as JSON (compatible with TRaSH Guides format)
📋 Templates for all condition types (release title, language, source, resolution, etc.)
🔀 Copy CFs — within same instance or cross-service (Radarr ↔ Sonarr)
🔒 Protection against deleting active Recyclarr CFs

Docker

🐳 Live container list with CPU/RAM, state badges, uptime
📋 Sortable container table
📊 Overview bar — total / running / stopped / restarting
📜 Live log streaming via SSE (stdout + stderr)
⚡ Real-time status updates via Docker events stream (no polling)
▶️ Start / stop / restart (admins only)
🔒 Docker page access configurable per group

Logbook

📋 Central monitoring center — all activity in one place
💯 Homelab health score (0–100) — calculated from services, Docker, Recyclarr, HA
📅 Event calendar — GitHub graph style, last 84 days
🔔 Anomaly detection — unstable services automatically flagged
📊 Tabs: Activity | Uptime | Sync History | Docker Events
🔍 Filter by category, time range and free text
📈 Resource history — CPU, RAM, network as 24h/7d graph
🌐 Network filter in activity
💾 Backup filter in activity
🔄 Extensible — new integrations (e.g. Unraid) as separate tabs

Network

🌐 Monitor network devices — ping via TCP, status history 7 days
📡 IP scanner — scan subnets (CIDR, max /22), add devices directly
🔌 Wake-on-LAN — wake devices via magic packet
📊 Device groups — named categories, 24h uptime history per device
🔔 Status changes in the activity feed (network filter)

Backup Center

💾 Central backup overview — CA Backup, Duplicati, Kopia, Docker, VMs
🐳 Docker config export — back up all container configurations as JSON
⚠️ Automatic warnings when backup is older than 7 days
📖 Integrated guide: full Unraid backup (3-2-1 rule, CA Backup, Duplicati, Kopia, databases, disaster recovery)

Unraid Integration

💽 Array & disk overview — status, usage, SMART data per disk
🐳 Docker container management — start/stop/restart directly from HELDASH
🖥️ VM management — status, start/stop/force-stop
🔔 Unraid notifications — system alerts directly in the dashboard
📊 System metrics — RAM usage, uptime, parity status

Home Assistant

🏠 Multi-instance support (add/edit/delete/test)
🔍 Entity browser — domain filter tabs + search
🃏 Panel grid — domain-aware cards, real-time WebSocket, drag & drop
💡 Lights — toggle, brightness, color temperature
🌡️ Climate — current + target temperature, HVAC mode
🎵 Media player — controls, volume, source selection, album art
🪟 Cover — open/stop/close + position slider
📊 Sensors — value with unit, last updated (read-only)
▶️ Scripts & scenes — action button
⚡ Energy dashboard — solar, grid, self-sufficiency chart, today / this week / this month
🏠 Rooms/areas — group panels by HA areas, automatic room detection from entity registry
🗺️ Floorplan — floor/outdoor areas with image upload, place entities, live state via WebSocket (lights pulse, sensors, etc.)
🔒 Lock cards — PIN-secured lock/unlock
🚨 Alarm cards — arm/disarm with PIN
🔔 HA alerts — entity state changes as toast notifications
🎬 Scenes — run HA scenes + scripts directly
📈 Entity history — 24h/7d graph for all entity types (Recharts)
👥 Presence tracking — person status + optional GPS map (OpenStreetMap)
🔒 Long-lived access tokens server-side only

Widgets

🖥️ Server status — live CPU, RAM, disks (Linux host)
🛡️ AdGuard Home — DNS stats, block rate, protection toggle
🕳️ Pi-hole — DNS stats, block rate, protection toggle
🐳 Docker overview — container counts + controls
🔐 Nginx Proxy Manager — proxies, certificates, expiry warnings
🏠 Home Assistant widget — entity states anywhere
⚡ HA energy widget — compact energy summary
📅 Calendar widget — combined Radarr/Sonarr upcoming releases
📊 Pin bar in topbar for quick overview
🔄 Live polling — all widgets update automatically

Dashboard & UX

➕ Quick actions in topbar — context-sensitive add button per page
🎓 Onboarding wizard — guided setup on first launch
👁️ Guest visibility overlay — admin sees directly which elements are visible to guests

Auth & Access

🔑 Local user authentication — admin setup on first launch
👥 User groups (admin, guest + custom)
👁️ Per-group visibility for apps, media and widgets
🐳 Per-group Docker permissions
🎨 Guests can change theme locally
🛠️ Admin "guest mode"

Design & Settings

🎨 Design tab (admins only) — corner style, blur, spacing, sidebar style, animations, custom CSS — applies globally for all users
🌓 Light/dark + 3 accent colors (cyan, orange, magenta)
🕐 Auto-theme — time-based light/dark switching
🖼️ Background images — upload and assign per user group
🎬 TMDB API key configuration

Documentation

📖 Integrated docs center in the About page

Changelog

🎉 What's New modal — appears automatically after updates
📋 All releases viewable directly in the dashboard

Import/Export

📥 JSON import/export — backup and restore service configurations


Installation
Unraid Community Store (Recommended)
HELDASH is available directly through the Unraid Community Applications Store. Search for "HELDASH" in the CA App Store and install with one click.
Then open http://server-ip:8282. On first launch the admin setup page appears automatically.
Docker (Alternative)
bashdocker run -d \
  --name heldash \
  -p 8282:8282 \
  -v /mnt/user/appdata/heldash:/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /mnt/user/appdata/recyclarr:/recyclarr \
  # -v /boot:/boot:ro \  # optional: CA Backup monitoring
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e SECURE_COOKIES=false \
  ghcr.io/kreuzbube88/heldash:latest
Or with docker-compose:
bashdocker compose up -d
Then open http://server-ip:8282. On first launch the admin setup page appears automatically.

Security Notice
⚠️ HELDASH is intended exclusively for local use on a home network.

Do not expose publicly on the internet
Run behind a reverse proxy (e.g. Nginx Proxy Manager) with SSL
Set SECURE_COOKIES=true when behind HTTPS
Always set SECRET_KEY: openssl rand -hex 32


Environment Variables
VariableRequiredDefaultDescriptionSECRET_KEYYesinsecureJWT secret key. Use openssl rand -hex 32SECURE_COOKIESYesfalsefalse = HTTP local, true = HTTPS via reverse proxyPORTNo8282Web server listen portDATA_DIRNo/dataDatabase, icons, backgrounds, floorplan imagesLOG_LEVELNoinfodebug · info · warn · errorLOG_FORMATNoprettypretty = readable · json = for log aggregatorsRECYCLARR_CONFIG_PATHNo/recyclarr/recyclarr.ymlPath to recyclarr.yml (container perspective)RECYCLARR_CONTAINER_NAMENorecyclarrName of the Recyclarr Docker containerPUIDNo99User ID for file permissions (Unraid: 99)PGIDNo100Group ID for file permissions (Unraid: 100)

Unraid
Community Applications template: heldash.xml in the repository root.
Important paths:
Container pathHost path (default)Description/data/mnt/user/appdata/heldashDatabase + configuration/var/run/docker.sock/var/run/docker.sockDocker integration (ro)/recyclarr/mnt/user/appdata/recyclarrRecyclarr config (optional)/boot/bootCA Backup log access (optional, read-only)

The /boot mount is only required if you want HELDASH to monitor CA Backup as a backup source. Configurable as an optional path in heldash.xml.

Required fields on installation:

SECRET_KEY — generate with openssl rand -hex 32 in the terminal
SECURE_COOKIES — false for local access, true with HTTPS


Documentation
Full documentation available directly in the dashboard under About.

Development Note
This project was developed entirely with AI assistance (Claude Code). No professional security review has been conducted. Use on local home networks only.