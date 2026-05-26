
-- 1. cache de slack_user_id no consultant
ALTER TABLE public.consultants ADD COLUMN IF NOT EXISTS slack_user_id text;
CREATE INDEX IF NOT EXISTS idx_consultants_slack_user_id ON public.consultants(slack_user_id);

-- 2. log de eventos recebidos
CREATE TABLE public.slack_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  slack_user_id text,
  slack_team_id text,
  channel_id text,
  consultant_id uuid,
  payload jsonb NOT NULL,
  response jsonb,
  status text NOT NULL DEFAULT 'received',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.slack_events TO authenticated;
GRANT ALL ON public.slack_events TO service_role;
ALTER TABLE public.slack_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manager read slack events" ON public.slack_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 3. sessões de fluxo interativo
CREATE TABLE public.slack_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_user_id text NOT NULL,
  consultant_id uuid,
  current_flow text,
  current_step text NOT NULL DEFAULT 'idle',
  agency_id uuid,
  session_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_sessions_user ON public.slack_sessions(slack_user_id, status);
GRANT SELECT ON public.slack_sessions TO authenticated;
GRANT ALL ON public.slack_sessions TO service_role;
ALTER TABLE public.slack_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manager read slack sessions" ON public.slack_sessions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE TRIGGER set_slack_sessions_updated_at BEFORE UPDATE ON public.slack_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. notificações automáticas enviadas
CREATE TABLE public.slack_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  agency_id uuid,
  consultant_id uuid,
  slack_user_id text,
  channel_id text,
  message_ts text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_notif_dedupe ON public.slack_notifications(notification_type, agency_id, created_at DESC);
GRANT SELECT ON public.slack_notifications TO authenticated;
GRANT ALL ON public.slack_notifications TO service_role;
ALTER TABLE public.slack_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manager read slack notif" ON public.slack_notifications
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
