"use client";

import { Check } from "lucide-react";
import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import type { PollOption } from "@/lib/data/types";
import { Icon } from "./icons";

/**
 * idle    → interactive: tap/Space/arrow keys move the selection (nothing is sent yet, P4).
 * proving → selected row locked with the progress line, others faded to 40 %.
 * done    → selected row locked with a check, others faded. (Also use for "already answered"
 *           with value=null so nothing hints at the earlier choice.)
 */
export type AnswerPhase = "idle" | "proving" | "done";

/**
 * Keyboard model (P4: selecting is not answering, the screen's "Send answer" commits): a real
 * radiogroup with roving focus. Arrow keys / Home / End move focus AND the selection, as native
 * radios do. Space selects. Enter selects an unselected row; on the already-selected row it's
 * left alone so it bubbles to the screen, where Enter means "Send answer" (L6).
 */
function useRadioKeys(onSelect: (el: HTMLElement) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
      if (!keys.includes(e.key) || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"])'));
      if (items.length === 0) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      let next = i;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % items.length;
      else next = (i - 1 + items.length) % items.length;
      const el = items[next];
      if (!el) return;
      el.focus();
      onSelect(el);
    },
    [onSelect],
  );
  return { ref, onKeyDown };
}

/** Space selects; Enter selects only when not yet selected (see useRadioKeys). */
function activate(e: KeyboardEvent<HTMLElement>, selected: boolean, fn: () => void) {
  if (e.key === " " || (e.key === "Enter" && !selected)) {
    e.preventDefault();
    fn();
  }
}

/** Thin silver line along the bottom of the selected option while proving. Hidden for reduced motion. */
export function ProgressLine({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden motion-reduce:hidden", className)}
    >
      <span className="absolute inset-0 origin-left animate-progress-fill bg-accent" />
      <span className="absolute inset-y-0 left-0 w-2/5 animate-progress-sweep bg-accent" />
    </span>
  );
}

export interface OptionRowProps {
  label: ReactNode;
  /** Optional second line (caption). */
  description?: ReactNode;
  selected: boolean;
  /** Not interactive (after commit / already answered / closed). */
  locked?: boolean;
  /** Dimmed to 40 % (the non-chosen rows during/after an answer). */
  faded?: boolean;
  /** Show the proving progress line (selected row only). */
  proving?: boolean;
  /** Show a check instead of the radio (answer recorded). */
  done?: boolean;
  tabbable?: boolean;
  onSelect?: () => void;
  /** Option value, read by the group's arrow-key handler. */
  value?: number;
}

/**
 * One answer row: --surface, 1 px control border, radius 12, ≥ 56 px, label left, radio right.
 * Selected: --surface-raised + 2 px accent border. Use inside <OptionGroup>; exported for
 * custom layouts (it must still live in an element with role="radiogroup").
 */
export function OptionRow({
  label,
  description,
  selected,
  locked,
  faded,
  proving,
  done,
  tabbable,
  onSelect,
  value,
}: OptionRowProps) {
  const interactive = !locked && !!onSelect;
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={!interactive || undefined}
      tabIndex={tabbable ? 0 : -1}
      onClick={interactive ? onSelect : undefined}
      data-value={value}
      onKeyDown={interactive ? (e) => activate(e, selected, onSelect) : undefined}
      className={cn(
        "relative flex min-h-14 w-full items-center gap-3 overflow-hidden rounded-md border px-4 py-3 text-left",
        "transition-[background-color,border-color,box-shadow,opacity] duration-base ease-standard",
        selected
          ? "border-accent bg-surface-raised shadow-[inset_0_0_0_1px_var(--accent)]"
          : "border-border-control bg-surface",
        interactive && !selected && "hover:bg-surface-raised",
        faded && "opacity-40",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("text-body text-text-1", selected && "font-medium")}>{label}</span>
        {description && <span className="text-caption text-text-2">{description}</span>}
      </span>
      {proving && (
        <span aria-hidden className="hidden text-caption text-text-2 motion-reduce:inline">
          {copy.vote.provingReduced}
        </span>
      )}
      {done && selected ? (
        <Icon icon={Check} className="text-success" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-fast",
            selected ? "border-accent" : "border-border-control",
          )}
        >
          {selected && <span className="size-2.5 rounded-full bg-accent" />}
        </span>
      )}
      {proving && <ProgressLine />}
    </div>
  );
}

export interface OptionGroupProps {
  options: PollOption[];
  /** The selected choice (PollOption.value) or null. Selected is not sent: see "Send answer" on L6. */
  value: number | null;
  /** Fires on tap, Space, Enter (unselected row) and arrow keys. Moves the selection only (P4). */
  onSelect: (value: number) => void;
  phase?: AnswerPhase;
  /** Accessible name (usually the question). Use `labelledBy` to point at the visible question instead. */
  label?: string;
  labelledBy?: string;
  /** Lock everything (poll closed, already answered). */
  disabled?: boolean;
  className?: string;
}

/**
 * Single-choice / Yes–No answers. Tap selects; the screen's "Send answer" commits (P4). Also used
 * read-only (`disabled`) as L5's live preview.
 */
export function OptionGroup({
  options,
  value,
  onSelect,
  phase = "idle",
  label,
  labelledBy,
  disabled,
  className,
}: OptionGroupProps) {
  const locked = disabled || phase !== "idle";
  const { ref, onKeyDown } = useRadioKeys(
    useCallback((el: HTMLElement) => onSelect(Number(el.dataset.value)), [onSelect]),
  );
  const tabbableValue = value ?? options[0]?.value;
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-disabled={locked || undefined}
      onKeyDown={onKeyDown}
      className={cn("flex flex-col gap-3", className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <OptionRow
            key={o.value}
            label={o.label}
            selected={selected}
            locked={locked}
            faded={locked && !selected}
            proving={selected && phase === "proving"}
            done={selected && phase === "done"}
            tabbable={o.value === tabbableValue}
            value={o.value}
            onSelect={() => onSelect(o.value)}
          />
        );
      })}
    </div>
  );
}

export interface RatingRowProps {
  /** Selected rating 1..5 or null (not sent until "Send answer", P4). */
  value: number | null;
  onSelect: (value: number) => void;
  phase?: AnswerPhase;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  /** End captions. Default "Hindi maganda" / "Napakaganda". */
  minLabel?: string;
  maxLabel?: string;
  className?: string;
}

/**
 * 1–5 rating: five equal 56 px squares, numeric labels read as "3 out of 5". No stars.
 * Proving: like OptionGroup (lock, fade others, progress line; static "Proving…" under reduced motion).
 */
export function RatingRow({
  value,
  onSelect,
  phase = "idle",
  label,
  labelledBy,
  disabled,
  minLabel = copy.vote.ratingMin,
  maxLabel = copy.vote.ratingMax,
  className,
}: RatingRowProps) {
  const locked = disabled || phase !== "idle";
  const { ref, onKeyDown } = useRadioKeys(
    useCallback((el: HTMLElement) => onSelect(Number(el.dataset.value)), [onSelect]),
  );
  const tabbable = value ?? 1;
  const captionId = useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        ref={ref}
        role="radiogroup"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={captionId}
        aria-disabled={locked || undefined}
        onKeyDown={onKeyDown}
        className="flex justify-between gap-2"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = n === value;
          const interactive = !locked;
          return (
            <div
              key={n}
              role="radio"
              aria-checked={selected}
              aria-label={copy.vote.ratingAria(n)}
              aria-disabled={!interactive || undefined}
              tabIndex={n === tabbable ? 0 : -1}
              data-value={n}
              onClick={interactive ? () => onSelect(n) : undefined}
              onKeyDown={interactive ? (e) => activate(e, selected, () => onSelect(n)) : undefined}
              className={cn(
                "relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border text-label tabular",
                "transition-[background-color,border-color,box-shadow,opacity] duration-base ease-standard",
                selected
                  ? "border-accent bg-surface-raised text-text-1 shadow-[inset_0_0_0_1px_var(--accent)]"
                  : "border-border-control bg-surface text-text-1",
                interactive && !selected && "hover:bg-surface-raised",
                locked && !selected && "opacity-40",
              )}
            >
              {selected && phase === "done" ? <Icon icon={Check} className="text-success" /> : n}
              {selected && phase === "proving" && <ProgressLine />}
            </div>
          );
        })}
      </div>
      <div id={captionId} className="flex justify-between text-caption text-text-2">
        <span>
          <span className="sr-only">1 = </span>
          {minLabel}
        </span>
        <span>
          <span className="sr-only">5 = </span>
          {maxLabel}
        </span>
      </div>
      {/* Reduced motion: the progress line is hidden, so say it in words (squares are too small for it). */}
      {phase === "proving" && (
        <span aria-hidden className="hidden text-caption text-text-2 motion-reduce:block">
          {copy.vote.provingReduced}
        </span>
      )}
    </div>
  );
}
