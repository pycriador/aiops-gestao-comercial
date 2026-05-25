import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "warning" | "destructive" | "success" | "info";
}) {
  const toneClass = {
    default: "",
    warning: "ring-warning/40",
    destructive: "ring-destructive/40",
    success: "ring-success/40",
    info: "ring-info/40",
  }[tone];
  return (
    <Card className={cn("ring-1 ring-border/60", toneClass)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
