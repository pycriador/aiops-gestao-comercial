import { createServerFn } from "@tanstack/react-start";
import { requireApiAuth } from "@/lib/api/auth-middleware";
import { loadSlackDiagnostics, runSlackCommandsDiagnosticTest } from "./diagnostics.server";

export const getSlackDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireApiAuth])
  .handler(async ({ context }) => loadSlackDiagnostics(context.userId));

export const testSlackCommandsEndpoint = createServerFn({ method: "POST" })
  .middleware([requireApiAuth])
  .handler(async ({ context }) => runSlackCommandsDiagnosticTest(context.userId));