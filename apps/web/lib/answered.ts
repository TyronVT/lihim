/**
 * Device-local memory of "I answered poll X" so L6 can show the already-answered card
 * without asking anyone. Stores ONLY the poll id — never the choice (the card must give
 * no hint of what they chose) and nothing ever leaves the device.
 *
 * The relay's 409 `already_answered` stays the source of truth; this is a UX shortcut.
 */
const KEY = "lihim:answered:v1";

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function hasAnswered(pollId: string): boolean {
  return read().has(pollId);
}

export function markAnswered(pollId: string): void {
  try {
    const set = read();
    set.add(pollId);
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // Private mode / storage blocked: the relay's 409 still protects against double answers.
  }
}
