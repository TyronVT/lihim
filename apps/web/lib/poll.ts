import type { Poll, PollOption } from "./data/types";

/** Status as shown in StatusPill. "closing-soon" is display-only, derived from closesAt. */
export type PollDisplayStatus = "draft" | "open" | "closing-soon" | "closed";

/** An open poll shows "Closing soon" inside this window. Matches the 2-hour reminder push × 3. */
export const CLOSING_SOON_MS = 6 * 3_600_000;

/**
 * L5/L7 show the small-group warning below this frozen size.
 * TODO(design open question): 15, or tie to `min_members × 2`?
 */
export const SMALL_GROUP_WARNING_THRESHOLD = 15;

/** Spec default and floor for a group's min_members (L1 stepper). */
export const DEFAULT_MIN_MEMBERS = 8;
export const MIN_MIN_MEMBERS = 5;
export const MAX_POLL_OPTIONS = 8;

export function pollDisplayStatus(poll: Pick<Poll, "status" | "closesAt">, now: number = Date.now()): PollDisplayStatus {
  if (poll.status === "draft") return "draft";
  const closesAt = Date.parse(poll.closesAt);
  if (poll.status === "closed" || closesAt <= now) return "closed";
  if (closesAt - now <= CLOSING_SOON_MS) return "closing-soon";
  return "open";
}

/** True when the anonymity set is small enough that people could guess by elimination. */
export function isSmallGroup(size: number): boolean {
  return size < SMALL_GROUP_WARNING_THRESHOLD;
}

export function optionLabel(options: PollOption[], value: number): string {
  return options.find((o) => o.value === value)?.label ?? String(value);
}
