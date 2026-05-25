import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "consultant";

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (u: User | null) => {
      if (!mounted) return;
      setUser(u);
      if (!u) {
        setRoles([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.id);
      if (!mounted) return;
      setRoles((data ?? []).map((r: any) => r.role as AppRole));
      setLoading(false);
    };
    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user ?? null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  const isConsultant = roles.includes("consultant");
  return { user, roles, isAdmin, isManager, isConsultant, loading };
}
