# Contributing to HELDASH

Thank you for your interest in contributing!

## Language / i18n

The dashboard is currently German-only. If you'd like to add
internationalization (i18n) support, here's what's involved:

**Scope:**
- ~500-800 UI strings across frontend components
- Recommended library: `i18next` + `react-i18next`
- Language files: `frontend/src/locales/de.json` + your language
- Language setting: stored per-user in the database
- Language switch: in Settings → General

**Please open an issue first** to discuss your approach before
starting a large PR. This avoids duplicate work.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript (strict), Vite 5 |
| State | Zustand |
| Styling | Vanilla CSS (CSS custom properties, no CSS-in-JS) |
| Backend | Fastify 4, TypeScript (strict) |
| Database | SQLite (better-sqlite3, WAL mode) |

## Code Standards

- **TypeScript strict** throughout — no `any` types
- **CSS variables only** — no hardcoded colors or inline styles
  (exception: dynamic values only)
- **No new dependencies** without a clear reason and discussion
- **All API calls** via `api.ts` — never `fetch` directly in components
- **All state mutations** via Zustand stores
- **Icons** via `lucide-react` only
- **No browser `alert`/`confirm`/`prompt`** — all feedback inline

## Getting Started

Requirements: Node.js 20+, Docker (for testing)
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Backend runs on port 8282, frontend dev server proxies API calls.

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Run `tsc` in both `backend/` and `frontend/` before submitting
- Follow existing code patterns — read CLAUDE.md for architecture details
- PRs that break TypeScript strict mode will not be merged

## Questions

Open a GitHub Issue for questions, feature requests or bug reports.
