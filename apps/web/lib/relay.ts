/**
 * Vote relay client (apps/relay). Deliberately a plain fetch to a separate origin:
 * no Supabase client, no session token, no cookies (credentials: "omit"), no referrer.
 * A vote that reaches the relay with identity attached is a bug (product rule 3).
 *
 * The relay rejects any request carrying Cookie, Authorization, apikey or x-client-info
 * (`identity_attached`) — the last two are what supabase-js adds, so never route this through
 * the Supabase client. The only header sent here is content-type.
 *
 * Contract (apps/relay/README.md): POST {RELAY}/vote { poll_id: "<u64>", proof: SerializedProof }
 *   200 { status: "recorded", tx_hash } · 409 { status: "already_answered" } (AlreadyVoted 208,
 *   NullifierUsed 113) · 400 { status: "invalid", reason } · 429 { status: "not_sent",
 *   reason: "busy" } (per-poll invalid-vote limiter; Retry-After) · 502 { status: "not_sent" }
 *   Both not_sent cases mean nothing was recorded and a retry is safe.
 */
import { env } from "./env";
import type { SerializedProof } from "./proof";
import { mockRecordVote } from "./data/mock";
import { toHex32 } from "./format";

export type RelayOutcome =
  | { status: "recorded"; txHash: string }
  | { status: "already_answered" }
  | { status: "invalid"; reason: string }
  /** Nothing was recorded — safe to retry. `cause` is for logs, never shown verbatim. */
  | { status: "not_sent"; cause: "network" | "server" | "timeout" | "busy"; retryAfterSec?: number };

export interface SubmitVoteOptions {
  signal?: AbortSignal;
  /** Default 30 s. The relay may add a privacy delay before submitting. */
  timeoutMs?: number;
}

export async function submitVote(
  chainPollId: string,
  proof: SerializedProof,
  opts: SubmitVoteOptions = {},
): Promise<RelayOutcome> {
  if (!env.relayUrl) return mockSubmit(chainPollId, proof);

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${env.relayUrl}/vote`, {
      method: "POST",
      // Nothing else: no apikey / x-client-info / Authorization (relay answers identity_attached).
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ poll_id: chainPollId, proof }),
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e; // Caller cancelled: let them handle it.
    return { status: "not_sent", cause: timeout.aborted ? "timeout" : "network" };
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 200 && body?.status === "recorded" && typeof body.tx_hash === "string") {
    return { status: "recorded", txHash: body.tx_hash };
  }
  if (res.status === 409) return { status: "already_answered" };
  if (res.status === 400) {
    return { status: "invalid", reason: typeof body?.reason === "string" ? body.reason : "invalid" };
  }
  if (res.status === 429) {
    // The poll is getting too many invalid votes; ours wasn't looked at. Same UX as not_sent.
    const retryAfter = Number(res.headers.get("retry-after"));
    return {
      status: "not_sent",
      cause: "busy",
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSec: retryAfter } : {}),
    };
  }
  return { status: "not_sent", cause: "server" };
}

/** TODO: remove once apps/relay runs locally; set NEXT_PUBLIC_RELAY_URL instead. */
async function mockSubmit(chainPollId: string, proof: SerializedProof): Promise<RelayOutcome> {
  // Exactly the body the real relay would get (dev console only; it's public-record data).
  if (process.env.NODE_ENV !== "production") {
    console.info("[lihim/relay mock] POST /vote", { poll_id: chainPollId, proof });
  }
  await new Promise((r) => setTimeout(r, 400));
  // Same cheap check as apps/relay (wire.ts): scope must equal poll_id.
  if (proof.scope !== chainPollId) return { status: "invalid", reason: "scope_mismatch" };
  const ok = mockRecordVote(chainPollId, toHex32(proof.nullifier), Number(proof.message));
  if (!ok) return { status: "already_answered" };
  const tx = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { status: "recorded", txHash: tx };
}

export async function relayHealthy(): Promise<boolean> {
  if (!env.relayUrl) return true;
  try {
    const res = await fetch(`${env.relayUrl}/health`, {
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    return res.ok;
  } catch {
    return false;
  }
}
