import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { adminMessage, type AdminFnTag } from "./admin.js";
import { parseU64 } from "./encoding.js";
import type { AdminKey } from "./identity.js";
import { POLL_KIND_TAG, type LihimNetwork, type LihimProof, type PollKind } from "./types.js";

/*
 * Every encoder below follows contracts/INTERFACE.md §3 ("ScVal encodings
 * from JS") byte for byte, and test/contracts.test.ts locks them against the
 * Rust-written vectors in contracts/test-vectors/{admin-auth,scval}.json.
 *
 * Ids: `chainGroupId` / `pollId` are the on-chain u64 ids. The off-chain
 * Supabase `groups.id` uuid never reaches a contract; it is only used for key
 * derivation (see ./identity).
 */

type ScVal = xdr.ScVal;

/** Used as the source for read-only simulations; RPC does not load it. */
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Max commitments per `add_members` call (semaphore `MAX_BATCH`; error 107 above it).
 * TODO(M0): tune against real testnet resource limits.
 */
export const MAX_BATCH = 32;
/** Max options for `PollKind::Single(n)` (polls `MAX_OPTIONS`; n >= 2). */
export const MAX_OPTIONS = 32;

// --- primitive encoders (INTERFACE.md §3) ---
export const u32 = (n: number): ScVal => xdr.ScVal.scvU32(n);
export const u64 = (n: bigint): ScVal => nativeToScVal(n, { type: "u64" });
export const u256 = (n: bigint): ScVal => nativeToScVal(n, { type: "u256" });
/** `BytesN<N>`; nativeToScVal accepts a plain Uint8Array (no Buffer needed in browsers). */
export const bytes = (b: Uint8Array): ScVal => nativeToScVal(b, { type: "bytes" });
export const sym = (s: string): ScVal => xdr.ScVal.scvSymbol(s);
export const vec = (items: ScVal[]): ScVal => xdr.ScVal.scvVec(items);
/** `Address` from a G... or C... strkey. */
export const addr = (strkey: string): ScVal => new Address(strkey).toScVal();

/** `#[contracttype]` struct: ScMap with symbol keys sorted by name (the host rejects unsorted maps). */
export function struct(fields: Record<string, ScVal>): ScVal {
  return xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort()
      .map((k) => new xdr.ScMapEntry({ key: sym(k), val: fields[k]! })),
  );
}

/** `#[contracttype]` enum variant: Vec[Symbol(name), ...fields]. */
export const variant = (name: string, ...fields: ScVal[]): ScVal => vec([sym(name), ...fields]);

/**
 * `Proof` contracttype. `message` and `scope` go in RAW (choice, poll id);
 * the contract applies `hashToField` itself. Wire order (sorted):
 * depth, message, nullifier, points, root, scope.
 */
export function proofToScVal(proof: LihimProof): ScVal {
  if (proof.points.length !== 8) throw new TypeError("points must have 8 elements");
  return struct({
    depth: u32(proof.depth),
    root: u256(proof.root),
    nullifier: u256(proof.nullifier),
    message: u256(proof.message),
    scope: u256(proof.scope),
    points: vec(proof.points.map(u256)),
  });
}

export type PollKindInput =
  | { kind: "single"; options: number }
  | { kind: "rating" }
  | { kind: "yesno" };

/** Rust `enum PollKind { Single(u32), Rating, YesNo }`. */
export function pollKindToScVal(k: PollKindInput): ScVal {
  switch (k.kind) {
    case "single":
      if (!Number.isInteger(k.options) || k.options < 2 || k.options > MAX_OPTIONS) {
        throw new RangeError(`single needs 2..=${MAX_OPTIONS} options`);
      }
      return variant("Single", u32(k.options));
    case "rating":
      return variant("Rating");
    case "yesno":
      return variant("YesNo");
  }
}

/** Inverse of `pollKindToScVal` for `scValToNative` output (`["Single", 3]`, `["YesNo"]`). */
export function pollKindFromNative(raw: unknown): PollKindInput {
  if (!Array.isArray(raw) || typeof raw[0] !== "string") throw new TypeError("not a PollKind");
  switch (raw[0]) {
    case "Single":
      return { kind: "single", options: Number(raw[1]) };
    case "Rating":
      return { kind: "rating" };
    case "YesNo":
      return { kind: "yesno" };
    default:
      throw new TypeError(`unknown PollKind variant ${raw[0]}`);
  }
}

/** Numeric tag in the `poll_created` event (0 single, 1 rating, 2 yesno). */
export const pollKindTag = (k: PollKindInput): number => POLL_KIND_TAG[k.kind];

/**
 * `args` of the admin digest per fn_tag (INTERFACE.md §5.2): the call's
 * arguments without `group_id` and `sig`, in contract order.
 */
export const adminArgs = {
  create_group: (adminPublicKey: Uint8Array): ScVal[] => {
    if (adminPublicKey.length !== 32) throw new TypeError("admin public key must be 32 bytes");
    return [bytes(adminPublicKey)];
  },
  add_member: (commitment: bigint): ScVal[] => [u256(commitment)],
  add_members: (commitments: bigint[]): ScVal[] => [vec(commitments.map(u256))],
  update_member: (oldCommitment: bigint, newCommitment: bigint, siblings: bigint[]): ScVal[] => [
    u256(oldCommitment),
    u256(newCommitment),
    vec(siblings.map(u256)),
  ],
  remove_member: (oldCommitment: bigint, siblings: bigint[]): ScVal[] => [u256(oldCommitment), vec(siblings.map(u256))],
  create_poll: (kind: PollKindInput, closesAt: bigint, metaHash: Uint8Array): ScVal[] => {
    if (metaHash.length !== 32) throw new TypeError("metaHash must be 32 bytes");
    return [pollKindToScVal(kind), u64(closesAt), bytes(metaHash)];
  },
} satisfies Record<AdminFnTag, (...a: never[]) => ScVal[]>;

/** `args_xdr` in the admin digest: XDR of an `ScVal::Vec` holding `args`. */
export function encodeAdminArgs(args: ScVal[]): Uint8Array {
  return new Uint8Array(vec(args).toXDR());
}

export type AdminSignatureInput = {
  contractId: string;
  fnTag: AdminFnTag;
  /** On-chain u64 group id (for create_group: `next_group_id()`). */
  chainGroupId: bigint;
  nonce: bigint;
  args: ScVal[];
};

/** Digest + Ed25519 signature for an admin call (INTERFACE.md §5.1). */
export function signAdminCall(input: AdminSignatureInput, admin: AdminKey): { digest: Uint8Array; sig: Uint8Array } {
  const digest = adminMessage({
    contractId: input.contractId,
    fnTag: input.fnTag,
    groupId: input.chainGroupId,
    nonce: input.nonce,
    argsXdr: encodeAdminArgs(input.args),
  });
  return { digest, sig: admin.sign(digest) };
}

// --- errors (INTERFACE.md §8; codes are unique across the three contracts) ---
export const CONTRACT_ERRORS = {
  100: "GroupNotFound",
  101: "LeafOutOfField",
  102: "LeafIsZero",
  103: "LeafExists",
  104: "LeafNotFound",
  105: "WrongSiblingNodes",
  106: "EmptyBatch",
  107: "BatchTooLarge",
  108: "DepthNotSupported",
  109: "DepthTooSmall",
  110: "GroupHasNoMembers",
  111: "RootNotInGroup",
  112: "RootExpired",
  113: "NullifierUsed",
  114: "InvalidProof",
  115: "MalformedProof",
  116: "FieldOutOfRange",
  200: "PollNotFound",
  201: "TooFewMembers",
  202: "InvalidKind",
  203: "InvalidCloseTime",
  204: "PollClosed",
  205: "WrongRoot",
  206: "WrongScope",
  207: "ChoiceOutOfRange",
  208: "AlreadyVoted",
  209: "NotYetClosable",
  210: "AlreadyClosed",
  300: "Finalized",
  301: "DepthNotSupported",
  302: "VkNotSet",
  303: "MalformedVk",
  304: "MissingVks",
  305: "MalformedInput",
} as const satisfies Record<number, string>;

export type ContractErrorCode = keyof typeof CONTRACT_ERRORS;

/**
 * Pull the contract error code out of an RPC error/diagnostic string
 * (`Error(Contract, #208)`). Undefined for host traps such as a bad admin
 * signature (`Error(Crypto, InvalidInput)`) or missing auth.
 * TODO(M0): confirm the exact host-trap strings on testnet.
 */
export function parseContractErrorCode(detail: string): number | undefined {
  const m = /Error\(Contract, #(\d+)\)/.exec(detail);
  return m ? Number(m[1]) : undefined;
}

export class ContractCallError extends Error {
  /** Contract error code when the failure was a contract error (see `CONTRACT_ERRORS`). */
  readonly code: number | undefined;

  constructor(
    readonly method: string,
    readonly detail: string,
  ) {
    const code = parseContractErrorCode(detail);
    const name = code !== undefined ? CONTRACT_ERRORS[code as ContractErrorCode] : undefined;
    super(`${method} failed: ${name ? `${name} (#${code}) ` : ""}${detail}`);
    this.name = "ContractCallError";
    this.code = code;
  }
}

// --- storage keys (INTERFACE.md §9), for getLedgerEntries / ExtendFootprintTTLOp ---
export const storageKeys = {
  semaphore: {
    group: (gid: bigint) => variant("Group", u64(gid)),
    tree: (gid: bigint) => variant("Tree", u64(gid)),
    rootTtl: (gid: bigint) => variant("RootTtl", u64(gid)),
    nonce: (gid: bigint) => variant("Nonce", u64(gid)),
    leaf: (gid: bigint, commitment: bigint) => variant("Leaf", u64(gid), u256(commitment)),
    root: (gid: bigint, root: bigint) => variant("Root", u64(gid), u256(root)),
    /** Votes live in the polls namespace: `caller` = the LihimPolls contract id. */
    nullifier: (caller: string, gid: bigint, nullifier: bigint) =>
      variant("Nullifier", addr(caller), u64(gid), u256(nullifier)),
  },
  polls: {
    poll: (pollId: bigint) => variant("Poll", u64(pollId)),
    tally: (pollId: bigint) => variant("Tally", u64(pollId)),
    voters: (pollId: bigint) => variant("Voters", u64(pollId)),
    nonce: (gid: bigint) => variant("Nonce", u64(gid)),
  },
  verifier: {
    vk: (depth: number) => variant("Vk", u32(depth)),
  },
  instance: (): ScVal => xdr.ScVal.scvLedgerKeyContractInstance(),
};

/** Persistent contract-data ledger key (the instance key also uses persistent durability). */
export function contractDataKey(contractId: string, key: ScVal): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

// --- clients ---

export type BuildOptions = {
  /** G... account that pays and signs the envelope (relay or admin submitter). */
  source: string;
  fee?: string;
  timeoutSeconds?: number;
};

export type ContractFnCall = { method: string; args: ScVal[] };

/** Signs, submits and waits for one transaction; used by the multi-tx helpers. */
export type SendTx<T = unknown> = (tx: Transaction) => Promise<T>;

abstract class BaseClient {
  readonly server: rpc.Server;
  readonly contract: Contract;

  constructor(
    readonly network: LihimNetwork,
    contractId: string,
    server?: rpc.Server,
  ) {
    this.server = server ?? new rpc.Server(network.rpcUrl, { allowHttp: network.rpcUrl.startsWith("http://") });
    this.contract = new Contract(contractId);
  }

  get contractId(): string {
    return this.contract.contractId();
  }

  /**
   * Builds the invocation and runs `prepareTransaction` (simulate + attach
   * footprint/resource fee and any auth entries). The returned tx is NOT
   * signed; the caller signs the envelope with `source` and submits via `submit()`.
   */
  async build(call: ContractFnCall, opts: BuildOptions): Promise<Transaction> {
    const account = await this.server.getAccount(opts.source);
    const tx = new TransactionBuilder(account, {
      fee: opts.fee ?? BASE_FEE,
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(this.contract.call(call.method, ...call.args))
      .setTimeout(opts.timeoutSeconds ?? 60)
      .build();
    try {
      return await this.server.prepareTransaction(tx);
    } catch (err) {
      throw new ContractCallError(call.method, err instanceof Error ? err.message : String(err));
    }
  }

  /** Read-only call via simulation; costs nothing and needs no account. */
  async view<T = unknown>(method: string, args: ScVal[] = []): Promise<T> {
    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
      fee: BASE_FEE,
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new ContractCallError(method, sim.error);
    const retval = sim.result?.retval;
    return (retval === undefined ? undefined : scValToNative(retval)) as T;
  }

  /** Submit a signed tx and wait for the final status. */
  async submit(signed: Transaction): Promise<rpc.Api.GetTransactionResponse & { hash: string }> {
    const sent = await this.server.sendTransaction(signed);
    if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
      throw new ContractCallError("sendTransaction", sent.status);
    }
    const res = await this.server.pollTransaction(sent.hash);
    return Object.assign(res, { hash: sent.hash });
  }

  /** `[...leadingArgs, ...signedArgs, sig]`: `group_id` leads, `sig` is always last. */
  protected adminCall(
    fnTag: AdminFnTag,
    chainGroupId: bigint,
    nonce: bigint,
    signedArgs: ScVal[],
    leadingArgs: ScVal[],
    admin: AdminKey,
  ): ContractFnCall {
    const { sig } = signAdminCall({ contractId: this.contractId, fnTag, chainGroupId, nonce, args: signedArgs }, admin);
    return { method: fnTag, args: [...leadingArgs, ...signedArgs, bytes(sig)] };
  }
}

/** `Group` contracttype as decoded by `scValToNative`. */
export type GroupInfo = {
  admin: Uint8Array;
  /** LeanIMT size: leaf slots ever used (removed leaves stay counted). */
  size: number;
  /** Active members (`size` minus removed): the anonymity set. */
  members: number;
  depth: number;
  root: bigint;
  created_at: bigint;
};

export type RootRecord = { replaced_at: bigint; depth: number };

export class LihimSemaphoreClient extends BaseClient {
  constructor(network: LihimNetwork, server?: rpc.Server) {
    super(network, network.semaphoreContractId, server);
  }

  // --- views ---
  getGroup(chainGroupId: bigint): Promise<GroupInfo> {
    return this.view("group", [u64(chainGroupId)]);
  }
  getRoot(chainGroupId: bigint): Promise<bigint> {
    return this.view("root", [u64(chainGroupId)]);
  }
  /** LeanIMT size (leaf slots ever used). */
  async getSize(chainGroupId: bigint): Promise<number> {
    return Number(await this.view("size", [u64(chainGroupId)]));
  }
  /** Active members (`Group.members`), the value `min_members` is checked against. */
  async getMemberCount(chainGroupId: bigint): Promise<number> {
    return Number(await this.view("member_count", [u64(chainGroupId)]));
  }
  async getDepth(chainGroupId: bigint): Promise<number> {
    return Number(await this.view("depth", [u64(chainGroupId)]));
  }
  isMember(chainGroupId: bigint, commitment: bigint): Promise<boolean> {
    return this.view("is_member", [u64(chainGroupId), u256(commitment)]);
  }
  /** 0-based leaf index; fails with 104 when not a member. */
  async indexOf(chainGroupId: bigint, commitment: bigint): Promise<number> {
    return Number(await this.view("index_of", [u64(chainGroupId), u256(commitment)]));
  }
  /** Whether `nullifier` is spent in `caller`'s namespace (D3). */
  hasNullifier(caller: string, chainGroupId: bigint, nullifier: bigint): Promise<boolean> {
    return this.view("has_nullifier", [addr(caller), u64(chainGroupId), u256(nullifier)]);
  }
  /** "Have I voted?": the nullifier in the LihimPolls namespace. */
  hasVoted(chainGroupId: bigint, nullifier: bigint): Promise<boolean> {
    return this.hasNullifier(this.network.pollsContractId, chainGroupId, nullifier);
  }
  /** Nonce the next admin signature for this group must use (0 before the group exists). */
  async getNonce(chainGroupId: bigint): Promise<bigint> {
    return BigInt(await this.view("nonce", [u64(chainGroupId)]));
  }
  /** Id the next `create_group` will get; `create_group` signs over it with nonce 0. */
  async getNextGroupId(): Promise<bigint> {
    return BigInt(await this.view("next_group_id"));
  }
  async getRootTtl(chainGroupId: bigint): Promise<bigint> {
    return BigInt(await this.view("root_ttl", [u64(chainGroupId)]));
  }
  /** `null` unless `root` is a replaced (historical) root of the group. */
  getRootRecord(chainGroupId: bigint, root: bigint): Promise<RootRecord | null> {
    return this.view("root_record", [u64(chainGroupId), u256(root)]);
  }
  getVerifier(): Promise<string> {
    return this.view("verifier");
  }
  /**
   * Same checks as `validate_proof` with the nullifier looked up in
   * `caller`'s namespace, no writes (free). For a vote pre-check pass the
   * polls contract id. `false` means only that Groth16 failed; every other
   * check throws a `ContractCallError` with its code.
   */
  verifyProof(caller: string, chainGroupId: bigint, proof: LihimProof): Promise<boolean> {
    return this.view("verify_proof", [addr(caller), u64(chainGroupId), proofToScVal(proof)]);
  }

  // --- admin transactions (signed in the browser, submitted by anyone) ---

  /**
   * Signs over `chainGroupId` (default `next_group_id()`) with nonce 0. If
   * another group takes that id before this lands, the call traps on the
   * signature; use `createGroupWithRetry` or rebuild with the same key.
   */
  async createGroup(admin: AdminKey, opts: BuildOptions & { chainGroupId?: bigint }): Promise<Transaction> {
    const chainGroupId = opts.chainGroupId ?? (await this.getNextGroupId());
    const call = this.adminCall("create_group", chainGroupId, 0n, adminArgs.create_group(admin.publicKey), [], admin);
    return this.build(call, opts);
  }

  /**
   * INTERFACE.md §5.4: read `next_group_id`, sign, send; on failure re-read
   * and retry with the same key. `send` signs, submits and waits, and must
   * throw when the transaction does not succeed.
   */
  async createGroupWithRetry<T>(
    admin: AdminKey,
    opts: BuildOptions,
    send: SendTx<T>,
    maxAttempts = 3,
  ): Promise<{ chainGroupId: bigint; result: T }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const chainGroupId = await this.getNextGroupId();
      try {
        const tx = await this.createGroup(admin, { ...opts, chainGroupId });
        return { chainGroupId, result: await send(tx) };
      } catch (err) {
        lastErr = err;
        // Only an id race is worth retrying, and it shows up as the id having moved on.
        if ((await this.getNextGroupId()) === chainGroupId) throw err;
      }
    }
    throw lastErr;
  }

  async addMember(chainGroupId: bigint, commitment: bigint, admin: AdminKey, opts: BuildOptions): Promise<Transaction> {
    const nonce = await this.getNonce(chainGroupId);
    const call = this.adminCall("add_member", chainGroupId, nonce, adminArgs.add_member(commitment), [u64(chainGroupId)], admin);
    return this.build(call, opts);
  }

  /** One `add_members` call: 1..=MAX_BATCH distinct commitments. Use `addMembersBatched` for more. */
  async addMembers(chainGroupId: bigint, commitments: bigint[], admin: AdminKey, opts: BuildOptions): Promise<Transaction> {
    assertBatch(commitments);
    const nonce = await this.getNonce(chainGroupId);
    const call = this.adminCall("add_members", chainGroupId, nonce, adminArgs.add_members(commitments), [u64(chainGroupId)], admin);
    return this.build(call, opts);
  }

  /**
   * Any number of commitments, in chunks of MAX_BATCH. Each chunk is its own
   * transaction signed over the then-current nonce, so chunks are built and
   * sent strictly one after another (`send` must wait for the result).
   */
  async addMembersBatched<T>(
    chainGroupId: bigint,
    commitments: bigint[],
    admin: AdminKey,
    opts: BuildOptions,
    send: SendTx<T>,
  ): Promise<T[]> {
    if (new Set(commitments).size !== commitments.length) throw new RangeError("duplicate commitments");
    const results: T[] = [];
    for (const chunk of chunkCommitments(commitments)) {
      results.push(await send(await this.addMembers(chainGroupId, chunk, admin, opts)));
    }
    return results;
  }

  /** `siblings` = `group.generateMerkleProof(index).siblings` from `@semaphore-protocol/group`. */
  async updateMember(
    chainGroupId: bigint,
    oldCommitment: bigint,
    newCommitment: bigint,
    siblings: bigint[],
    admin: AdminKey,
    opts: BuildOptions,
  ): Promise<Transaction> {
    const nonce = await this.getNonce(chainGroupId);
    const signed = adminArgs.update_member(oldCommitment, newCommitment, siblings);
    const call = this.adminCall("update_member", chainGroupId, nonce, signed, [u64(chainGroupId)], admin);
    return this.build(call, opts);
  }

  /**
   * Zeroes a leaf. Needs the member's commitment, which only the member
   * knows, so the app's admin "Remove" is off-chain only (INTERFACE.md §11).
   */
  async removeMember(
    chainGroupId: bigint,
    oldCommitment: bigint,
    siblings: bigint[],
    admin: AdminKey,
    opts: BuildOptions,
  ): Promise<Transaction> {
    const nonce = await this.getNonce(chainGroupId);
    const signed = adminArgs.remove_member(oldCommitment, siblings);
    const call = this.adminCall("remove_member", chainGroupId, nonce, signed, [u64(chainGroupId)], admin);
    return this.build(call, opts);
  }

  // --- proof transactions ---

  /**
   * Spends the nullifier in `caller`'s namespace (D3); `caller` must
   * authorize. With `caller === opts.source` the envelope signature covers it.
   * Votes do NOT go through here: use `LihimPollsClient.vote`.
   */
  validateProof(caller: string, chainGroupId: bigint, proof: LihimProof, opts: BuildOptions): Promise<Transaction> {
    return this.build({ method: "validate_proof", args: [addr(caller), u64(chainGroupId), proofToScVal(proof)] }, opts);
  }

  /** As `validateProof` but accepts any root the group has ever had. */
  validateFrozenProof(caller: string, chainGroupId: bigint, proof: LihimProof, opts: BuildOptions): Promise<Transaction> {
    return this.build(
      { method: "validate_frozen_proof", args: [addr(caller), u64(chainGroupId), proofToScVal(proof)] },
      opts,
    );
  }

  // --- keeper hooks (anyone; fees only) ---
  bumpGroup(chainGroupId: bigint, opts: BuildOptions): Promise<Transaction> {
    return this.build({ method: "bump_group", args: [u64(chainGroupId)] }, opts);
  }
  /** For vote nullifiers, `caller` = the polls contract id. */
  bumpKeys(caller: string, chainGroupId: bigint, leaves: bigint[], nullifiers: bigint[], opts: BuildOptions): Promise<Transaction> {
    return this.build(
      { method: "bump_keys", args: [addr(caller), u64(chainGroupId), vec(leaves.map(u256)), vec(nullifiers.map(u256))] },
      opts,
    );
  }
}

function assertBatch(commitments: bigint[]) {
  if (commitments.length === 0) throw new RangeError("add_members needs at least one commitment");
  if (commitments.length > MAX_BATCH) throw new RangeError(`add_members takes at most ${MAX_BATCH}; use addMembersBatched`);
  if (new Set(commitments).size !== commitments.length) throw new RangeError("duplicate commitments");
}

/** Split into chunks of at most `size` (default MAX_BATCH), preserving order. */
export function chunkCommitments<T>(items: T[], size = MAX_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Raw `Poll` contracttype as decoded by `scValToNative`. */
type RawPoll = Omit<PollInfo, "kind"> & { kind: unknown };

export type PollInfo = {
  group_id: bigint;
  creator_key: Uint8Array;
  kind: PollKindInput;
  frozen_root: bigint;
  /** `Group.members` at creation. */
  frozen_size: number;
  opens_at: bigint;
  closes_at: bigint;
  meta_hash: Uint8Array;
  closed: boolean;
};

export class LihimPollsClient extends BaseClient {
  constructor(network: LihimNetwork, server?: rpc.Server) {
    super(network, network.pollsContractId, server);
  }

  async getPoll(pollId: bigint | string): Promise<PollInfo> {
    const raw = await this.view<RawPoll>("poll", [u64(parseU64(pollId, "pollId"))]);
    return { ...raw, kind: pollKindFromNative(raw.kind) };
  }
  /** One count per bucket: option index for single/yesno, rating-1 for rating. */
  async getTally(pollId: bigint | string): Promise<number[]> {
    const raw = await this.view<unknown[]>("tally", [u64(parseU64(pollId, "pollId"))]);
    return raw.map((n) => Number(n));
  }
  async getVotersCount(pollId: bigint | string): Promise<number> {
    return Number(await this.view("voters_count", [u64(parseU64(pollId, "pollId"))]));
  }
  /** The `create_poll` nonce: a polls-side counter per group, separate from the semaphore's. */
  async getNonce(chainGroupId: bigint): Promise<bigint> {
    return BigInt(await this.view("nonce", [u64(chainGroupId)]));
  }
  async getNextPollId(): Promise<bigint> {
    return BigInt(await this.view("next_poll_id"));
  }
  async getMinMembers(): Promise<number> {
    return Number(await this.view("min_members"));
  }
  getSemaphore(): Promise<string> {
    return this.view("semaphore");
  }

  /** Fails with 201 when the group has fewer than `min_members` active members. */
  async createPoll(
    input: { chainGroupId: bigint; kind: PollKindInput; closesAt: bigint; metaHash: Uint8Array },
    admin: AdminKey,
    opts: BuildOptions,
  ): Promise<Transaction> {
    const signed = adminArgs.create_poll(input.kind, input.closesAt, input.metaHash);
    const nonce = await this.getNonce(input.chainGroupId);
    const call = this.adminCall("create_poll", input.chainGroupId, nonce, signed, [u64(input.chainGroupId)], admin);
    return this.build(call, opts);
  }

  /** Built by the relay; the proof is the voter's only credential and no auth entries are needed. */
  vote(pollId: bigint | string, proof: LihimProof, opts: BuildOptions): Promise<Transaction> {
    return this.build({ method: "vote", args: [u64(parseU64(pollId, "pollId")), proofToScVal(proof)] }, opts);
  }

  close(pollId: bigint | string, opts: BuildOptions): Promise<Transaction> {
    return this.build({ method: "close", args: [u64(parseU64(pollId, "pollId"))] }, opts);
  }

  bumpPoll(pollId: bigint | string, opts: BuildOptions): Promise<Transaction> {
    return this.build({ method: "bump_poll", args: [u64(parseU64(pollId, "pollId"))] }, opts);
  }
}

export type { PollKind };
