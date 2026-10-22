/**
 * The whole L6 vote path in one call: prove locally → send to the relay → map outcome.
 * Screens drive their UI from `onPhase` and the returned outcome; they never touch
 * the prover or relay directly.
 */
import { markAnswered } from "./answered";
import { repo } from "./data";
import type { Poll } from "./data/types";
import { env } from "./env";
import { activeProverMode, isNotMemberError, proveVote, serializeForRelay, type ProverMode } from "./prover";
import type { LihimProof } from "./proof";
import { submitVote, type RelayOutcome } from "./relay";

/** proving → (slow after 4 s) → sending → done. */
export type VotePhase = "proving" | "sending";

/** Show the "medyo matagal" line after this long (design: Motion → proving moment). */
export const SLOW_PROVING_MS = 4000;

export type VoteResult =
  | RelayOutcome
  /**
   * Couldn't build the proof. Nothing sent. `notMember`: the viewer's commitment isn't in
   * the poll's frozen member set (joined after it opened, or a different passkey).
   */
  | { status: "prove_failed"; error: unknown; notMember: boolean };

export interface CastVoteOptions {
  onPhase?: (phase: VotePhase) => void;
  /** Fires once if proving passes SLOW_PROVING_MS. */
  onSlow?: () => void;
  signal?: AbortSignal;
  /** Mock prover only: simulated proving time. */
  simulateMs?: number;
  /** Force a prover mode (default: NEXT_PUBLIC_PROVER / `?prover=`). */
  prover?: ProverMode;
}

const frozenSets = new Map<string, Promise<bigint[]>>();

/**
 * Start loading the poll's frozen member set as soon as the vote screen opens (sdk prover only).
 * The request goes out with the viewer's session, so it must not happen at the moment of voting:
 * fetched on open, it reads like any other page load instead of "user X is about to answer P".
 */
export function prefetchVoteInputs(poll: Pick<Poll, "id" | "chainPollId">, prover?: ProverMode): void {
  if (!poll.chainPollId || (prover ?? activeProverMode()) !== "sdk") return;
  frozenCommitments(poll.id);
}

function frozenCommitments(pollId: string): Promise<bigint[]> {
  let p = frozenSets.get(pollId);
  if (!p) {
    p = repo.getFrozenCommitments(pollId);
    // Don't cache a failure; the next attempt refetches.
    p.catch(() => frozenSets.delete(pollId));
    frozenSets.set(pollId, p);
  }
  return p;
}

export async function castVote(
  poll: Pick<Poll, "id" | "groupId" | "chainPollId" | "frozenRoot">,
  choice: number,
  opts: CastVoteOptions = {},
): Promise<VoteResult> {
  const { chainPollId, frozenRoot } = poll;
  if (!chainPollId || !frozenRoot) {
    return { status: "prove_failed", error: new Error("Poll is not open"), notMember: false };
  }
  const mode = opts.prover ?? activeProverMode();

  opts.onPhase?.("proving");
  const slowTimer = setTimeout(() => opts.onSlow?.(), SLOW_PROVING_MS);
  let proof: LihimProof;
  try {
    proof = await proveVote(
      {
        groupId: poll.groupId,
        chainPollId,
        choice,
        frozenRoot,
        loadCommitments: () => frozenCommitments(poll.id),
      },
      { signal: opts.signal, simulateMs: opts.simulateMs, mode },
    );
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    return { status: "prove_failed", error, notMember: isNotMemberError(error) };
  } finally {
    clearTimeout(slowTimer);
  }

  // LihimPolls rejects a proof whose root isn't the frozen root (205 WrongRoot → relay 400
  // root_mismatch). Catch it here so a stale member list costs no relay round trip. The mock
  // data layer's frozenRoot is decorative, so only warn there.
  if (mode === "sdk" && proof.root !== BigInt(frozenRoot)) {
    if (env.data === "mock") {
      console.warn("[lihim/vote] proof root ≠ mock poll.frozenRoot (expected with mock data); sending anyway");
    } else {
      return { status: "invalid", reason: "root_mismatch" };
    }
  }

  const serialized = await serializeForRelay(proof, mode);
  opts.onPhase?.("sending");
  const outcome = await submitVote(chainPollId, serialized, { signal: opts.signal });
  if (outcome.status === "recorded" || outcome.status === "already_answered") markAnswered(poll.id);
  return outcome;
}
