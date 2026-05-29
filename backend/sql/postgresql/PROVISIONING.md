# PostgreSQL Provisioning — Agency Watch

Scripts to create database, users, and roles **before** applying `001_schema.sql`.

> **Nothing is executed automatically.** Run manually when you receive approval / instructions.

## Your `.env` context

From `backend/.env` you have connectivity to a managed PostgreSQL:

| Variable | Example value |
|----------|----------------|
| `DB_HOST` | `aiops.db.cross.loft-prod.io` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `aiops` |
| `DB_USER` | `postgres` (admin — provisioning only) |

The application should **not** use `postgres` at runtime. Create dedicated roles below.

## Choose a strategy

| Strategy | When to use | Script |
|----------|-------------|--------|
| **Dedicated database** | You can `CREATE DATABASE` on the instance | `000_provision_database.sql` |
| **Dedicated schema** | Shared DB (`aiops`), no new database allowed | `000_provision_schema_only.sql` |

For Loft managed Postgres with existing `aiops` database, **schema-only** is usually the right choice.

## Roles created

| Role | Login | Purpose |
|------|-------|---------|
| `agency_watch_owner` | No | Owns schema/objects; used by migrator |
| `agency_watch_readwrite` | No | Group: DML on app tables |
| `agency_watch_readonly_role` | No | Group: SELECT only |
| `agency_watch_app` | Yes | **Flask runtime** — put in `DATABASE_URL` |
| `agency_watch_migrator` | Yes | Apply `001_schema.sql`, migrations |
| `agency_watch_readonly` | Yes | Optional BI / reporting |

## Suggested execution order

### A) Schema-only (shared `aiops` database)

```bash
# 1. Edit passwords in the file (replace CHANGE_ME_*)
# 2. Connect as admin and provision roles + schema
psql -h aiops.db.cross.loft-prod.io -p 5432 -U postgres -d aiops \
  -f sql/postgresql/000_provision_schema_only.sql

# 3. Apply tables (as migrator or owner)
psql -h ... -U agency_watch_migrator -d aiops \
  -v ON_ERROR_STOP=1 \
  -c "SET search_path TO agency_watch;" \
  -f sql/postgresql/001_schema.sql

# 4. Optional seed
psql -h ... -U agency_watch_migrator -d aiops \
  -c "SET search_path TO agency_watch;" \
  -f sql/postgresql/002_seed.sql
```

### B) Dedicated database

```bash
psql -h HOST -U postgres -d postgres -f sql/postgresql/000_provision_database.sql
# then \c agency_watch and run 001_schema.sql
```

## `DATABASE_URL` for Flask

Add to `backend/.env` (after provisioning):

```bash
# Schema in shared DB (recommended for aiops)
DATABASE_URL=postgresql+psycopg://agency_watch_app:APP_PASSWORD@aiops.db.cross.loft-prod.io:5432/aiops?options=-csearch_path%3Dagency_watch

# Or dedicated database
DATABASE_URL=postgresql+psycopg://agency_watch_app:APP_PASSWORD@HOST:5432/agency_watch
```

Install driver when switching from SQLite:

```bash
pip install psycopg[binary]
# add psycopg[binary] to requirements.txt when approved
```

## Security notes

- Never commit `backend/.env` with real passwords.
- `postgres` user: provisioning only, not for the app.
- Rotate passwords after first deploy if shared in tickets/chat.
- `agency_watch_app` has no DDL rights — migrations use `agency_watch_migrator`.

## Next steps (waiting for your instructions)

- [ ] Confirm: dedicated DB vs schema `agency_watch` inside `aiops`
- [ ] Confirm: role naming convention (Loft standards?)
- [ ] Run provisioning SQL on the target instance
- [ ] Adapt `001_schema.sql` to `agency_watch` schema if needed
- [ ] Update `DATABASE_URL` and add `psycopg` to requirements
- [ ] Import seed data → `003_exported_data.sql` → import
