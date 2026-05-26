import { createFileRoute } from "@tanstack/react-router";
import { verifySlackSignature } from "@/lib/slack/verify.server";
import { handleBlockAction, handleViewSubmission } from "@/lib/slack/flows.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Single endpoint for all interactivity (block_actions, view_submission, shortcuts).
 */
export const Route = createFileRoute("/api/public/slack/interactions")({
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
        const payloadStr = params.get("payload");
        if (!payloadStr) return new Response("Missing payload", { status: 400 });
        const payload = JSON.parse(payloadStr);

        await supabaseAdmin.from("slack_events").insert({
          event_type: `interaction:${payload.type}`,
          slack_user_id: payload.user?.id ?? null,
          slack_team_id: payload.team?.id ?? null,
          channel_id: payload.channel?.id ?? null,
          payload: payload as any,
        });

        try {
          if (payload.type === "block_actions") {
            // Ack immediately; do work after
            handleBlockAction(payload).catch((e) => console.error("block_action err", e));
            return new Response("", { status: 200 });
          }
          if (payload.type === "view_submission") {
            const res = await handleViewSubmission(payload);
            return Response.json(res ?? {});
          }
          return new Response("", { status: 200 });
        } catch (err: any) {
          console.error("slack interactions error", err);
          return Response.json({
            response_action: "errors",
            errors: { agency: err?.message?.slice(0, 150) ?? "Erro interno" },
          });
        }
      },
    },
  },
});
