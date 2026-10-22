/**
 * Semaphore V4 proof as the Lihim contracts consume it.
 *
 * `message` and `scope` are the RAW values (choice, on-chain poll id). The
 * contract applies `hashToField` itself before verifying, exactly like the
 * Semaphore Solidity verifier does.
 *
 * Choice per poll kind: Single(n) 0..n (option index), YesNo 0 = Yes /
 * 1 = No, Rating 1..=5.
 */
export type LihimProof = {
  depth: number;
  root: bigint;
  nullifier: bigint;
  message: bigint;
  scope: bigint;
  /**
   * Groth16 proof packed as 8 field elements in the Solidity-verifier order
   * produced by `@zk-kit/utils` `packGroth16Proof`:
   * [a.x, a.y, b.x[1], b.x[0], b.y[1], b.y[0], c.x, c.y]
   * (each G2 coordinate is imaginary part first).
   */
  points: bigint[];
};

/** Wire format (relay body, storage): all bigints as base-10 strings. */
export type SerializedProof = {
  depth: number;
  root: string;
  nullifier: string;
  message: string;
  scope: string;
  points: string[];
};

export type PollKind = "single" | "rating" | "yesno";

/** Numeric `kind_tag` in the `poll_created` event data (contracts/INTERFACE.md §7). */
export const POLL_KIND_TAG: Record<PollKind, number> = {
  single: 0,
  rating: 1,
  yesno: 2,
};

export type LihimNetwork = {
  rpcUrl: string;
  networkPassphrase: string;
  semaphoreContractId: string;
  pollsContractId: string;
  verifierContractId: string;
};

/** Alias kept for readability at call sites (`network: NetworkConfig`). */
export type NetworkConfig = LihimNetwork;

export const MIN_DEPTH = 1;
export const MAX_DEPTH = 32;
export const POINTS_LEN = 8;
