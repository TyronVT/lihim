// Poll metadata hash committed on-chain as meta_hash.
//
// meta_hash = sha256(utf8(JSON.stringify({ v: 1, kind, title, options })))
// with keys in exactly that order, options = [] for rating polls, no whitespace.
// The web app must build the same string before signing create_poll, and L9
// recomputes it from public_poll_audit to show the text was not edited later.

export type PollKind = 'single' | 'rating' | 'yesno';

export function canonicalPollMeta(kind: PollKind, title: string, options: string[] | null): string {
  return JSON.stringify({ v: 1, kind, title, options: options ?? [] });
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function pollMetaHash(kind: PollKind, title: string, options: string[] | null): Promise<string> {
  return sha256Hex(canonicalPollMeta(kind, title, options));
}

/** kind_tag as emitted in poll_created. */
export const KIND_TAG: Record<PollKind, number> = { single: 0, rating: 1, yesno: 2 };
