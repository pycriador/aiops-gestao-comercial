import { createMiddleware } from "@tanstack/react-start";
import { auth } from "./auth";

export const attachApiAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await auth.getSession();
  const token = data.session?.access_token;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
