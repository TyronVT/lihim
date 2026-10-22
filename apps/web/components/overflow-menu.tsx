"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import type { Glyph } from "./glyphs";
import { Icon, type IconName } from "./icons";

export interface OverflowMenuItem {
  label: string;
  icon?: IconName | Glyph;
  onSelect: () => void;
  /** --danger label. Destructive items must open a ConfirmSheet, never act directly. */
  destructive?: boolean;
}

export interface OverflowMenuProps {
  /** Accessible name of the 48 px trigger, e.g. "Options for Ana Reyes". */
  label?: string;
  items: OverflowMenuItem[];
  align?: "start" | "end";
  className?: string;
}

/**
 * "…" button (48 px) → small menu of 48 px items (Radix DropdownMenu). L4 uses it per
 * roster row for Remove. Non-modal so an item can hand focus straight to a ConfirmSheet
 * without the two focus traps fighting on close.
 */
export function OverflowMenu({ label = copy.common.moreOptions, items, align = "end", className }: OverflowMenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={label}
        className={cn(
          "inline-flex size-12 shrink-0 items-center justify-center rounded-md text-text-2 transition-colors duration-fast",
          "hover:bg-surface-raised hover:text-text-1 data-[state=open]:bg-surface-raised",
          className,
        )}
      >
        <Icon icon="more" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className="z-40 min-w-44 rounded-md border border-border bg-surface-raised p-1 shadow-raised data-[state=open]:animate-fade-in"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              onSelect={item.onSelect}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-label outline-none data-[highlighted]:bg-surface",
                item.destructive ? "text-danger" : "text-text-1",
              )}
            >
              {item.icon && <Icon icon={item.icon} />}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
