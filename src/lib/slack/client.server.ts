/**
 * Thin Slack Web API client (bot token).
 */
const SLACK_API = "https://slack.com/api";

function token(): string {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error("SLACK_BOT_TOKEN não configurado");
  return t;
}

async function call<T = any>(method: string, body: Record<string, any>): Promise<T> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as any;
  if (!data.ok) {
    throw new Error(`slack ${method} failed: ${data.error}${data.response_metadata ? ` (${JSON.stringify(data.response_metadata)})` : ""}`);
  }
  return data as T;
}

export const slack = {
  postMessage: (channel: string, args: { text?: string; blocks?: any[]; thread_ts?: string }) =>
    call("chat.postMessage", { channel, ...args }),
  postEphemeral: (channel: string, user: string, args: { text?: string; blocks?: any[] }) =>
    call("chat.postEphemeral", { channel, user, ...args }),
  openView: (trigger_id: string, view: any) => call("views.open", { trigger_id, view }),
  updateView: (view_id: string, view: any) => call("views.update", { view_id, view }),
  pushView: (trigger_id: string, view: any) => call("views.push", { trigger_id, view }),
  usersInfo: (user: string) => call<any>("users.info", { user }),
  usersLookupByEmail: async (email: string) => {
    const res = await fetch(`${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = (await res.json()) as any;
    if (!data.ok) return null;
    return data.user;
  },
  openDM: async (user: string): Promise<string | null> => {
    try {
      const r = await call<any>("conversations.open", { users: user });
      return r.channel?.id ?? null;
    } catch {
      return null;
    }
  },
};
