import type { IamMe } from "@/lib/api/iam";

const IAM_CACHE_KEY = "agency-watch-iam-me";

export function readIamCache(userId: string): IamMe | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(IAM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IamMe;
    return parsed.user_id === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeIamCache(me: IamMe): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(IAM_CACHE_KEY, JSON.stringify(me));
}

export function clearIamCache(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(IAM_CACHE_KEY);
}
