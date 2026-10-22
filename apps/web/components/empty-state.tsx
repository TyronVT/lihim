import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Illustration, type IllustrationName } from "./illustration";

export interface EmptyStateProps {
  /**
   * 96 px hero. Omit on screens that already spend their one illustration elsewhere
   * (e.g. L3's member count block): the state then renders as a quiet card.
   */
  illustration?: IllustrationName;
  /** One line. */
  title: string;
  /** One line. */
  body?: string;
  /** One action (usually a secondary Button; the screen's primary lives in PinnedFooter). */
  action?: ReactNode;
  className?: string;
}

/** Hero illustration at 96 px (optional), heading, body, one action — centred. */
export function EmptyState({ illustration, title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 text-center",
        illustration ? "px-4 py-10" : "rounded-lg border border-border bg-surface p-card py-6 shadow-raised",
        className,
      )}
    >
      {illustration && <Illustration name={illustration} size={96} />}
      <div className="flex flex-col gap-1">
        <p className="text-heading text-text-1">{title}</p>
        {body && <p className="text-body text-text-2">{body}</p>}
      </div>
      {action && <div className="w-full max-w-xs">{action}</div>}
    </div>
  );
}
