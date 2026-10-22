import { sha256 } from "@noble/hashes/sha2.js";
import { verifyProof } from "@semaphore-protocol/proof";
import { describe, expect, it } from "vitest";
import {
  NotAMemberError,
  deriveGroupIdentity,
  deserializeProof,
  proveVote,
  toSemaphoreProof,
  verifyVoteProof,
  type LihimProof,
} from "../src/index.js";
import { createProver } from "../src/prover.js";
import { handleRequest } from "../src/worker.js";

const prf = (s: string) => sha256(new TextEncoder().encode(s));
const GROUP = "6f1c2b0e-8a4d-4c3b-9f2e-1d5a7b3c9e01"; // groups.id
const members = ["alice", "bob", "carol"].map((n) => deriveGroupIdentity(prf(n), GROUP));
const commitments = members.map((m) => m.commitment);

// Artifact download failures (offline CI) skip rather than fail; anything
// else, including an invalid proof, must fail loudly.
function isNetworkError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /fetch|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket|download|getaddrinfo/i.test(msg);
}

describe("proveVote (end to end, real circuit)", () => {
  let proof: LihimProof | undefined;

  it("produces a proof the official verifier accepts", async (ctx) => {
    try {
      proof = await proveVote({ identity: members[1]!, commitments, pollId: 42n, choice: 1 });
    } catch (err) {
      if (isNetworkError(err)) ctx.skip(`snark artifacts unavailable: ${(err as Error).message}`);
      throw err;
    }
    expect(proof.depth).toBe(2);
    expect(proof.message).toBe(1n);
    expect(proof.scope).toBe(42n);
    expect(proof.points).toHaveLength(8);
    expect(await verifyProof(toSemaphoreProof(proof) as never)).toBe(true);
    expect(await verifyVoteProof(proof)).toBe(true);
  });

  it("rejects a tampered proof", async (ctx) => {
    if (!proof) ctx.skip("depends on the previous test");
    expect(await verifyVoteProof({ ...proof!, message: 0n })).toBe(false);
    expect(await verifyVoteProof({ ...proof!, scope: 43n })).toBe(false);
  });

  it("gives the same nullifier per poll and a different one across polls", async (ctx) => {
    if (!proof) ctx.skip("depends on the first test");
    const again = await proveVote({ identity: members[1]!, commitments, pollId: 42n, choice: 0 });
    const other = await proveVote({ identity: members[1]!, commitments, pollId: 43n, choice: 1 });
    expect(again.nullifier).toBe(proof!.nullifier);
    expect(other.nullifier).not.toBe(proof!.nullifier);
  });

  it("worker handler and main-thread prover agree", async (ctx) => {
    if (!proof) ctx.skip("depends on the first test");
    const res = await handleRequest({
      id: 1,
      identity: members[0]!.export(),
      commitments: commitments.map(String),
      pollId: "42",
      choice: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await verifyVoteProof(deserializeProof(res.proof))).toBe(true);

    const prover = createProver(); // no Worker in Node → main-thread fallback
    expect(prover.usesWorker).toBe(false);
    const p = await prover.prove({ identity: members[2]!, commitments, pollId: 42n, choice: 1 });
    expect(await verifyVoteProof(p)).toBe(true);
    prover.terminate();
  });
});

describe("proveVote input checks", () => {
  it("refuses identities outside the frozen member set", async () => {
    const outsider = deriveGroupIdentity(prf("mallory"), GROUP);
    await expect(proveVote({ identity: outsider, commitments, pollId: 1n, choice: 0 })).rejects.toThrow(NotAMemberError);
    const res = await handleRequest({ id: 7, identity: outsider.export(), commitments: commitments.map(String), pollId: "1", choice: 0 });
    expect(res).toMatchObject({ id: 7, ok: false, code: "not_member" });
  });

  it("refuses negative choices", async () => {
    await expect(proveVote({ identity: members[0]!, commitments, pollId: 1n, choice: -1 })).rejects.toThrow();
  });
});
