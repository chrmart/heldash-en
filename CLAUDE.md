# CLAUDE.md — HELDASH

Personal homelab dashboard. Self-hosted on Unraid, single Docker container.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript strict, Vite 5 |
| State | Zustand: useStore · useArrStore · useDockerStore · useWidgetStore · useDashboardStore · useHaStore · useRecyclarrStore · useActivityStore |
| DnD | @dnd-kit/core + sortable + utilities |
| Icons | lucide-react (16px topbar/sidebar, 14px headers, 12px buttons) |
| Styling | Vanilla CSS, CSS custom properties, glass morphism |
| Backend | Fastify 4, TypeScript strict |
| Auth | @fastify/jwt + @fastify/cookie + bcryptjs (cost 12) |
| DB | better-sqlite3 (SQLite, WAL, no ORM) |
| HTTP | undici Pool (service ping, arr proxy, Docker socket) |
| Registry | ghcr.io/kreuzbube88/heldash |

## Architecture

- Single container: Fastify serves `/api/*` + React SPA, no nginx inside
- Frontend routing: no React Router — single `page` string in `App.tsx`
- Auth: JWT httpOnly cookie; `app.authenticate` = verify JWT; `app.requireAdmin` = verify + `groupId === 'grp_admin'`
- ACL: `grp_admin` full; `grp_guest` read-only, no Docker; custom groups sparse visibility (row = hidden)
- Dashboard: 20-col CSS grid; apps=2 cols, widgets=4×2; `grid-auto-flow:dense`
- Docker proxy: undici Pool (10 conn) → `/var/run/docker.sock`; SSE: `reply.hijack()` before Docker request
- HA WS: `HaWsClient` per instanceId in `HaWsManager`; SSE fans events; backoff 5s→60s; invalidated on PATCH/DELETE
- Recyclarr: generates recyclarr.yml (v8 syntax); syncs via docker exec (SSE stream); CF groups cached 5min; sync history max 10
- Activity log: max 100 rows; rate-limited 1/entity/60s; never logs api_key/token/password
- Resource history: 1min entries 25h, 15min entries 8 days; aggregation every 15min

## Frontend Rules (HELDASH-specific)

- All API calls via `api.ts` — never `fetch` directly in components
- All state mutations via Zustand store — never `api.*` directly in components
- Shared pure functions in `utils.ts` — never redefine `normalizeUrl` or `containerCounts` inline
- `useEffect` deps: stable primitives only — never `.filter()/.map()` in dep array
- CSS in `global.css` only — no inline styles except dynamic values
- Errors → local `error` state → displayed inline in form/modal
- Status "unknown" = neutral gray dot only — no text, no tooltip

## Backend Rules (HELDASH-specific)

- Interface for every request body (`CreateXBody`, `PatchXBody`) and DB row (`XRow`)
- Return `RowType | undefined` from `.get()` — never `unknown`
- Errors: `reply.status(N).send({ error: '...' })` — codes: 400/404/413/415
- Recyclarr YAML: v8 only, no include blocks
- `sanitize()` strips `api_key`, `password_hash`, `token`, widget passwords — never in API responses
- `{ logLevel: 'silent' }` not `{ disableRequestLogging: true }` (not in Fastify 4 types)

## CSS Variables (quick ref)

Spacing 8px base: `xs`=4 `sm`=8 `md`=12 `lg`=16 `xl`=20 `2xl`=24 `3xl`=32
Fonts: `--font-sans: Geist` | `--font-display: Space Mono` (h1–h4) | `--font-mono: JetBrains Mono`
Radius: `sm`=8 `md`=12 `lg`=16 `xl`=24 `2xl`=32
Transitions: `fast`=100ms | `base`=200ms | `smooth`=350ms bounce | `slow`=500ms

## Gotchas

- **better-sqlite3**: booleans → always `value ? 1 : 0`
- **Docker Pool**: `new Pool('http://localhost', { socketPath: '/var/run/docker.sock', connections: 10 })` — NOT `undici.Client`
- **SSE hijack**: `reply.hijack()` before Docker request; errors as SSE events after
- **Docker log mux**: non-TTY frames have 8-byte header; first byte `0x01/0x02` = muxed
- **Self-signed TLS**: all undici agents use `connect: { rejectUnauthorized: false }`
- **DB migration**: `ALTER TABLE … ADD COLUMN` in try/catch — silently ignores "column exists"
- **HA panels reorder**: `PATCH /api/ha/panels/reorder` registered BEFORE `PATCH /api/ha/panels/:id`
- **HA WS**: `auth_invalid` sets `destroyed=true` to stop retry loops
- **HA token**: `sanitizeInstance()` strips token; PATCH preserves with `token = req.body.token?.trim() || row.token`
- **Activity log rate limit**: max 1 entry/entity/60s — prevents sensor flooding
- **HA Alerts**: max 20 total; min 60s between triggers (last_triggered_at); SSE via `/api/ha/alerts/stream`
- **Network Monitor**: subnet never auto-detect (Docker eth0 ≠ host IP); CIDR max /22 (1024 hosts)
- **tcpPing**: always `socket.destroy()` after connect/error — never hangs
- **WoL**: 102-byte magic packet; UDP dgram port 9; dgram = Node built-in
- **CA Backup**: requires `/boot:ro` mount; no mount → clear error, no crash
- **Recyclarr yaml_instance_key**: sanitized once on create, never regenerated
- **Recyclarr api_key**: always from arr_instances — never stored in recyclarr_config
- **User CF trash_id**: `user-{slug}` frozen on create — never regenerate on rename
- **CF groups 50% threshold**: ≥50% CF overlap to include group in profile-cfs route
- **last_checked column**: in `services` table it's `last_checked` (NOT `last_checked_at`)
- **Service health scheduler**: server-side every 30s writes `last_status`; frontend polls every 15s
- **Activity timestamps**: SQLite stores UTC without 'Z'; backend appends 'Z' before returning
- **Docker Events pendingStops**: 5s delay before logging 'gestoppt'; 'start'/'restart' cancels timer
- **FST_ERR_CTP_EMPTY_JSON_BODY**: frontend sends `body: JSON.stringify({})` for empty bodies
- **pino-pretty**: must be in `dependencies` not devDependencies — crashes container if missing
- **@fastify/rate-limit**: use `^8.0.0` with Fastify 4 (v9 = Fastify 5)
- **Health score**: services 40pts + docker 30pts + recyclarr 20pts + ha 10pts
- **Logbuch**: single source of truth for monitoring; new integrations → add tab to TABS array
- **HA Floorplan**: single instance assumed in UI; images in `{DATA_DIR}/floorplans/`; positions as % for responsiveness
- **Changelog Modal**: first start (null) → save silently, no modal; version change → show modal
- **Healthcheck**: use `127.0.0.1` not `localhost` (IPv6 resolution)
- **safeJson helper**: `{} as any` fallback for config props; `safeJson<unknown>(str, null)` for settings

## Deploy

```
Build test:     "Build & Push Docker Image" workflow → version tag
Release:        "Release Latest" workflow → bumps package.json, creates tag, sets latest
Unraid update:  docker compose pull && docker compose up -d
Image:          ghcr.io/kreuzbube88/heldash:<tag>
Data:           /mnt/cache/appdata/heldash:/data
```
