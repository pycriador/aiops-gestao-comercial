import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SlackSession = {
  id: string;
  slack_user_id: string;
  consultant_id: string | null;
  current_flow: string | null;
  current_step: string;
  agency_id: string | null;
  session_data: Record<string, any>;
};

export async function getActiveSession(slackUserId: string): Promise<SlackSession | null> {
  const { data } = await supabaseAdmin
    .from("slack_sessions")
    .select("*")
    .eq("slack_user_id", slackUserId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function startSession(args: {
  slackUserId: string;
  consultantId: string | null;
  flow: string;
  step?: string;
  agencyId?: string | null;
  data?: Record<string, any>;
}): Promise<SlackSession> {
  // close any previous
  await supabaseAdmin
    .from("slack_sessions")
    .update({ status: "abandoned" })
    .eq("slack_user_id", args.slackUserId)
    .eq("status", "active");

  const { data, error } = await supabaseAdmin
    .from("slack_sessions")
    .insert({
      slack_user_id: args.slackUserId,
      consultant_id: args.consultantId,
      current_flow: args.flow,
      current_step: args.step ?? "start",
      agency_id: args.agencyId ?? null,
      session_data: args.data ?? {},
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as any;
}

export async function updateSession(id: string, patch: Partial<SlackSession>) {
  const { error } = await supabaseAdmin.from("slack_sessions").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function completeSession(id: string) {
  await supabaseAdmin.from("slack_sessions").update({ status: "completed" }).eq("id", id);
}
