import { Group } from "@semaphore-protocol/group";
import type { Identity } from "@semaphore-protocol/identity";
import { generateProof, verifyProof } from "@semaphore-protocol/proof";
import { fromSemaphoreProof, toSemaphoreProof } from "./encoding.js";
import type { LihimProof } from "./types.js";

/** The identity's commitment is not in the poll's frozen member set. */
export class NotAMemberError extends Error {
  readonly code = "not_member" as const;
  constructor() {
    super("This identity is not in the poll's member set");
    this.name = "NotAMemberError";
  }
}

/** Local file paths or URLs for the circuit; omitted → fetched by zk-kit. */
export type SnarkArtifacts = { wasm: string; zkey: string };

export type ProveVoteInput = {
  identity: Identity;
  /** Commitments of the poll's frozen member set, in insertion order. */
  commitments: bigint[];
  pollId: bigint;
  /** 0-based option index (single/yesno: 0 = Yes, 1 = No) or rating 1..=5. */
  choice: number;
  snarkArtifacts?: SnarkArtifacts;
};

/**
 * Build the Semaphore V4 proof for a vote: message = choice, scope = poll id.
 * The group must be rebuilt from exactly the commitments that were present
 * when the poll opened, otherwise the root will not match `frozen_root`.
 */
export async function proveVote(input: ProveVoteInput): Promise<LihimProof> {
  const { identity, commitments, pollId, choice, snarkArtifacts } = input;
  if (!Number.isInteger(choice) || choice < 0) throw new RangeError("choice must be a non-negative integer");
  if (pollId < 0n) throw new RangeError("pollId must be non-negative");

  const group = new Group(commitments);
  if (group.indexOf(identity.commitment) === -1) {
    throw new NotAMemberError();
  }
  const proof = await generateProof(identity, group, BigInt(choice), pollId, undefined, snarkArtifacts);
  return fromSemaphoreProof(proof);
}

/** Off-chain check with the official verifier; useful before hitting the relay. */
export async function verifyVoteProof(proof: LihimProof): Promise<boolean> {
  const p = toSemaphoreProof(proof);
  return verifyProof({ ...p, points: [...p.points] } as Parameters<typeof verifyProof>[0]);
}
