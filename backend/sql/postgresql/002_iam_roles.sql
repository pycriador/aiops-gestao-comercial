-- IAM roles and permissions (run on existing databases)

CREATE TABLE IF NOT EXISTS iam_roles (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  data_scope TEXT NOT NULL DEFAULT 'own' CHECK (data_scope IN ('all', 'own')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

INSERT INTO iam_roles (slug, name, description, is_system, data_scope, permissions, created_at, updated_at) VALUES
  ('admin', 'Administrador', 'Acesso total à plataforma', true, 'all', '["*"]'::jsonb, now(), now()),
  ('manager', 'Gestor', 'Visão completa da carteira e configurações operacionais', true, 'all',
   '["portfolio.read","portfolio.write","portfolio.delete","consultants.read","settings.hubspot","settings.slack","bot.view"]'::jsonb, now(), now()),
  ('consultant', 'Consultor', 'Acesso apenas às imobiliárias vinculadas ao seu perfil', true, 'own',
   '["portfolio.read","portfolio.write"]'::jsonb, now(), now())
ON CONFLICT (slug) DO NOTHING;
