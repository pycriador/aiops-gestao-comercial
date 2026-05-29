import { redirect } from "@tanstack/react-router";
import { getCachedSessionUser } from "@/lib/api/auth";
import { isBackendUnavailable } from "@/lib/backend-health";
import { iam, iamHasAnyPermission, iamHasPermission } from "@/lib/api/iam";
import { readIamCache, writeIamCache } from "@/lib/session-cache";

function checkPermission(permissions: string[] | undefined, permission: string | string[]): boolean {
  return Array.isArray(permission)
    ? iamHasAnyPermission(permissions, permission)
    : iamHasPermission(permissions, permission);
}

function cachedPermissions(userId: string | undefined): string[] | undefined {
  if (!userId) return undefined;
  return readIamCache(userId)?.permissions;
}

export async function requireIamPermission(permission: string | string[]): Promise<void> {
  if (typeof window === "undefined") return;

  const userId = getCachedSessionUser()?.id;

  if (checkPermission(cachedPermissions(userId), permission)) {
    return;
  }

  const { data, status } = await iam.me();

  if (data?.permissions?.length) {
    writeIamCache(data);
  }

  if (checkPermission(data?.permissions, permission)) {
    return;
  }

  if (isBackendUnavailable(status) && checkPermission(cachedPermissions(userId), permission)) {
    return;
  }

  if (status === 401) {
    throw redirect({ to: "/login" });
  }

  throw redirect({ to: "/dashboard" });
}
