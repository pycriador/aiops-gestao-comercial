import { createFileRoute } from "@tanstack/react-router";
import { inspectSlackSignature } from "@/lib/slack/verify.server";
import { handleViewSubmission } from "@/lib/slack/flows.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slack } from "@/lib/slack/client.server";

/**
 * Single endpoint for all interactivity (block_actions, view_submission).
 * Estratégia: ACK <3s. block_actions sempre roda em background.
 * Para a fase de validação, os botões do menu principal usam handlers
 * estáticos que não dependem de DB/consultor.
 */
export const Route = createFileRoute("/api/public/slack/interactions")({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({
        ok: true,
        service: "slack.interactions",
        url: request.url,
        hasBotToken: !!process.env.SLACK_BOT_TOKEN,
        hasSigningSecret: !!process.env.SLACK_SIGNING_SECRET,
      }),
      POST: async ({ request }) => {
        const t0 = Date.now();
        const rid = Math.random().toString(36).slice(2, 8);
        const log = (msg: string, extra?: any) =>
          console.log(`[slack.interactions ${rid} +${Date.now() - t0}ms] ${msg}`, extra ?? "");

        const queueBackground = (promise: PromiseLike<unknown>) => {
          const runtime = globalThis as any;
          const waitUntil = runtime.EdgeRuntime?.waitUntil ?? runtime.waitUntil;
          const task = Promise.resolve(promise);
          if (typeof waitUntil === "function") waitUntil(task);
          else task.catch((err) => console.error(`[slack.interactions ${rid}] background error`, err));
        };

        const record = (args: {
          status: string;
          type?: string;
          actionId?: string;
          slackUserId?: string;
          teamId?: string;
          channelId?: string;
          payload: Record<string, unknown>;
          response?: Record<string, unknown>;
          errorMessage?: string;
        }) =>
          supabaseAdmin.from("slack_events").insert({
            event_type: `interaction:${args.type ?? "unknown"}${args.actionId ? `:${args.actionId}` : ""}`,
            slack_user_id: args.slackUserId || null,
            slack_team_id: args.teamId || null,
            channel_id: args.channelId || null,
            payload: args.payload as any,
            response: (args.response ?? null) as any,
            status: args.status,
            error_message: args.errorMessage ?? null,
          }).then(({ error }) => {
            if (error) console.error(`[slack.interactions ${rid}] insert error`, error);
          });

        try {
          log("request received");
          const rawBody = await request.text();
          const secret = process.env.SLACK_SIGNING_SECRET;
          const ts = request.headers.get("x-slack-request-timestamp");
          const sig = request.headers.get("x-slack-signature");
          const hmac = inspectSlackSignature(rawBody, ts, sig, secret);
          log("hmac", hmac);

          const params = new URLSearchParams(rawBody);
          const payloadStr = params.get("payload");
          if (!payloadStr) {
            log("missing payload");
            return new Response("Missing payload", { status: 200 });
          }
          const payload = JSON.parse(payloadStr);
          const type = payload.type as string;
          const userId = payload.user?.id as string | undefined;
          const teamId = payload.team?.id as string | undefined;
          const channelId = payload.channel?.id as string | undefined;
          const trigger_id = payload.trigger_id as string | undefined;
          const response_url = payload.response_url as string | undefined;
          const action = payload.actions?.[0];
          const actionId: string | undefined = action?.action_id;
          const blockId: string | undefined = action?.block_id;

          log("parsed", {
            type, userId, teamId, channelId,
            actionId, blockId,
            has_trigger_id: !!trigger_id,
            has_response_url: !!response_url,
            hmac_valid: hmac.valid,
          });

          // ===== view_submission: precisa responder JSON síncrono =====
          if (type === "view_submission") {
            try {
              const res = await handleViewSubmission(payload);
              queueBackground(record({
                status: "view_submission_ok",
                type, actionId: payload.view?.callback_id,
                slackUserId: userId, teamId, channelId,
                payload, response: res ?? {},
              }));
              return Response.json(res ?? {});
            } catch (err: any) {
              console.error(`[slack.interactions ${rid}] view_submission error`, err?.stack ?? err);
              queueBackground(record({
                status: "view_submission_error",
                type, actionId: payload.view?.callback_id,
                slackUserId: userId, teamId, channelId,
                payload, errorMessage: `${err?.message}\n${err?.stack ?? ""}`.slice(0, 1500),
              }));
              return Response.json({
                response_action: "errors",
                errors: { agency: (err?.message ?? "Erro interno").slice(0, 150) },
              });
            }
          }

          // ===== block_actions: ACK imediato, handler em background =====
          if (type === "block_actions") {
            queueBackground((async () => {
              const b0 = Date.now();
              log("bg handler start", { actionId });
              try {
                await handleMenuAction({
                  actionId, trigger_id, response_url, userId, log,
                });
                log("bg handler done", { ms: Date.now() - b0 });
                await record({
                  status: "block_action_ok",
                  type, actionId,
                  slackUserId: userId, teamId, channelId,
                  payload,
                  response: { handlerMs: Date.now() - b0 },
                });
              } catch (err: any) {
                console.error(`[slack.interactions ${rid}] block_action error`, err?.stack ?? err);
                await record({
                  status: "block_action_error",
                  type, actionId,
                  slackUserId: userId, teamId, channelId,
                  payload,
                  errorMessage: `${err?.message}\n${err?.stack ?? ""}`.slice(0, 1500),
                });
                if (response_url) {
                  await fetch(response_url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      response_type: "ephemeral",
                      replace_original: false,
                      text: `❌ Erro no botão *${actionId}*: ${(err?.message ?? "interno").slice(0, 200)}`,
                    }),
                  }).catch((e) => console.error(`[slack.interactions ${rid}] err post failed`, e));
                }
              }
            })());

            log("ACK 200 (block_actions)");
            return new Response("", { status: 200 });
          }

          log("unhandled type, ACK 200", { type });
          queueBackground(record({
            status: "unhandled_type",
            type, slackUserId: userId, teamId, channelId, payload,
          }));
          return new Response("", { status: 200 });
        } catch (err: any) {
          console.error(`[slack.interactions ${rid}] top-level error`, err?.stack ?? err);
          return new Response("", { status: 200 });
        }
      },
    },
  },
});

// ===== Handlers estáticos de teste (fase 1) =====
// Sem dependência de banco, consultor ou RLS.

async function handleMenuAction(args: {
  actionId: string | undefined;
  trigger_id: string | undefined;
  response_url: string | undefined;
  userId: string | undefined;
  log: (msg: string, extra?: any) => void;
}) {
  const { actionId, trigger_id, response_url, log } = args;

  const postReply = async (text: string) => {
    if (!response_url) throw new Error("response_url ausente");
    log("posting to response_url", { preview: text.slice(0, 80) });
    const r = await fetch(response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", replace_original: false, text }),
    });
    const body = await r.text();
    log("response_url result", { status: r.status, ok: r.ok, body: body.slice(0, 200) });
    if (!r.ok) throw new Error(`response_url ${r.status}: ${body.slice(0, 200)}`);
  };

  const openTestModal = async (title: string, label: string) => {
    if (!trigger_id) throw new Error("trigger_id ausente");
    log("opening test modal", { title });
    const result = await slack.openView(trigger_id, {
      type: "modal",
      callback_id: `test_${actionId}`,
      title: { type: "plain_text", text: title.slice(0, 24) },
      submit: { type: "plain_text", text: "OK" },
      close: { type: "plain_text", text: "Cancelar" },
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*Teste de interatividade*\n${label}` } },
        {
          type: "input",
          block_id: "test_input",
          label: { type: "plain_text", text: "Digite qualquer coisa" },
          element: { type: "plain_text_input", action_id: "v" },
        },
      ],
    });
    log("views.open ok", { view_id: (result as any)?.view?.id });
  };

  switch (actionId) {
    case "view_pending":
      await postReply("✅ Teste: botão *Pendências* acionado.");
      return;
    case "request_c_level_support":
      await postReply("🚨 Teste: botão *Apoio C-Level* acionado.");
      return;
    case "update_agency":
      await openTestModal("Atualizar (teste)", "Modal de teste para *Atualizar imobiliária*.");
      return;
    case "create_agency":
      await openTestModal("Nova (teste)", "Modal de teste para *Nova imobiliária*.");
      return;
    default:
      log("action_id desconhecido — ignorado", { actionId });
      if (response_url) {
        await postReply(`⚠️ action_id não tratado: \`${actionId ?? "—"}\``);
      }
  }
}
