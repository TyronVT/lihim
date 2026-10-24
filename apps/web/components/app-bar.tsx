import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import type { Glyph } from "./glyphs";
import { APP_BAR_ICON_SIZE, Icon, type IconName } from "./icons";
import { HIDE_IN_SHELL_LG } from "./shell-classes";

export interface AppBarProps {
  /** Screen title, `heading` size, truncated to one line. */
  title?: ReactNode;
  /** Back target. Omit only on Home; the L3 hub goes back to APP_HOME (never "/", the landing page). */
  backHref?: string;
  /** Accessible label for the back link. Default "Back". */
  backLabel?: string;
  /** Right slot: icon buttons / overflow menu (keep ≥ 48 px targets). */
  right?: ReactNode;
  /**
   * Add a Settings (gear) link after `right`. Signed-in screens only: on compact/medium there is
   * no tab bar, so this is how Settings and Sign out stay one tap away from anywhere.
   */
  settings?: boolean;
  /** Widen the inner container to 720 to align with `<Screen wide>`. */
  wide?: boolean;
  /**
   * Keep showing at ≥ lg inside a shell. Default false: there the sidebar / focused top bar and
   * the Screen's ShellHeader replace the app bar (lihim-UIUX-SPEC.md §3).
   */
  keepOnDesktop?: boolean;
  className?: string;
}

/**
 * Top app bar: sticky, 56 px, back arrow (Lucide 24 px) + title + optional right slot.
 * There's no global tab bar; this is the only navigation chrome on compact/medium. Inside a
 * shell it hides itself at ≥ lg — give the Screen a `header={<ShellHeader …/>}` for that size.
 */
export function AppBar({
  title,
  backHref,
  backLabel = copy.common.back,
  right,
  settings,
  wide,
  keepOnDesktop,
  className,
}: AppBarProps) {
  const trailing = (right || settings) && (
    <div className="flex shrink-0 items-center gap-1 pr-1">
      {right}
      {settings && <AppBarAction label={copy.shell.settings} icon="settings" href="/settings" />}
    </div>
  );
  return (
    <header className={cn("sticky top-0 z-30 bg-bg pt-[env(safe-area-inset-top)]", !keepOnDesktop && HIDE_IN_SHELL_LG, className)}>
      <div
        className={cn(
          "mx-auto flex h-14 w-full items-center gap-1 px-1",
          wide ? "max-w-wide" : "max-w-app md:max-w-form",
          !backHref && "pl-gutter",
        )}
      >
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-md text-text-1 transition-colors duration-fast hover:bg-surface"
          >
            <Icon icon="arrowLeft" size={APP_BAR_ICON_SIZE} />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-heading text-text-1">{title}</h1>
        {trailing}
      </div>
    </header>
  );
}

export interface AppBarActionProps {
  /** Required: icon-only buttons need a name. */
  label: string;
  icon: IconName | Glyph;
  onClick?: () => void;
  href?: string;
}

/** 48 px icon button for AppBar's `right` slot (button, or link when `href`). */
export function AppBarAction({ label, icon, onClick, href }: AppBarActionProps) {
  const cls =
    "inline-flex size-12 items-center justify-center rounded-md text-text-1 transition-colors duration-fast hover:bg-surface";
  if (href)
    return (
      <Link href={href} aria-label={label} className={cls}>
        <Icon icon={icon} size={APP_BAR_ICON_SIZE} />
      </Link>
    );
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      <Icon icon={icon} size={APP_BAR_ICON_SIZE} />
    </button>
  );
}
