import { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="relative border-b border-border/60 bg-background/40 backdrop-blur-xl sticky top-0 z-20">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="px-6 lg:px-10 py-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10px] uppercase tracking-[0.22em] text-primary/80 mb-1.5 flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
