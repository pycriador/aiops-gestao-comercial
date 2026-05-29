-- Provision gestaocomercial (from regras.txt)
-- Run connected to maintenance DB as postgres

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
