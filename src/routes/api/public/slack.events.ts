import { createFileRoute } from "@tanstack/react-router";
import { verifySlackSignature } from "@/lib/slack/verify.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Slack Events API endpoint.
 * Handles URL verification handshake + event_callback (app_mention, etc.).
 */
export const Route = createFileRoute("/api/public/slack/events")({
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

        let payload: any;
        try { payload = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }

        // URL verification challenge
        if (payload.type === "url_verification") {
          return new Response(payload.challenge, { headers: { "Content-Type": "text/plain" } });
        }

        // Log event for observability
        await supabaseAdmin.from("slack_events").insert({
          event_type: payload.event?.type ?? payload.type ?? "unknown",
          slack_user_id: payload.event?.user ?? null,
          slack_team_id: payload.team_id ?? null,
          channel_id: payload.event?.channel ?? null,
          payload: payload as any,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
