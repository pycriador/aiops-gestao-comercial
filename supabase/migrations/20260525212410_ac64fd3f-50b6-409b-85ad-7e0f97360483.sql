
-- bot_sessions enhancements
ALTER TABLE public.bot_sessions
  ADD COLUMN IF NOT EXISTS current_flow text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_bot_sessions_phone_active ON public.bot_sessions (phone) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bot_sessions_status ON public.bot_sessions (status, expires_at);

DROP TRIGGER IF EXISTS bot_sessions_updated_at ON public.bot_sessions;
CREATE TRIGGER bot_sessions_updated_at
  BEFORE UPDATE ON public.bot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- whatsapp_messages enhancements
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS agency_id uuid,
  ADD COLUMN IF NOT EXISTS flow text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON public.whatsapp_messages (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON public.whatsapp_messages (status, created_at DESC);

-- Manager/admin read access for monitoring
DROP POLICY IF EXISTS "manager read whatsapp" ON public.whatsapp_messages;
CREATE POLICY "manager read whatsapp" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "manager read bot_sessions" ON public.bot_sessions;
CREATE POLICY "manager read bot_sessions" ON public.bot_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Session cleanup function (called by cron or on demand)
CREATE OR REPLACE FUNCTION public.expire_stale_bot_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.bot_sessions
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
