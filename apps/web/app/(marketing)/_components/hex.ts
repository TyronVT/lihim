/**
 * Deterministic stand-ins for field elements on the landing page. NOT Poseidon and not secure:
 * they only need to look like 32-byte values and give the same output for the same input
 * (same identity + same poll → same nullifier), and render identically on server and client.
 */

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 64 hex chars (no 0x) derived from `input`. */
export function fakeHash(input: string): string {
  const rand = mulberry32(fnv1a(input));
  let out = "";
  for (let i = 0; i < 64; i++) out += Math.floor(rand() * 16).toString(16);
  return out;
}

/** `0x7f3a…c91e`: middle-out truncation, as the app does for hashes. */
export function shortHex(hex: string, head = 4, tail = 4): string {
  return `0x${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
