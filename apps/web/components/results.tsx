import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { formatCount, formatPercent } from "@/lib/format";

export interface ResultBarProps {
  label: string;
  count: number;
  /** Denominator for the percentage: answers cast (not members). */
  total: number;
  /** Leading option: 600-weight label and --accent fill. No trophy, no colour change. */
  leading?: boolean;
  className?: string;
}

/**
 * One tally row. The number is text (count + %, tabular, right-aligned); the bar is
 * aria-hidden decoration. The fill animates in over 320 ms (fades for reduced motion).
 */
export function ResultBar({ label, count, total, leading, className }: ResultBarProps) {
  const pct = total > 0 ? count / total : 0;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("min-w-0 text-body text-text-1", leading ? "font-semibold" : "font-normal")}>{label}</span>
        <span className="shrink-0 text-label text-text-2 tabular">
          {formatCount(count)} · {formatPercent(count, total)}
        </span>
      </div>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-bar-track">
        <div
          className={cn("h-full origin-left animate-bar-fill rounded-full", leading ? "bg-bar-fill" : "bg-bar-fill-muted")}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

export interface TurnoutMeterProps {
  answered: number;
  /** Members frozen at open. */
  total: number;
  className?: string;
}

/** "23 of 31 members answered" + thin bar. Never "8 haven't answered" — that implies we know who. */
export function TurnoutMeter({ answered, total, className }: TurnoutMeterProps) {
  const pct = total > 0 ? Math.min(answered / total, 1) : 0;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-label text-text-2 tabular">{copy.results.turnout(answered, total)}</p>
      <div aria-hidden className="h-1 overflow-hidden rounded-full bg-bar-track">
        <div className="h-full origin-left animate-bar-fill rounded-full bg-bar-fill-muted" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
