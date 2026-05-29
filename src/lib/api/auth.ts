import { API_BASE_URL, API_PUBLIC_KEY } from "./config";
import { clearIamCache } from "@/lib/session-cache";

export type AuthUser = {
  id: string;
  email: string;
  role?: string;
  aud?: string;
  email_confirmed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  user_metadata?: Record<string, unknown>;
};

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user: AuthUser;
};

type AuthChangeCallback = (event: string, session: Session | null) => void;

const STORAGE_KEY = "agency-watch-session";
const listeners = new Set<AuthChangeCallback>();

function readStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getCachedSessionUser(): AuthUser | null {
  return readStoredSession()?.user ?? null;
}

export function hasActiveSession(): boolean {
  return readStoredSession() !== null;
}

export function getUserDisplayName(user: AuthUser | null | undefined): string {
  if (!user) return "";
  const meta = user.user_metadata;
  const name = String(meta?.display_name ?? meta?.full_name ?? "").trim();
  return name || user.email.split("@")[0];
}

function persistSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function notify(event: string, session: Session | null) {
  listeners.forEach((cb) => cb(event, session));
}

function mapSessionResponse(body: Record<string, unknown>): Session {
  return {
    access_token: String(body.access_token ?? ""),
    refresh_token: String(body.refresh_token ?? ""),
    expires_in: typeof body.expires_in === "number" ? body.expires_in : undefined,
    expires_at: typeof body.expires_at === "number" ? body.expires_at : undefined,
    token_type: typeof body.token_type === "string" ? body.token_type : "bearer",
    user: body.user as AuthUser,
  };
}

async function authFetch(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: API_PUBLIC_KEY,
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
}

export const auth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const response = await authFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        data: { session: null, user: null },
        error: new Error(body.error_description || body.message || "Falha no login"),
      };
    }
    const session = mapSessionResponse(body);
    persistSession(session);
    notify("SIGNED_IN", session);
    return { data: { session, user: session.user }, error: null };
  },

  async signUp({ email, password }: { email: string; password: string }) {
    const response = await authFetch("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        data: { session: null, user: null },
        error: new Error(body.error_description || body.message || "Falha ao criar conta"),
      };
    }
    const session = mapSessionResponse(body);
    persistSession(session);
    notify("SIGNED_IN", session);
    return { data: { session, user: session.user }, error: null };
  },

  async signOut() {
    const session = readStoredSession();
    if (session?.access_token) {
      await authFetch("/auth/v1/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => undefined);
    }
    persistSession(null);
    clearIamCache();
    notify("SIGNED_OUT", null);
    return { error: null };
  },

  async getSession() {
    const session = readStoredSession();
    return { data: { session }, error: null };
  },

  async updateProfile(body: { email?: string; display_name?: string; password?: string }) {
    const session = readStoredSession();
    if (!session?.access_token) {
      return { data: { user: null }, error: new Error("Sessão expirada") };
    }

    try {
      const response = await authFetch("/auth/v1/user", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          data: { user: null },
          error: new Error(payload.message || payload.error_description || payload.error || "Falha ao atualizar perfil"),
        };
      }
      const updated: Session = { ...session, user: payload as AuthUser };
      persistSession(updated);
      notify("USER_UPDATED", updated);
      return { data: { user: payload as AuthUser }, error: null };
    } catch (e) {
      return {
        data: { user: null },
        error: new Error(e instanceof Error ? e.message : "Erro de rede"),
      };
    }
  },

  async getUser(jwt?: string) {
    const session = readStoredSession();
    const token = jwt ?? session?.access_token;
    if (!token) {
      return { data: { user: null }, error: null };
    }

    try {
      const response = await authFetch("/auth/v1/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 && !jwt) {
          persistSession(null);
          clearIamCache();
          notify("SIGNED_OUT", null);
          return { data: { user: null }, error: new Error(body.error || "Sessão inválida") };
        }

        return {
          data: { user: session?.user ?? null },
          error: new Error(body.error || body.message || response.statusText),
        };
      }

      if (session && !jwt) {
        const updated: Session = { ...session, user: body as AuthUser };
        persistSession(updated);
      }

      return { data: { user: body as AuthUser }, error: null };
    } catch (e) {
      return {
        data: { user: session?.user ?? null },
        error: new Error(e instanceof Error ? e.message : "Erro de rede"),
      };
    }
  },

  onAuthStateChange(callback: AuthChangeCallback) {
    listeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => listeners.delete(callback),
        },
      },
    };
  },
};
