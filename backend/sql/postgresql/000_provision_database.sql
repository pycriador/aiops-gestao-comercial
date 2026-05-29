-- =============================================================================
-- Agency Watch — PostgreSQL provisioning (dedicated database)
-- =============================================================================
-- Run as superuser connected to the `postgres` maintenance database.
-- Replace all CHANGE_ME_* placeholders before executing.
--
-- Example:
--   psql -h HOST -U postgres -d postgres -f 000_provision_database.sql
--   psql -h HOST -U postgres -d agency_watch -c "SET search_path TO agency_watch;" -f 001_schema.sql
-- =============================================================================

-- ── 1. Database ──────────────────────────────────────────────────────────────
CREATE DATABASE agency_watch
  WITH
  OWNER = postgres
  ENCODING = 'UTF8'
  TEMPLATE = template0
  CONNECTION LIMIT = -1;

COMMENT ON DATABASE agency_watch IS 'Agency Watch — portfolio management (Loft Carteira)';

-- Switch connection: \c agency_watch
-- Run everything below connected to database `agency_watch`

-- ── 2. Login roles ───────────────────────────────────────────────────────────

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

-- ── 3. Group roles ───────────────────────────────────────────────────────────

CREATE ROLE agency_watch_owner NOLOGIN;
CREATE ROLE agency_watch_readwrite NOLOGIN;
CREATE ROLE agency_watch_readonly_role NOLOGIN;

GRANT agency_watch_readwrite TO agency_watch_app;
GRANT agency_watch_readonly_role TO agency_watch_readonly;
GRANT agency_watch_owner TO agency_watch_migrator;

-- ── 4. Schema ────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS agency_watch AUTHORIZATION agency_watch_owner;

ALTER ROLE agency_watch_app SET search_path TO agency_watch, public;
ALTER ROLE agency_watch_migrator SET search_path TO agency_watch, public;
ALTER ROLE agency_watch_readonly SET search_path TO agency_watch, public;

-- ── 5. Grants ────────────────────────────────────────────────────────────────

GRANT CONNECT, TEMPORARY ON DATABASE agency_watch TO agency_watch_readwrite;
GRANT CONNECT ON DATABASE agency_watch TO agency_watch_readonly_role;
GRANT ALL PRIVILEGES ON DATABASE agency_watch TO agency_watch_owner;

GRANT USAGE ON SCHEMA agency_watch TO agency_watch_readwrite;
GRANT USAGE ON SCHEMA agency_watch TO agency_watch_readonly_role;
GRANT ALL ON SCHEMA agency_watch TO agency_watch_owner;

ALTER DEFAULT PRIVILEGES FOR ROLE agency_watch_owner IN SCHEMA agency_watch
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agency_watch_readwrite;

ALTER DEFAULT PRIVILEGES FOR ROLE agency_watch_owner IN SCHEMA agency_watch
  GRANT USAGE, SELECT ON SEQUENCES TO agency_watch_readwrite;

ALTER DEFAULT PRIVILEGES FOR ROLE agency_watch_owner IN SCHEMA agency_watch
  GRANT SELECT ON TABLES TO agency_watch_readonly_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- DATABASE_URL:
-- postgresql+psycopg://agency_watch_app:PASSWORD@HOST:5432/agency_watch?options=-csearch_path%3Dagency_watch
