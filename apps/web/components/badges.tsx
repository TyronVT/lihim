import Link from "next/link";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import type { PollDisplayStatus } from "@/lib/poll";
import { Icon } from "./icons";

export interface VerifiedBadgeProps {
  /** App poll id → links to the public /verify/[pollId] page (L9). */
  pollId: string;
  className?: string;
}

/** Pill: shield-check + "Every vote verified", --success on --surface-raised. Tap → L9. */
export function VerifiedBadge({ pollId, className }: VerifiedBadgeProps) {
  return (
    <Link
      href={`/verify/${encodeURIComponent(pollId)}`}
      className={cn(
        "relative inline-flex min-h-9 items-center gap-2 self-start rounded-full bg-surface-raised px-3 py-1.5 text-label text-success shadow-raised",
        // 36 px pill, 48 px tap target.
        "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
        "transition-opacity duration-fast hover:opacity-90",
        className,
      )}
    >
      <Icon icon="verified" size={16} />
      {copy.results.verified}
    </Link>
  );
}

const STATUS: Record<PollDisplayStatus, { label: string; className: string; dot?: boolean; icon?: "closing" }> = {
  draft: { label: copy.status.draft, className: "text-text-3 border-border" },
  open: { label: copy.status.open, className: "text-text-1 border-border-control", dot: true },
  "closing-soon": { label: copy.status.closingSoon, className: "text-warning border-warning/40", icon: "closing" },
  closed: { label: copy.status.closed, className: "text-text-2 border-border" },
};

export interface StatusPillProps {
  /** Use `pollDisplayStatus(poll)` from lib/poll.ts to derive closing-soon. */
  status: PollDisplayStatus;
  className?: string;
}

/** Draft (--text-3) · Open (--text-1 + dot) · Closing soon (--warning + clock) · Closed (--text-2). */
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
