import { createFileRoute } from "@tanstack/react-router";
import { verifySlackSignature } from "@/lib/slack/verify.server";
import { handleCommand } from "@/lib/slack/flows.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Slash commands endpoint.
 * Estratégia: ACK imediato em <100ms e processamento em background, usando
 * response_url para enviar a resposta final (Slack permite até 30min e 5
 * mensagens em um response_url, e a janela do trigger_id para abrir modal é 3s).
 *
 * Para garantir trigger_id válido em comandos que abrem modal, iniciamos o
 * processamento em background imediatamente (sem await) e o response é
 * enviado em paralelo.
 */
export const Route = createFileRoute("/api/public/slack/commands")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t0 = Date.now();
        const rid = Math.random().toString(36).slice(2, 8);
        const log = (msg: string, extra?: any) =>
          console.log(`[slack.commands ${rid} +${Date.now() - t0}ms] ${msg}`, extra ?? "");

        log("request received", { url: request.url, method: request.method });

        try {
          const secret = process.env.SLACK_SIGNING_SECRET;
          const botToken = process.env.SLACK_BOT_TOKEN;
          log("env check", { has_signing_secret: !!secret, has_bot_token: !!botToken });
          if (!secret) {
            return new Response("SLACK_SIGNING_SECRET ausente no servidor", { status: 500 });
          }
          if (!botToken) {
            return new Response("SLACK_BOT_TOKEN ausente no servidor", { status: 500 });
          }

          const rawBody = await request.text();
          log("body read", { length: rawBody.length });

          const ts = request.headers.get("x-slack-request-timestamp");
          const sig = request.headers.get("x-slack-signature");
          log("hmac headers", { ts, sig_present: !!sig });

          const valid = verifySlackSignature(rawBody, ts, sig, secret);
          log("hmac result", { valid });
          if (!valid) {
            return new Response("Invalid signature", { status: 401 });
          }

          const params = new URLSearchParams(rawBody);
          const command = params.get("command") ?? "";
          const slackUserId = params.get("user_id") ?? "";
          const channelId = params.get("channel_id") ?? "";
          const trigger_id = params.get("trigger_id") ?? "";
          const text = params.get("text") ?? "";
          const response_url = params.get("response_url") ?? "";
          log("parsed", { command, slackUserId, channelId, has_trigger: !!trigger_id, has_response_url: !!response_url });

          // fire-and-forget event log (não bloqueia o ACK)
          supabaseAdmin
            .from("slack_events")
            .insert({
              event_type: `command:${command}`,
              slack_user_id: slackUserId,
              channel_id: channelId,
              payload: Object.fromEntries(params) as any,
            })
            .then(({ error }) => {
              if (error) console.error(`[slack.commands ${rid}] event insert error`, error);
            });

          // processa em background — não awaitamos, garantindo ACK <3s
          (async () => {
            const b0 = Date.now();
            try {
              const reply = await handleCommand({ command, slackUserId, channelId, trigger_id, text });
              console.log(`[slack.commands ${rid}] handler done in ${Date.now() - b0}ms`);
              if (response_url && reply && (reply.text || reply.blocks)) {
                const r = await fetch(response_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ replace_original: false, ...reply }),
                });
                console.log(`[slack.commands ${rid}] response_url posted`, { status: r.status });
              }
            } catch (err: any) {
              console.error(`[slack.commands ${rid}] handler error`, err?.stack ?? err);
              if (response_url) {
                await fetch(response_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    response_type: "ephemeral",
                    text: `❌ Erro: ${err?.message ?? "interno"}`,
                  }),
                }).catch(() => {});
              }
            }
          })();

          // ACK imediato — Slack mostra apenas o reconhecimento, mensagem real chega via response_url
          log("ACK sent");
          return new Response("", { status: 200 });
        } catch (err: any) {
          console.error(`[slack.commands ${rid}] top-level error`, err?.stack ?? err);
          return Response.json({
            response_type: "ephemeral",
            text: `❌ Erro interno: ${err?.message ?? "desconhecido"}`,
          });
        }
      },
    },
  },
});
