import { createFileRoute } from "@tanstack/react-router";
import { inspectSlackSignature } from "@/lib/slack/verify.server";
import { handleCommand } from "@/lib/slack/flows.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slackRuntimeEnvironment } from "@/lib/slack/constants";

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
      GET: async ({ request }) => Response.json({
        ok: true,
        service: "slack.commands",
        method: "GET",
        url: request.url,
        environment: slackRuntimeEnvironment(request.url),
        hasBotToken: !!process.env.SLACK_BOT_TOKEN,
        hasSigningSecret: !!process.env.SLACK_SIGNING_SECRET,
      }),
      POST: async ({ request }) => {
        const t0 = Date.now();
        const rid = Math.random().toString(36).slice(2, 8);
        const log = (msg: string, extra?: any) =>
          console.log(`[slack.commands ${rid} +${Date.now() - t0}ms] ${msg}`, extra ?? "");

        const queueBackground = (promise: PromiseLike<unknown>) => {
          const runtime = globalThis as any;
          const waitUntil = runtime.EdgeRuntime?.waitUntil ?? runtime.waitUntil;
          const task = Promise.resolve(promise);
          if (typeof waitUntil === "function") waitUntil(task);
          else task.catch((err) => console.error(`[slack.commands ${rid}] background error`, err));
        };

        const secretStatus = () => {
          const signingSecret = process.env.SLACK_SIGNING_SECRET;
          return {
            hasBotToken: !!process.env.SLACK_BOT_TOKEN,
            hasSigningSecret: !!signingSecret,
            hasCronSecret: !!process.env.SLACK_CRON_SECRET,
            signingSecretLast4: signingSecret ? signingSecret.slice(-4) : null,
          };
        };

        const recordDiagnostic = (args: {
          status: string;
          command?: string;
          slackUserId?: string;
          teamId?: string;
          channelId?: string;
          payload: Record<string, unknown>;
          response?: Record<string, unknown>;
          errorMessage?: string;
        }) =>
          supabaseAdmin.from("slack_events").insert({
            event_type: `command:${args.command || "unknown"}`,
            slack_user_id: args.slackUserId || null,
            slack_team_id: args.teamId || null,
            channel_id: args.channelId || null,
            payload: args.payload as any,
            response: (args.response ?? null) as any,
            status: args.status,
            error_message: args.errorMessage ?? null,
          }).then(({ error }) => {
            if (error) console.error(`[slack.commands ${rid}] diagnostic insert error`, error);
          });

        log("request received", { url: request.url, method: request.method });

        try {
          const secret = process.env.SLACK_SIGNING_SECRET;
          const secrets = secretStatus();
          log("env check", secrets);

          const rawBody = await request.text();
          log("body read", { length: rawBody.length });

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
          const trigger_id = params.get("trigger_id") ?? "";
          const text = params.get("text") ?? "";
          const response_url = params.get("response_url") ?? "";
          log("parsed", { command, slackUserId, teamId, channelId, has_trigger: !!trigger_id, has_response_url: !!response_url });

          const diagnosticPayload = {
            request: {
              receivedAt: new Date(t0).toISOString(),
              method: request.method,
              url: request.url,
              environment: slackRuntimeEnvironment(request.url),
            },
            command,
            user_id: slackUserId,
            team_id: teamId,
            channel_id: channelId,
            text,
            response_url_present: !!response_url,
            trigger_id_present: !!trigger_id,
            hmac,
            hmac_status: hmac.valid || diagnosticBypass ? "valid" : "invalid",
            diagnostic_bypass: diagnosticBypass,
            secrets,
          };

          if (!hmac.valid && !diagnosticBypass) {
            const ack = { status: 200, durationMs: Date.now() - t0, mode: "hmac_invalid_ack" };
            queueBackground(recordDiagnostic({
              status: "hmac_invalid_ack_sent",
              command,
              slackUserId,
              teamId,
              channelId,
              payload: diagnosticPayload,
              response: { ack },
              errorMessage: hmac.reason ?? "invalid_signature",
            }));
            log("ACK sent despite invalid HMAC", ack);
            return Response.json({
              response_type: "ephemeral",
              text: "Recebi a chamada, mas a assinatura do Slack não conferiu. Diagnóstico registrado no painel.",
            }, { status: 200 });
          }

          // processa em background — não awaitamos, garantindo ACK <3s.
          // Para /carteira o handler não depende de DB/consultor/Slack, apenas retorna o menu estático.
          queueBackground((async () => {
            const b0 = Date.now();
            log("background start", { command, has_response_url: !!response_url });
            try {
              const reply = await handleCommand({ command, slackUserId, channelId, trigger_id, text });
              log("handler done", { ms: Date.now() - b0, hasText: !!reply.text, blocks: reply.blocks?.length ?? 0 });

              if (!response_url) {
                log("response_url ausente — não há como enviar resposta final");
                await recordDiagnostic({
                  status: "missing_response_url",
                  command, slackUserId, teamId, channelId,
                  payload: diagnosticPayload,
                  response: { ack: { status: 200, durationMs: Date.now() - t0, mode: "async_ack" }, handlerMs: Date.now() - b0 },
                  errorMessage: "response_url ausente no payload do Slack",
                });
                return;
              }

              log("posting to response_url", { preview: response_url.slice(0, 60) + "…" });
              const r = await fetch(response_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ response_type: "ephemeral", replace_original: true, ...reply }),
              });
              const respBody = await r.text();
              log("response_url result", { status: r.status, ok: r.ok, body: respBody.slice(0, 200) });

              await recordDiagnostic({
                status: r.ok ? (diagnosticBypass ? "diagnostic_test_response_url_ok" : "response_url_ok") : "response_url_failed",
                command, slackUserId, teamId, channelId,
                payload: diagnosticPayload,
                response: {
                  ack: { status: 200, durationMs: Date.now() - t0, mode: "async_ack" },
                  handlerMs: Date.now() - b0,
                  response_url_post: { status: r.status, ok: r.ok, body: respBody.slice(0, 500) },
                },
                errorMessage: r.ok ? undefined : `response_url POST status ${r.status}: ${respBody.slice(0, 300)}`,
              });
            } catch (err: any) {
              console.error(`[slack.commands ${rid}] handler error`, err?.stack ?? err);
              await recordDiagnostic({
                status: "handler_error",
                command, slackUserId, teamId, channelId,
                payload: diagnosticPayload,
                response: { ack: { status: 200, durationMs: Date.now() - t0, mode: "async_ack" } },
                errorMessage: `${err?.message ?? "internal_error"}\n${err?.stack ?? ""}`.slice(0, 1500),
              });
              if (response_url) {
                await fetch(response_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    response_type: "ephemeral",
                    text: `❌ Erro: ${err?.message ?? "interno"}`,
                  }),
                }).catch((e) => console.error(`[slack.commands ${rid}] response_url error post failed`, e));
              }
            }
          })());

          // ACK imediato — Slack mostra apenas o reconhecimento, mensagem real chega via response_url
          const ack = { status: 200, durationMs: Date.now() - t0, mode: "async_ack" };
          log("ACK sent", ack);
          return Response.json({ response_type: "ephemeral", text: "Recebido. Processando…" }, { status: 200 });
        } catch (err: any) {
          console.error(`[slack.commands ${rid}] top-level error`, err?.stack ?? err);
          queueBackground(recordDiagnostic({
            status: "top_level_error_ack_sent",
            payload: {
              request: { receivedAt: new Date(t0).toISOString(), method: request.method, url: request.url },
              secrets: secretStatus(),
            },
            response: { ack: { status: 200, durationMs: Date.now() - t0, mode: "top_level_error" } },
            errorMessage: err?.message ?? "unknown_error",
          }));
          return Response.json({
            response_type: "ephemeral",
            text: `❌ Erro interno: ${err?.message ?? "desconhecido"}`,
          }, { status: 200 });
        }
      },
    },
  },
});
