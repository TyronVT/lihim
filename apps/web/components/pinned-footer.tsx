import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { HIDE_IN_SHELL_LG } from "./shell-classes";

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
 * Inside a shell it is removed at ≥ lg: put the same primary in the ShellHeader `actions`
 * (lihim-UIUX-SPEC.md §3 "Pinned footer → Removed; action moves to page header").
 */
export function PinnedFooter({ children, wide, className }: PinnedFooterProps) {
  return (
    <div className={cn("fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg", HIDE_IN_SHELL_LG)}>
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-3 px-gutter pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]",
          wide ? "max-w-wide" : "max-w-app md:max-w-form",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
