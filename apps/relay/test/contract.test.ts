import { readFileSync } from "node:fs";
import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_ERRORS,
  classifyContractError,
  contractErrorCode,
  isBudgetError,
  proofToScVal,
  voteArgs,
} from "../src/contract.ts";
import { loadConfig } from "../src/config.ts";

// Known-answer vectors written by the contracts' Rust tests.
const scvalVectors = JSON.parse(
  readFileSync(new URL("../../../contracts/test-vectors/scval.json", import.meta.url), "utf8"),
) as { values: { name: string; scval_xdr_hex: string }[] };

const proof = {
  depth: 10,
  root: (1n << 255n) + 7n,
  nullifier: 2n,
  message: 1n,
  scope: 42n,
  points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
};

describe("proof ScVal", () => {
  it("encodes a struct as a symbol-keyed map in sorted key order", () => {
    const v = proofToScVal(proof);
    // Round-trip through XDR so we test what actually goes on the wire.
    const back = xdr.ScVal.fromXDR(v.toXDR("base64"), "base64");
    expect(back.type).toBe("scvMap");
    const entries = (back as xdr.ScValMap).map!;
    expect(entries.map((e) => (e.key as xdr.ScValSymbol).sym.toString())).toEqual([
      "depth",
      "message",
      "nullifier",
      "points",
      "root",
      "scope",
    ]);
  });

  it("encodes depth as u32, field elements as u256 and points as a vec of 8", () => {
    const entries = (proofToScVal(proof) as xdr.ScValMap).map!;
    const byKey = Object.fromEntries(entries.map((e) => [(e.key as xdr.ScValSymbol).sym.toString(), e.val]));
    expect(byKey.depth!.type).toBe("scvU32");
    for (const k of ["message", "nullifier", "root", "scope"]) expect(byKey[k]!.type).toBe("scvU256");
    expect(byKey.points!.type).toBe("scvVec");
    expect((byKey.points as xdr.ScValVec).vec).toHaveLength(8);
  });

  it("matches the contracts' known-answer Proof XDR byte for byte", () => {
    const vector = scvalVectors.values.find((v) => v.name === "proof");
    expect(vector).toBeDefined();
    // INTERFACE.md §3: proof {depth 4, root 1001, nullifier 77, message 1, scope 42, points 1..8}
    const v = proofToScVal({
      depth: 4,
      root: 1001n,
      nullifier: 77n,
      message: 1n,
      scope: 42n,
      points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
    });
    expect(Buffer.from(v.toXDR()).toString("hex")).toBe(vector!.scval_xdr_hex);
  });

  it("builds vote(poll_id: u64, proof: Proof) as exactly two args", () => {
    const args = voteArgs(42n, proof);
    expect(args).toHaveLength(2);
    expect(args[0]!.type).toBe("scvU64");
    expect(scValToNative(args[0]!)).toBe(42n);
    expect(Buffer.from(args[1]!.toXDR()).equals(Buffer.from(proofToScVal(proof).toXDR()))).toBe(true);
  });
});

describe("contract error mapping", () => {
  // contracts/INTERFACE.md §8.
  const ALL_CODES = [
    ...Array.from({ length: 17 }, (_, i) => 100 + i), // semaphore 100..=116
    ...Array.from({ length: 11 }, (_, i) => 200 + i), // polls 200..=210
    ...Array.from({ length: 6 }, (_, i) => 300 + i), // verifier 300..=305
  ];

  it("maps every contract error code and nothing else", () => {
    expect(Object.keys(CONTRACT_ERRORS).map(Number).sort((a, b) => a - b)).toEqual(ALL_CODES);
  });

  it("treats only AlreadyVoted (208) and NullifierUsed (113) as already answered", () => {
    const answered = ALL_CODES.filter((c) => classifyContractError(c).kind === "already_answered");
    expect(answered).toEqual([113, 208]);
  });

  it.each([
    [114, "bad_proof"],
    [200, "unknown_poll"],
    [204, "poll_closed"],
    [205, "root_mismatch"],
    [206, "scope_mismatch"],
    [207, "choice_out_of_range"],
    [111, "unknown_root"],
    [109, "depth_too_small"],
  ])("maps %i to reason %s", (code, reason) => {
    expect(classifyContractError(code)).toEqual({ kind: "invalid", reason });
  });

  it("gives every invalid code a snake_case reason", () => {
    for (const code of ALL_CODES) {
      const r = classifyContractError(code);
      if (r.kind === "invalid") expect(r.reason).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it("falls back to rejected for unknown codes", () => {
    expect(classifyContractError(1)).toEqual({ kind: "invalid", reason: "rejected" });
  });
});

describe("simulation error parsing", () => {
  it("extracts contract error codes", () => {
    expect(contractErrorCode("HostError: Error(Contract, #208)\n\nEvent log (newest first): ...")).toBe(208);
    // A nested frame later in the log does not override the top-level code.
    expect(contractErrorCode("HostError: Error(Contract, #114)\n\n... Error(Contract, #302) ...")).toBe(114);
    expect(contractErrorCode("HostError: Error(WasmVm, InvalidAction)")).toBeNull();
  });

  it("recognizes budget exhaustion", () => {
    expect(isBudgetError("HostError: Error(Budget, ExceededLimit)")).toBe(true);
    expect(isBudgetError("HostError: Error(Contract, #114)")).toBe(false);
  });
});

describe("config", () => {
  const base = {
    RELAY_FEE_SECRET: "S".padEnd(56, "A"),
    STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
    STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    POLLS_CONTRACT_ID: "C".padEnd(56, "A"),
    APP_ORIGIN: "https://lihim.app",
  };

  it("applies defaults", () => {
    const cfg = loadConfig(base);
    expect(cfg.maxDelayMs).toBe(0);
    expect(cfg.port).toBe(8787);
  });

  it("requires the fee key", () => {
    expect(() => loadConfig({ ...base, RELAY_FEE_SECRET: "" })).toThrow(/RELAY_FEE_SECRET/);
  });

  it("rejects an APP_ORIGIN with a path or trailing slash", () => {
    expect(() => loadConfig({ ...base, APP_ORIGIN: "https://lihim.app/" })).toThrow(/APP_ORIGIN/);
  });
});
