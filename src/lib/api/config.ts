/** Local Flask backend configuration. */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || process.env.API_URL || "http://localhost:5001";

export const API_PUBLIC_KEY =
  import.meta.env.VITE_API_PUBLIC_KEY ||
  process.env.API_PUBLIC_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImFnZW5jeS13YXRjaC1sb2NhbCJ9.local-anon-key";

export function getServiceKey(): string {
  return (
    process.env.API_SERVICE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoiYWdlbmN5LXdhdGNoLWxvY2FsIn0.local-service-key"
  );
}

export const IS_LOCAL_BACKEND =
  typeof API_BASE_URL === "string" && /localhost|127\.0\.0\.1/.test(API_BASE_URL);
