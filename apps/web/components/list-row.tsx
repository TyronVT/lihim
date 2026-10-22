import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface ListRowProps {
  title: ReactNode;
  /** Secondary line (caption): member count, closing time… */
  meta?: ReactNode;
  /**
   * R10 poll card: a StatusPill shown at the START of the meta row, so the title gets the full
   * width. Pair with `trailing={null}` for no chevron:
   * `<ListRow href title={q} status={<StatusPill …/>} meta="Today 10:00 AM · 16 of 31 answered" trailing={null} />`
   */
  status?: ReactNode;
  /** Leading slot (StatusPill, small icon). No avatars — Lihim never shows faces/initials. */
  leading?: ReactNode;
  /** Trailing slot (role chip, overflow button). Defaults to a chevron when `href` is set; `null` = nothing. */
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Tappable card row (≥ 56 px): group switcher, poll cards on L3, roster rows on L4.
 * Titles wrap to two lines (poll questions get cut to a word or two at 360 px otherwise).
 * Renders a Link with `href`, a button with `onClick`, otherwise a plain div.
 */
export function ListRow({ title, meta, status, leading, trailing, href, onClick, className }: ListRowProps) {
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-body font-medium break-words text-text-1">{title}</span>
        {status ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-2">
            {status}
            {meta}
          </span>
        ) : (
          meta && <span className="text-caption text-text-2">{meta}</span>
        )}
      </span>
      {trailing === undefined ? (href ? <Icon icon={ChevronRight} className="shrink-0 text-text-3" /> : null) : trailing}
    </>
  );
  const cls = cn(
    "flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left shadow-raised",
    (href || onClick) && "transition-colors duration-fast hover:bg-surface-raised",
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}
