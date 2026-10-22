import { readFileSync } from "node:fs";
import { Account, Keypair, scValToNative, xdr, type Transaction, type rpc } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_ERRORS,
  ContractCallError,
  LihimPollsClient,
  LihimSemaphoreClient,
  MAX_BATCH,
  TESTNET,
  adminArgs,
  adminKeyFromSeed,
  adminMessage,
  chunkCommitments,
  contractDataKey,
  encodeAdminArgs,
  parseContractErrorCode,
  pollKindFromNative,
  pollKindTag,
  pollKindToScVal,
  proofToScVal,
  signAdminCall,
  storageKeys,
  u256,
  u64,
  type AdminFnTag,
  type LihimNetwork,
  type LihimProof,
  type PollKindInput,
} from "../src/index.js";

// Rust-written known answers (contracts/test-vectors, INTERFACE.md §3, §5, §9).
const vectors = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../../contracts/test-vectors/${name}`, import.meta.url), "utf8")) as T;

type AdminVector = {
  admin_pub_hex: string;
  admin_seed_hex: string;
  args_xdr_hex: string;
  contract: string;
  digest_hex: string;
  fn_tag: AdminFnTag;
  group_id: string;
  nonce: string;
  signature_hex: string;
};
type ScValVectors = {
  values: { name: string; scval_xdr_hex: string }[];
  ledger_keys: { name: string; contract: string; key_scval_xdr_hex: string; ledger_key_xdr_hex: string }[];
};

const ADMIN = vectors<AdminVector[]>("admin-auth.json");
const SCVAL = vectors<ScValVectors>("scval.json");

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const xdrHex = (v: { toXDR(): Uint8Array | Buffer }) => hex(new Uint8Array(v.toXDR()));
const unhex = (h: string) => new Uint8Array(Buffer.from(h, "hex"));

// Same cases, in the same order, as lihim-semaphore `admin_auth_vectors` / check-js.mjs.
const META = new Uint8Array(32).fill(9);
const CLOSES_AT = 1_700_000_000n;
const SIBLINGS = [11n, 12n];
const KINDS: PollKindInput[] = [{ kind: "single", options: 3 }, { kind: "yesno" }, { kind: "rating" }];

const seed = unhex(ADMIN[0]!.admin_seed_hex);
const admin = adminKeyFromSeed(seed);

function argsFor(i: number, v: AdminVector) {
  switch (v.fn_tag) {
    case "create_group":
      return adminArgs.create_group(admin.publicKey);
    case "add_member":
      return adminArgs.add_member(42n);
    case "add_members":
      return adminArgs.add_members([1n, 2n, 3n]);
    case "update_member":
      return adminArgs.update_member(1n, 4n, SIBLINGS);
    case "remove_member":
      return adminArgs.remove_member(2n, SIBLINGS);
    case "create_poll":
      return adminArgs.create_poll(KINDS[i - 5]!, CLOSES_AT, META);
  }
}

describe("admin auth vectors (admin-auth.json)", () => {
  it("covers all six fn tags and all three poll kinds", () => {
    expect(new Set(ADMIN.map((v) => v.fn_tag)).size).toBe(6);
    expect(ADMIN).toHaveLength(8);
  });

  it("derives the vector public key from the seed", () => {
    expect(hex(admin.publicKey)).toBe(ADMIN[0]!.admin_pub_hex);
  });

  it.each(ADMIN.map((v, i) => [`${i} ${v.fn_tag} nonce ${v.nonce}`, i, v] as const))(
    "args, digest and signature match: %s",
    (_label, i, v) => {
      const args = argsFor(i, v);
      expect(hex(encodeAdminArgs(args))).toBe(v.args_xdr_hex);

      const msg = adminMessage({
        contractId: v.contract,
        fnTag: v.fn_tag,
        groupId: BigInt(v.group_id),
        nonce: BigInt(v.nonce),
        argsXdr: encodeAdminArgs(args),
      });
      expect(hex(msg)).toBe(v.digest_hex);

      const { digest, sig } = signAdminCall(
        { contractId: v.contract, fnTag: v.fn_tag, chainGroupId: BigInt(v.group_id), nonce: BigInt(v.nonce), args },
        admin,
      );
      expect(hex(digest)).toBe(v.digest_hex);
      expect(hex(sig)).toBe(v.signature_hex);
    },
  );
});

describe("ScVal vectors (scval.json values)", () => {
  const value = (name: string) => SCVAL.values.find((v) => v.name === name)!.scval_xdr_hex;
  const proof: LihimProof = {
    depth: 4,
    root: 1001n,
    nullifier: 77n,
    message: 1n,
    scope: 42n,
    points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
  };

  it("proofToScVal matches byte for byte (sorted keys, raw message/scope)", () => {
    expect(xdrHex(proofToScVal(proof))).toBe(value("proof"));
    expect(scValToNative(proofToScVal(proof))).toEqual(proof);
  });

  it("proofToScVal rejects the wrong number of points", () => {
    expect(() => proofToScVal({ ...proof, points: [1n] })).toThrow();
  });

  it("PollKind variants match", () => {
    expect(xdrHex(pollKindToScVal({ kind: "single", options: 3 }))).toBe(value("poll_kind_single_3"));
    expect(xdrHex(pollKindToScVal({ kind: "rating" }))).toBe(value("poll_kind_rating"));
    expect(xdrHex(pollKindToScVal({ kind: "yesno" }))).toBe(value("poll_kind_yesno"));
  });

  it("PollKind round-trips through scValToNative and has the event tag", () => {
    for (const k of [...KINDS, { kind: "single", options: 32 } as const]) {
      expect(pollKindFromNative(scValToNative(pollKindToScVal(k)))).toEqual(k);
    }
    expect(KINDS.map(pollKindTag)).toEqual([0, 2, 1]);
    expect(() => pollKindFromNative(["Multi"])).toThrow();
  });

  it("PollKind::Single needs 2..=32 options", () => {
    expect(() => pollKindToScVal({ kind: "single", options: 1 })).toThrow();
    expect(() => pollKindToScVal({ kind: "single", options: 33 })).toThrow();
    expect(() => pollKindToScVal({ kind: "single", options: 2.5 })).toThrow();
  });
});

describe("storage keys (scval.json ledger_keys)", () => {
  const SEM = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";
  const POLLS = "CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ";
  const k = storageKeys;
  const cases: Record<string, xdr.ScVal> = {
    "semaphore Group(1)": k.semaphore.group(1n),
    "semaphore Tree(1)": k.semaphore.tree(1n),
    "semaphore RootTtl(1)": k.semaphore.rootTtl(1n),
    "semaphore Nonce(1)": k.semaphore.nonce(1n),
    "semaphore Leaf(1, 42)": k.semaphore.leaf(1n, 42n),
    "semaphore Root(1, 1001)": k.semaphore.root(1n, 1001n),
    "semaphore Nullifier(polls, 1, 77)": k.semaphore.nullifier(POLLS, 1n, 77n),
    "polls Poll(42)": k.polls.poll(42n),
    "polls Tally(42)": k.polls.tally(42n),
    "polls Voters(42)": k.polls.voters(42n),
    "polls Nonce(1)": k.polls.nonce(1n),
    "verifier Vk(4)": k.verifier.vk(4),
    "semaphore instance": k.instance(),
  };

  it("has a case for every vector", () => {
    expect(SCVAL.ledger_keys.map((v) => v.name).sort()).toEqual(Object.keys(cases).sort());
    expect(SCVAL.ledger_keys.find((v) => v.name.startsWith("semaphore Group"))!.contract).toBe(SEM);
  });

  it.each(SCVAL.ledger_keys.map((v) => [v.name, v] as const))("%s", (name, v) => {
    const key = cases[name]!;
    expect(xdrHex(key)).toBe(v.key_scval_xdr_hex);
    expect(xdrHex(contractDataKey(v.contract, key))).toBe(v.ledger_key_xdr_hex);
  });
});

describe("encodeAdminArgs", () => {
  it("is the XDR of an ScVec", () => {
    const x = encodeAdminArgs([u256(5n)]);
    // ScValType::Vec = 16, then Option<Vec> present = 1, length = 1.
    expect(Array.from(x.slice(0, 12))).toEqual([0, 0, 0, 16, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe("errors", () => {
  it("parses contract codes from RPC strings", () => {
    expect(parseContractErrorCode("HostError: Error(Contract, #208)\n...")).toBe(208);
    expect(parseContractErrorCode("Error(Crypto, InvalidInput)")).toBeUndefined();
    const e = new ContractCallError("vote", "Error(Contract, #113)");
    expect(e.code).toBe(113);
    expect(e.message).toContain("NullifierUsed");
    expect(CONTRACT_ERRORS[208]).toBe("AlreadyVoted");
    expect(new ContractCallError("x", "boom").code).toBeUndefined();
  });
});

describe("chunkCommitments", () => {
  it("splits into MAX_BATCH chunks preserving order", () => {
    const xs = Array.from({ length: 70 }, (_, i) => BigInt(i + 1));
    const chunks = chunkCommitments(xs);
    expect(chunks.map((c) => c.length)).toEqual([32, 32, 6]);
    expect(chunks.flat()).toEqual(xs);
    expect(chunkCommitments([])).toEqual([]);
  });
});

// --- clients against a stub RPC: checks method names, argument order and the
// nonce source of every call without a network. ---

const VECTOR_CONTRACT = ADMIN[0]!.contract;
const POLLS_ID = "CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ";
const SUBMITTER = Keypair.random().publicKey();

type Invocation = { method: string; args: xdr.ScVal[] };

function invocationOf(tx: Transaction): Invocation {
  const op = tx.operations[0] as unknown as { func: xdr.HostFunction };
  if (op.func.type !== "hostFunctionTypeInvokeContract") throw new Error("not a contract call");
  const ic = op.func.invokeContract;
  return { method: new TextDecoder().decode(ic.functionName.bytes), args: ic.args };
}

/** Views answer from `views[method]`; transactions are "prepared" as-is. */
function stubServer(views: Record<string, (args: xdr.ScVal[]) => xdr.ScVal>) {
  const viewCalls: { method: string; args: unknown[] }[] = [];
  const server = {
    getAccount: async (id: string) => new Account(id, "1"),
    prepareTransaction: async (tx: Transaction) => tx,
    simulateTransaction: async (tx: Transaction) => {
      const { method, args } = invocationOf(tx);
      viewCalls.push({ method, args: args.map((a) => scValToNative(a)) });
      const f = views[method];
      if (!f) return { error: `HostError: Error(Contract, #100) no stub for ${method}` };
      return { result: { retval: f(args) } };
    },
  } as unknown as rpc.Server;
  return { server, viewCalls };
}

const net = (semaphore: string, polls: string): LihimNetwork => ({
  ...TESTNET,
  semaphoreContractId: semaphore,
  pollsContractId: polls,
  verifierContractId: semaphore,
});
const nonceView = (n: bigint) => () => u64(n);

describe("LihimSemaphoreClient admin calls", () => {
  const opts = { source: SUBMITTER };

  it.each(ADMIN.filter((v) => v.fn_tag !== "create_poll").map((v, i) => [v.fn_tag, i, v] as const))(
    "%s: args are [group_id?, ...signed, sig] with the vector signature",
    async (fnTag, i, v) => {
      const gid = BigInt(v.group_id);
      const { server, viewCalls } = stubServer({
        next_group_id: () => u64(gid),
        nonce: nonceView(BigInt(v.nonce)),
      });
      const sem = new LihimSemaphoreClient(net(v.contract, POLLS_ID), server);
      let tx: Transaction;
      switch (fnTag) {
        case "create_group":
          tx = await sem.createGroup(admin, opts);
          break;
        case "add_member":
          tx = await sem.addMember(gid, 42n, admin, opts);
          break;
        case "add_members":
          tx = await sem.addMembers(gid, [1n, 2n, 3n], admin, opts);
          break;
        case "update_member":
          tx = await sem.updateMember(gid, 1n, 4n, SIBLINGS, admin, opts);
          break;
        case "remove_member":
          tx = await sem.removeMember(gid, 2n, SIBLINGS, admin, opts);
          break;
        default:
          throw new Error("unreachable");
      }
      const inv = invocationOf(tx);
      expect(inv.method).toBe(fnTag);
      const signed = argsFor(i, v);
      const leading = fnTag === "create_group" ? [] : [u64(gid)];
      expect(inv.args).toHaveLength(leading.length + signed.length + 1);
      expect(inv.args.slice(0, -1).map(xdrHex)).toEqual([...leading, ...signed].map(xdrHex));
      expect(hex(scValToNative(inv.args.at(-1)!) as Uint8Array)).toBe(v.signature_hex);
      // create_group signs over next_group_id with nonce 0; the rest read the semaphore nonce.
      expect(viewCalls.map((c) => c.method)).toEqual(fnTag === "create_group" ? ["next_group_id"] : ["nonce"]);
    },
  );

  it("addMembers enforces 1..=MAX_BATCH distinct commitments", async () => {
    const { server } = stubServer({ nonce: nonceView(1n) });
    const sem = new LihimSemaphoreClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => BigInt(i + 1));
    await expect(sem.addMembers(1n, [], admin, opts)).rejects.toThrow();
    await expect(sem.addMembers(1n, many, admin, opts)).rejects.toThrow(/at most 32/);
    await expect(sem.addMembers(1n, [5n, 5n], admin, opts)).rejects.toThrow(/duplicate/);
    await expect(sem.addMembers(1n, many.slice(0, MAX_BATCH), admin, opts)).resolves.toBeDefined();
  });

  it("addMembersBatched sends chunks in order, re-reading the nonce for each", async () => {
    let nonce = 1n;
    const { server, viewCalls } = stubServer({ nonce: () => u64(nonce) });
    const sem = new LihimSemaphoreClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    const commitments = Array.from({ length: 70 }, (_, i) => BigInt(i + 1));
    const sent: { n: number; sig: string }[] = [];
    const results = await sem.addMembersBatched(1n, commitments, admin, opts, async (tx) => {
      const inv = invocationOf(tx);
      const batch = scValToNative(inv.args[1]!) as bigint[];
      const sig = scValToNative(inv.args[2]!) as Uint8Array;
      // Each chunk is signed over the nonce current when it was built.
      const expected = signAdminCall(
        { contractId: VECTOR_CONTRACT, fnTag: "add_members", chainGroupId: 1n, nonce, args: adminArgs.add_members(batch) },
        admin,
      );
      expect(hex(sig)).toBe(hex(expected.sig));
      sent.push({ n: batch.length, sig: hex(sig) });
      nonce += 1n; // the contract bumps it on success
      return batch.length;
    });
    expect(results).toEqual([32, 32, 6]);
    expect(new Set(sent.map((s) => s.sig)).size).toBe(3);
    expect(viewCalls.filter((c) => c.method === "nonce")).toHaveLength(3);
    await expect(sem.addMembersBatched(1n, [1n, 1n], admin, opts, async () => 0)).rejects.toThrow(/duplicate/);
  });

  it("createGroupWithRetry re-reads next_group_id after losing the race", async () => {
    let next = 5n;
    const { server } = stubServer({ next_group_id: () => u64(next) });
    const sem = new LihimSemaphoreClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    const signedFor: bigint[] = [];
    const out = await sem.createGroupWithRetry(admin, opts, async (tx) => {
      const sig = scValToNative(invocationOf(tx).args[1]!) as Uint8Array;
      const gid = [5n, 6n].find(
        (g) =>
          hex(
            signAdminCall(
              { contractId: VECTOR_CONTRACT, fnTag: "create_group", chainGroupId: g, nonce: 0n, args: adminArgs.create_group(admin.publicKey) },
              admin,
            ).sig,
          ) === hex(sig),
      )!;
      signedFor.push(gid);
      if (signedFor.length === 1) {
        next = 6n; // someone else created group 5 first
        throw new Error("Error(Crypto, InvalidInput)");
      }
      return "ok";
    });
    expect(signedFor).toEqual([5n, 6n]);
    expect(out).toEqual({ chainGroupId: 6n, result: "ok" });
  });

  it("createGroupWithRetry does not retry unrelated failures", async () => {
    const { server } = stubServer({ next_group_id: nonceView(5n) });
    const sem = new LihimSemaphoreClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    let calls = 0;
    await expect(
      sem.createGroupWithRetry(admin, opts, async () => {
        calls++;
        throw new Error("insufficient fee");
      }),
    ).rejects.toThrow(/insufficient fee/);
    expect(calls).toBe(1);
  });
});

describe("caller-namespaced proof calls (D3)", () => {
  const proof: LihimProof = { depth: 4, root: 1001n, nullifier: 77n, message: 1n, scope: 42n, points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n] };

  it("validate_proof / validate_frozen_proof put caller first", async () => {
    const { server } = stubServer({});
    const sem = new LihimSemaphoreClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    for (const [tx, method] of [
      [await sem.validateProof(SUBMITTER, 3n, proof, { source: SUBMITTER }), "validate_proof"],
      [await sem.validateFrozenProof(SUBMITTER, 3n, proof, { source: SUBMITTER }), "validate_frozen_proof"],
    ] as const) {
      const inv = invocationOf(tx);
      expect(inv.method).toBe(method);
      expect(inv.args.map((a) => scValToNative(a))).toEqual([SUBMITTER, 3n, proof]);
      expect(xdrHex(inv.args[2]!)).toBe(xdrHex(proofToScVal(proof)));
    }
  });

  it("verify_proof, has_nullifier and hasVoted pass the namespace", async () => {
    const { server, viewCalls } = stubServer({
      verify_proof: () => xdr.ScVal.scvBool(true),
      has_nullifier: () => xdr.ScVal.scvBool(false),
    });
    const sem = new LihimSemaphoreClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    expect(await sem.verifyProof(POLLS_ID, 3n, proof)).toBe(true);
    expect(await sem.hasNullifier(SUBMITTER, 3n, 77n)).toBe(false);
    expect(await sem.hasVoted(3n, 77n)).toBe(false);
    expect(viewCalls).toEqual([
      { method: "verify_proof", args: [POLLS_ID, 3n, proof] },
      { method: "has_nullifier", args: [SUBMITTER, 3n, 77n] },
      { method: "has_nullifier", args: [POLLS_ID, 3n, 77n] },
    ]);
  });

  it("view errors carry the contract code", async () => {
    const { server } = stubServer({});
    const sem = new LihimSemaphoreClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    await expect(sem.getRoot(9n)).rejects.toMatchObject({ name: "ContractCallError", code: 100 });
  });
});

describe("LihimPollsClient", () => {
  const opts = { source: SUBMITTER };
  const pollVectors = ADMIN.map((v, i) => [i, v] as const).filter(([, v]) => v.fn_tag === "create_poll");

  it.each(pollVectors.map(([i, v]) => [KINDS[i - 5]!.kind, i, v] as const))(
    "create_poll (%s) signs over the POLLS nonce and orders args [group_id, kind, closes_at, meta_hash, sig]",
    async (_k, i, v) => {
      const { server, viewCalls } = stubServer({ nonce: nonceView(BigInt(v.nonce)) });
      // The vectors sign with one contract id for every fn tag.
      const polls = new LihimPollsClient(net(POLLS_ID, v.contract), server);
      const tx = await polls.createPoll({ chainGroupId: BigInt(v.group_id), kind: KINDS[i - 5]!, closesAt: CLOSES_AT, metaHash: META }, admin, opts);
      const inv = invocationOf(tx);
      expect(inv.method).toBe("create_poll");
      expect(inv.args.slice(0, 4).map(xdrHex)).toEqual(
        [u64(BigInt(v.group_id)), ...adminArgs.create_poll(KINDS[i - 5]!, CLOSES_AT, META)].map(xdrHex),
      );
      expect(hex(scValToNative(inv.args[4]!) as Uint8Array)).toBe(v.signature_hex);
      expect(viewCalls).toEqual([{ method: "nonce", args: [BigInt(v.group_id)] }]);
    },
  );

  it("vote is (poll_id, proof)", async () => {
    const { server } = stubServer({});
    const polls = new LihimPollsClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    const proof: LihimProof = { depth: 4, root: 1n, nullifier: 2n, message: 0n, scope: 42n, points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n] };
    const inv = invocationOf(await polls.vote("42", proof, opts));
    expect(inv.method).toBe("vote");
    expect(inv.args.map((a) => scValToNative(a))).toEqual([42n, proof]);
  });

  it("getPoll decodes the kind", async () => {
    const { server } = stubServer({
      poll: () =>
        xdr.ScVal.scvMap(
          [
            ["closed", xdr.ScVal.scvBool(false)],
            ["closes_at", u64(10n)],
            ["kind", pollKindToScVal({ kind: "single", options: 4 })],
          ].map(([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k as string), val: v as xdr.ScVal })),
        ),
    });
    const polls = new LihimPollsClient(net(VECTOR_CONTRACT, POLLS_ID), server);
    const p = await polls.getPoll(1n);
    expect(p.kind).toEqual({ kind: "single", options: 4 });
    expect(p.closes_at).toBe(10n);
  });
});
