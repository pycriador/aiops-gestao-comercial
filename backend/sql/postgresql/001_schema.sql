-- Agency Watch — PostgreSQL schema (offline / self-hosted)
-- Compatible with the Supabase migration set, adapted for standalone Postgres.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Auth users (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  encrypted_password TEXT NOT NULL,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'consultant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  regional TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  slack_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultants_phone ON consultants(phone);
CREATE INDEX IF NOT EXISTS idx_consultants_user_id ON consultants(user_id);
CREATE INDEX IF NOT EXISTS idx_consultants_slack_user_id ON consultants(slack_user_id);

CREATE TABLE IF NOT EXISTS real_estate_agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state CHAR(2) NOT NULL,
  regional_director TEXT,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  contract_stock INTEGER NOT NULL DEFAULT 0,
  current_guarantor TEXT,
  guarantor_type TEXT CHECK (guarantor_type IN ('Garantia Propria', 'Concorrente', 'Seguradora', 'Outro')),
  main_contact TEXT,
  contact_role TEXT,
  negotiation_status TEXT NOT NULL DEFAULT 'Pipeline de Prospecção',
  current_offer TEXT,
  c_level_support_needed BOOLEAN NOT NULL DEFAULT false,
  next_steps TEXT,
  feedback TEXT,
  last_interaction_date TIMESTAMPTZ,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth_users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS agencies_dedupe_idx ON real_estate_agencies (lower(name), lower(city), state);

CREATE TABLE IF NOT EXISTS agency_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES real_estate_agencies(id) ON DELETE CASCADE,
  interaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  interaction_type TEXT,
  feedback TEXT,
  next_steps TEXT,
  status_before TEXT,
  status_after TEXT,
  c_level_support_needed BOOLEAN,
  current_offer TEXT,
  contract_stock INTEGER,
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'whatsapp', 'import')),
  created_by UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  message_body TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  parsed_intent TEXT,
  raw_payload JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  agency_id UUID REFERENCES real_estate_agencies(id) ON DELETE SET NULL,
  flow TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  current_flow TEXT,
  current_step TEXT NOT NULL DEFAULT 'idle',
  agency_id UUID REFERENCES real_estate_agencies(id) ON DELETE SET NULL,
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hubspot_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL UNIQUE REFERENCES real_estate_agencies(id) ON DELETE CASCADE,
  hubspot_company_id TEXT,
  hubspot_contact_id TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slack_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  slack_user_id TEXT,
  slack_team_id TEXT,
  channel_id TEXT,
  consultant_id UUID,
  payload JSONB NOT NULL,
  response JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slack_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_user_id TEXT NOT NULL,
  consultant_id UUID,
  current_flow TEXT,
  current_step TEXT NOT NULL DEFAULT 'idle',
  agency_id UUID,
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slack_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  agency_id UUID,
  consultant_id UUID,
  slack_user_id TEXT,
  channel_id TEXT,
  message_ts TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: sync agency on interaction insert
CREATE OR REPLACE FUNCTION sync_agency_on_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE real_estate_agencies SET
    last_interaction_date = NEW.interaction_date,
    total_interactions = total_interactions + 1,
    negotiation_status = COALESCE(NEW.status_after, negotiation_status),
    next_steps = COALESCE(NEW.next_steps, next_steps),
    feedback = COALESCE(NEW.feedback, feedback),
    current_offer = COALESCE(NEW.current_offer, current_offer),
    contract_stock = COALESCE(NEW.contract_stock, contract_stock),
    c_level_support_needed = COALESCE(NEW.c_level_support_needed, c_level_support_needed),
    updated_by = COALESCE(NEW.created_by, updated_by),
    updated_at = now()
  WHERE id = NEW.agency_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS interactions_sync_agency ON agency_interactions;
CREATE TRIGGER interactions_sync_agency
  AFTER INSERT ON agency_interactions
  FOR EACH ROW EXECUTE FUNCTION sync_agency_on_interaction();
