import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, LogOut, UserCircle } from "lucide-react";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type UserAccountMenuProps = {
  email?: string;
  displayName?: string;
  roleLabel?: string;
  compact?: boolean;
  className?: string;
};

export function UserAccountMenu({
  email,
  displayName,
  roleLabel = "Usuário",
  compact = false,
  className,
}: UserAccountMenuProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.auth.signOut();
    await navigate({ to: "/login", replace: true });
  };

  const initial = (displayName || email)?.[0]?.toUpperCase() ?? "?";

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className={cn("h-9 w-9 rounded-lg", className)}>
            <span className="text-xs font-semibold uppercase">{initial}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="truncate font-medium">{displayName || email}</div>
            {displayName && email ? (
              <div className="truncate text-xs text-muted-foreground">{email}</div>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings/profile">
              <UserCircle className="h-4 w-4 mr-2" />
              Meu perfil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleLogout()}>
            <LogOut className="h-4 w-4 mr-2" />
            Encerrar sessão
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Link
        to="/settings/profile"
        className="block px-3 py-2 rounded-lg bg-sidebar-accent/40 border border-sidebar-border hover:bg-sidebar-accent/60 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-semibold uppercase">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate text-foreground/90">{displayName || email}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Activity className="h-2.5 w-2.5 text-primary" /> {roleLabel}
            </div>
            {displayName && email ? (
              <div className="text-[10px] text-muted-foreground truncate mt-0.5">{email}</div>
            ) : null}
          </div>
        </div>
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground hover:text-foreground"
        onClick={() => void handleLogout()}
      >
        <LogOut className="h-4 w-4 mr-2" /> Encerrar sessão
      </Button>
    </div>
  );
}
