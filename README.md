# Agency Watch (Loft Carteira)

Executive portfolio management platform for real estate agencies. Tracks portability, negotiation pipeline, next steps, and contract stock — without replacing HubSpot as the consultants' operational CRM.

Consultants update their portfolio via the web app, Slack slash commands, or WhatsApp bot. Managers and admins get a consolidated executive dashboard with prioritization and alerts.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start (Full Stack)](#quick-start-full-stack)
- [Frontend](#frontend)
  - [Tech Stack](#frontend-tech-stack)
  - [Project Structure](#frontend-project-structure)
  - [Routes & Pages](#routes--pages)
  - [Authentication & Session](#authentication--session)
  - [IAM & Permissions](#iam--permissions)
  - [API Client](#api-client)
  - [State Management](#state-management)
  - [Offline / Backend Unavailable](#offline--backend-unavailable)
  - [Frontend Scripts](#frontend-scripts)
- [Backend](#backend)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Integrations](#integrations)
  - [Slack](#slack-integration)
  - [WhatsApp](#whatsapp-integration)
- [Permissions Matrix](#permissions-matrix)
- [Deployment](#deployment)
- [License](#license)

---

## Overview

| Layer | Technology | Default URL |
|-------|------------|-------------|
| **Frontend** | React 19 + TanStack Start/Router/Query | `http://localhost:8080` |
| **Backend** | Flask + SQLAlchemy + PostgreSQL | `http://localhost:5001` |
| **Production SSR** | Cloudflare Workers (optional) | via Wrangler |

The frontend talks to a **local Flask REST API** (`src/lib/api/`). Supabase has been fully removed; auth, data, and IAM run through the backend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser / Cloudflare Workers (TanStack Start SSR)              │
│  React UI  •  TanStack Router  •  TanStack Query                │
│  src/lib/api/  →  HTTP  →  Flask backend                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        /auth/v1       /iam/v1        /rest/v1
        JWT login      Users/Roles    Portfolio CRUD
              │              │              │
              └──────────────┴──────────────┘
                             │
                             ▼
                      PostgreSQL
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   Slack webhooks      WhatsApp webhooks     Cron nudges
   /api/public/slack   /api/public/whatsapp  (Cloudflare)
```

**Design principles**

- HubSpot stays the consultants' operational CRM; this platform is the executive visibility layer.
- `agency_interactions` is an immutable audit log — DB triggers propagate changes to parent agencies.
- Bot tables are server-only; webhooks use `API_SERVICE_KEY` via `src/lib/api/client.server.ts`.
- Agency deduplication: unique index on `(lower(name), lower(city), state)`.

---

## Quick Start (Full Stack)

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # configure PostgreSQL
python cli.py init-db
python cli.py init-iam        # IAM roles (existing DBs)
python cli.py create-user --email admin@loft.com --password 'LoftAdmin123!' --role admin
python run.py                 # http://localhost:5001
```

See **[backend/README.md](backend/README.md)** for full API, CLI, and database docs.

### 2. Frontend

```bash
cd ..                         # repo root
cp .env.example .env          # point VITE_API_URL to backend
npm install
npm run dev                   # http://localhost:8080
```

### 3. First login

1. Open `http://localhost:8080/login`
2. Sign in with the admin user created above
3. Optional: `python cli.py import-exemplos --replace` for sample CSV data

---

## Frontend

### Frontend Tech Stack

| Area | Library |
|------|---------|
| Framework | [TanStack Start](https://tanstack.com/start) 1.168 — SSR + server functions |
| UI | React 19, Tailwind CSS 4, shadcn/ui (Radix) |
| Routing | TanStack Router — file-based `src/routes/` |
| Server state | TanStack Query 5 |
| Forms | react-hook-form + Zod |
| Charts | Recharts |
| Toasts | Sonner |
| Spreadsheets | SheetJS (`xlsx`) — client-side import |
| Icons | Lucide React |

### Frontend Project Structure

```
src/
├── routes/
│   ├── _authenticated/           # Protected app shell
│   │   ├── route.tsx               # Layout, nav, CurrentUserProvider
│   │   ├── dashboard.tsx           # Mission Control KPIs
│   │   ├── portfolio.*             # Portfolio list, detail, new
│   │   ├── consultants.tsx         # Consultant CRUD
│   │   ├── import.tsx              # XLSX/CSV import
│   │   ├── settings.profile.tsx    # Own profile (name, email, password)
│   │   ├── settings.users.tsx      # IAM users + roles (admin)
│   │   ├── settings.slack.tsx      # Slack bot config
│   │   ├── settings.hubspot.tsx    # HubSpot placeholder
│   │   └── bot.tsx                 # WhatsApp/Slack monitoring
│   ├── api/public/                 # Webhook endpoints (Slack, WhatsApp)
│   ├── login.tsx
│   └── __root.tsx                  # QueryClient, AuthSync, toasts
├── components/
│   ├── ui/                         # shadcn primitives
│   ├── user-account-menu.tsx       # Profile + logout (desktop + mobile)
│   ├── backend-offline-banner.tsx  # Backend down warning
│   └── ...
├── providers/
│   └── current-user-provider.tsx   # Shared auth + IAM state
├── hooks/
│   ├── use-current-user.ts         # Re-exports provider hook
│   └── use-backend-status.ts       # Health polling
├── lib/
│   ├── api/                        # HTTP client (see below)
│   ├── constants/permissions.ts    # IAM labels (PT-BR UI)
│   ├── session-cache.ts            # IAM permissions cache (offline)
│   ├── backend-health.ts           # /health check
│   ├── route-guards.ts             # Permission-based route guards
│   ├── slack/                      # Slack bot (server)
│   └── whatsapp/                   # WhatsApp bot (server)
├── start.ts                        # TanStack Start + CSRF middleware
└── server.ts                       # Cloudflare Worker entry
```

### Routes & Pages

| Route | Permission | Description |
|-------|------------|-------------|
| `/login` | — | Email/password login |
| `/dashboard` | `portfolio.read` | Executive KPIs and charts |
| `/portfolio` | `portfolio.read` | Searchable agency table + filters |
| `/portfolio/new` | `portfolio.write` | Manual agency registration |
| `/portfolio/:agencyId` | `portfolio.read` | Detail, interactions, next steps |
| `/consultants` | `consultants.read` | Consultant list (manage requires `consultants.manage`) |
| `/import` | `import.run` | Spreadsheet import (admin) |
| `/settings/profile` | always | Own name, email, password |
| `/settings/users` | `users.manage` | User + role administration |
| `/settings/slack` | `settings.slack` | Slack app manifest & diagnostics |
| `/settings/hubspot` | `settings.hubspot` | HubSpot mapping placeholder |
| `/bot` | `bot.view` | Bot message monitoring |

Navigation items are filtered by IAM permissions in `_authenticated/route.tsx`.

### Authentication & Session

**Flow**

1. Login → `POST /auth/v1/token?grant_type=password`
2. Session stored in `localStorage` (`agency-watch-session`)
3. All API calls send `Authorization: Bearer <token>` + `apikey: <API_PUBLIC_KEY>`
4. Logout → clears session, IAM cache, redirects to `/login`

**Key files**

| File | Role |
|------|------|
| `src/lib/api/auth.ts` | signIn, signOut, getSession, getUser, updateProfile |
| `src/lib/api/auth-attacher.ts` | Attaches Bearer token to server functions |
| `src/routes/__root.tsx` | `AuthSync` — invalidates queries on auth events |

**Profile update**

- Page: `/settings/profile`
- API: `PATCH /auth/v1/user` via `api.auth.updateProfile()`
- Updates local session immediately; sidebar and all screens refresh via `CurrentUserProvider`

**Resilient session**

- Network/backend errors do **not** log the user out
- Session is cleared only on explicit `401` (invalid token) or manual logout
- Offline banner shown when `/health` fails

### IAM & Permissions

Full IAM is implemented in backend (`/iam/v1`) and frontend (`src/lib/api/iam.ts`).

**Default roles**

| Role | Scope | Access |
|------|-------|--------|
| Admin | All data | Everything (`*`) |
| Gestor (manager) | All data | Portfolio, consultants (read), Slack, HubSpot |
| Consultor | Own data only | Portfolio read/write for linked consultant |

**Consultant data isolation**

Consultors only see agencies where `consultant_id` matches their linked `consultants.user_id`. Link users in **Settings → Users** or via IAM API.

**Frontend IAM usage**

```typescript
import { useCurrentUser } from "@/hooks/use-current-user";

const { hasPermission, displayName, dataScope } = useCurrentUser();

if (hasPermission("import.run")) { /* show import */ }
```

**Route guards**

```typescript
import { requireIamPermission } from "@/lib/route-guards";

beforeLoad: () => requireIamPermission("users.manage")
```

### API Client

Browser client: `src/lib/api/client.ts`

```typescript
import { api } from "@/lib/api/client";

// Auth
await api.auth.signInWithPassword({ email, password });
await api.auth.updateProfile({ display_name, email, password });
await api.auth.signOut();

// REST (PostgREST-style)
const { data, error } = await api
  .from("real_estate_agencies")
  .select("*, consultants(name)")
  .order("updated_at", { ascending: false })
  .limit(10)
  .offset(0);

// IAM
import { iam } from "@/lib/api/iam";
const { data: me } = await iam.me();
const { data: users } = await iam.listUsers();
```

Server client (service role, webhooks): `src/lib/api/client.server.ts`

Config: `src/lib/api/config.ts` — reads `VITE_API_URL` / `VITE_API_PUBLIC_KEY`.

### State Management

| Concern | Solution |
|---------|----------|
| Server data | TanStack Query (`useQuery`, `useMutation`) |
| Current user + permissions | `CurrentUserProvider` (single shared context) |
| IAM cache (offline) | `localStorage` via `session-cache.ts` |
| Auth events | `auth.onAuthStateChange` → query invalidation |

After profile save: `refreshUser()` + `queryClient.invalidateQueries()` + `router.invalidate()`.

### Offline / Backend Unavailable

| Component | Behavior |
|-----------|----------|
| `BackendOfflineBanner` | Red banner on authenticated pages |
| `useBackendStatus` | Polls `GET /health` every 15s |
| `auth.getUser()` | Falls back to cached session user |
| Login page | Blocks submit when backend is offline |

### Frontend Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (default `:8080`) |
| `npm run build` | Production build (client + SSR) |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

## Backend

Python Flask API with JWT auth, IAM, and REST CRUD.

**Documentation:** **[backend/README.md](backend/README.md)**

Quick reference:

| Endpoint prefix | Purpose |
|-----------------|---------|
| `/health` | Health check |
| `/auth/v1` | Login, signup, profile, logout |
| `/iam/v1` | Users, roles, permissions |
| `/rest/v1` | Portfolio table CRUD |

**CLI highlights**

```bash
cd backend
.venv/bin/python cli.py list-users
.venv/bin/python cli.py create-user --email user@loft.com --role consultant
.venv/bin/python cli.py reset-password --email user@loft.com
.venv/bin/python cli.py init-iam
.venv/bin/python cli.py import-exemplos --replace
```

---

## Environment Variables

### Root `.env` (frontend + SSR)

| Variable | Scope | Description |
|----------|-------|-------------|
| `VITE_API_URL` | Client | Backend URL (`http://localhost:5001`) |
| `VITE_API_PUBLIC_KEY` | Client | Public API key (`apikey` header) |
| `API_URL` | Server (SSR) | Same as above |
| `API_PUBLIC_KEY` | Server | Same as above |
| `API_SERVICE_KEY` | Server | Service role for webhooks/bots |

See [`.env.example`](.env.example) for Slack and WhatsApp optional vars.

### `backend/.env`

See [`backend/.env.example`](backend/.env.example) — PostgreSQL credentials, JWT secrets, CORS origins, API keys.

---

## Database

Schema: `backend/sql/postgresql/`

| Table | Purpose |
|-------|---------|
| `real_estate_agencies` | Agency portfolio |
| `agency_interactions` | Immutable interaction log |
| `consultants` | Consultant profiles (`user_id` link for IAM scope) |
| `auth_users` / `user_roles` | Accounts and role assignments |
| `iam_roles` | Role definitions + JSON permissions |
| `hubspot_mappings` | HubSpot links (sync not implemented) |
| `slack_*`, `whatsapp_*`, `bot_sessions` | Bot infrastructure |

Triggers: `sync_agency_on_interaction`, `set_updated_at`.

---

## Integrations

### Slack Integration

**App endpoints** (TanStack Start, server-side):

| Path | Purpose |
|------|---------|
| `POST /api/public/slack/commands` | Slash commands |
| `POST /api/public/slack/interactions` | Modals / buttons |
| `POST /api/public/slack/events` | Event subscriptions |
| `GET /api/public/slack/cron` | Scheduled nudges |
| `GET /api/public/slack/health` | Config check |

**Slash commands:** `/carteira`, `/pendencias`, `/atualizar`, `/nova-imobiliaria`

**Setup:** Settings → Slack Bot → copy manifest → set `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` in `.env`.

### WhatsApp Integration

**Endpoint:** `POST /api/public/whatsapp/webhook`

**Providers:** `mock` (dev), `evolution`, `zapi` — set `WHATSAPP_PROVIDER` and related env vars.

Consultants are matched by `consultants.phone`. See `.env.example` for provider credentials.

---

## Permissions Matrix

Enforced by IAM permissions + RLS data scope.

| Action | Admin | Manager | Consultant |
|--------|:-----:|:-------:|:----------:|
| View dashboard / portfolio | ✓ all | ✓ all | ✓ own agencies |
| Edit agency | ✓ | ✓ | ✓ own |
| Delete agency | ✓ | ✓ | — |
| Import spreadsheet | ✓ | — | — |
| Manage users / roles | ✓ | — | — |
| Manage consultants | ✓ | read only | — |
| Configure Slack / HubSpot | ✓ | ✓ | — |
| Edit own profile | ✓ | ✓ | ✓ |

Custom roles can be created in **Settings → Users → Roles** with configurable permissions and data scope (`all` | `own`).

---

## Deployment

| Environment | Method |
|-------------|--------|
| Local dev | `npm run dev` + `python run.py` |
| Docker (dev) | `docker compose up` (see root `Dockerfile`) |
| Production SSR | `npm run build` + `npx wrangler deploy` |
| Backend | Gunicorn / EKS (see `backend/Dockerfile`) |

Cloudflare config: `wrangler.jsonc` → entry `src/server.ts`.

Set secrets via Wrangler or platform env:

```bash
npx wrangler secret put API_SERVICE_KEY
npx wrangler secret put SLACK_BOT_TOKEN
```

---

## License

Private — internal Loft project.
