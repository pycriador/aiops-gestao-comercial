import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Building2, LayoutDashboard, Briefcase, Upload, Settings, LogOut, Users, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // Only enforce on the client — during SSR there's no session storage,
    // which would cause a redirect-to-login flicker on every navigation.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Carteira", icon: Briefcase },
  { to: "/bot", label: "Bot WhatsApp", icon: MessageSquare, managerOnly: true },
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

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="h-16 flex items-center gap-2 px-6 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">Carteira</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Imobiliárias</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.filter((n) => !n.adminOnly || isAdmin).filter((n) => !n.managerOnly || isAdmin || isManager).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs">
            <div className="font-medium truncate">{user?.email}</div>
            <div className="text-muted-foreground">{isAdmin ? "Admin" : isManager ? "Gestor" : "Consultor"}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
