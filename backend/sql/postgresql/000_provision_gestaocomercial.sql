-- =========================================================
-- Provision gestaocomercial — Loft PostgreSQL (regras.txt)
-- Executed against: aiops.db.cross.loft-prod.io
-- =========================================================

DO
$$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gestaocomercial'
   ) THEN
      CREATE ROLE gestaocomercial
      WITH LOGIN
      PASSWORD 'QwqGKo6166aNr5A2XnBZMCvgpqi1jPQTHbI';
   END IF;
END
$$;

GRANT gestaocomercial TO postgres;

-- CREATE DATABASE fails if already exists — safe to skip on re-run
-- CREATE DATABASE gestaocomercial;
-- ALTER DATABASE gestaocomercial OWNER TO gestaocomercial;
