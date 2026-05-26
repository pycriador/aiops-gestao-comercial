import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SLACK_PRODUCTION_BASE_URL, SLACK_URLS, slackRuntimeEnvironment } from "./constants";

async function canViewSlackDiagnostics(userId: string) {
  const [admin, manager] = await Promise.all([
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "manager" }),
  ]);
  return !!admin.data || !!manager.data;
}

export async function loadSlackDiagnostics(userId: string) {
  if (!(await canViewSlackDiagnostics(userId))) throw new Error("Unauthorized");

  const { data: lastCommand } = await supabaseAdmin
    .from("slack_events")
    .select("event_type,status,created_at,slack_user_id,slack_team_id,channel_id,payload,response,error_message")
    .like("event_type", "command:%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const req = getRequest();
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const currentUrl = req?.url ? new URL(req.url) : null;
  const currentOrigin = currentUrl?.origin ?? null;
  const currentCommandsUrl = currentOrigin ? `${currentOrigin}/api/public/slack/commands` : null;
  const currentHealthUrl = currentOrigin ? `${currentOrigin}/api/public/slack/health` : null;

  return {
    environment: slackRuntimeEnvironment(req?.url),
    currentOrigin,
    currentCommandsUrl,
    currentHealthUrl,
    productionBaseUrl: SLACK_PRODUCTION_BASE_URL,
    expectedCommandsUrl: SLACK_URLS.commands,
    manifestUrlMatchesProduction: SLACK_URLS.commands.startsWith(SLACK_PRODUCTION_BASE_URL),
    productionPublished: currentOrigin ? (SLACK_PRODUCTION_ORIGINS as readonly string[]).includes(currentOrigin) : false,
    secrets: {
      hasBotToken: !!process.env.SLACK_BOT_TOKEN,
      hasSigningSecret: !!signingSecret,
      hasCronSecret: !!process.env.SLACK_CRON_SECRET,
      signingSecretLast4: signingSecret ? signingSecret.slice(-4) : null,
    },
    lastCommand,
  };
}

export async function runSlackCommandsDiagnosticTest(userId: string) {
  if (!(await canViewSlackDiagnostics(userId))) throw new Error("Unauthorized");
  const token = process.env.SLACK_CRON_SECRET;
  if (!token) throw new Error("SLACK_CRON_SECRET ausente para teste interno");

  const startedAt = Date.now();
  const body = new URLSearchParams({
    team_id: "T_DIAGNOSTIC",
    channel_id: "C_DIAGNOSTIC",
    user_id: "U_DIAGNOSTIC",
    command: "/carteira",
    text: "diagnostic",
    response_url: "",
    trigger_id: "diagnostic",
    diagnostic: "1",
  });

  const response = await fetch(SLACK_URLS.commands, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-slack-diagnostic-bypass": "1",
      "x-slack-diagnostic-token": token,
    },
    body,
  });

  return {
    ok: response.ok,
    status: response.status,
    durationMs: Date.now() - startedAt,
    body: (await response.text()).slice(0, 500),
  };
}