/**
 * Formatting helpers. All dates render in en-PH, Asia/Manila — fixed so server and
 * client output match (no hydration drift) and so "6:00 PM" means PH time everywhere.
 */

export const LOCALE = "en-PH";
export const TIME_ZONE = "Asia/Manila";

const numberFmt = new Intl.NumberFormat(LOCALE);
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: "short" });
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, month: "short", day: "numeric" });
const longDateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

type DateInput = string | number | Date;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

/**
 * Middle-out truncation for hashes: `0x7f3a…c91e`. Never wrap hashes; truncate them.
 * `head` counts the 0x prefix.
 */
export function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Group a 0x-hex value into 8-char blocks for the full-value sheet ("7f3a9c21 0b…"). */
export function chunkHex(value: string, size = 8): string[] {
  const body = value.startsWith("0x") ? value.slice(2) : value;
  const out: string[] = [];
  for (let i = 0; i < body.length; i += size) out.push(body.slice(i, i + size));
  return out;
}

/** Field element (bigint or decimal string) → 0x + 64 hex. */
export function toHex32(value: bigint | string): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  return `0x${n.toString(16).padStart(64, "0")}`;
}

/** Thousands-separated count. Render inside an element with the `tabular` class. */
export function formatCount(n: number): string {
  return numberFmt.format(n);
}

/** Whole-number percent of `part / whole` ("48%"). 0 when whole is 0. */
export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

/** Average rating with one decimal ("3.8"). */
export function formatAverage(avg: number): string {
  return avg.toFixed(1);
}

/** "6:00 PM" */
export function formatTime(d: DateInput): string {
  return timeFmt.format(toDate(d));
}

/** "Oct 22, 2026" */
export function formatDate(d: DateInput): string {
  return longDateFmt.format(toDate(d));
}

/** "Oct 22" */
export function formatShortDate(d: DateInput): string {
  return shortDateFmt.format(toDate(d));
}

function dayDiff(a: Date, b: Date): number {
  const ka = Date.parse(dayKeyFmt.format(a));
  const kb = Date.parse(dayKeyFmt.format(b));
  return Math.round((ka - kb) / 86_400_000);
}

/**
 * Relative-day phrase for a moment: "today, 6:00 PM", "tomorrow, 6:00 PM",
 * "yesterday, 6:00 PM", "Fri, 6:00 PM" (within a week ahead), else "Oct 24, 6:00 PM".
 */
export function formatWhen(d: DateInput, now: DateInput = Date.now()): string {
  const date = toDate(d);
  const diff = dayDiff(date, toDate(now));
  const time = formatTime(date);
  if (diff === 0) return `today, ${time}`;
  if (diff === 1) return `tomorrow, ${time}`;
  if (diff === -1) return `yesterday, ${time}`;
  if (diff > 1 && diff < 7) return `${weekdayFmt.format(date)}, ${time}`;
  return `${formatShortDate(date)}, ${time}`;
}

/** "Closes today, 6:00 PM" / "Closed Oct 20" */
export function formatClosing(closesAt: DateInput, now: DateInput = Date.now()): string {
  const date = toDate(closesAt);
  if (date.getTime() <= toDate(now).getTime()) return `Closed ${formatShortDate(date)}`;
  return `Closes ${formatWhen(date, now)}`;
}

/** "in 2 hours" / "in 3 days" — for reminders and the closing-soon pill tooltip. */
export function formatRelative(d: DateInput, now: DateInput = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const ms = toDate(d).getTime() - toDate(now).getTime();
  const abs = Math.abs(ms);
  if (abs < 3_600_000) return rtf.format(Math.round(ms / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(ms / 3_600_000), "hour");
  return rtf.format(Math.round(ms / 86_400_000), "day");
}
