import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export type StatusRowState = "running" | "done" | "failed";

export interface StatusRowProps {
  state: StatusRowState;
  /** "Opening…" / "Adding 3 new members…" / "Didn't open" — words always, never a bare line. */
  title: ReactNode;
  /** Second line: "Usually under a minute." / "They can't answer new polls yet." */
  body?: ReactNode;
  /** Failed: the recovery action, e.g. `<Button variant="secondary" block={false} icon="retry">Try again</Button>`. */
  action?: ReactNode;
  /** Right slot, e.g. an OverflowMenu with "Discard" (P6). */
  trailing?: ReactNode;
  /**
   * "danger" (default) colours a failed row's title; "neutral" keeps it --text-1 when the title is a
   * name (L3: the poll title) and a pill in `body` already says "Didn't open".
   */
  failedTitle?: "danger" | "neutral";
  className?: string;
}

/**
 * Status of a background job (lihim-UIUX-SPEC.md §6): L4 "Adding members" (R6) and L3
 * "Opening…" rows (P6).
 * - running → --text-1 title, indeterminate silver line along the bottom (static under reduced
 *   motion; the words carry it), announced politely.
 * - done    → --success check + words.
 * - failed  → --danger icon + title, body, and the action button; announced as an alert.
 */
export function StatusRow({ state, title, body, action, trailing, failedTitle = "danger", className }: StatusRowProps) {
  return (
    <div
      role={state === "failed" ? "alert" : "status"}
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-lg border bg-surface p-card shadow-raised",
        state === "failed" ? "border-danger/40" : "border-border",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {state === "done" && <Icon icon="success" className="mt-0.5 shrink-0 text-success" />}
        {state === "failed" && <Icon icon="alert" className="mt-0.5 shrink-0 text-danger" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className={cn("text-body font-medium break-words", state === "failed" && failedTitle === "danger" ? "text-danger" : "text-text-1")}>{title}</p>
          {body && <p className="text-caption text-text-2">{body}</p>}
        </div>
        {trailing && <div className="-my-2 -mr-2 shrink-0">{trailing}</div>}
      </div>
      {action && <div className="flex flex-wrap gap-3">{action}</div>}
      {state === "running" && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-bar-track">
          <span className="absolute inset-y-0 left-0 w-2/5 animate-progress-indeterminate bg-accent motion-reduce:w-full motion-reduce:opacity-40" />
        </span>
      )}
    </div>
  );
}
