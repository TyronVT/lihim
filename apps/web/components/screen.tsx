import type { HTMLAttributes, ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { NO_FOOTER_PAD_IN_SHELL_LG, SHOW_IN_SHELL_LG } from "./shell-classes";

/** Main-column cap at ≥ lg (lihim-UIUX-SPEC.md §3). Compact is 480, medium 560 for all. */
export type ScreenWidth = "page" | "form" | "reading";

// Static class maps so Tailwind sees every class. [no rail, with rail at ≥ xl].
const WIDTH: Record<ScreenWidth | "wide", [string, string]> = {
  /** Expanded main column: 720. */
  page: ["max-w-app md:max-w-form lg:max-w-wide", "xl:max-w-[calc(var(--container-wide)+var(--spacing-section)+var(--spacing-rail))]"],
  /** Forms (L1, L5, L10, L6's answer column) and the focused shell: 560. */
  form: ["max-w-app md:max-w-form", "xl:max-w-[calc(var(--container-form)+var(--spacing-section)+var(--spacing-rail))]"],
  /** L8 reading column: 640. */
  reading: ["max-w-app md:max-w-form lg:max-w-reading", "xl:max-w-[calc(var(--container-reading)+var(--spacing-section)+var(--spacing-rail))]"],
  /** L9: 720 below lg, 960 at ≥ lg. */
  wide: ["max-w-wide lg:max-w-record", "xl:max-w-record"],
};

const RAIL_COLS: Record<ScreenWidth | "wide", string> = {
  page: "xl:grid-cols-[minmax(0,var(--container-wide))_var(--spacing-rail)]",
  form: "xl:grid-cols-[minmax(0,var(--container-form))_var(--spacing-rail)]",
  reading: "xl:grid-cols-[minmax(0,var(--container-reading))_var(--spacing-rail)]",
  wide: "xl:grid-cols-[minmax(0,1fr)_var(--spacing-rail)]",
};

export interface ScreenProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** 720 px max width instead of 480 (L9's vote table only); 960 at ≥ lg. Overrides `width`. */
  wide?: boolean;
  /** Main-column cap at ≥ lg: page 720 (default), form 560, reading 640 (L8). */
  width?: ScreenWidth;
  /** Adds bottom padding so content clears a <PinnedFooter> (dropped at ≥ lg inside a shell). */
  withFooter?: boolean;
  /**
   * Desktop page header, usually `<ShellHeader … />`. Rendered as a full-width band above
   * <main>, only at ≥ lg inside a shell (where the AppBar is hidden). Holds the page's h1 there.
   */
  header?: ReactNode;
  /**
   * Right rail (320 px) beside the main column at ≥ xl (L3, L5, L7, L9). Below xl it stacks
   * with the content, `railPlacement` deciding where. Content order follows compact.
   */
  rail?: ReactNode;
  /** Where the rail stacks below xl: "after" the content (default) or "before" it (L3's strip). */
  railPlacement?: "before" | "after";
  /**
   * Hide the rail below a breakpoint instead of stacking it there: "xl" = only beside the column
   * (L1's "How groups work"), "lg" = from 1024 up, stacked below xl (L5's live preview). Default:
   * shown at every width.
   */
  railFrom?: "lg" | "xl";
  /** Accessible name of the rail's <aside>. Default "Details". */
  railLabel?: string;
  children: ReactNode;
}

/**
 * Page body: <main>, centred, 16 px gutters (32 at ≥ lg), 32 px section rhythm via `gap-section`
 * on direct children. Width: 480 compact, 560 medium, then `width` at ≥ lg (720 default).
 *
 * Desktop pattern (inside AppShell/FocusedShell):
 *   <AppBar title="Members" backHref={…} />                       // compact/medium only
 *   <Screen withFooter header={<ShellHeader title="Members" back={…} actions={primary} />} rail={…}>
 *     …
 *   </Screen>
 *   <PinnedFooter>{primary}</PinnedFooter>                         // compact/medium only
 */
export function Screen({
  wide,
  width = "page",
  withFooter,
  header,
  rail,
  railPlacement = "after",
  railFrom,
  railLabel = copy.shell.railLabel,
  className,
  children,
  ...rest
}: ScreenProps) {
  const key = wide ? "wide" : width;
  const [base, withRail] = WIDTH[key];
  const widthCls = cn(base, rail && withRail);
  const aside = rail && (
    <aside
      aria-label={railLabel}
      className={cn(
        "min-w-0 flex-col gap-section xl:sticky xl:top-8 xl:col-start-2 xl:row-start-1",
        railFrom === "xl" ? "hidden xl:flex" : railFrom === "lg" ? "hidden lg:flex" : "flex",
      )}
    >
      {rail}
    </aside>
  );
  return (
    <>
      {header && (
        <div className={cn(SHOW_IN_SHELL_LG, "border-b border-border")}>
          <div className={cn("mx-auto w-full px-8 pt-8 pb-6", widthCls)}>{header}</div>
        </div>
      )}
      <main
        id="main"
        className={cn(
          "mx-auto flex w-full flex-col gap-section px-gutter pt-4 lg:px-8 lg:pt-8",
          widthCls,
          withFooter ? cn("pb-footer", NO_FOOTER_PAD_IN_SHELL_LG) : "pb-safe lg:pb-14",
          className,
        )}
        {...rest}
      >
        {rail ? (
          <div className={cn("grid grid-cols-1 gap-section xl:items-start", RAIL_COLS[key])}>
            {railPlacement === "before" && aside}
            <div className="flex min-w-0 flex-col gap-section xl:col-start-1 xl:row-start-1">{children}</div>
            {railPlacement === "after" && aside}
          </div>
        ) : (
          children
        )}
      </main>
    </>
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
