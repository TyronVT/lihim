/**
 * Vote prover, two interchangeable modes (env NEXT_PUBLIC_PROVER, default "mock"):
 *
 * - "mock": simulates the worker's timing and returns a structurally valid but FAKE proof.
 *   Used until contracts are deployed and passkeys exist, and by /dev/components.
 * - "sdk": a real Semaphore V4 proof from `createProver()` ("@lihim/sdk/prover"), which runs
 *   in a Web Worker (falls back to the main thread if the worker can't start or crashes):
 *     1. prf_out    = passkey PRF (lib/identity.ts; dev-only fixed bytes until passkeys exist)
 *     2. identity   = deriveGroupIdentity(prf_out, groupId)     — groupId = groups.id uuid (D1)
 *     3. commitments = repo.getFrozenCommitments(pollId)        — frozen member set at open
 *     4. prover.prove({ identity, commitments, pollId: BigInt(chainPollId), choice })
 *
 * Dev builds also accept `?prover=sdk|mock` on the page URL to switch without a rebuild.
 * The SDK is imported lazily, so mock mode never downloads the Semaphore/snarkjs code.
 */
import type { Prover } from "@lihim/sdk/prover";
import { env } from "./env";
import { mockFailure } from "./data/mock";
import { groupIdentity, loadSdk } from "./identity";
import type { LihimProof, SerializedProof } from "./proof";
import { serializeProof as serializeMockProof } from "./proof";

export type ProverMode = "mock" | "sdk";

export interface ProveVoteRequest {
  /** Supabase groups.id (uuid): the identity HKDF info is "lihim/sem/" + groupId (D1). */
  groupId: string;
  /** u64 decimal. Also the Semaphore scope. */
  chainPollId: string;
  /** Option value: single/yesno 0-based (0 = Yes), rating 1..=5. */
  choice: number;
  /** Group root frozen at poll open, 0x-hex. The proof must match it. */
  frozenRoot: string;
  /**
   * The poll's frozen member commitments, in leaf order. Only called in "sdk" mode
   * (lib/vote.ts passes `repo.getFrozenCommitments(poll.id)`).
   */
  loadCommitments: () => Promise<bigint[]>;
}

export interface ProveOptions {
  signal?: AbortSignal;
  /** Mock only: override the simulated duration (ms) to exercise slow paths. */
  simulateMs?: number;
  /** Force a mode (e.g. /dev/components always uses "mock"). Default: activeProverMode(). */
  mode?: ProverMode;
}

/** NEXT_PUBLIC_PROVER, overridable in dev with `?prover=sdk|mock`. Client-side only. */
export function activeProverMode(): ProverMode {
  if (env.devRoutes && typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("prover");
    if (q === "sdk" || q === "mock") return q;
  }
  return env.prover;
}

/** The viewer's commitment isn't in the poll's frozen member set (SDK NotAMemberError). */
export function isNotMemberError(e: unknown): boolean {
  return e instanceof Error && (e.name === "NotAMemberError" || (e as { code?: unknown }).code === "not_member");
}

export async function proveVote(req: ProveVoteRequest, opts: ProveOptions = {}): Promise<LihimProof> {
  const mode = opts.mode ?? activeProverMode();
  return mode === "sdk" ? proveWithSdk(req, opts.signal) : proveMock(req, opts);
}

/**
 * Relay wire format. "sdk" proofs go through the SDK's `serializeProof` (validates depth and
 * points); mock proofs use the local copy so mock mode stays SDK-free.
 */
export async function serializeForRelay(proof: LihimProof, mode: ProverMode): Promise<SerializedProof> {
  if (mode === "mock") return serializeMockProof(proof);
  const sdk = await loadSdk();
  return sdk.serializeProof(proof);
}

// ---------------------------------------------------------------------------
// "sdk": real proof
// ---------------------------------------------------------------------------

const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.info("[lihim/prover]", ...args);
};

let proverPromise: Promise<Prover> | null = null;

/** One prover (= one worker) per tab, created on first use. */
function getProver(disableWorker = false): Promise<Prover> {
  if (!proverPromise || disableWorker) {
    const created = import("@lihim/sdk/prover").then((m) => {
      const p = m.createProver(disableWorker ? { disableWorker: true } : {});
      debug(p.usesWorker ? "prover ready (Web Worker)" : "prover ready (main thread)");
      return p;
    });
    // Don't cache a failed chunk load; the next vote tries again.
    created.catch(() => {
      if (proverPromise === created) proverPromise = null;
    });
    proverPromise = created;
  }
  return proverPromise;
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

async function proveWithSdk(req: ProveVoteRequest, signal?: AbortSignal): Promise<LihimProof> {
  const started = performance.now();
  const [identity, commitments, prover] = await abortable(
    Promise.all([groupIdentity(req.groupId), req.loadCommitments(), getProver()]),
    signal,
  );
  const input = { identity, commitments, pollId: BigInt(req.chainPollId), choice: req.choice };

  // An abort can't stop the worker mid-proof; we just stop waiting for it.
  let proof: LihimProof;
  try {
    proof = await abortable(prover.prove(input), signal);
  } catch (e) {
    if (signal?.aborted || isNotMemberError(e) || !prover.usesWorker) throw e;
    // Worker failed to load or crashed (e.g. bundler couldn't serve it): retry on the main thread.
    console.warn("[lihim/prover] worker failed, retrying on the main thread:", e);
    prover.terminate();
    const fallback = await getProver(true);
    proof = await abortable(fallback.prove(input), signal);
  }
  const current = await getProver();
  debug(`proof generated (${current.usesWorker ? "worker" : "main thread"})`, {
    ms: Math.round(performance.now() - started),
    depth: proof.depth,
    members: commitments.length,
    root: `0x${proof.root.toString(16)}`,
  });
  return proof;
}

// ---------------------------------------------------------------------------
// "mock": fake proof
// ---------------------------------------------------------------------------

const FIELD_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function randomField(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n % FIELD_P;
}

async function proveMock(req: ProveVoteRequest, opts: ProveOptions): Promise<LihimProof> {
  const ms = opts.simulateMs ?? 1200;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    opts.signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
  // ?mockFail=vote-late: as if the viewer joined after the poll opened (SDK NotAMemberError).
  if (mockFailure() === "vote-late") {
    const e = new Error("Not in this poll's member set");
    e.name = "NotAMemberError";
    throw e;
  }
  return {
    depth: 5,
    root: BigInt(req.frozenRoot),
    // Real nullifier = Poseidon(scope, secret): stable per (member, poll). The mock is random,
    // so mock double-vote detection relies on lib/answered.ts instead.
    nullifier: randomField(),
    message: BigInt(req.choice),
    scope: BigInt(req.chainPollId),
    points: Array.from({ length: 8 }, randomField),
  };
}
