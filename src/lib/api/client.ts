import { auth } from "./auth";
import { from } from "./database";

/** Browser API client for the local Flask backend. */
export const api = {
  auth,
  from,
};

export type { AuthUser, Session } from "./auth";
export type { Database } from "./types";
export { ApiError, rpc } from "./database";
