import { fromService, rpc } from "./database";

/** Server-side API client with service role (bypasses RLS). */
export const apiAdmin = {
  from: fromService,
  rpc: (name: string, params: Record<string, unknown>) => rpc(name, params, true),
};
