"use client";

import { useState } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { chunkHex, truncateMiddle } from "@/lib/format";
import { Button } from "./button";
import { Icon } from "./icons";
import { Sheet } from "./sheet";
import { notify } from "./toast";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    notify(copy.common.copied);
  } catch {
    notify(copy.common.copyFailed);
  }
}

/** The chip stays 36 px tall to read as a chip; this stretches each tap target to 48 px (R9). */
const HIT_48 = "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

export interface HashChipProps {
  /** Full value, e.g. 0x + 64 hex. */
  value: string;
  /** What this is ("Receipt", "Member list fingerprint") — sheet title + accessible name. */
  label: string;
  /** Characters kept at each end (head includes "0x"). Default 6 / 4 → 0x7f3a…c91e. */
  head?: number;
  tail?: number;
  className?: string;
}

/**
 * Monospace hash, middle-out truncated (never wrapped). Tap the text → full-value sheet
 * (grouped in 8-char blocks for comparing by eye); tap the copy icon → clipboard + toast.
 * The outer box is 48 px tall so both tap targets get a real 48 px (R9) without overlapping
 * neighbours; the visible chip inside stays 36.
 */
export function HashChip({ value, label, head = 6, tail = 4, className }: HashChipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cn("inline-flex h-12 w-fit max-w-full items-center", className)}>
      <span className="inline-flex h-9 max-w-full items-stretch rounded-sm bg-surface-raised font-mono text-mono text-text-1 shadow-raised">
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={label}
          trigger={
            <button
              type="button"
              className={cn("whitespace-nowrap rounded-l-sm px-2.5 tabular hover:bg-border", HIT_48)}
              aria-label={`${label}: ${truncateMiddle(value, head, tail)}. ${copy.common.showFull}`}
            >
              {truncateMiddle(value, head, tail)}
            </button>
          }
          footer={
            <Button variant="secondary" icon="copy" onClick={() => copyText(value)}>
              {copy.common.copy}
            </Button>
          }
        >
          <p className="sr-only">{value}</p>
          <div aria-hidden className="grid grid-cols-4 gap-x-3 gap-y-1 rounded-sm bg-surface-raised p-3 font-mono text-mono text-text-1">
            {value.startsWith("0x") && <span className="col-span-4 text-text-3">0x</span>}
            {chunkHex(value).map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
        </Sheet>
        <button
          type="button"
          onClick={() => copyText(value)}
          aria-label={`${copy.common.copy} ${label}`}
          className={cn("flex w-12 shrink-0 items-center justify-center rounded-r-sm border-l border-border text-text-2 hover:bg-border hover:text-text-1", HIT_48)}
        >
          <Icon icon="copy" size={16} />
        </button>
      </span>
    </span>
  );
}
