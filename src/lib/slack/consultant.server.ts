import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slack } from "./client.server";

export type SlackConsultant = {
  id: string;
  name: string;
  user_id: string | null;
  email: string | null;
  slack_user_id: string;
};

/**
 * Resolve a Slack user → consultant. Cached via consultants.slack_user_id.
 * Fallback: fetch Slack profile by user id, match by email.
 */
export async function resolveConsultant(slackUserId: string): Promise<SlackConsultant | null> {
  // 1. cache hit
  {
    const { data } = await supabaseAdmin
      .from("consultants")
      .select("id, name, user_id, email, slack_user_id, active")
      .eq("slack_user_id", slackUserId)
      .eq("active", true)
      .maybeSingle();
    if (data) return data as any;
  }

  // 2. fetch email from Slack, match consultants.email
  try {
    const info = await slack.usersInfo(slackUserId);
    const email: string | undefined = info.user?.profile?.email;
    if (!email) return null;
    const { data: consult } = await supabaseAdmin
      .from("consultants")
      .select("id, name, user_id, email, active")
      .ilike("email", email)
      .eq("active", true)
      .maybeSingle();
    if (!consult) return null;
    // cache it
    await supabaseAdmin
      .from("consultants")
      .update({ slack_user_id: slackUserId })
      .eq("id", consult.id);
    return { ...(consult as any), slack_user_id: slackUserId };
  } catch {
    return null;
  }
}

/** Verify whether the resolved consultant is admin/manager (for unrestricted carteira access). */
export async function isPrivileged(consultantUserId: string | null): Promise<boolean> {
  if (!consultantUserId) return false;
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", consultantUserId);
  return !!data?.some((r: any) => r.role === "admin" || r.role === "manager");
}
