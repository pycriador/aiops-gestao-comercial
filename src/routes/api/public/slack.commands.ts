import { createFileRoute } from "@tanstack/react-router";
import { verifySlackSignature } from "@/lib/slack/verify.server";
import { handleCommand } from "@/lib/slack/flows.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Slash commands endpoint — single URL serves /carteira, /pendencias, /nova-imobiliaria, /atualizar.
 */
export const Route = createFileRoute("/api/public/slack/commands")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const secret = process.env.SLACK_SIGNING_SECRET;
        if (!secret) return new Response("SLACK_SIGNING_SECRET ausente", { status: 500 });

        const ts = request.headers.get("x-slack-request-timestamp");
        const sig = request.headers.get("x-slack-signature");
        if (!verifySlackSignature(rawBody, ts, sig, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const params = new URLSearchParams(rawBody);
        const command = params.get("command") ?? "";
        const slackUserId = params.get("user_id") ?? "";
        const channelId = params.get("channel_id") ?? "";
        const trigger_id = params.get("trigger_id") ?? "";
        const text = params.get("text") ?? "";

        await supabaseAdmin.from("slack_events").insert({
          event_type: `command:${command}`,
          slack_user_id: slackUserId,
          channel_id: channelId,
          payload: Object.fromEntries(params) as any,
        });

        try {
          const reply = await handleCommand({ command, slackUserId, channelId, trigger_id, text });
          return Response.json(reply);
        } catch (err: any) {
          console.error("slack command error", err);
          return Response.json({
            response_type: "ephemeral",
            text: `Erro: ${err?.message ?? "interno"}`,
          });
        }
      },
    },
  },
});
