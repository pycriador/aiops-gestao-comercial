# Agency Watch — Backend

Python **Flask + SQLAlchemy** API backed by **PostgreSQL**. Provides authentication, IAM, and REST data access for the React frontend.

**Default URL:** `http://localhost:5001`

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [CLI](#cli)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Authentication (`/auth/v1`)](#authentication-authv1)
  - [IAM (`/iam/v1`)](#iam-iamv1)
  - [REST (`/rest/v1`)](#rest-restv1)
- [IAM & Permissions](#iam--permissions)
- [Row-Level Security (RLS)](#row-level-security-rls)
- [Project Layout](#project-layout)
- [Docker](#docker)

---

## Architecture

```
React frontend (Vite / TanStack Start)
        │  Bearer JWT + apikey header
        ▼
┌───────────────────────────────────────┐
│  Flask app (backend/run.py)           │
│  ├── /auth/v1   JWT login, profile    │
│  ├── /iam/v1    Users, roles, perms   │
│  └── /rest/v1   Portfolio CRUD        │
└───────────────────────────────────────┘
        │
        ▼
   PostgreSQL (gestaocomercial)
```

| Module | Path | Responsibility |
|--------|------|----------------|
| Auth | `app/api/auth_routes.py` | Signup, login, logout, profile |
| IAM | `app/api/iam_routes.py` | User/role administration |
| REST | `app/api/rest_routes.py` | Table CRUD + RPC |
| Permissions | `app/auth/permissions.py` | Permission catalog & evaluation |
| RLS | `app/auth/rls.py` | Data scope (all vs own consultant) |
| Security | `app/auth/security.py` | bcrypt, JWT, refresh tokens |
| Models | `app/models.py` | SQLAlchemy models |
| CLI | `cli.py` | Admin commands |

---

## Quick Start

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # configure PostgreSQL + secrets
python cli.py init-db                # create tables + default IAM roles
python cli.py create-user \
  --email admin@loft.com \
  --password 'LoftAdmin123!' \
  --role admin
python run.py                        # → http://localhost:5001
```

Verify:

```bash
curl http://localhost:5001/health
# {"service":"agency-watch-backend","status":"ok"}
```

### Frontend connection

In the project root `.env`:

```env
VITE_API_URL=http://localhost:5001
VITE_API_PUBLIC_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImFnZW5jeS13YXRjaC1sb2NhbCJ9.local-anon-key
API_URL=http://localhost:5001
API_PUBLIC_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImFnZW5jeS13YXRjaC1sb2NhbCJ9.local-anon-key
API_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoiYWdlbmN5LXdhdGNoLWxvY2FsIn0.local-service-key
```

Then from the repo root: `npm run dev` → `http://localhost:8080`

---

## Environment Variables

File: `backend/.env` (see `.env.example`)

| Variable | Required | Description |
|----------|:--------:|-------------|
| `SECRET_KEY` | ✓ | Flask secret |
| `JWT_SECRET_KEY` | ✓ | JWT signing key (min 32 chars) |
| `JWT_ALGORITHM` | | Default `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRES` | | Seconds (default `3600`) |
| `JWT_REFRESH_TOKEN_EXPIRES` | | Seconds (default `604800`) |
| `PORT` | | Default `5001` |
| `FLASK_DEBUG` | | `1` enables auto-reload |
| `DB_HOST` | ✓ | PostgreSQL host |
| `DB_PORT` | | Default `5432` |
| `DB_NAME` | ✓ | Database name |
| `DB_APP_USER` | ✓ | Application user |
| `DB_APP_PASSWORD` | ✓ | Application password |
| `DATABASE_URL` | | Optional full URL (overrides `DB_*`) |
| `API_ANON_KEY` | ✓ | Public key sent as `apikey` header |
| `API_SERVICE_KEY` | ✓ | Service role key (bots/webhooks) |
| `CORS_ORIGINS` | | Comma-separated frontend origins |

---

## Database

### Schema files

| File | Purpose |
|------|---------|
| `sql/postgresql/001_schema.sql` | Core tables, triggers, indexes |
| `sql/postgresql/002_iam_roles.sql` | IAM roles table + default role seed |
| `sql/postgresql/002_seed.sql` | Optional sample data |
| `sql/postgresql/000_provision_*.sql` | DBA provisioning scripts |

### Core tables

| Table | Purpose |
|-------|---------|
| `auth_users` | Email/password accounts |
| `refresh_tokens` | JWT refresh token hashes |
| `user_roles` | Role slug per user (`admin`, `manager`, `consultant`, custom) |
| `iam_roles` | Role definitions with JSON permissions + data scope |
| `consultants` | Consultant profiles linked via `user_id` |
| `real_estate_agencies` | Portfolio records |
| `agency_interactions` | Immutable interaction audit log |
| `hubspot_mappings` | HubSpot company/contact links |
| `slack_events`, `slack_sessions`, `slack_notifications` | Slack bot state |
| `whatsapp_messages`, `bot_sessions` | WhatsApp bot state |

### Migrations on existing databases

```bash
python cli.py init-iam    # iam_roles table + drop role CHECK constraint
python cli.py init-db     # create_all + seed default roles
```

### Import sample CSVs

```bash
python cli.py import-exemplos --replace   # from ../exemplos/*.csv
```

---

## CLI

All commands load `backend/.env` automatically.

| Command | Description |
|---------|-------------|
| `python cli.py list-users` | List users with roles |
| `python cli.py create-user` | Create user (`--email`, `--password`, `--role`, `--name`) |
| `python cli.py reset-password` | Reset password and revoke sessions |
| `python cli.py init-db` | Create all tables + default IAM roles |
| `python cli.py init-iam` | IAM migration on existing DB |
| `python cli.py seed` | Sample consultants + agencies |
| `python cli.py import-exemplos` | Import from `exemplos/` CSV exports |

Examples:

```bash
.venv/bin/python cli.py create-user \
  --email consultor@loft.com \
  --password 'Secret123!' \
  --role consultant \
  --name "Maria Consultora"

.venv/bin/python cli.py reset-password --email admin@loft.com
```

---

## API Reference

All authenticated endpoints require:

```http
Authorization: Bearer <access_token>
apikey: <API_ANON_KEY>
Content-Type: application/json
```

Service role (bots, server-side) uses `apikey: <API_SERVICE_KEY>` without Bearer.

### Health

```http
GET /health
```

Response: `{"status":"ok","service":"agency-watch-backend"}`

---

### Authentication (`/auth/v1`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/v1/signup` | Register (first user → `admin`) |
| `POST` | `/auth/v1/token?grant_type=password` | Login |
| `POST` | `/auth/v1/token?grant_type=refresh_token` | Refresh tokens |
| `GET` | `/auth/v1/user` | Current user profile |
| `PATCH` | `/auth/v1/user` | Update own profile (name, email, password) |
| `POST` | `/auth/v1/logout` | Revoke refresh tokens |

**Login**

```bash
curl -X POST 'http://localhost:5001/auth/v1/token?grant_type=password' \
  -H 'Content-Type: application/json' \
  -H 'apikey: <API_ANON_KEY>' \
  -d '{"email":"admin@loft.com","password":"LoftAdmin123!"}'
```

**Update profile**

```bash
curl -X PATCH 'http://localhost:5001/auth/v1/user' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -H 'apikey: <API_ANON_KEY>' \
  -d '{"display_name":"João Silva","email":"joao@loft.com"}'
```

Profile fields:

- `display_name` / `name` → stored in `auth_users.raw_user_meta_data`
- `email` → must be unique
- `password` → min 8 chars; revokes other refresh tokens

When a consultant is linked (`consultants.user_id`), name/email sync to the consultant record.

---

### IAM (`/iam/v1`)

Requires `users.manage` or `roles.manage` (admin has all via `*`).

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/iam/v1/me` | any authenticated | Current roles, permissions, data scope |
| `GET` | `/iam/v1/permissions` | admin/IAM | Permission catalog |
| `GET` | `/iam/v1/roles` | roles/users manage | List roles |
| `POST` | `/iam/v1/roles` | roles.manage | Create custom role |
| `PATCH` | `/iam/v1/roles/:slug` | roles.manage | Update role permissions |
| `DELETE` | `/iam/v1/roles/:slug` | roles.manage | Delete non-system role |
| `GET` | `/iam/v1/users` | users.manage | List users |
| `POST` | `/iam/v1/users` | users.manage | Create user + password |
| `PATCH` | `/iam/v1/users/:id` | users.manage | Update user/role/consultant link |
| `DELETE` | `/iam/v1/users/:id` | users.manage | Delete user (not self) |

**Permission catalog**

| Key | Description |
|-----|-------------|
| `portfolio.read` | View portfolio |
| `portfolio.write` | Create/edit agencies |
| `portfolio.delete` | Delete agencies |
| `consultants.read` | View consultants |
| `consultants.manage` | Manage consultants |
| `users.manage` | Manage users |
| `roles.manage` | Manage roles |
| `import.run` | Import spreadsheets |
| `settings.hubspot` | HubSpot settings |
| `settings.slack` | Slack settings |
| `bot.view` | Bot monitoring |

---

### REST (`/rest/v1`)

PostgREST-style API for portfolio tables.

```http
GET    /rest/v1/{table}?select=*&order=updated_at.desc&limit=10&offset=0
POST   /rest/v1/{table}
PATCH  /rest/v1/{table}?id=eq.{uuid}
DELETE /rest/v1/{table}?id=eq.{uuid}
POST   /rest/v1/rpc/has_role
```

**Query parameters**

| Param | Example | Description |
|-------|---------|-------------|
| `select` | `*,consultants(name)` | Columns + embeds |
| `order` | `name.asc` | Sort |
| `limit` / `offset` | `10`, `0` | Pagination |
| `q` | `search term` | Text search (consultants) |
| `{column}` | `eq.value`, `in.(a,b)` | Filters |

**Tables:** `real_estate_agencies`, `agency_interactions`, `consultants`, `user_roles`, `hubspot_mappings`, `slack_events`, `slack_sessions`, `whatsapp_messages`, `bot_sessions`, …

Response headers: `Content-Range` for paginated lists.

---

## IAM & Permissions

### Default roles

| Role | Data scope | Permissions |
|------|------------|-------------|
| `admin` | `all` | `*` (everything) |
| `manager` | `all` | Portfolio, consultants (read), Slack, HubSpot, bot |
| `consultant` | `own` | Portfolio read/write on linked consultant only |

### Data scope

- **`all`** — sees entire portfolio
- **`own`** — sees only agencies where `real_estate_agencies.consultant_id` matches the user's linked `consultants` row

Link a consultant user:

1. Create user with role `consultant` in **Settings → Users**, or
2. Set `consultants.user_id` when creating/editing the user via IAM API

---

## Row-Level Security (RLS)

Implemented in Python (`app/auth/rls.py`), not PostgreSQL policies.

| Check | Rule |
|-------|------|
| Read agency | `portfolio.read` + scope |
| Write agency | `portfolio.write` + scope |
| Delete agency | `portfolio.delete` (admin/manager) |
| Consultants | `consultants.read` / `consultants.manage` |
| Service role | Bypasses all checks |

Consultant scope resolves via:

```python
consultant_id = consultants.id WHERE consultants.user_id = current_user.id
agencies WHERE consultant_id = consultant_id
```

---

## Project Layout

```
backend/
├── app/
│   ├── __init__.py          # App factory, CORS, blueprints
│   ├── config.py            # DB URL, JWT, CORS
│   ├── models.py            # SQLAlchemy models
│   ├── extensions.py        # db, jwt
│   ├── api/
│   │   ├── auth_routes.py   # /auth/v1
│   │   ├── iam_routes.py    # /iam/v1
│   │   └── rest_routes.py   # /rest/v1
│   ├── auth/
│   │   ├── permissions.py   # IAM catalog
│   │   ├── rls.py           # Row-level rules
│   │   └── security.py      # JWT + bcrypt
│   └── importers/
│       └── exemplos.py      # CSV import
├── cli.py                   # Admin CLI
├── run.py                   # Dev server entry
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── sql/postgresql/          # Schema & migrations
```

---

## Docker

```bash
cd backend
docker compose up --build     # Flask on :5001
docker compose exec backend python cli.py init-db
```

PostgreSQL profile (optional):

```bash
docker compose --profile postgres up
```

---

## License

Private — internal Loft project.
