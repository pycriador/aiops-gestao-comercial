import { createFileRoute } from "@tanstack/react-router";
import { inspectSlackSignature } from "@/lib/slack/verify.server";

/**
 * Slack interactions — modo SYNC-DIRECT-ACTIONS.
 * Resposta síncrona direta no ACK, sem response_url, sem modal,
 * sem background, sem DB.
 */
export const Route = createFileRoute("/api/public/slack/interactions")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, version: "sync-direct-actions" }),
      POST: async ({ request }) => {
        const rid = Math.random().toString(36).slice(2, 8);
        const log = (msg: string, extra?: any) =>
          console.log(`[slack.interactions ${rid}] ${msg}`, extra ?? "");

        try {
          const rawBody = await request.text();
          const secret = process.env.SLACK_SIGNING_SECRET;
          const ts = request.headers.get("x-slack-request-timestamp");
          const sig = request.headers.get("x-slack-signature");
          const hmac = inspectSlackSignature(rawBody, ts, sig, secret);
          log("hmac", { valid: hmac.valid, reason: hmac.reason });

          const params = new URLSearchParams(rawBody);
          const payloadStr = params.get("payload");
          if (!payloadStr) {
            log("missing payload");
            return new Response("Missing payload", { status: 200 });
          }

          const payload = JSON.parse(payloadStr);
          const type = payload.type;
          const action = payload.actions?.[0];
          const actionId: string | undefined = action?.action_id;
          const blockId: string | undefined = action?.block_id;
          const userId = payload.user?.id;

          log("parsed", { type, actionId, blockId, userId, hmac_valid: hmac.valid });

          const responseUrl: string | undefined = payload.response_url;
          log("response_url", { present: !!responseUrl });

          // Slack confirma o clique pelo ACK HTTP 200, mas para block_actions
          // a mensagem visível deve ser enviada pelo response_url do payload.
          let body: { response_type: "ephemeral"; text: string; replace_original: boolean };
          switch (actionId) {
            case "view_pending":
              body = { response_type: "ephemeral", text: "Teste: botão Pendências acionado", replace_original: true };
              break;
            case "request_c_level_support":
              body = { response_type: "ephemeral", text: "Teste: botão Apoio C-Level acionado", replace_original: true };
              break;
            case "update_agency":
              body = { response_type: "ephemeral", text: "Teste: botão Atualizar acionado", replace_original: true };
              break;
            case "create_agency":
              body = { response_type: "ephemeral", text: "Teste: botão Nova imobiliária acionado", replace_original: true };
              break;
            default:
              body = { response_type: "ephemeral", text: `Ação desconhecida: ${actionId ?? "—"}`, replace_original: true };
          }

          if (!responseUrl) {
            log("response_url missing; returning body fallback", body);
            return Response.json(body, { status: 200 });
          }

          log("sending response_url", body);
          const responseUrlRes = await fetch(responseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(body),
          });
          const responseUrlText = await responseUrlRes.text();
          log("response_url result", {
            ok: responseUrlRes.ok,
            status: responseUrlRes.status,
            body: responseUrlText.slice(0, 500),
          });

          log("ACK sent", { status: 200 });
          return new Response(null, { status: 200 });
        } catch (err: any) {
          console.error(`[slack.interactions ${rid}] error`, err?.stack ?? err);
          return Response.json(
            { text: `Erro: ${err?.message ?? "interno"}`, replace_original: false },
            { status: 200 },
          );
        }
      },
    },
  },
});
