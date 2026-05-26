export const SLACK_PRODUCTION_BASE_URL = "https://agency-watch.lovable.app";

export const SLACK_PRODUCTION_ORIGINS = [
  "https://agency-watch.lovable.app",
  "https://project--d11cb06d-335d-4537-a5a5-ab92c2b041f2.lovable.app",
] as const;

export const SLACK_URLS = {
  events: `${SLACK_PRODUCTION_BASE_URL}/api/public/slack/events`,
  interactions: `${SLACK_PRODUCTION_BASE_URL}/api/public/slack/interactions`,
  commands: `${SLACK_PRODUCTION_BASE_URL}/api/public/slack/commands`,
  cron: `${SLACK_PRODUCTION_BASE_URL}/api/public/slack/cron`,
  health: `${SLACK_PRODUCTION_BASE_URL}/api/public/slack/health`,
} as const;

export function slackRuntimeEnvironment(requestUrl?: string | null) {
  if (!requestUrl) return "unknown";
  try {
    const origin = new URL(requestUrl).origin;
    return (SLACK_PRODUCTION_ORIGINS as readonly string[]).includes(origin) ? "production" : "preview/dev";
  } catch {
    return "unknown";
  }
}
