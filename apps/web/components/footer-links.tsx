import Link from "next/link";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";
import { HIDE_IN_SHELL_LG } from "./shell-classes";

export interface FooterLinksProps {
  /** Add the "Settings" row (Home, R12). */
  settings?: boolean;
  className?: string;
}

const row =
  "flex min-h-12 items-center gap-3 rounded-md px-1 text-label text-text-2 transition-colors duration-fast hover:text-text-1";

/**
 * The footer row (R14): eye-off + "Who can see what" as a 48 px row at the end of Home, L2,
 * L3, L5, L6, L7 — the app's main trust promise, never a tiny loose link. Optional Settings row.
 * Hidden at ≥ lg inside a shell, where the sidebar (or the focused top bar) has both links.
 */
export function FooterLinks({ settings, className }: FooterLinksProps) {
  return (
    <nav aria-label={copy.shell.footerLabel} className={cn("flex flex-col", HIDE_IN_SHELL_LG, className)}>
      <Link href="/privacy" className={row}>
        <Icon icon="anonymous" className="shrink-0" />
        <span className="flex-1">{copy.shell.privacy}</span>
        <Icon icon="chevronRight" className="shrink-0 text-text-3" />
      </Link>
      {settings && (
        <Link href="/settings" className={cn(row, "border-t border-border")}>
          <Icon icon="settings" className="shrink-0" />
          <span className="flex-1">{copy.shell.settings}</span>
          <Icon icon="chevronRight" className="shrink-0 text-text-3" />
        </Link>
      )}
    </nav>
  );
}
