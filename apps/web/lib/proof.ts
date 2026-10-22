/**
 * Proof shapes come from @lihim/sdk (packages/sdk/src/types.ts), shared with apps/relay.
 * Type-only imports: they cost nothing in the bundle.
 *
 * `serializeProof` here is a dependency-free copy used ONLY on the mock-prover path, so mock
 * mode never loads the SDK chunk. The real path (prover "sdk") serializes with the SDK's own
 * `serializeProof` (lib/vote.ts), which also validates depth/points.
 */
import type { LihimProof, SerializedProof } from "@lihim/sdk";

export type { LihimProof, SerializedProof };

export function serializeProof(p: LihimProof): SerializedProof {
  if (p.points.length !== 8) throw new Error("proof.points must have 8 elements");
  return {
    depth: p.depth,
    root: p.root.toString(10),
    nullifier: p.nullifier.toString(10),
    message: p.message.toString(10),
    scope: p.scope.toString(10),
    points: p.points.map((x) => x.toString(10)),
  };
}
