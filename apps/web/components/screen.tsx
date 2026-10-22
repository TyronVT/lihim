import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ScreenProps extends HTMLAttributes<HTMLElement> {
  /** 720 px max width instead of 480 (L9's vote table only). */
  wide?: boolean;
  /** Adds bottom padding so content clears a <PinnedFooter>. */
  withFooter?: boolean;
  children: ReactNode;
}

/**
 * Page body: <main>, centred, max-width 480 (720 when `wide`), 16 px gutters,
 * 32 px section rhythm via `gap-section` on direct children.
 */
export function Screen({ wide, withFooter, className, children, ...rest }: ScreenProps) {
  return (
    <main
      id="main"
      className={cn(
        "mx-auto flex w-full flex-col gap-section px-gutter pt-4",
        wide ? "max-w-wide" : "max-w-app",
        withFooter ? "pb-footer" : "pb-safe",
        className,
      )}
      {...rest}
    >
      {children}
    </main>
  );
}

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Section heading (`heading` type). Optional for unlabeled groups. */
  title?: ReactNode;
  /** Right-aligned slot next to the title (e.g. a "See all" link). */
  action?: ReactNode;
  children: ReactNode;
}

/** A titled block within a Screen; cards inside stack with a 12 px gap. */
export function Section({ title, action, className, children, ...rest }: SectionProps) {
  return (
    <section className={cn("flex flex-col gap-card-gap", className)} {...rest}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="text-heading text-text-1">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` uses --surface-raised (menus, emphasised blocks). */
  tone?: "surface" | "raised";
}

/** Card — surface, 1 px decorative border, radius 16, padding 16, lit top edge / light shadow. */
export function Card({ tone = "surface", className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-card shadow-raised",
        tone === "raised" ? "bg-surface-raised" : "bg-surface",
        className,
      )}
      {...rest}
    />
  );
}
