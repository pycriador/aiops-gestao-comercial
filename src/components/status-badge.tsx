import { cn } from "@/lib/utils";
import { STATUS_TONE, type NegotiationStatus } from "@/lib/constants";

const TONE_CLASS: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info/10 text-info border-info/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  success: "bg-success/15 text-success border-success/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
};

export function StatusBadge({ status, className }: { status: NegotiationStatus | string; className?: string }) {
  const tone = STATUS_TONE[status as NegotiationStatus] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap", TONE_CLASS[tone], className)}>
      {status}
    </span>
  );
}
