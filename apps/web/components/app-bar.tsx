import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { APP_BAR_ICON_SIZE, Icon } from "./icons";

export interface AppBarProps {
  /** Screen title, `heading` size, truncated to one line. */
  title?: ReactNode;
  /** Back target. Omit on top-level screens (home, L3 hub). */
  backHref?: string;
  /** Accessible label for the back link. Default "Back". */
  backLabel?: string;
  /** Right slot: icon buttons / overflow menu (keep ≥ 48 px targets). */
  right?: ReactNode;
  /** Widen the inner container to 720 to align with `<Screen wide>`. */
  wide?: boolean;
  className?: string;
}

/**
 * Top app bar: sticky, 56 px, back arrow (Lucide 24 px) + title + optional right slot.
 * There's no global tab bar; this is the only navigation chrome.
 */
export function AppBar({ title, backHref, backLabel = copy.common.back, right, wide, className }: AppBarProps) {
  return (
    <header className={cn("sticky top-0 z-30 bg-bg pt-[env(safe-area-inset-top)]", className)}>
      <div
        className={cn(
          "mx-auto flex h-14 w-full items-center gap-1 px-1",
          wide ? "max-w-wide" : "max-w-app",
          !backHref && "pl-gutter",
        )}
      >
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-md text-text-1 transition-colors duration-fast hover:bg-surface"
          >
            <Icon icon={ArrowLeft} size={APP_BAR_ICON_SIZE} />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-heading text-text-1">{title}</h1>
        {right && <div className="flex shrink-0 items-center gap-1 pr-1">{right}</div>}
      </div>
    </header>
  );
}

export interface AppBarActionProps {
  /** Required: icon-only buttons need a name. */
  label: string;
  icon: Parameters<typeof Icon>[0]["icon"];
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
