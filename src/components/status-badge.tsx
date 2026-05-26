import { cn } from "@/lib/utils";
import { STATUS_TONE, type NegotiationStatus } from "@/lib/constants";

const TONE_CLASS: Record<string, string> = {
  neutral: "bg-muted/40 text-muted-foreground border-border/60 [--dot:var(--muted-foreground)]",
  info: "bg-info/10 text-info border-info/30 [--dot:var(--info)]",
  warning: "bg-warning/10 text-warning border-warning/30 [--dot:var(--warning)]",
  success: "bg-success/10 text-success border-success/30 [--dot:var(--success)]",
  destructive: "bg-destructive/10 text-destructive border-destructive/30 [--dot:var(--destructive)]",
};

export function StatusBadge({ status, className }: { status: NegotiationStatus | string; className?: string }) {
  const tone = STATUS_TONE[status as NegotiationStatus] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap tracking-wide",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--dot)", boxShadow: "0 0 8px var(--dot)" }}
      />
      {status}
    </span>
  );
}
