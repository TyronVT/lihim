import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PinnedFooterProps {
  /** Usually one primary <Button>; a caption/secondary line above it is fine. */
  children: ReactNode;
  /** Match `<Screen wide>`. */
  wide?: boolean;
  className?: string;
}

/**
 * Bottom-pinned action area: 16 px padding + safe-area inset, --bg behind it so
 * scrolled content doesn't show through. Pair with `<Screen withFooter>`.
 */
export function PinnedFooter({ children, wide, className }: PinnedFooterProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg">
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-3 px-gutter pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]",
          wide ? "max-w-wide" : "max-w-app",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
