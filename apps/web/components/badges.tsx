import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import type { PollStatus } from "@/lib/data/types";
import { formatCount } from "@/lib/format";
import type { PollPillStatus } from "@/lib/poll";
import { Icon } from "./icons";

export interface VerifiedBadgeProps {
  /** App poll id → links to the public /verify/[pollId] page (L9). */
  pollId: string;
  /**
   * R15: pass the poll's status and the badge renders only once it's "closed" (L9 covers closed
   * polls only). While open it renders `whileOpen` instead — e.g.
   * `<p className="text-caption text-text-2">{copy.results.verifyAfterClose}</p>`. Omit to always show.
   */
  status?: PollStatus;
  whileOpen?: ReactNode;
  className?: string;
}

/**
 * Pill: shield-check + "Every vote verified", --success on --surface-raised. Tap → L9.
 * The link box is 48 px tall (R9) around the 36 px pill.
 */
export function VerifiedBadge({ pollId, status, whileOpen = null, className }: VerifiedBadgeProps) {
  if (status !== undefined && status !== "closed") return <>{whileOpen}</>;
  return (
    <Link
      href={`/verify/${encodeURIComponent(pollId)}`}
      className={cn("group/badge inline-flex min-h-12 items-center self-start rounded-full", className)}
    >
      <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-surface-raised px-3 py-1.5 text-label text-success shadow-raised transition-opacity duration-fast group-hover/badge:opacity-90">
        <Icon icon="verified" size={16} />
        {copy.results.verified}
      </span>
    </Link>
  );
}

export interface CountBadgeProps {
  count: number;
  /** Accessible words for the number, e.g. copy.shell.openPollsBadge(2) → "2 open polls". */
  label: string;
  /** Show `label` itself in the pill ("2 open polls", Home rows) instead of the bare number (sidebar). */
  words?: boolean;
  className?: string;
}

/** Small --text-1 count pill (open polls on Home rows and the sidebar). Reads at a glance; never colour-only. */
export function CountBadge({ count, label, words, className }: CountBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border-control text-caption font-medium text-text-1 tabular",
        words ? "px-2" : "px-1.5",
        className,
      )}
    >
      {words ? (
        label
      ) : (
        <>
          <span aria-hidden>{formatCount(count)}</span>
          <span className="sr-only">{label}</span>
        </>
      )}
    </span>
  );
}

const STATUS: Record<PollPillStatus, { label: string; className: string; dot?: boolean; icon?: "closing" | "alert" }> = {
  // P6: a draft is a poll whose create transaction is in flight — "Opening…", never "Draft".
  draft: { label: copy.status.draft, className: "text-text-3 border-border" },
  "didnt-open": { label: copy.status.didntOpen, className: "text-danger border-danger/40", icon: "alert" },
  open: { label: copy.status.open, className: "text-text-1 border-border-control", dot: true },
  "closing-soon": { label: copy.status.closingSoon, className: "text-warning border-warning/40", icon: "closing" },
  closed: { label: copy.status.closed, className: "text-text-2 border-border" },
};

export interface StatusPillProps {
  /** Use `pollDisplayStatus(poll)` from lib/poll.ts (closing-soon, and "didnt-open" for failed drafts). */
  status: PollPillStatus;
  className?: string;
}

/**
 * Opening… (--text-3) · Didn't open (--danger + icon) · Open (--text-1 + dot) ·
 * Closing soon (--warning + clock) · Closed (--text-2).
 */
export function StatusPill({ status, className }: StatusPillProps) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-caption font-medium",
        s.className,
        className,
      )}
    >
      {s.dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {s.icon && <Icon icon={s.icon} size={14} />}
      {s.label}
    </span>
  );
}
