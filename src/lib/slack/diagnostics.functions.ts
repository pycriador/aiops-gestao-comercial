import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSlackDiagnostics, runSlackCommandsDiagnosticTest } from "./diagnostics.server";

export const getSlackDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadSlackDiagnostics(context.userId));

export const testSlackCommandsEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => runSlackCommandsDiagnosticTest(context.userId));