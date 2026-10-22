/**
 * Closing-time helpers for L5. Presets round up to the next full hour so the poll
 * reads "closes 6:00 PM", not "6:37 PM".
 *
 * The custom picker is <input type="datetime-local">, which works in the browser's own
 * time zone, while lib/format renders in Asia/Manila. For the PH pilot those agree; a
 * member abroad would see the Manila time on L3/L6 (the app's convention).
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const MIN_OPEN_MS = HOUR;
/** TODO(M0): confirm a max poll duration against root/nullifier TTL bumps (lihim-SPEC.md → TTL). */
export const MAX_OPEN_MS = 30 * DAY;

export type ClosingPreset = "1d" | "3d" | "1w" | "custom";
export const DEFAULT_PRESET: Exclude<ClosingPreset, "custom"> = "3d";

const PRESET_MS: Record<Exclude<ClosingPreset, "custom">, number> = { "1d": DAY, "3d": 3 * DAY, "1w": 7 * DAY };

const ceilHour = (ms: number) => Math.ceil(ms / HOUR) * HOUR;

export function presetClosesAt(preset: Exclude<ClosingPreset, "custom">, now: number): number {
  return ceilHour(now + PRESET_MS[preset]);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Epoch ms → "YYYY-MM-DDTHH:mm" in the browser's local zone (datetime-local value). */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → epoch ms, or null when empty/invalid. */
export function fromLocalInputValue(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export type ClosingError = "too-soon" | "too-far" | null;

export function validateClosing(closesAt: number | null, now: number): ClosingError {
  if (closesAt === null || closesAt - now < MIN_OPEN_MS) return "too-soon";
  if (closesAt - now > MAX_OPEN_MS) return "too-far";
  return null;
}
