import { keccak256, toBeHex } from "ethers";
import { describe, expect, it } from "vitest";
import {
  deserializeProof,
  fromSemaphoreProof,
  hashToField,
  serializeProof,
  toSemaphoreProof,
  type LihimProof,
} from "../src/index.js";

// Exactly the expression in @semaphore-protocol/proof v4.14.5 `hash()`
// (not exported from the package, so it is reproduced verbatim here).
const semaphoreHash = (x: bigint) => BigInt(keccak256(toBeHex(x, 32))) >> 8n;

const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Frozen vectors: the Soroban contract test suite should assert the same outputs.
const VECTORS: [bigint, bigint][] = [
  [0n, semaphoreHash(0n)],
  [1n, semaphoreHash(1n)],
  [5n, semaphoreHash(5n)],
];

describe("hashToField", () => {
  const inputs = [
    0n, 1n, 2n, 4n, 5n, 42n, 255n, 256n, 2n ** 64n - 1n, 2n ** 128n,
    SNARK_FIELD - 1n, SNARK_FIELD, 2n ** 256n - 1n,
    123456789012345678901234567890n,
  ];
  it.each(inputs)("matches Semaphore's hash for %s", (x) => {
    expect(hashToField(x)).toBe(semaphoreHash(x));
  });

  it("always lands inside the BN254 scalar field", () => {
    for (const x of inputs) expect(hashToField(x) < SNARK_FIELD).toBe(true);
  });

  it("is stable for known vectors", () => {
    for (const [x, h] of VECTORS) expect(hashToField(x)).toBe(h);
    expect(hashToField(0n).toString(16)).toBe(
      "290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e5",
    );
  });

  it("rejects values outside u256", () => {
    expect(() => hashToField(-1n)).toThrow();
    expect(() => hashToField(2n ** 256n)).toThrow();
  });
});

const sample: LihimProof = {
  depth: 10,
  root: 2n ** 250n + 7n,
  nullifier: 99n,
  message: 1n,
  scope: 7n,
  points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 2n ** 253n],
};

describe("proof serialization", () => {
  it("round-trips through JSON", () => {
    const wire = JSON.parse(JSON.stringify(serializeProof(sample)));
    expect(wire.root).toBe(sample.root.toString());
    expect(wire.points).toHaveLength(8);
    expect(deserializeProof(wire)).toEqual(sample);
  });

  it("round-trips through the Semaphore proof shape", () => {
    expect(fromSemaphoreProof(toSemaphoreProof(sample))).toEqual(sample);
  });

  it.each([
    ["missing points", { ...serializeProof(sample), points: ["1"] }],
    ["hex string", { ...serializeProof(sample), root: "0x10" }],
    ["leading zero", { ...serializeProof(sample), nullifier: "01" }],
    ["number instead of string", { ...serializeProof(sample), scope: 7 }],
    ["depth 0", { ...serializeProof(sample), depth: 0 }],
    ["depth 33", { ...serializeProof(sample), depth: 33 }],
    ["over u256", { ...serializeProof(sample), message: (2n ** 256n).toString() }],
    ["null", null],
  ])("rejects malformed input: %s", (_name, bad) => {
    expect(() => deserializeProof(bad)).toThrow();
  });
});
