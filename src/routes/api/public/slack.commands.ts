import { createFileRoute } from "@tanstack/react-router";
import { inspectSlackSignature } from "@/lib/slack/verify.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slackRuntimeEnvironment } from "@/lib/slack/constants";
import { homeMenu } from "@/lib/slack/blocks";

/**
 * Slash commands endpoint — modo DIRECT-ACK-MENU.
 * Para diagnosticar: /carteira retorna o menu estático diretamente no ACK,
 * sem response_url, sem background, sem DB, sem users.info.
 */
export const Route = createFileRoute("/api/public/slack/commands")({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({
        ok: true,
        route: "commands",
        version: "direct-ack-menu",
        environment: slackRuntimeEnvironment(request.url),
        hasBotToken: !!process.env.SLACK_BOT_TOKEN,
        hasSigningSecret: !!process.env.SLACK_SIGNING_SECRET,
      }),
      POST: async ({ request }) => {
        const t0 = Date.now();
        const rid = Math.random().toString(36).slice(2, 8);
        const log = (msg: string, extra?: any) =>
          console.log(`[slack.commands ${rid} +${Date.now() - t0}ms] ${msg}`, extra ?? "");

        log("request received (direct-ack-menu)", { url: request.url });

        try {
          const secret = process.env.SLACK_SIGNING_SECRET;
          const rawBody = await request.text();
          const ts = request.headers.get("x-slack-request-timestamp");
          const sig = request.headers.get("x-slack-signature");
          const hmac = inspectSlackSignature(rawBody, ts, sig, secret);
          const diagnosticBypass = request.headers.get("x-slack-diagnostic-bypass") === "1"
            && !!process.env.SLACK_CRON_SECRET
            && request.headers.get("x-slack-diagnostic-token") === process.env.SLACK_CRON_SECRET;
          log("hmac result", { ...hmac, diagnosticBypass });

          const params = new URLSearchParams(rawBody);
          const command = params.get("command") ?? "";
          const slackUserId = params.get("user_id") ?? "";
          const teamId = params.get("team_id") ?? "";
          const channelId = params.get("channel_id") ?? "";
          const text = params.get("text") ?? "";
          log("parsed", { command, slackUserId });

          // fire-and-forget diagnostic insert (no await — não bloqueia o ACK)
          const recordDiagnostic = (status: string, response?: any, errorMessage?: string) => {
            supabaseAdmin.from("slack_events").insert({
              event_type: `command:${command || "unknown"}`,
              slack_user_id: slackUserId || null,
              slack_team_id: teamId || null,
              channel_id: channelId || null,
              payload: {
                request: { receivedAt: new Date(t0).toISOString(), url: request.url, environment: slackRuntimeEnvironment(request.url) },
                command, user_id: slackUserId, team_id: teamId, channel_id: channelId, text,
                hmac, diagnostic_bypass: diagnosticBypass, mode: "direct-ack-menu",
              } as any,
              response: (response ?? null) as any,
              status,
              error_message: errorMessage ?? null,
            }).then(({ error }) => {
              if (error) console.error(`[slack.commands ${rid}] diagnostic insert error`, error);
            });
          };

          if (!hmac.valid && !diagnosticBypass) {
            recordDiagnostic("hmac_invalid", null, hmac.reason ?? "invalid_signature");
            log("HMAC inválido — respondendo ephemeral");
            return Response.json({
              response_type: "ephemeral",
              text: "Assinatura do Slack inválida.",
            }, { status: 200 });
          }

          // Comando /carteira (ou qualquer outro neste modo): retorna o menu direto no ACK.
          const menu = homeMenu();
          const payload = {
            response_type: "ephemeral",
            text: "Loft · Carteira",
            blocks: menu.blocks,
          };
          recordDiagnostic("direct_ack_menu_sent", { ack: { status: 200, durationMs: Date.now() - t0, mode: "direct-ack-menu" } });
          log("ACK with menu sent", { blocks: menu.blocks.length });
          return Response.json(payload, { status: 200 });
        } catch (err: any) {
          console.error(`[slack.commands ${rid}] top-level error`, err?.stack ?? err);
          return Response.json({
            response_type: "ephemeral",
            text: `❌ Erro interno: ${err?.message ?? "desconhecido"}`,
          }, { status: 200 });
        }
      },
    },
  },
});
