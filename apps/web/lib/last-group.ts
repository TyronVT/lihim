/**
 * The last group the viewer opened on this device, so desktop /groups can reopen it
 * (lihim-UIUX-SPEC.md §3: "The / route on desktop opens the last-visited group"). Only a group
 * id the viewer can already see; nothing about polls or answers.
 */
const KEY = "lihim:last-group:v1";

export function rememberLastGroup(groupId: string): void {
  try {
    localStorage.setItem(KEY, groupId);
  } catch {
    // Storage blocked: desktop /groups falls back to the first group.
  }
}

export function lastGroupId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** After leaving a group, so /groups doesn't try to reopen it. */
export function forgetLastGroup(groupId?: string): void {
  try {
    if (!groupId || localStorage.getItem(KEY) === groupId) localStorage.removeItem(KEY);
  } catch {
    // Nothing stored then.
  }
}
