import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { LayoutDashboard, Briefcase, Upload, Settings, LogOut, Users, MessageSquare, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Mission Control", icon: LayoutDashboard },
  { to: "/portfolio", label: "Carteira", icon: Briefcase },
  { to: "/settings/slack", label: "Slack Bot", icon: MessageSquare, managerOnly: true },
  { to: "/import", label: "Importar", icon: Upload, adminOnly: true },
  { to: "/consultants", label: "Consultores", icon: Users, managerOnly: true },
  { to: "/settings/hubspot", label: "HubSpot", icon: Settings, managerOnly: true },
  { to: "/settings/users", label: "Usuários", icon: Users, adminOnly: true },
];

function AuthedLayout() {
  const { user, isAdmin, isManager } = useCurrentUser();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const role = isAdmin ? "Admin" : isManager ? "Gestor" : "Consultor";

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex w-64 flex-col bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border relative">
        {/* subtle vertical glow */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

        <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
          <div className="relative h-9 w-9 rounded-xl bg-background/60 border border-border/60 flex items-center justify-center p-1.5">
            <Logo />
          </div>
          <div className="leading-tight">
            <div className="font-display font-semibold text-sm tracking-tight">Loft</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80 flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-success animate-pulse" /> live
            </div>
          </div>
        </div>

        <div className="px-5 pt-5 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          Operação
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.filter((n) => !n.adminOnly || isAdmin).filter((n) => !n.managerOnly || isAdmin || isManager).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-sidebar-foreground/75 hover:text-foreground hover:bg-sidebar-accent/60"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary shadow-[0_0_12px_var(--primary)]" />
                )}
                <Icon className={cn("h-4 w-4 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-3 py-2 rounded-lg bg-sidebar-accent/40 border border-sidebar-border">
            <div className="flex items-center gap-2 text-xs">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-semibold uppercase">
                {user?.email?.[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate text-foreground/90">{user?.email}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Activity className="h-2.5 w-2.5 text-primary" /> {role}
                </div>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Encerrar sessão
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
