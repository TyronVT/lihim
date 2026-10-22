import { keccak_256 } from "@noble/hashes/sha3.js";
import { MAX_DEPTH, MIN_DEPTH, POINTS_LEN, type LihimProof, type SerializedProof } from "./types.js";

const U256_MAX = (1n << 256n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

/** Big-endian 32-byte encoding; equivalent to ethers `toBeHex(x, 32)`. */
export function be32(x: bigint): Uint8Array {
  if (x < 0n || x > U256_MAX) throw new RangeError("value does not fit in 32 bytes");
  const out = new Uint8Array(32);
  let v = x;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Big-endian 8-byte encoding of a u64. */
export function be64(x: bigint): Uint8Array {
  if (x < 0n || x > U64_MAX) throw new RangeError("value does not fit in u64");
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, x, false);
  return out;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

/**
 * Semaphore V4 message/scope hash: `keccak256(be32(x)) >> 8`, so the result
 * fits the BN254 scalar field. Must match `@semaphore-protocol/proof`'s
 * internal `hash` byte-for-byte or every proof fails on-chain.
 */
export function hashToField(x: bigint): bigint {
  return bytesToBigInt(keccak_256(be32(x))) >> 8n;
}

/** Parse a canonical base-10 u64 (ids are passed as strings across JSON). */
export function parseU64(value: string | bigint | number, name = "value"): bigint {
  let v: bigint;
  if (typeof value === "bigint") v = value;
  else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer`);
    v = BigInt(value);
  } else {
    if (!DECIMAL.test(value)) throw new TypeError(`${name} must be a base-10 integer string`);
    v = BigInt(value);
  }
  if (v < 0n || v > U64_MAX) throw new RangeError(`${name} out of u64 range`);
  return v;
}

function parseU256(value: string, name: string): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new TypeError(`${name} must be a base-10 integer string`);
  }
  const v = BigInt(value);
  if (v > U256_MAX) throw new RangeError(`${name} out of u256 range`);
  return v;
}

function assertProofShape(p: { depth: number; points: unknown[] }) {
  if (!Number.isInteger(p.depth) || p.depth < MIN_DEPTH || p.depth > MAX_DEPTH) {
    throw new RangeError(`depth must be an integer in ${MIN_DEPTH}..=${MAX_DEPTH}`);
  }
  if (!Array.isArray(p.points) || p.points.length !== POINTS_LEN) {
    throw new TypeError(`points must have exactly ${POINTS_LEN} elements`);
  }
}

export function serializeProof(proof: LihimProof): SerializedProof {
  assertProofShape(proof);
  return {
    depth: proof.depth,
    root: proof.root.toString(),
    nullifier: proof.nullifier.toString(),
    message: proof.message.toString(),
    scope: proof.scope.toString(),
    points: proof.points.map((p) => p.toString()),
  };
}

/** Strict parser: the relay feeds untrusted JSON straight into this. */
export function deserializeProof(input: unknown): LihimProof {
  if (typeof input !== "object" || input === null) throw new TypeError("proof must be an object");
  const o = input as Record<string, unknown>;
  const depth = o.depth;
  const points = o.points;
  if (typeof depth !== "number") throw new TypeError("depth must be a number");
  if (!Array.isArray(points)) throw new TypeError("points must be an array");
  assertProofShape({ depth, points });
  return {
    depth,
    root: parseU256(o.root as string, "root"),
    nullifier: parseU256(o.nullifier as string, "nullifier"),
    message: parseU256(o.message as string, "message"),
    scope: parseU256(o.scope as string, "scope"),
    points: points.map((p, i) => parseU256(p as string, `points[${i}]`)),
  };
}

/** Shape of `@semaphore-protocol/proof` v4 `SemaphoreProof` (strings throughout). */
export type SemaphoreProofLike = {
  merkleTreeDepth: number;
  merkleTreeRoot: string;
  nullifier: string;
  message: string;
  scope: string;
  points: readonly string[];
};

/**
 * Convert `generateProof` output into a `LihimProof`. `depth` overrides the
 * proof's `merkleTreeDepth` when given (they should normally agree).
 */
export function fromSemaphoreProof(proof: SemaphoreProofLike, depth?: number): LihimProof {
  const out: LihimProof = {
    depth: depth ?? proof.merkleTreeDepth,
    root: BigInt(proof.merkleTreeRoot),
    nullifier: BigInt(proof.nullifier),
    message: BigInt(proof.message),
    scope: BigInt(proof.scope),
    points: proof.points.map((p) => BigInt(p)),
  };
  assertProofShape(out);
  return out;
}

/** Inverse of `fromSemaphoreProof`, for `verifyProof` from `@semaphore-protocol/proof`. */
export function toSemaphoreProof(proof: LihimProof): SemaphoreProofLike {
  assertProofShape(proof);
  return {
    merkleTreeDepth: proof.depth,
    merkleTreeRoot: proof.root.toString(),
    nullifier: proof.nullifier.toString(),
    message: proof.message.toString(),
    scope: proof.scope.toString(),
    points: proof.points.map((p) => p.toString()),
  };
}
