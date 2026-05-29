import { API_BASE_URL } from "@/lib/api/config";

export type BackendStatus = "checking" | "online" | "offline";

const HEALTH_PATH = "/health";
const CHECK_TIMEOUT_MS = 5000;

export async function checkBackendHealth(baseUrl = API_BASE_URL): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function isBackendUnavailable(status: number): boolean {
  return status === 0 || status === 408 || status >= 502;
}

export function mapAuthErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login") || normalized.includes("invalid_grant")) {
    return "Email ou senha incorretos.";
  }
  if (normalized.includes("user already registered") || normalized.includes("user_already_exists")) {
    return "Este email já está cadastrado.";
  }
  if (normalized.includes("email already") || normalized.includes("email_in_use")) {
    return "Este email já está em uso.";
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("fetch")
  ) {
    return "Não foi possível conectar ao backend. Verifique se o servidor está rodando.";
  }

  return message || "Falha na autenticação";
}
