import { createFileRoute } from "@tanstack/react-router";
import { verifySlackSignature } from "@/lib/slack/verify.server";
import { handleBlockAction, handleViewSubmission } from "@/lib/slack/flows.server";

/**
 * Slack interactions endpoint.
 * Handles block_actions (open modals) and view_submission (multi-step flows).
 */
export const Route = createFileRoute("/api/public/slack/interactions")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, version: "crm-modals-v1" }),
      POST: async ({ request }) => {
        const rid = Math.random().toString(36).slice(2, 8);
        const log = (msg: string, extra?: any) =>
          console.log(`[slack.interactions ${rid}] ${msg}`, extra ?? "");

        try {
          const rawBody = await request.text();
          const secret = process.env.SLACK_SIGNING_SECRET;
          const ts = request.headers.get("x-slack-request-timestamp");
          const sig = request.headers.get("x-slack-signature");
          const valid = secret ? verifySlackSignature(rawBody, ts, sig, secret) : false;
          if (!valid) {
            log("invalid signature");
            return new Response("Invalid signature", { status: 401 });
          }

          const params = new URLSearchParams(rawBody);
          const payloadStr = params.get("payload");
          if (!payloadStr) return new Response("Missing payload", { status: 400 });

          const payload = JSON.parse(payloadStr);
          const type = payload.type;
          log("payload", {
            type,
            action_id: payload.actions?.[0]?.action_id,
            callback_id: payload.view?.callback_id,
            user: payload.user?.id,
          });

          if (type === "block_actions") {
            // Must call views.open within 3s using trigger_id; do work inline.
            try {
              await handleBlockAction(payload);
            } catch (err: any) {
              console.error(`[slack.interactions ${rid}] block_actions error`, err?.stack ?? err);
              if (payload.response_url) {
                await fetch(payload.response_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    response_type: "ephemeral",
                    replace_original: false,
                    text: `Erro ao processar ação: ${err?.message ?? "interno"}`,
                  }),
                });
              }
            }
            return new Response(null, { status: 200 });
          }

          if (type === "view_submission") {
            const result = await handleViewSubmission(payload);
            return Response.json(result ?? { response_action: "clear" });
          }

          if (type === "view_closed") {
            return new Response(null, { status: 200 });
          }

          log("unhandled type", { type });
          return new Response(null, { status: 200 });
        } catch (err: any) {
          console.error(`[slack.interactions ${rid}] fatal`, err?.stack ?? err);
          return new Response(null, { status: 200 });
        }
      },
    },
  },
});
