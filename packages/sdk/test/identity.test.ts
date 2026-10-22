import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import {
  Identity,
  PRF_SALT,
  adminKeyFromSeed,
  adminMessage,
  canonicalGroupUuid,
  deriveAdminKey,
  deriveGroupIdentity,
  deriveGroupSecret,
  newGroupUuid,
  encodeAdminArgs,
  u256,
  verifyAdminSignature,
} from "../src/index.js";

const prfA = sha256(new TextEncoder().encode("device-a test prf output"));
const prfB = sha256(new TextEncoder().encode("another passkey"));

describe("PRF salt", () => {
  it("is sha256('lihim/v1')", () => {
    expect(Buffer.from(PRF_SALT).toString("hex")).toBe(
      Buffer.from(sha256(new TextEncoder().encode("lihim/v1"))).toString("hex"),
    );
  });
});

// Supabase groups.id values (D1: HKDF info uses the off-chain uuid, not the u64 chain id).
const G1 = "6f1c2b0e-8a4d-4c3b-9f2e-1d5a7b3c9e01";
const G2 = "0b7e4a52-3c1d-4e8f-a9b0-5c6d7e8f9a10";

describe("canonicalGroupUuid", () => {
  it("lowercases and keeps the Postgres text form", () => {
    expect(canonicalGroupUuid(G1.toUpperCase())).toBe(G1);
    expect(canonicalGroupUuid(G1)).toBe(G1);
  });

  it.each([
    ["on-chain id", "7"],
    ["no hyphens", G1.replaceAll("-", "")],
    ["braces", `{${G1}}`],
    ["whitespace", ` ${G1}`],
    ["urn", `urn:uuid:${G1}`],
    ["empty", ""],
  ])("rejects %s", (_name, bad) => {
    expect(() => canonicalGroupUuid(bad)).toThrow();
  });

  it("newGroupUuid is canonical", () => {
    const u = newGroupUuid();
    expect(canonicalGroupUuid(u)).toBe(u);
  });
});

describe("deriveGroupIdentity", () => {
  it("is deterministic for the same prfOut and group", () => {
    const a = deriveGroupIdentity(prfA, G1);
    const b = deriveGroupIdentity(prfA.slice(), G1);
    expect(a.commitment).toBe(b.commitment);
  });

  it("matches the frozen HKDF vector (info = 'lihim/sem/' + groups.id)", () => {
    expect(Buffer.from(deriveGroupSecret(prfA, G1)).toString("hex")).toBe(
      "de2fe01b1c3418ee7a84be2e4e1c11ceb988a3276bc9c66097fe033dc50c24bf",
    );
    expect(deriveGroupIdentity(prfA, G1).commitment).toBe(
      18725748453531335025441938816800341706849848349780505405810583937248821459581n,
    );
  });

  it("differs across groups and across passkeys", () => {
    const g1 = deriveGroupIdentity(prfA, G1).commitment;
    expect(deriveGroupIdentity(prfA, G2).commitment).not.toBe(g1);
    expect(deriveGroupIdentity(prfB, G1).commitment).not.toBe(g1);
  });

  it("canonicalizes the group uuid", () => {
    expect(deriveGroupIdentity(prfA, G1.toUpperCase()).commitment).toBe(deriveGroupIdentity(prfA, G1).commitment);
    expect(() => deriveGroupIdentity(prfA, "7")).toThrow();
  });

  it("survives export/import (used to hand identities to the worker)", () => {
    const id = deriveGroupIdentity(prfA, G2);
    expect(Identity.import(id.export()).commitment).toBe(id.commitment);
  });

  it("rejects short PRF output", () => {
    expect(() => deriveGroupIdentity(new Uint8Array(16), G1)).toThrow();
  });
});

describe("deriveAdminKey", () => {
  it("is deterministic and group-separated", () => {
    const k1 = deriveAdminKey(prfA, G1);
    const k2 = deriveAdminKey(prfA, G1);
    expect(Buffer.from(k1.publicKey)).toEqual(Buffer.from(k2.publicKey));
    expect(k1.publicKey).toHaveLength(32);
    expect(Buffer.from(deriveAdminKey(prfA, G2).publicKey)).not.toEqual(Buffer.from(k1.publicKey));
  });

  it("matches the frozen HKDF vector (info = 'lihim/admin/' + groups.id)", () => {
    expect(Buffer.from(deriveAdminKey(prfA, G1).publicKey).toString("hex")).toBe(
      "ecab74262a1e4a4ed10268b1865e7c9d118a6db24691fd061b61f40e38e7b011",
    );
  });

  it("produces signatures that verify", () => {
    const k = deriveAdminKey(prfA, G1);
    const msg = new TextEncoder().encode("hello");
    const sig = k.sign(msg);
    expect(sig).toHaveLength(64);
    expect(ed25519.verify(sig, msg, k.publicKey)).toBe(true);
    expect(verifyAdminSignature(sig, new TextEncoder().encode("hellO"), k.publicKey)).toBe(false);
  });

  it("admin key differs from the semaphore secret for the same group", () => {
    const k = deriveAdminKey(prfA, G1);
    expect(Buffer.from(k.publicKey).toString("hex")).not.toBe(Buffer.from(deriveGroupSecret(prfA, G1)).toString("hex"));
  });

  it("adminKeyFromSeed rejects bad seeds and copies the seed", () => {
    expect(() => adminKeyFromSeed(new Uint8Array(31))).toThrow();
    const seed = new Uint8Array(32).fill(7);
    const k = adminKeyFromSeed(seed);
    seed.fill(0);
    expect(Buffer.from(k.publicKey).toString("hex")).toBe(Buffer.from(ed25519.getPublicKey(new Uint8Array(32).fill(7))).toString("hex"));
    const msg = new Uint8Array([1]);
    expect(ed25519.verify(k.sign(msg), msg, k.publicKey)).toBe(true);
  });
});

describe("adminMessage", () => {
  const contractId = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
  const base = { contractId, fnTag: "add_member" as const, groupId: 1n, nonce: 0n, argsXdr: new Uint8Array([1, 2, 3]) };

  it("equals sha256 of the documented concatenation", () => {
    const enc = new TextEncoder();
    const expected = sha256(
      new Uint8Array([
        ...enc.encode(contractId),
        ...enc.encode("add_member"),
        0, 0, 0, 0, 0, 0, 0, 1,
        0, 0, 0, 0, 0, 0, 0, 0,
        1, 2, 3,
      ]),
    );
    expect(Buffer.from(adminMessage(base)).toString("hex")).toBe(Buffer.from(expected).toString("hex"));
  });

  it("is stable (frozen vector for the contract tests)", () => {
    const msg = adminMessage({ ...base, argsXdr: encodeAdminArgs([u256(5n)]) });
    expect(Buffer.from(msg).toString("hex")).toMatchInlineSnapshot(`"432866c794142ee79038cb68299bbf727345aaa855e07cbcd88b962475bc8aff"`);
  });

  it("changes with every bound field", () => {
    const h = (o: Partial<typeof base>) => Buffer.from(adminMessage({ ...base, ...o })).toString("hex");
    const ref = h({});
    expect(h({ nonce: 1n })).not.toBe(ref);
    expect(h({ groupId: 2n })).not.toBe(ref);
    expect(h({ fnTag: "remove_member" as never })).not.toBe(ref);
    expect(h({ argsXdr: new Uint8Array([1, 2, 4]) })).not.toBe(ref);
  });

  it("rejects non-contract addresses", () => {
    expect(() => adminMessage({ ...base, contractId: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" })).toThrow();
  });
});
