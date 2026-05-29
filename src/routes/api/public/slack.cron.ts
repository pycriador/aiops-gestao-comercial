import { createFileRoute } from "@tanstack/react-router";
import { apiAdmin } from "@/lib/api/client.server";
import { slack } from "@/lib/slack/client.server";
import { daysSince } from "@/lib/constants";

/**
 * Scheduled notification job. Protect with ?token=SLACK_CRON_SECRET.
 * Call daily via pg_cron or external scheduler.
 *
 * Sends DMs to consultants for:
 *  - agencies without update >= 15 days
 *  - C-Level support requests
 * De-duplicated against slack_notifications within the last 7 days.
 */
export const Route = createFileRoute("/api/public/slack/cron")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});

async function run(request: Request) {
  const token = process.env.SLACK_CRON_SECRET;
  if (token) {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== token) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const { data: agencies } = await apiAdmin
    .from("real_estate_agencies")
    .select("id, name, city, state, negotiation_status, contract_stock, c_level_support_needed, last_interaction_date, next_steps, consultant_id, consultants:consultant_id(id, name, slack_user_id, email)")
    .not("consultant_id", "is", null);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await apiAdmin
    .from("slack_notifications")
    .select("notification_type, agency_id")
    .gte("created_at", sevenDaysAgo);
  const sent = new Set(recent?.map((r: any) => `${r.notification_type}:${r.agency_id}`));

  let dispatched = 0;
  for (const a of agencies ?? []) {
    const consult = (a as any).consultants;
    if (!consult?.slack_user_id) continue;
    const tasks: Array<{ type: string; text: string }> = [];

    const days = daysSince(a.last_interaction_date);
    if ((days ?? 999) >= 15 && !sent.has(`stale:${a.id}`)) {
      tasks.push({
        type: "stale",
        text: `⏰ *${a.name}* (${a.city}/${a.state}) — *${days ?? "—"}d* sem atualização. Status: \`${a.negotiation_status}\`. Use \`/atualizar\` para registrar.`,
      });
    }
    if (a.c_level_support_needed && !sent.has(`clevel:${a.id}`)) {
      tasks.push({
        type: "clevel",
        text: `🚨 *${a.name}* segue marcada como precisando de *apoio C-Level*. Acompanhe.`,
      });
    }

    for (const t of tasks) {
      try {
        const channel = await slack.openDM(consult.slack_user_id);
        if (!channel) continue;
        const res = await slack.postMessage(channel, { text: t.text });
        await apiAdmin.from("slack_notifications").insert({
          notification_type: t.type,
          agency_id: a.id,
          consultant_id: consult.id,
          slack_user_id: consult.slack_user_id,
          channel_id: channel,
          message_ts: res.ts,
          payload: { text: t.text },
        });
        dispatched++;
      } catch (err: any) {
        console.error("slack cron send error", err);
      }
    }
  }

  return Response.json({ ok: true, dispatched });
}
