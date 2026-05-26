import { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONE_RING: Record<string, string> = {
  default: "before:bg-primary/40",
  warning: "before:bg-warning/60",
  destructive: "before:bg-destructive/60",
  success: "before:bg-success/60",
  info: "before:bg-info/60",
};

const TONE_ICON: Record<string, string> = {
  default: "text-primary",
  warning: "text-warning",
  destructive: "text-destructive",
  success: "text-success",
  info: "text-info",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "warning" | "destructive" | "success" | "info";
  delta?: { value: string; direction?: "up" | "down" | "flat" };
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl surface-glass p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_oklch(0_0_0_/_0.7)]",
        "before:absolute before:left-0 before:top-5 before:bottom-5 before:w-[2px] before:rounded-r-full",
        TONE_RING[tone],
      )}
    >
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-colors" />
      <div className="flex items-start justify-between gap-3 relative">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
          {label}
        </div>
        {icon && (
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center bg-background/40 border border-border/60", TONE_ICON[tone])}>
            {icon}
          </div>
        )}
      </div>
      <div className="mt-3 font-display text-[2.25rem] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {hint && <div className="text-xs text-muted-foreground/90 truncate">{hint}</div>}
        {delta && (
          <span
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-md tabular-nums",
              delta.direction === "up" && "text-success bg-success/10",
              delta.direction === "down" && "text-destructive bg-destructive/10",
              (!delta.direction || delta.direction === "flat") && "text-muted-foreground bg-muted/40",
            )}
          >
            {delta.value}
          </span>
        )}
      </div>
    </div>
  );
}
