import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type AuthUser } from "@/lib/api/client";
import { getCachedSessionUser, getUserDisplayName, hasActiveSession } from "@/lib/api/auth";
import { iam } from "@/lib/api/iam";
import { isBackendUnavailable } from "@/lib/backend-health";
import { readIamCache, writeIamCache } from "@/lib/session-cache";

export type AppRole = "admin" | "manager" | "consultant" | string;

type CurrentUserContextValue = {
  user: AuthUser | null;
  displayName: string;
  roles: AppRole[];
  permissions: string[];
  dataScope: "all" | "own";
  hasPermission: (permission: string) => boolean;
  isAdmin: boolean;
  isManager: boolean;
  isConsultant: boolean;
  loading: boolean;
  refreshUser: () => Promise<void>;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

function applyIamState(
  userId: string,
  setRoles: (roles: AppRole[]) => void,
  setPermissions: (permissions: string[]) => void,
  setDataScope: (scope: "all" | "own") => void,
) {
  const cached = readIamCache(userId);
  if (!cached) return false;
  setRoles(cached.roles as AppRole[]);
  setPermissions(cached.permissions);
  setDataScope(cached.data_scope);
  return true;
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getCachedSessionUser());
  const [roles, setRoles] = useState<AppRole[]>(() => {
    const cachedUser = getCachedSessionUser();
    return cachedUser ? (readIamCache(cachedUser.id)?.roles as AppRole[]) ?? [] : [];
  });
  const [permissions, setPermissions] = useState<string[]>(() => {
    const cachedUser = getCachedSessionUser();
    return cachedUser ? readIamCache(cachedUser.id)?.permissions ?? [] : [];
  });
  const [dataScope, setDataScope] = useState<"all" | "own">(() => {
    const cachedUser = getCachedSessionUser();
    return cachedUser ? readIamCache(cachedUser.id)?.data_scope ?? "own" : "own";
  });
  const [loading, setLoading] = useState(true);
  const loadGeneration = useRef(0);

  const load = useCallback(async (sessionUser: AuthUser | null, generation: number) => {
    if (generation !== loadGeneration.current) return;

    if (!sessionUser) {
      const { data } = await api.auth.getSession();
      sessionUser = data.session?.user ?? null;
    }

    if (generation !== loadGeneration.current) return;

    if (!sessionUser) {
      setUser(null);
      setRoles([]);
      setPermissions([]);
      setDataScope("own");
      setLoading(false);
      return;
    }

    setUser(sessionUser);
    applyIamState(sessionUser.id, setRoles, setPermissions, setDataScope);

    const { data: me, status } = await iam.me();
    if (generation !== loadGeneration.current) return;

    if (me) {
      writeIamCache(me);
      setRoles(me.roles as AppRole[]);
      setPermissions(me.permissions);
      setDataScope(me.data_scope);
      setLoading(false);
      return;
    }

    if (isBackendUnavailable(status)) {
      applyIamState(sessionUser.id, setRoles, setPermissions, setDataScope);
      setLoading(false);
      return;
    }

    const { data } = await api.from("user_roles").select("role").eq("user_id", sessionUser.id);
    if (generation !== loadGeneration.current) return;
    setRoles((data ?? []).map((r: { role: string }) => r.role as AppRole));
    setPermissions([]);
    setDataScope("own");
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const cached = getCachedSessionUser();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
    if (!hasActiveSession()) {
      await load(null, generation);
      return;
    }
    const { data } = await api.auth.getUser();
    if (generation !== loadGeneration.current) return;
    await load(data.user ?? cached, generation);
  }, [load]);

  useEffect(() => {
    let mounted = true;
    const generation = ++loadGeneration.current;

    void api.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (!hasActiveSession()) {
        void load(null, generation);
        return;
      }
      void load(data.user ?? getCachedSessionUser(), generation);
    });

    const {
      data: { subscription },
    } = api.auth.onAuthStateChange((event, session) => {
      if (event === "USER_UPDATED" && session?.user) {
        loadGeneration.current += 1;
        setUser(session.user);
        setLoading(false);
        return;
      }
      if (event === "SIGNED_OUT") {
        loadGeneration.current += 1;
        void load(null, loadGeneration.current);
        return;
      }
      void load(session?.user ?? null, ++loadGeneration.current);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [load]);

  const hasPermission = useCallback(
    (permission: string) => permissions.includes("*") || permissions.includes(permission),
    [permissions],
  );

  const value = useMemo<CurrentUserContextValue>(() => {
    const isAdmin = roles.includes("admin") || hasPermission("users.manage");
    const isManager = roles.includes("manager") || dataScope === "all";
    const isConsultant = roles.includes("consultant") || dataScope === "own";

    return {
      user,
      displayName: getUserDisplayName(user),
      roles,
      permissions,
      dataScope,
      hasPermission,
      isAdmin,
      isManager,
      isConsultant,
      loading,
      refreshUser,
    };
  }, [user, roles, permissions, dataScope, hasPermission, loading, refreshUser]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (!context) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider");
  }
  return context;
}
