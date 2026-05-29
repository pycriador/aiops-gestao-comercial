import { API_BASE_URL, API_PUBLIC_KEY } from "./config";
import { auth } from "./auth";

export type IamRole = {
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  data_scope: "all" | "own";
  permissions: string[];
  created_at: string;
  updated_at: string;
};

export type IamUser = {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  primary_role: string | null;
  permissions: string[];
  data_scope: "all" | "own";
  consultant_id: string | null;
  consultant_name: string | null;
  created_at: string;
  updated_at: string;
};

export type IamMe = {
  user_id: string;
  roles: string[];
  permissions: string[];
  data_scope: "all" | "own";
};

export function iamHasPermission(permissions: string[] | undefined, permission: string): boolean {
  if (!permissions) return false;
  return permissions.includes("*") || permissions.includes(permission);
}

export function iamHasAnyPermission(permissions: string[] | undefined, keys: string[]): boolean {
  return keys.some((key) => iamHasPermission(permissions, key));
}

type IamResult<T> = { data: T | null; error: Error | null; status: number };

async function iamFetch<T>(path: string, init: RequestInit = {}): Promise<IamResult<T>> {
  const { data: sessionData } = await auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: API_PUBLIC_KEY,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (sessionData.session?.access_token) {
    headers.Authorization = `Bearer ${sessionData.session.access_token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/iam/v1${path}`, { ...init, headers });
    if (response.status === 204) {
      return { data: null, error: null, status: 204 };
    }
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok) {
      const payload = json as { message?: string } | null;
      return {
        data: null,
        error: new Error(payload?.message || response.statusText),
        status: response.status,
      };
    }
    return { data: json as T, error: null, status: response.status };
  } catch (e) {
    return {
      data: null,
      error: new Error(e instanceof Error ? e.message : "Erro de rede"),
      status: 0,
    };
  }
}

export const iam = {
  me: () => iamFetch<IamMe>("/me"),
  permissionCatalog: () => iamFetch<{ catalog: Record<string, string> }>("/permissions"),
  listRoles: () => iamFetch<IamRole[]>("/roles"),
  createRole: (body: Partial<IamRole> & { slug: string; name: string }) =>
    iamFetch<IamRole>("/roles", { method: "POST", body: JSON.stringify(body) }),
  updateRole: (slug: string, body: Partial<IamRole>) =>
    iamFetch<IamRole>(`/roles/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRole: (slug: string) => iamFetch<void>(`/roles/${slug}`, { method: "DELETE" }),
  listUsers: () => iamFetch<IamUser[]>("/users"),
  createUser: (body: {
    email: string;
    password: string;
    display_name?: string;
    role: string;
    consultant_id?: string | null;
  }) => iamFetch<IamUser>("/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (
    id: string,
    body: {
      email?: string;
      display_name?: string;
      password?: string;
      role?: string;
      consultant_id?: string | null;
    },
  ) => iamFetch<IamUser>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: string) => iamFetch<void>(`/users/${id}`, { method: "DELETE" }),
};
