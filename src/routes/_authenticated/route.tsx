import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { api } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { CurrentUserProvider } from "@/providers/current-user-provider";
import { BackendOfflineBanner } from "@/components/backend-offline-banner";
import { UserAccountMenu } from "@/components/user-account-menu";
import { LayoutDashboard, Briefcase, Upload, Settings, Users, MessageSquare, UserCircle } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await api.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
  always?: boolean;
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Mission Control", icon: LayoutDashboard, permission: "portfolio.read" },
  { to: "/portfolio", label: "Carteira", icon: Briefcase, permission: "portfolio.read" },
  { to: "/settings/slack", label: "Slack Bot", icon: MessageSquare, permission: "settings.slack" },
  { to: "/import", label: "Importar", icon: Upload, permission: "import.run" },
  { to: "/consultants", label: "Consultores", icon: Users, permission: "consultants.read" },
  { to: "/settings/hubspot", label: "HubSpot", icon: Settings, permission: "settings.hubspot" },
  { to: "/settings/users", label: "Usuários", icon: Users, permission: "users.manage" },
  { to: "/settings/profile", label: "Meu perfil", icon: UserCircle, always: true },
];

function AuthedLayout() {
  return (
    <CurrentUserProvider>
      <AuthedLayoutShell />
    </CurrentUserProvider>
  );
}

function AuthedLayoutShell() {
  const { user, displayName, roles, hasPermission, loading } = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const roleLabel = roles.includes("admin")
    ? "Admin"
    : roles.includes("manager")
      ? "Gestor"
      : roles[0] || "Usuário";

  const visibleNav = NAV.filter((item) => {
    if (item.always) return true;
    if (loading || !item.permission) return false;
    return hasPermission(item.permission);
  });

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <header className="lg:hidden flex items-center justify-between gap-3 px-4 h-14 border-b border-border bg-sidebar/80 backdrop-blur-xl">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-background/60 border border-border/60 flex items-center justify-center p-1">
            <Logo />
          </div>
          <span className="font-display font-semibold text-sm truncate">Loft · Carteira</span>
        </div>
        <UserAccountMenu
          compact
          email={user?.email}
          displayName={displayName}
          roleLabel={roleLabel}
        />
      </header>

      <aside className="hidden lg:flex w-64 flex-col bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border relative">
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
          {visibleNav.map((item) => {
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
                    : "text-sidebar-foreground/75 hover:text-foreground hover:bg-sidebar-accent/60",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary shadow-[0_0_12px_var(--primary)]" />
                )}
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <UserAccountMenu email={user?.email} displayName={displayName} roleLabel={roleLabel} />
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <BackendOfflineBanner />
        <Outlet />
      </main>
    </div>
  );
}
