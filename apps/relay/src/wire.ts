// Request/response shapes shared with @lihim/sdk and apps/web.
// Duplicated here on purpose: the relay stays standalone and auditable, so it
// does not import the SDK. Keep in sync with the shared contract in the spec
// and with `Proof` in contracts/INTERFACE.md §2.

export type LihimProof = {
  depth: number;
  root: bigint;
  nullifier: bigint;
  message: bigint;
  scope: bigint;
  points: bigint[]; // always length 8, packGroth16Proof order
};

export type VoteRequest = { pollId: bigint; proof: LihimProof };

export type VoteResponse =
  | { status: "recorded"; tx_hash: string }
  | { status: "already_answered" }
  | { status: "invalid"; reason: string }
  | { status: "not_sent"; reason?: string };

const U64_MAX = (1n << 64n) - 1n;
const U256_MAX = (1n << 256n) - 1n;
// Canonical base-10 only: no sign, no leading zeros, no whitespace, no hex.
// Rejecting non-canonical forms means one vote has exactly one wire encoding.
const DECIMAL = /^(0|[1-9][0-9]*)$/;

const PROOF_KEYS = ["depth", "root", "nullifier", "message", "scope", "points"] as const;

type Parsed = { ok: true; value: VoteRequest } | { ok: false; reason: string };

function parseUint(v: unknown, max: bigint): bigint | null {
  // 78 digits is the longest u256; bounding length first keeps BigInt() cheap.
  if (typeof v !== "string" || v.length > 78 || !DECIMAL.test(v)) return null;
  const n = BigInt(v);
  return n <= max ? n : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasExactKeys(o: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(o, k));
}

/**
 * Strict parse of the POST /vote body. Unknown keys are rejected rather than
 * ignored so that nothing identifying can ride along unnoticed.
 */
export function parseVoteBody(body: unknown): Parsed {
  const fail = (reason: string): Parsed => ({ ok: false, reason });

  if (!isPlainObject(body) || !hasExactKeys(body, ["poll_id", "proof"])) return fail("malformed");

  const pollId = parseUint(body.poll_id, U64_MAX);
  if (pollId === null) return fail("malformed");

  const p = body.proof;
  if (!isPlainObject(p) || !hasExactKeys(p, PROOF_KEYS)) return fail("malformed");

  const { depth } = p;
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1 || depth > 32) {
    return fail("malformed");
  }

  const root = parseUint(p.root, U256_MAX);
  const nullifier = parseUint(p.nullifier, U256_MAX);
  const message = parseUint(p.message, U256_MAX);
  const scope = parseUint(p.scope, U256_MAX);
  if (root === null || nullifier === null || message === null || scope === null) {
    return fail("malformed");
  }

  if (!Array.isArray(p.points) || p.points.length !== 8) return fail("malformed");
  const points: bigint[] = [];
  for (const raw of p.points) {
    const n = parseUint(raw, U256_MAX);
    if (n === null) return fail("malformed");
    points.push(n);
  }

  // Scope is the poll id (shared contract #5). The contract enforces this too
  // (WrongScope, 206); checking here just avoids spending an RPC simulation on
  // an obvious mismatch. Same for depth 1..=32 (108) and 8 points (115) above.
  if (scope !== pollId) return fail("scope_mismatch");

  return { ok: true, value: { pollId, proof: { depth, root, nullifier, message, scope, points } } };
}
