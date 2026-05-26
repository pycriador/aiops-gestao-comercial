import { createFileRoute } from "@tanstack/react-router";
import { SLACK_URLS, slackRuntimeEnvironment } from "@/lib/slack/constants";

export const Route = createFileRoute("/api/public/slack/health")({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({
        ok: true,
        service: "slack",
        commandsUrl: SLACK_URLS.commands,
        hasBotToken: !!process.env.SLACK_BOT_TOKEN,
        hasSigningSecret: !!process.env.SLACK_SIGNING_SECRET,
        hasCronSecret: !!process.env.SLACK_CRON_SECRET,
        environment: slackRuntimeEnvironment(request.url),
      }),
    },
  },
});