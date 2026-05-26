import logoUrl from "@/assets/logo.svg";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="Loft"
      className={cn("h-full w-full object-contain", className)}
    />
  );
}
