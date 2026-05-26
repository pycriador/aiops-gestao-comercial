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

          // IMPORTANT: para block_actions, a resposta síncrona substitui a
          // mensagem original. Sem replace_original=true o Slack descarta o
          // text e nada aparece na UI (foi o sintoma "nada acontece").
          let body: { text: string; replace_original: boolean };
          switch (actionId) {
            case "view_pending":
              body = { text: "Teste: botão Pendências acionado", replace_original: true };
              break;
            case "request_c_level_support":
              body = { text: "Teste: botão Apoio C-Level acionado", replace_original: true };
              break;
            case "update_agency":
              body = { text: "Teste: botão Atualizar acionado", replace_original: true };
              break;
            case "create_agency":
              body = { text: "Teste: botão Nova imobiliária acionado", replace_original: true };
              break;
            default:
              body = { text: `Ação desconhecida: ${actionId ?? "—"}`, replace_original: true };
          }

          log("response sent", body);
          return Response.json(body, { status: 200 });
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
