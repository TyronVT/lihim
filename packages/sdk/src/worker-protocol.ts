import type { SerializedProof } from "./types.js";
import type { SnarkArtifacts } from "./prove.js";

/**
 * Messages cross the worker boundary via structured clone, which cannot carry
 * an `Identity` instance, so the identity travels as its exported private key.
 */
export type WorkerRequest = {
  id: number;
  identity: string; // Identity.export() (base64 private key)
  commitments: string[];
  pollId: string;
  choice: number;
  snarkArtifacts?: SnarkArtifacts;
};

export type WorkerResponse =
  | { id: number; ok: true; proof: SerializedProof }
  | { id: number; ok: false; error: string; code?: "not_member" };
