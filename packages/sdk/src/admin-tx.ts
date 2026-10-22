import { sha256 } from "@noble/hashes/sha2.js";
import type { PollKind } from "./types.js";

/*
 * Client for the `submit-admin-tx` Edge Function (supabase/functions/submit-admin-tx).
 * The browser signs the admin call with the per-group admin key; the function
 * checks it against Postgres, simulates, pays the fee and submits.
 */

/** Request body (see the header of supabase/functions/submit-admin-tx/index.ts). */
export type AdminTxBody = {
  action: "create_group" | "add_member" | "add_members" | "update_member" | "remove_member" | "create_poll";
  /** Supabase groups.id (uuid, canonical lowercase). */
  group_id: string;
  /** base64 XDR of the full ScVal::Vec of contract args, signature last (`signedAdminArgs`). */
  args_xdr: string;
  group?: { name: string; description?: string; min_members?: number; admin_pubkey: string };
  poll?: {
    id?: string;
    title: string;
    kind: PollKind;
    options: string[] | null;
    closes_at: string;
    hide_live_tally?: boolean;
  };
};

export type AdminTxResult = {
  status: "confirmed" | "submitted";
  tx_hash: string;
  group_id: string;
  chain_group_id?: string | number;
  poll_id?: string;
  chain_poll_id?: string | number;
};

/** A non-2xx answer from `submit-admin-tx`. `code` is its `status` field. */
export class AdminTxError extends Error {
  constructor(
    readonly httpStatus: number,
    /** invalid | stale_signature | busy | below_min_members | conflict | not_found | forbidden | not_sent | … */
    readonly code: string,
    reason: string,
    /** Contract error code (contracts/INTERFACE.md §8), when the failure came from the contract. */
    readonly contractErrorCode?: number,
  ) {
    super(reason || code);
    this.name = "AdminTxError";
  }
}

export type SubmitAdminTxOptions = {
  /** Full URL of the function, e.g. `${SUPABASE_URL}/functions/v1/submit-admin-tx`. */
  url: string;
  /** The signed-in user's Supabase access token (the function checks they are the group admin). */
  accessToken: string;
  /** Supabase anon key, sent as `apikey` (the API gateway wants it). */
  apiKey?: string;
  /**
   * Builds and signs the body. Called again after a `409 stale_signature`, so it must re-read
   * what the signature covers (semaphore/polls `nonce(gid)`, or `next_group_id()` for
   * create_group) on every call, and keep the same `group_id` (and `poll.id`).
   */
  build: (attempt: number) => Promise<AdminTxBody>;
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  fetch?: typeof fetch;
};

/**
 * POST a signed admin action. On `409 stale_signature` (the nonce moved, or another group took
 * the predicted id) it rebuilds via `build` and resends; any other failure throws `AdminTxError`.
 */
export async function submitAdminTx(opts: SubmitAdminTxOptions): Promise<AdminTxResult> {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const maxAttempts = opts.maxAttempts ?? 3;
  let last: AdminTxError | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const body = await opts.build(attempt);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${opts.accessToken}`,
    };
    if (opts.apiKey) headers.apikey = opts.apiKey;
    const res = await doFetch(opts.url, { method: "POST", headers, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return data as unknown as AdminTxResult;

    last = new AdminTxError(
      res.status,
      typeof data.status === "string" ? data.status : "error",
      typeof data.reason === "string" ? data.reason : `HTTP ${res.status}`,
      typeof data.error_code === "number" ? data.error_code : undefined,
    );
    if (!(res.status === 409 && last.code === "stale_signature")) throw last;
  }
  throw last!;
}

/**
 * The poll text committed on-chain as `meta_hash` (supabase/functions/_shared/meta.ts):
 * `JSON.stringify({ v: 1, kind, title, options })` with exactly that key order and
 * `options: []` when there are none (rating polls).
 */
export function canonicalPollMeta(kind: PollKind, title: string, options: string[] | null): string {
  return JSON.stringify({ v: 1, kind, title, options: options ?? [] });
}

/** sha256 of `canonicalPollMeta`, 32 bytes. */
export function pollMetaHash(kind: PollKind, title: string, options: string[] | null): Uint8Array {
  return sha256(new TextEncoder().encode(canonicalPollMeta(kind, title, options)));
}
