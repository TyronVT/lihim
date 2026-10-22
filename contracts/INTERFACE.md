# Lihim contracts: interface reference

This file is the canonical description of the on-chain interface. The SDK
(`packages/sdk`), the relay (`apps/relay`) and the Supabase indexer, keeper
and edge functions code against it. If this file and the code disagree,
the code is wrong or this file is stale. Either way, fix one of them.

What backs it:

- The contract specs embedded in the wasm. Print them with
  `stellar contract info interface --wasm target/wasm32v1-none/release/lihim_<name>.wasm`.
- Known-answer vectors written by the Rust tests:
  `test-vectors/admin-auth.json` (admin digests and signatures) and
  `test-vectors/scval.json` (ScVal and ledger-key XDR).
- `test-vectors/check-js.mjs`, which rebuilds every vector with
  `@stellar/stellar-sdk@17.3.0` and `@noble/curves@2.4.0` using exactly the
  recipes below. Run `node contracts/test-vectors/check-js.mjs --deps .` from
  the repo root. Last result: `ok: 8 admin-auth + 4 values + 13 ledger keys (25)`.

Contents: [1 Deployment](#1-deployment) · [2 Types](#2-types) ·
[3 ScVal encodings from JS](#3-scval-encodings-from-js) ·
[4 Functions](#4-functions) · [5 Admin authorization](#5-admin-authorization) ·
[6 Proofs and nullifier namespaces](#6-proofs-and-nullifier-namespaces) ·
[7 Events](#7-events) · [8 Errors](#8-errors) ·
[9 Storage layout and TTL](#9-storage-layout-and-ttl) ·
[10 Constants](#10-constants) · [11 Membership removal](#11-membership-removal-mvp)

---

## 1. Deployment

Deploy order: verifier, then semaphore, then polls (`scripts/deploy-testnet.sh`).

| Contract | Constructor | Env var |
|---|---|---|
| `LihimVerifier` | `__constructor(admin: Address)` | `LIHIM_VERIFIER_ID` |
| `LihimSemaphore` | `__constructor(verifier: Address)` | `LIHIM_SEMAPHORE_ID` |
| `LihimPolls` | `__constructor(semaphore: Address, min_members: u32, first_poll_id: u64)` | `LIHIM_POLLS_ID` |

Production values: `min_members = 8`, `first_poll_id = 1` for a fresh
semaphore. When a new polls contract is deployed against an existing
semaphore, set `first_poll_id` above every poll id the old one used (see
[6](#6-proofs-and-nullifier-namespaces)).

The verifier is loaded with `set_vk(depth, vk)` for depths 1..=32 and then
`finalize()`d. After that its keys are immutable.

Ids: group ids and poll ids are `u64` and start at 1, so 0 never names a
real group or poll. The off-chain Supabase `groups.id` is a uuid and is a
different thing. It appears only in the HKDF info strings
([5.3](#53-key-derivation-d1)).

---

## 2. Types

All of these are `#[contracttype]`s in `lihim-common` (except `RootRecord`,
which is in `lihim-semaphore`). They are listed below in declaration order.
On the wire a struct is an `ScMap` whose keys are **sorted by name**, and
that order is shown as "wire order".

### `Proof`

| Field | Type | Meaning |
|---|---|---|
| `depth` | `u32` | Circuit tree depth, 1..=32. Must be ≥ the depth of the tree that `root` came from |
| `root` | `U256` | Merkle root the proof is against |
| `nullifier` | `U256` | `poseidon(scope, secret)` from the circuit |
| `message` | `U256` | Raw message. For polls this is the choice (below) |
| `scope` | `U256` | Raw scope. For polls this is the poll id |
| `points` | `Vec<U256>` | Exactly 8 values: `packGroth16Proof(proof.points)` from `@semaphore-protocol/proof`, i.e. `[a.x, a.y, b.x.c1, b.x.c0, b.y.c1, b.y.c0, c.x, c.y]`, passed through unchanged |

Wire order: `depth, message, nullifier, points, root, scope`.

`message` and `scope` are sent **raw**. The contract computes
`hash(x) = keccak256(be32(x)) >> 8` itself and verifies against the public
signals `[root, nullifier, hash(message), hash(scope)]`. In
`@semaphore-protocol/proof` 4.x, `SemaphoreProof` has `merkleTreeDepth`,
`merkleTreeRoot`, `nullifier`, `message`, `scope` and `points` (all
decimal strings except the depth and `points`), which map 1:1 onto the
fields above.

Poll choice (`message`):

| `PollKind` | Valid `message` | Tally bucket |
|---|---|---|
| `Single(n)` | `0..n` (option index) | `message` |
| `YesNo` | `0` = Yes, `1` = No | `message` |
| `Rating` | `1..=5` | `message - 1` |

### `Group`

| Field | Type | Meaning |
|---|---|---|
| `admin` | `BytesN<32>` | Ed25519 public key that signs admin calls for this group |
| `size` | `u32` | LeanIMT size: leaf slots ever used. Removed leaves stay in the count as 0. This is `group.size` in `@semaphore-protocol/group` |
| `members` | `u32` | Active members (`size` minus removed). The anonymity set, and the value `min_members` is checked against |
| `depth` | `u32` | LeanIMT depth (0 for 0 or 1 leaves) |
| `root` | `U256` | Current root (0 for an empty group) |
| `created_at` | `u64` | Ledger timestamp (unix seconds) |

Wire order: `admin, created_at, depth, members, root, size`.

### `RootRecord` (semaphore)

| Field | Type | Meaning |
|---|---|---|
| `replaced_at` | `u64` | Ledger timestamp when this root stopped being current |
| `depth` | `u32` | Tree depth while it was current. Proofs against it need `depth` ≥ this |

Wire order: `depth, replaced_at`.

### `PollKind` (enum)

| Variant | Rust | Wire |
|---|---|---|
| single choice, n options (2..=32) | `Single(u32)` | `Vec[Symbol("Single"), U32(n)]` |
| rating 1..=5 | `Rating` | `Vec[Symbol("Rating")]` |
| yes / no | `YesNo` | `Vec[Symbol("YesNo")]` |

The numeric tag in the `poll_created` event is `0` Single, `1` Rating and
`2` YesNo.

### `Poll`

| Field | Type | Meaning |
|---|---|---|
| `group_id` | `u64` | On-chain group id |
| `creator_key` | `BytesN<32>` | Group admin key at creation. (Delegated creator keys are not implemented) |
| `kind` | `PollKind` | |
| `frozen_root` | `U256` | Group root at creation. Only proofs against this root count |
| `frozen_size` | `u32` | `Group.members` at creation (≥ `min_members`) |
| `opens_at` | `u64` | Ledger timestamp at creation |
| `closes_at` | `u64` | Voting is open while `now < closes_at` |
| `meta_hash` | `BytesN<32>` | sha256 of the off-chain title/options JSON. The contract does not interpret it |
| `closed` | `bool` | Set by `close()` |

Wire order: `closed, closes_at, creator_key, frozen_root, frozen_size,
group_id, kind, meta_hash, opens_at`.

### `VerificationKey` (verifier)

`alpha1: BytesN<64>`, `beta2: BytesN<128>`, `gamma2: BytesN<128>`,
`delta2: BytesN<128>`, `ic: Vec<BytesN<64>>` (5 points). G1 is
`be(x) || be(y)`. G2 is `be(x.c1) || be(x.c0) || be(y.c1) || be(y.c0)`.
Wire order: `alpha1, beta2, delta2, gamma2, ic`. Only the deploy script
uses this type (`vks/*.json`).

---

## 3. ScVal encodings from JS

The recipes below are for `@stellar/stellar-sdk` **17.3.0** and are
verified byte for byte by `test-vectors/check-js.mjs`.

```ts
import { Address, nativeToScVal, scValToNative, xdr, contract } from "@stellar/stellar-sdk"

const u32  = (n: number)          => xdr.ScVal.scvU32(n)
const u64  = (n: bigint | number) => nativeToScVal(BigInt(n), { type: "u64" })
const u256 = (n: bigint | string) => nativeToScVal(BigInt(n), { type: "u256" })
const sym  = (s: string)          => xdr.ScVal.scvSymbol(s)
const bytes = (b: Uint8Array)     => xdr.ScVal.scvBytes(Buffer.from(b))   // BytesN<32>, BytesN<64>
const vec  = (items: xdr.ScVal[]) => xdr.ScVal.scvVec(items)              // Vec<T> and tuples
const addr = (strkey: string)     => new Address(strkey).toScVal()        // Address (G… or C…)

// #[contracttype] struct: ScMap, symbol keys SORTED by name (the host rejects unsorted maps)
const struct = (fields: Record<string, xdr.ScVal>) =>
  xdr.ScVal.scvMap(Object.keys(fields).sort()
    .map((k) => new xdr.ScMapEntry({ key: sym(k), val: fields[k] })))

// #[contracttype] enum variant: Vec[Symbol(name), ...fields]
const variant = (name: string, ...fields: xdr.ScVal[]) => vec([sym(name), ...fields])

const proofToScVal = (p) => struct({
  depth: u32(p.depth), root: u256(p.root), nullifier: u256(p.nullifier),
  message: u256(p.message), scope: u256(p.scope), points: vec(p.points.map(u256)),
})
const pollKind = { single: (n: number) => variant("Single", u32(n)),
                   rating: () => variant("Rating"), yesNo: () => variant("YesNo") }
```

| Rust type | ScVal | JS builder | `scValToNative` gives |
|---|---|---|---|
| `u32` | `U32` | `xdr.ScVal.scvU32(n)` | `number` |
| `u64` | `U64` | `nativeToScVal(BigInt(n), {type:"u64"})` | `bigint` |
| `U256` | `U256` | `nativeToScVal(BigInt(x), {type:"u256"})` | `bigint` |
| `bool` | `Bool` | `xdr.ScVal.scvBool(b)` | `boolean` |
| `BytesN<N>` | `Bytes` (exactly N bytes) | `xdr.ScVal.scvBytes(buf)` | `Buffer` |
| `Address` | `Address` | `new Address(strkey).toScVal()` | strkey `string` |
| `Vec<T>` | `Vec` | `xdr.ScVal.scvVec([...])` | array |
| tuple `(A, B, …)` | `Vec` | `xdr.ScVal.scvVec([a, b, …])` | array |
| struct | `Map`, sorted symbol keys | `struct({...})` above | object |
| enum | `Vec[Symbol, …]` | `variant(...)` above | `["Single", 3]`, `["YesNo"]` |
| `Option<T>` | `Void` (None) or the `T` | `xdr.ScVal.scvVoid()` | `null` (None) or the value |
| `()` | `Void` | `xdr.ScVal.scvVoid()` | `null` |

Notes:

- `toXDR()` returns a `Uint8Array` in v17. Wrap it in `Buffer.from(...)`
  before hex or base64 work.
- `xdr.ContractDataDurability.persistent` is a **value** in 17.3, not a
  function. `check-js.mjs` accepts either.
- Do not use `nativeToScVal(obj, {type: {...}})` for `Proof`. It sorts
  the keys, but it cannot type the `points` elements as `u256`, so the
  bytes come out wrong.
- Alternatively, a `contract.Spec` built from the wasm does all of this
  from the contract's own types, and its output matches the recipes byte
  for byte (checked for `vote`'s `Proof` and all three `PollKind`s):
  ```ts
  const spec = contract.Spec.fromWasm(wasmBytes)
  spec.funcArgsToScVals("vote", { poll_id: 42n, proof: { depth: 4, root, nullifier, message, scope, points } })
  spec.funcArgsToScVals("create_poll", { group_id, kind: { tag: "Single", values: [3] }, closes_at, meta_hash, sig })
  ```
  `stellar contract bindings typescript --wasm … --output-dir …` produces a
  typed client from the same spec.

Known answers (`test-vectors/scval.json`, `values`):
`proof {depth 4, root 1001, nullifier 77, message 1, scope 42, points 1..8}`,
`PollKind::Single(3)`, `Rating` and `YesNo`.

---

## 4. Functions

Auth column: **sig** means an Ed25519 admin signature argument
([5](#5-admin-authorization)), **require_auth(x)** means Soroban auth of
address `x`, and **none** means anyone may call. "Errors" lists the
contract error codes a call can return ([8](#8-errors)). Calls that read
or write a group also fail with 100 when the group does not exist.

### 4.1 LihimSemaphore

Admin calls (the transaction source account has no role; the signature is the authorization):

| Signature | Auth | Errors | Effect |
|---|---|---|---|
| `create_group(admin_key: BytesN<32>, sig: BytesN<64>) -> u64` | sig over `group_id = next_group_id()`, nonce 0 | none (bad sig traps) | New empty group. `root_ttl` = 3600, admin nonce becomes 1. Returns the id |
| `add_member(group_id: u64, commitment: U256, sig: BytesN<64>) -> U256` | sig | 100, 101, 102, 103 | LeanIMT insert. Returns the new root |
| `add_members(group_id: u64, commitments: Vec<U256>, sig: BytesN<64>) -> U256` | sig | 100, 106, 107, 101, 102, 103 | Batch insert of 1..=32. Duplicates within the batch give 103 |
| `update_member(group_id: u64, old: U256, new: U256, siblings: Vec<U256>, sig: BytesN<64>) -> U256` | sig | 100, 101, 102, 103 (for `new`), 104, 116, 105 | Replace a leaf |
| `remove_member(group_id: u64, old: U256, siblings: Vec<U256>, sig: BytesN<64>) -> U256` | sig | 100, 104, 116, 105 | Set the leaf to 0. `size` stays the same and `members` drops by 1. See [11](#11-membership-removal-mvp) |

The signature is checked first, before any other validation. A failed
call rolls back everything, including the nonce bump. `siblings` is
`group.generateMerkleProof(index).siblings` from
`@semaphore-protocol/group`, which omits levels that have no sibling.

Proof calls ([6](#6-proofs-and-nullifier-namespaces)):

| Signature | Auth | Errors | Effect |
|---|---|---|---|
| `validate_proof(caller: Address, group_id: u64, proof: Proof)` | require_auth(caller) | 108, 115, 100, 110, 111, 112, 109, 113, 114 | Accepts the current root or a root replaced less than `root_ttl` ago. Spends the nullifier in `caller`'s namespace and emits `proof_validated` |
| `validate_frozen_proof(caller: Address, group_id: u64, proof: Proof)` | require_auth(caller) | 108, 115, 100, 110, 111, 109, 113, 114 | Same, but accepts **any** root the group has ever had (no 112). For apps that pin their own root |
| `verify_proof(caller: Address, group_id: u64, proof: Proof) -> bool` | none (view) | 108, 115, 100, 110, 111, 112, 109, 113 | Same checks as `validate_proof`, with the nullifier looked up in `caller`'s namespace and no writes. `false` means only that Groth16 failed |
| `has_nullifier(caller: Address, group_id: u64, nullifier: U256) -> bool` | none | | Whether the nullifier is spent in `caller`'s namespace |

Check order: depth in 1..=32 (108); 8 points (115); group exists (100);
`size > 0` (110); root is current, or else in history (111) and, unless
frozen, younger than `root_ttl` (112); `depth` ≥ the root's depth (109);
nullifier unused in `caller`'s namespace (113); then Groth16 (114 /
`false`).

Views:

| Signature | Errors | Returns |
|---|---|---|
| `group(group_id: u64) -> Group` | 100 | |
| `root(group_id: u64) -> U256` | 100 | |
| `size(group_id: u64) -> u32` | 100 | LeanIMT size |
| `member_count(group_id: u64) -> u32` | 100 | `Group.members` |
| `depth(group_id: u64) -> u32` | 100 | |
| `is_member(group_id: u64, commitment: U256) -> bool` | | |
| `index_of(group_id: u64, commitment: U256) -> u32` | 104 | 0-based leaf index |
| `nonce(group_id: u64) -> u64` | | Nonce the next admin sig must use. 0 for a group that does not exist yet |
| `next_group_id() -> u64` | | Id the next `create_group` will get |
| `root_ttl(group_id: u64) -> u64` | 100 | Seconds (3600) |
| `root_record(group_id: u64, root: U256) -> Option<RootRecord>` | | `Some` only for replaced roots |
| `verifier() -> Address` | | |

Keeper hooks (anyone may call; they cost only fees):

| Signature | Errors | Effect |
|---|---|---|
| `bump_group(group_id: u64)` | 100 | Extends the instance and `Group`, `Tree`, `RootTtl`, `Nonce` of the group |
| `bump_keys(caller: Address, group_id: u64, leaves: Vec<U256>, nullifiers: Vec<U256>)` | | Extends `Leaf(group_id, l)` for each leaf and `Nullifier(caller, group_id, n)` for each nullifier. Missing keys are skipped. For vote nullifiers, `caller` = the polls contract address |

### 4.2 LihimPolls

| Signature | Auth | Errors | Effect |
|---|---|---|---|
| `create_poll(group_id: u64, kind: PollKind, closes_at: u64, meta_hash: BytesN<32>, sig: BytesN<64>) -> u64` | sig (polls nonce) | 202, 203, 100, 201 | Checks the kind (`Single(n)` needs 2 ≤ n ≤ 32) and `closes_at > now` **before** the signature, then reads the group (100 propagates from the semaphore), checks the sig, and rejects `members < min_members` (201). Freezes `root` and `members`. Returns the poll id |
| `vote(poll_id: u64, proof: Proof)` | none (the proof is the authorization) | 200, 204, 205, 206, 207, 208, then any semaphore proof error (108, 109, 110, 111, 113, 114, 115) | Requires the poll to be open, `proof.root == frozen_root` (205), `proof.scope == poll_id` (206) and the choice in range (207). A nullifier already spent in the polls namespace gives 208. Then calls `semaphore.validate_frozen_proof(polls_address, group_id, proof)` and increments the tally |
| `close(poll_id: u64)` | none | 200, 210, 209 | Allowed at or after `closes_at`. Sets `closed = true` |
| `poll(poll_id: u64) -> Poll` | | 200 | |
| `tally(poll_id: u64) -> Vec<u32>` | | 200 | One count per bucket. For Rating, index 0 is rating 1 |
| `voters_count(poll_id: u64) -> u32` | | 200 | |
| `nonce(group_id: u64) -> u64` | | | The `create_poll` nonce, a separate counter from the semaphore's (starts at 0) |
| `next_poll_id() -> u64` | | | |
| `min_members() -> u32` | | | |
| `semaphore() -> Address` | | | |
| `bump_poll(poll_id: u64)` | none | 200 | Extends the instance and `Poll`, `Tally`, `Voters` |

The order of checks in `vote` is: poll exists, open (`!closed && now < closes_at`),
root, scope, choice, nullifier (208), then the semaphore's checks.

### 4.3 LihimVerifier

| Signature | Auth | Errors | Effect |
|---|---|---|---|
| `set_vk(depth: u32, vk: VerificationKey)` | require_auth(admin) | 300, 301, 303 | |
| `finalize()` | require_auth(admin) | 300, 304 | Removes the admin for good |
| `verify(depth: u32, points: Vec<U256>, signals: Vec<U256>) -> bool` | none | 301, 305, 302 (as panics) | Groth16. Returns `false` for a bad proof |
| `vk(depth: u32) -> Option<VerificationKey>`, `admin() -> Option<Address>`, `is_finalized() -> bool` | | | |
| `bump()` | none | | Extends the instance and all 32 `Vk` entries |

Apps never call the verifier directly. The semaphore calls it.

---

## 5. Admin authorization

### 5.1 Digest

```
digest = sha256( contract_strkey_ascii   // 56 ASCII bytes: "C…" strkey of the contract being called
              || fn_tag_ascii            // e.g. "add_member"
              || be64(group_id)          // on-chain u64 group id
              || be64(nonce)
              || args_xdr )              // XDR of an ScVal::Vec holding the args below, in order
sig    = Ed25519.sign(digest, admin_secret)   // sign the 32 digest bytes themselves, no prehash
```

```ts
import { ed25519 } from "@noble/curves/ed25519.js"
import { createHash } from "node:crypto"   // or @noble/hashes sha256 in the browser
const be64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b }
const digest = createHash("sha256")
  .update(Buffer.from(contractId, "ascii")).update(Buffer.from(fnTag, "ascii"))
  .update(be64(groupId)).update(be64(nonce))
  .update(Buffer.from(xdr.ScVal.scvVec(args).toXDR()))
  .digest()
const sig = ed25519.sign(digest, adminSeed32)   // 64 bytes -> BytesN<64> arg
```

### 5.2 Per-function arguments and nonces

| fn_tag | Contract | `group_id` in digest | nonce | `args` (the ScVal::Vec) |
|---|---|---|---|---|
| `create_group` | semaphore | `semaphore.next_group_id()` | always `0` | `[Bytes(admin_pub32)]` |
| `add_member` | semaphore | the group | `semaphore.nonce(group_id)` | `[U256(commitment)]` |
| `add_members` | semaphore | the group | `semaphore.nonce(group_id)` | `[Vec[U256…]]` (a vec inside the vec) |
| `update_member` | semaphore | the group | `semaphore.nonce(group_id)` | `[U256(old), U256(new), Vec[U256 siblings]]` |
| `remove_member` | semaphore | the group | `semaphore.nonce(group_id)` | `[U256(old), Vec[U256 siblings]]` |
| `create_poll` | polls | the group | `polls.nonce(group_id)`, a separate counter starting at 0 | `[PollKind, U64(closes_at), Bytes(meta_hash32)]` |

- After `create_group` the semaphore nonce is 1, so the first `add_member(s)`
  signs nonce 1. Each nonce advances by one per **successful** call only.
- All semaphore admin calls on a group share one nonce (and `create_poll`
  calls share the polls nonce). Two such transactions for the same group
  in flight at once collide, so serialize them per group and counter:
  read the nonce, sign, submit, wait.
- The contract address in the digest stops a semaphore signature being
  replayed on polls (and the reverse), and the fn_tag stops replays across
  functions.
- Known answers: `test-vectors/admin-auth.json` (seed `07…07`, contract
  `CAAAA…FCT4`, all six fn tags and all three `PollKind`s).

### 5.3 Key derivation (D1)

The contracts never see this, but every client must agree on it:

```
sem_priv(group)  = HKDF-SHA256(prf_out, salt = empty, info = "lihim/sem/"   + groups.id, 32)
admin_key(group) = Ed25519 seed HKDF-SHA256(prf_out, salt = empty, info = "lihim/admin/" + groups.id, 32)
```

(`salt = empty` matches `packages/sdk/src/identity.ts`; `prf_out` there is
the WebAuthn PRF output for `sha256("lihim/v1")`.)

`groups.id` is the **off-chain Supabase uuid string**, generated in the
browser before `create_group`. It is not the on-chain u64. So the admin key
is known before the on-chain id exists, and it does not change if
`create_group` has to be retried. TODO(M0): the SDK owns the exact uuid
text form (lowercase, hyphenated, as Postgres prints it).

### 5.4 `create_group` flow

1. The browser generates `groups.id` and derives `admin_pub` from it.
2. It reads `id = semaphore.next_group_id()`.
3. It signs `digest(semaphore, "create_group", id, 0, [admin_pub])` and
   submits `create_group(admin_pub, sig)`.
4. If someone else took `id` first, the call fails with a host crypto
   error (the signature no longer matches). The browser goes back to step
   2 with the same key.
5. The return value, or the `group_created` event, gives the on-chain id,
   which is stored next to `groups.id`.

---

## 6. Proofs and nullifier namespaces

**This is a deliberate difference from upstream Semaphore V4 (D3).**
Upstream keeps one nullifier set per group, and `validateProof` can be
called by anyone. So anyone who sees a proof before it lands (the relay,
or network peers once the transaction is broadcast) can submit it to
`validateProof` first. That burns the nullifier without the vote being
counted, and the real vote then fails as already answered.

Here the nullifier store is keyed by `(caller, group_id, nullifier)`:

- `validate_proof` and `validate_frozen_proof` take `caller: Address` first
  and call `caller.require_auth()`.
- A contract passes `env.current_contract_address()`. A contract that is
  the **direct invoker** satisfies `require_auth` with no signature and no
  auth entry. Nobody else can authorize a contract address, so only
  LihimPolls can spend nullifiers in the LihimPolls namespace.
- An attacker who replays a proof directly into the semaphore must pass an
  address they control, so the nullifier is spent only in **their**
  namespace. The vote through polls still succeeds. Tested in
  `lihim-polls::front_run_against_semaphore_does_not_block_vote` and in the
  real-proof `end_to_end_real_semaphore_v4_proof`.
- `has_nullifier`, `verify_proof` and `bump_keys` take the namespace
  (`caller`) too. For anything about votes, `caller = LIHIM_POLLS_ID`.

Consequences for clients:

- **Relay `POST /vote`**: build `polls.vote(poll_id, proof)` and simulate
  it. The simulation needs **no auth entries** (polls authorizes itself as
  the invoker of the semaphore, and `vote` has no `require_auth`). Submit
  from the relay's fee account. A cheaper pre-check is
  `semaphore.verify_proof(LIHIM_POLLS_ID, group_id, proof)`.
- **"Have I voted?"**: `semaphore.has_nullifier(LIHIM_POLLS_ID, group_id, nullifier)`,
  or match `voted` events by nullifier.
- **Indexer**: a `proof_validated` event whose `caller` is not
  `LIHIM_POLLS_ID` is not a vote. Count votes from polls' `voted` event.
- **Scope reuse**: a new polls deployment gets a fresh namespace, so reused
  poll ids would not block votes. They would still give a member the same
  nullifier for the same scope in both deployments, which links their two
  votes. So keep `first_poll_id` above the old deployment's ids.

---

## 7. Events

Every event has two topics, `[Symbol(name), U64(id)]`. Data is an
`ScVal::Vec` of the fields in the order shown (declaration order, **not**
sorted). The one exception is `poll_closed`, whose data is `Void`.

| Contract | Topic 0 | Topic 1 | Data |
|---|---|---|---|
| semaphore | `group_created` | group_id | `[admin: Bytes(32)]` |
| semaphore | `member_added` | group_id | `[index: U32, commitment: U256, root: U256]` |
| semaphore | `members_added` | group_id | `[start_index: U32, commitments: Vec<U256>, root: U256]` (leaf `i` of the batch is at `start_index + i`) |
| semaphore | `member_updated` | group_id | `[index: U32, old: U256, new: U256, root: U256]` |
| semaphore | `member_removed` | group_id | `[index: U32, old: U256, root: U256]` |
| semaphore | `proof_validated` | group_id | `[caller: Address, root: U256, nullifier: U256, message: U256, scope: U256]` (**`caller` is new and comes first**) |
| polls | `poll_created` | poll_id | `[group_id: U64, kind_tag: U32 (0 single, 1 rating, 2 yesno), n_options: U32, frozen_root: U256, frozen_size: U32, closes_at: U64, meta_hash: Bytes(32)]` |
| polls | `voted` | poll_id | `[nullifier: U256, choice: U32]` (the raw message: option index, 0 Yes / 1 No, or rating 1..=5) |
| polls | `poll_closed` | poll_id | `Void` |

A `vote` transaction emits two events: `proof_validated` from the semaphore
(with `caller` = polls) and then `voted` from polls. Decode with
`scValToNative(xdr.ScVal.fromXDR(b64, "base64"))`. The topics then decode to
`["voted", 42n]` and the data to an array, for example
`[77n, 1]`.

For indexing: group membership can be rebuilt from `member_added`,
`members_added`, `member_updated` and `member_removed` (in ledger order).
Their `root` should equal `semaphore.root(group_id)` after the last one.

---

## 8. Errors

Codes are unique across the three contracts, so a client can map a code
without knowing which contract raised it. An error from the semaphore inside
`polls.vote` or `polls.create_poll` surfaces unchanged (for example 114 from
`vote`; tested).

| Code | Contract | Name | Typical cause |
|---|---|---|---|
| 100 | semaphore | GroupNotFound | Wrong group id |
| 101 | semaphore | LeafOutOfField | Commitment ≥ BN254 r |
| 102 | semaphore | LeafIsZero | Commitment 0 |
| 103 | semaphore | LeafExists | Already a member (or a duplicate in the batch) |
| 104 | semaphore | LeafNotFound | `old` is not a member |
| 105 | semaphore | WrongSiblingNodes | Stale Merkle path |
| 106 | semaphore | EmptyBatch | |
| 107 | semaphore | BatchTooLarge | > 32. Chunk the batch |
| 108 | semaphore | DepthNotSupported | `proof.depth` not in 1..=32 |
| 109 | semaphore | DepthTooSmall | `proof.depth` < the root's tree depth |
| 110 | semaphore | GroupHasNoMembers | |
| 111 | semaphore | RootNotInGroup | |
| 112 | semaphore | RootExpired | Old root past `root_ttl` (not raised on the frozen path) |
| 113 | semaphore | NullifierUsed | Already spent in this namespace |
| 114 | semaphore | InvalidProof | Groth16 failed |
| 115 | semaphore | MalformedProof | `points.len() != 8` |
| 116 | semaphore | FieldOutOfRange | A sibling ≥ r |
| 200 | polls | PollNotFound | |
| 201 | polls | TooFewMembers | `members < min_members` |
| 202 | polls | InvalidKind | `Single(n)` with n outside 2..=32 |
| 203 | polls | InvalidCloseTime | `closes_at <= now` |
| 204 | polls | PollClosed | Closed, or `now >= closes_at` |
| 205 | polls | WrongRoot | Proof not against `frozen_root` |
| 206 | polls | WrongScope | `scope != poll_id` |
| 207 | polls | ChoiceOutOfRange | |
| 208 | polls | AlreadyVoted | Nullifier already spent by polls |
| 209 | polls | NotYetClosable | `close` before `closes_at` |
| 210 | polls | AlreadyClosed | |
| 300 | verifier | Finalized | |
| 301 | verifier | DepthNotSupported | |
| 302 | verifier | VkNotSet | |
| 303 | verifier | MalformedVk | |
| 304 | verifier | MissingVks | `finalize` before all 32 keys are loaded |
| 305 | verifier | MalformedInput | |

How they appear to JS: a contract error is `ScError::Contract(code)`. In
RPC simulation and submission results it shows up in the diagnostic and
error strings as `Error(Contract, #208)`, so parse it with
`/Error\(Contract, #(\d+)\)/`. Failures that are not contract codes:

- A bad admin signature is a host trap from `ed25519_verify`, expected as
  `Error(Crypto, InvalidInput)`.
- Missing auth for `caller` (an account, or someone impersonating a
  contract) is expected as `Error(Auth, InvalidAction)`.
- An invalid G2 point traps in the pairing host function.

TODO(M0): confirm these exact strings on testnet.

Relay mapping for `POST /vote` (D2):

- 208 `AlreadyVoted` or 113 `NullifierUsed` → **409 `already_answered`**.
  (113 can only come from `vote` in a same-ledger race, because polls checks
  208 first.)
- Any other contract error or host trap → **400 `invalid`**, with the code
  as `reason`.
- RPC or submission failure → **502 `not_sent`**.

---

## 9. Storage layout and TTL

Every `DataKey` is a `#[contracttype]` enum, so a storage key is
`Vec[Symbol(variant), ...fields]` ([3](#3-scval-encodings-from-js)).
"instance" keys live inside the contract-instance entry and have no ledger
key of their own.

### LihimSemaphore

| DataKey | Durability | Value |
|---|---|---|
| `Verifier` | instance | `Address` |
| `NextGroupId` | instance | `u64` |
| `Group(u64 group_id)` | persistent | `Group` |
| `Tree(u64 group_id)` | persistent | `Vec<U256>` LeanIMT side nodes |
| `RootTtl(u64 group_id)` | persistent | `u64` seconds |
| `Nonce(u64 group_id)` | persistent | `u64` |
| `Leaf(u64 group_id, U256 commitment)` | persistent | `u32` = index + 1 |
| `Root(u64 group_id, U256 root)` | persistent | `RootRecord` (replaced roots only) |
| `Nullifier(Address caller, u64 group_id, U256 nullifier)` | persistent | `()` |

### LihimPolls

| DataKey | Durability | Value |
|---|---|---|
| `Semaphore`, `MinMembers`, `NextPollId` | instance | `Address`, `u32`, `u64` |
| `Poll(u64 poll_id)` | persistent | `Poll` |
| `Tally(u64 poll_id)` | persistent | `Vec<u32>` |
| `Voters(u64 poll_id)` | persistent | `u32` |
| `Nonce(u64 group_id)` | persistent | `u64` (create_poll nonce) |

### LihimVerifier

| DataKey | Durability | Value |
|---|---|---|
| `Admin` | instance | `Address` (removed by `finalize`) |
| `Vk(u32 depth)` | persistent | `VerificationKey` |

### Ledger keys from JS (for `getLedgerEntries` and `ExtendFootprintTTLOp`)

```ts
const dataKey = (contractId: string, key: xdr.ScVal) =>
  xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: new Address(contractId).toScAddress(),
    key,
    durability: xdr.ContractDataDurability.persistent,   // a value in 17.3, not a function
  }))

dataKey(SEM,   variant("Group", u64(gid)))
dataKey(SEM,   variant("Leaf", u64(gid), u256(commitment)))
dataKey(SEM,   variant("Root", u64(gid), u256(root)))
dataKey(SEM,   variant("Nullifier", addr(POLLS), u64(gid), u256(nullifier)))
dataKey(POLLS, variant("Poll", u64(pollId)))
dataKey(VERIFIER, variant("Vk", u32(depth)))
dataKey(SEM,   xdr.ScVal.scvLedgerKeyContractInstance())     // the instance entry
// contract code: xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: wasmHash32 }))
```

Known answers for every key above: `test-vectors/scval.json` →
`ledger_keys` (`key_scval_xdr_hex` and the full `ledger_key_xdr_hex`). The
contracts used there are fixed: semaphore `CAAQC…C526`, polls
`CABAE…FNSZ`, verifier `CAAAA…FCT4`.

### TTL policy

- Every write extends the entry to `BUMP_AMOUNT` = 120 days (2,073,600
  ledgers) whenever it has less than `BUMP_THRESHOLD` = 30 days (518,400
  ledgers) left. The same applies to the instance on most calls.
- The keeper has two options per entry. One is the contract hooks
  (`semaphore.bump_group`, `semaphore.bump_keys(LIHIM_POLLS_ID, gid, leaves,
  nullifiers)`, `polls.bump_poll`, `verifier.bump()`), which are cheap to
  build but bounded by the per-transaction footprint. The other is an
  `ExtendFootprintTTLOp` with the ledger keys above in the read-only
  footprint, which also covers the contract **code** entries the hooks
  cannot touch.
- Keep alive: the instance and code of all three contracts. For each active
  group: `Group`, `Tree`, `RootTtl`, `Nonce`, every `Leaf`, the `Root` record
  of every open poll's `frozen_root`, and every polls-namespace
  `Nullifier`. For each poll: `Poll`, `Tally`, `Voters` (at least until it
  closes and the results are cached off-chain), plus `polls.Nonce(gid)`.
  The verifier keeps all 32 `Vk` entries.
- An expired persistent entry is archived, not deleted. Reading it needs a
  restore and never reads as "absent", so a lapsed nullifier cannot be
  reused. TODO(M0): confirm on the current protocol.

---

## 10. Constants

| Name | Value | Where |
|---|---|---|
| depth range | 1..=32 | `MIN_DEPTH`, `MAX_DEPTH` |
| `MAX_BATCH` | 32 commitments per `add_members` | semaphore. TODO(M0): tune on testnet |
| `DEFAULT_ROOT_TTL` | 3600 s | semaphore (`validate_proof` only) |
| `MAX_OPTIONS` | 32 | polls (`Single(n)`, n ≥ 2) |
| `min_members` | 8 (constructor arg) | polls |
| Rating buckets / YesNo buckets | 5 / 2 | |
| BN254 r | `0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001` | leaves, roots and signals must be < r |

---

## 11. Membership removal (MVP)

`remove_member` (and `update_member`) need the member's current
`commitment` and its Merkle path. Only the member can compute that
commitment (it comes from their per-group identity), and the off-chain
roster deliberately does not store it next to the person (D5).

So in the MVP the admin's "Remove" is **off-chain only**: it deactivates
the member in the roster, invites and push, and stops them seeing future
polls. Their leaf stays in the on-chain tree, which means they could still
produce a valid proof for a poll created after the removal. Closing that
gap is a later feature: either the member leaves, which they can do
because they know their commitment (it needs a member-initiated removal
path, not built), or the admin re-keys the group into a fresh one. The
contract functions already exist for that.
