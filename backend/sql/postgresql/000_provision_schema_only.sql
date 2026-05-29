-- =============================================================================
-- Agency Watch — PostgreSQL provisioning (shared database, dedicated schema)
-- =============================================================================
-- Use when you already have a database (e.g. `aiops`) and cannot CREATE DATABASE.
-- Run as superuser or a user with CREATE on the target database.
--
-- Replace placeholders:
--   :APP_USER, :APP_PASSWORD, :MIGRATOR_USER, :MIGRATOR_PASSWORD
--   :READONLY_USER, :READONLY_PASSWORD
--
-- Example:
--   psql -h aiops.db.cross.loft-prod.io -U postgres -d aiops -f 000_provision_schema_only.sql
-- =============================================================================

-- ── 1. Login roles ───────────────────────────────────────────────────────────

CREATE ROLE agency_watch_app WITH
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  CONNECTION LIMIT 50
  PASSWORD 'CHANGE_ME_APP_PASSWORD';

CREATE ROLE agency_watch_migrator WITH
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  CONNECTION LIMIT 5
  PASSWORD 'CHANGE_ME_MIGRATOR_PASSWORD';

CREATE ROLE agency_watch_readonly WITH
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  CONNECTION LIMIT 10
  PASSWORD 'CHANGE_ME_READONLY_PASSWORD';

-- ── 2. Group roles ───────────────────────────────────────────────────────────

CREATE ROLE agency_watch_owner NOLOGIN;
CREATE ROLE agency_watch_readwrite NOLOGIN;
CREATE ROLE agency_watch_readonly_role NOLOGIN;

GRANT agency_watch_readwrite TO agency_watch_app;
GRANT agency_watch_readonly_role TO agency_watch_readonly;
GRANT agency_watch_owner TO agency_watch_migrator;

-- ── 3. Schema (isolated namespace inside existing DB) ───────────────────────

CREATE SCHEMA IF NOT EXISTS agency_watch AUTHORIZATION agency_watch_owner;
COMMENT ON SCHEMA agency_watch IS 'Agency Watch — Loft Carteira';

ALTER ROLE agency_watch_app SET search_path TO agency_watch, public;
ALTER ROLE agency_watch_migrator SET search_path TO agency_watch, public;
ALTER ROLE agency_watch_readonly SET search_path TO agency_watch, public;

-- ── 4. Grants ───────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA agency_watch TO agency_watch_readwrite;
GRANT USAGE ON SCHEMA agency_watch TO agency_watch_readonly_role;
GRANT ALL ON SCHEMA agency_watch TO agency_watch_owner;

ALTER DEFAULT PRIVILEGES FOR ROLE agency_watch_owner IN SCHEMA agency_watch
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agency_watch_readwrite;

ALTER DEFAULT PRIVILEGES FOR ROLE agency_watch_owner IN SCHEMA agency_watch
  GRANT USAGE, SELECT ON SEQUENCES TO agency_watch_readwrite;

ALTER DEFAULT PRIVILEGES FOR ROLE agency_watch_owner IN SCHEMA agency_watch
  GRANT SELECT ON TABLES TO agency_watch_readonly_role;

-- Extension (if allowed on shared instance)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 5. DATABASE_URL for Flask ───────────────────────────────────────────────
-- postgresql+psycopg://agency_watch_app:PASSWORD@aiops.db.cross.loft-prod.io:5432/aiops
-- Optional connect arg: ?options=-csearch_path%3Dagency_watch
