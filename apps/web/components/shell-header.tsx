import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface ShellHeaderProps {
  /** The page's h1 at ≥ lg (the AppBar's h1 is hidden there). */
  title: ReactNode;
  /** One line of context: "31 members · You're the admin". */
  context?: ReactNode;
  /** Child pages (L4–L7): link back to the parent, labelled with its name ("UP Sining"). */
  back?: { href: string; label: ReactNode };
  /**
   * THE primary action the PinnedFooter holds on compact (still one primary per screen), plus
   * at most a secondary before it. Buttons render at their natural width here.
   */
  actions?: ReactNode;
  /** id on the h1, e.g. for aria-labelledby. */
  titleId?: string;
  className?: string;
}

/**
 * Desktop page header (lihim-UIUX-SPEC.md §3 "Page header"): back link, title, context line,
 * actions on the right. Pass it to `<Screen header={…}>`, which shows it as a full-width band
 * at ≥ lg inside a shell only. Not the in-content `PageHeader` (hero + heading).
 */
export function ShellHeader({ title, context, back, actions, titleId, className }: ShellHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-2", className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-2 inline-flex min-h-10 items-center gap-1.5 self-start rounded-md px-2 text-label text-text-2 transition-colors duration-fast hover:text-text-1"
        >
          <Icon icon={ArrowLeft} size={18} />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id={titleId} className="text-title break-words text-text-1">
            {title}
          </h1>
          {context && <p className="text-body text-text-2">{context}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3 [&>*]:w-auto">{actions}</div>}
      </div>
    </header>
  );
}
