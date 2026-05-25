
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'consultant');

CREATE TYPE public.negotiation_status AS ENUM (
  'Pipeline de Prospecção',
  'Conversas iniciadas',
  'Reunião agendada',
  'Aguardando base',
  'Stand by',
  'Sem interesse',
  'Proposta enviada',
  'Em negociação',
  'Convertida'
);

CREATE TYPE public.guarantor_type AS ENUM (
  'Garantia Propria',
  'Concorrente',
  'Seguradora',
  'Outro'
);

CREATE TYPE public.update_source AS ENUM ('web', 'whatsapp', 'import');
CREATE TYPE public.bot_session_status AS ENUM ('active', 'completed', 'abandoned');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============ CONSULTANTS ============
CREATE TABLE public.consultants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  email text,
  regional text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consultants_phone_idx ON public.consultants(phone);
CREATE INDEX consultants_user_id_idx ON public.consultants(user_id);
ALTER TABLE public.consultants ENABLE ROW LEVEL SECURITY;

-- ============ REAL ESTATE AGENCIES ============
CREATE TABLE public.real_estate_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  regional_director text,
  consultant_id uuid REFERENCES public.consultants(id) ON DELETE SET NULL,
  contract_stock integer NOT NULL DEFAULT 0,
  current_guarantor text,
  guarantor_type public.guarantor_type,
  main_contact text,
  contact_role text,
  negotiation_status public.negotiation_status NOT NULL DEFAULT 'Pipeline de Prospecção',
  current_offer text,
  c_level_support_needed boolean NOT NULL DEFAULT false,
  next_steps text,
  feedback text,
  last_interaction_date timestamptz,
  total_interactions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX agencies_dedupe_idx
  ON public.real_estate_agencies (lower(name), lower(city), state);
CREATE INDEX agencies_status_idx ON public.real_estate_agencies(negotiation_status);
CREATE INDEX agencies_consultant_idx ON public.real_estate_agencies(consultant_id);
CREATE INDEX agencies_state_idx ON public.real_estate_agencies(state);

ALTER TABLE public.real_estate_agencies ENABLE ROW LEVEL SECURITY;

-- ============ AGENCY INTERACTIONS ============
CREATE TABLE public.agency_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE,
  interaction_date timestamptz NOT NULL DEFAULT now(),
  interaction_type text,
  feedback text,
  next_steps text,
  status_before public.negotiation_status,
  status_after public.negotiation_status,
  c_level_support_needed boolean,
  current_offer text,
  contract_stock integer,
  source public.update_source NOT NULL DEFAULT 'web',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interactions_agency_idx ON public.agency_interactions(agency_id, interaction_date DESC);
ALTER TABLE public.agency_interactions ENABLE ROW LEVEL SECURITY;

-- ============ WHATSAPP MESSAGES ============
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  consultant_id uuid REFERENCES public.consultants(id) ON DELETE SET NULL,
  message_body text,
  direction public.message_direction NOT NULL,
  parsed_intent text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wpp_phone_idx ON public.whatsapp_messages(phone, created_at DESC);
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ============ BOT SESSIONS ============
CREATE TABLE public.bot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid REFERENCES public.consultants(id) ON DELETE SET NULL,
  phone text NOT NULL,
  current_step text NOT NULL DEFAULT 'idle',
  agency_id uuid REFERENCES public.real_estate_agencies(id) ON DELETE SET NULL,
  session_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.bot_session_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bot_sessions_phone_active_idx ON public.bot_sessions(phone) WHERE status = 'active';
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

-- ============ HUBSPOT MAPPINGS ============
CREATE TABLE public.hubspot_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL UNIQUE REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE,
  hubspot_company_id text,
  hubspot_contact_id text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hubspot_mappings ENABLE ROW LEVEL SECURITY;

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agencies_set_updated_at BEFORE UPDATE ON public.real_estate_agencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER consultants_set_updated_at BEFORE UPDATE ON public.consultants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bot_sessions_set_updated_at BEFORE UPDATE ON public.bot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER hubspot_mappings_set_updated_at BEFORE UPDATE ON public.hubspot_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sync agency aggregates from interactions
CREATE OR REPLACE FUNCTION public.sync_agency_on_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.real_estate_agencies
  SET
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
$$;

CREATE TRIGGER interactions_sync_agency AFTER INSERT ON public.agency_interactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_agency_on_interaction();

-- First user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'consultant');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- user_roles
CREATE POLICY "users can read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- consultants
CREATE POLICY "auth read consultants" ON public.consultants FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manager write consultants" ON public.consultants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- agencies: admin/manager see all; consultant sees own
CREATE POLICY "agencies select" ON public.real_estate_agencies FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR consultant_id IN (SELECT id FROM public.consultants WHERE user_id = auth.uid())
  );
CREATE POLICY "agencies insert" ON public.real_estate_agencies FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'consultant')
  );
CREATE POLICY "agencies update" ON public.real_estate_agencies FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR consultant_id IN (SELECT id FROM public.consultants WHERE user_id = auth.uid())
  );
CREATE POLICY "agencies delete admin" ON public.real_estate_agencies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- interactions: same visibility as agency; insert if can update agency; immutable (no update/delete)
CREATE POLICY "interactions select" ON public.agency_interactions FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT id FROM public.real_estate_agencies)
  );
CREATE POLICY "interactions insert" ON public.agency_interactions FOR INSERT TO authenticated
  WITH CHECK (
    agency_id IN (
      SELECT id FROM public.real_estate_agencies WHERE
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR consultant_id IN (SELECT id FROM public.consultants WHERE user_id = auth.uid())
    )
  );

-- whatsapp_messages & bot_sessions: server-only (no policies = locked for authenticated)
CREATE POLICY "admin read whatsapp" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read bot_sessions" ON public.bot_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- hubspot mappings
CREATE POLICY "hubspot select" ON public.hubspot_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "hubspot admin write" ON public.hubspot_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
