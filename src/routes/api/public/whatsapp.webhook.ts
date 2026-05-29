import { createFileRoute } from "@tanstack/react-router";
import { apiAdmin } from "@/lib/api/client.server";
import { getProvider } from "@/lib/whatsapp/providers.server";
import { processInbound } from "@/lib/whatsapp/engine.server";

/**
 * Inbound WhatsApp webhook.
 *
 * Provider-agnostic: the configured provider parses the payload, the bot engine
 * decides the next reply, and we send it back through the same provider.
 *
 * Configure via env:
 *   WHATSAPP_PROVIDER=evolution|zapi|mock
 *   EVOLUTION_API_URL=... / EVOLUTION_INSTANCE=... / EVOLUTION_API_KEY=...
 *   ZAPI_INSTANCE=... / ZAPI_TOKEN=...
 *   WHATSAPP_WEBHOOK_TOKEN=...  (optional shared secret in ?token=)
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"), // health check / verify
      POST: async ({ request }) => {
        // Optional shared-secret check
        const requiredToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
        if (requiredToken) {
          const url = new URL(request.url);
          if (url.searchParams.get("token") !== requiredToken) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        const rawBody = await request.text();
        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const provider = getProvider();
        const inbound = provider.parseIncomingMessage(payload);
        if (!inbound) {
          // Not a message we handle (group / status / unsupported type) — ack
          return Response.json({ ok: true, ignored: true });
        }

        const result = await processInbound({
          phone: inbound.phone,
          body: inbound.body,
          rawPayload: payload,
        });

        if (result.reply) {
          const sendRes = await provider.sendMessage(inbound.phone, result.reply);
          await apiAdmin.from("whatsapp_messages").insert({
            direction: "outbound",
            phone: inbound.phone,
            consultant_id: result.consultant?.id ?? null,
            message_body: result.reply,
            raw_payload: { provider: provider.name, externalId: sendRes.externalId } as any,
            parsed_intent: result.intent,
            flow: result.flow,
            agency_id: result.agencyId,
            status: sendRes.ok ? "sent" : "error",
            error_message: sendRes.error ?? null,
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
