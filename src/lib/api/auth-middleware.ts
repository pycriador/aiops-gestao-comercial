import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { API_BASE_URL } from "./config";

export const requireApiAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();

  if (!request?.headers) {
    throw new Error("Unauthorized: No request headers available");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: No authorization header provided");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }

  const response = await fetch(`${API_BASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.API_PUBLIC_KEY || process.env.VITE_API_PUBLIC_KEY || "",
    },
  });

  if (!response.ok) {
    throw new Error("Unauthorized: Invalid token");
  }

  const user = (await response.json()) as { id: string; email?: string };

  return next({
    context: {
      userId: user.id,
      claims: { sub: user.id, email: user.email },
    },
  });
});
