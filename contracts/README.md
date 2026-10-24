# Lihim contracts (Soroban)

**[`INTERFACE.md`](INTERFACE.md) is the canonical interface reference**:
exact signatures, type field order, ScVal encodings from JS, the admin
digest, events, error codes and storage keys. This README covers the design,
the tests and the deviations.

Three contracts, plus one shared library crate:

```
                 relay (vote fee key)              submit-admin-tx (admin fee key)
                        │ vote(poll_id, proof)            │ create_poll / add_member … (Ed25519-signed in browser)
                        ▼                                 ▼
┌───────────────────────────────┐ group(), has_nullifier(self,…)┌─────────────────────────────────────┐
│ LihimPolls                    │─validate_frozen_proof(self,…)▶│ LihimSemaphore                      │
│ polls, frozen root, tallies   │   (self = polls address,      │ groups, LeanIMT (Poseidon), root    │
└───────────────────────────────┘    require_auth'd)            │ history, per-app nullifiers, nonces │
                                                                └──────────────┬──────────────────────┘
                                                                               │ verify(depth, points, signals)
                                                                ┌──────────────▼──────────────────────┐
                                                                │ LihimVerifier                       │
                                                                │ Groth16/BN254, V4 keys depth 1..=32 │
                                                                └─────────────────────────────────────┘
```

| Crate | Kind | What it holds |
|---|---|---|
| `lihim-common` | rlib | Shared `#[contracttype]`s (`Proof`, `Group`, `Poll`, `PollKind`, `VerificationKey`), `#[contractclient]` interfaces, `admin_digest`, `hash_to_field`, TTL constants. It exists so one contract can call another without linking that contract's exports into its own wasm. |
| `lihim-verifier` | contract | Groth16 BN254 verification and the 32 Semaphore V4 keys |
| `lihim-semaphore` | contract | Semaphore V4 groups: LeanIMT, roots, nullifiers, admin auth |
| `lihim-polls` | contract | Polls on top of the semaphore contract |

## Versions (checked 2026-10-22)

| Thing | Version | Why |
|---|---|---|
| `soroban-sdk` | **28.0.0** | Newest stable is 29.0.1 (30.0.0-rc.1 is an rc). `soroban-poseidon` 28.0.0 depends on `soroban-sdk ^28`, and pairing it with 29 would put two incompatible `Env` types in the graph. 28 has every BN254 host function we need: `pairing_check` (`bn254_multi_pairing_check`), `g1_msm`, `g1_add`, `g1_mul`, `g1_is_on_curve`, and Fr arithmetic. Move to 29 once a matching `soroban-poseidon` ships. |
| `soroban-poseidon` | 28.0.0 | `PoseidonSponge<3, Bn254Fr>` runs on the host Poseidon permutation, with BN254 parameters documented as circomlib's. Confirmed against `poseidon-lite` on 20 vectors (M0 test 1). |
| `ed25519-dalek` | 2.1 (dev only) | Test admin keys, the same major version soroban-sdk testutils uses |
| `serde_json` | 1 (dev only) | Reads `test-vectors/*.json` |
| stellar CLI | 27.0.0 | `stellar contract build` (sdk 28 needs ≥ 25.2 for spec shaking) |
| Rust | cargo 1.96, target `wasm32v1-none` | |

### Verifier source

The spec suggested porting a community BN254 verifier (ZK-VOTE, crisp) or
adapting the BLS12-381 example. We wrote it directly against the sdk 28 BN254
API instead. The verification equation is about 15 lines
(`e(-A,B)·e(α,β)·e(vk_x,γ)·e(C,δ) = 1`, with `vk_x` computed by `g1_msm`),
and code written straight from the equation is easier to review than an
adapted third-party crate. The input conventions follow Semaphore's
`SemaphoreVerifier.sol` and `@zk-kit/utils` `packGroth16Proof`. **Not audited.**

## Build and test

```sh
cd contracts
cargo test                       # 54 tests (+2 ignored cost probes)
stellar contract build           # or: cargo build --target wasm32v1-none --release
cargo clippy --all-targets && cargo fmt --all -- --check

# cost probes (print numbers)
cargo test -p lihim-semaphore measure_costs -- --ignored --nocapture
cargo test -p lihim-polls measure_costs_wasm -- --ignored --nocapture   # after `stellar contract build`
```

Wasm sizes from `stellar contract build`, optimized:

| Contract | Bytes |
|---|---|
| `lihim_verifier.wasm` | 8,117 |
| `lihim_semaphore.wasm` | 40,755 (mostly the circomlib Poseidon constants) |
| `lihim_polls.wasm` | 13,179 |

### What the tests cover

- **M0 tests 1 to 3, passing natively** against vectors from the official JS
  libraries (`test-vectors/`): Poseidon on 20 vectors, the LeanIMT root of
  10 commitments (one at a time, batched, after an update and after a
  removal), and keccak `hash()` on 10 vectors.
- **M0 test 4, native half, passing.** Real `@semaphore-protocol/proof`
  proofs at depth 4 and 10 verify against the official V4 keys. A wrong
  root, a wrong scope, a tampered `C`, swapped G2 coordinates and the wrong
  depth's key all fail. `lihim-polls::end_to_end_real_semaphore_v4_proof`
  runs the whole stack with no mocks: the real verifier, a real semaphore
  holding the 10 JS identities (the on-chain root equals the JS root), and a
  real vote. Before the vote, the same real proof is front-run straight into
  the semaphore from another address, and the vote still counts. A deeper
  re-proof from the same identity is then rejected as already voted. All 32 official keys load through `set_vk`'s checks and
  the contract finalizes.
- Groups and admin auth: sequential ids, the digest layout rebuilt by hand,
  wrong key, wrong fn tag, wrong contract and wrong args all rejected, nonce
  replay rejected, and the `create_group` signature bound to the id.
- LeanIMT: every insert, batch (across depth and odd/even boundaries),
  update and remove is checked against an independent full-recompute
  reference.
- Proofs: the happy path checks the signals passed to the verifier
  (`[root, nullifier, h(message), h(scope)]`) and the `proof_validated`
  event (with `caller`). Also covered: double nullifier, invalid Groth16,
  depth range and depth floor, root history inside and beyond `root_ttl`,
  the frozen path, empty or unknown groups, and a malformed proof.
- Nullifier namespaces: a proof spent by one caller is still unspent for
  another, and re-use within either namespace is rejected. `validate_*`
  records exactly one auth (`caller`), and with no auth nobody can spend in
  another address's namespace.
- Verifier: a synthetic key built from the generators exercises pairing,
  negation, MSM and signal binding. Out-of-range coordinates and signals
  (including the `s + r` alias) and off-curve points are rejected.
- Polls: root and size frozen; below `min_members` rejected; signature and
  replay; kind and close-time validation; happy path and events; rating
  buckets; wrong scope; the frozen root surviving a mid-poll join after
  `root_ttl`; double vote reported as `AlreadyVoted`; a front-run directly
  against the semaphore not blocking the vote, and nobody being able to
  spend in the polls namespace from outside; choice ranges; an invalid
  proof records nothing, and its semaphore error code (114) surfaces
  through `vote`; the close lifecycle.
- Encodings: `test-vectors/scval.json` (Proof, PollKind, every storage key
  and its full ledger key) is written by the Rust side and checked as
  stale. The polls and verifier `DataKey`s are asserted to encode as
  `Vec[Symbol, …]`. `test-vectors/check-js.mjs` rebuilds both
  `admin-auth.json` and `scval.json` with `@stellar/stellar-sdk` 17.3 and
  matched 25/25.

## Measured costs (test environment, not testnet fees)

| Operation | CPU instructions | Notes |
|---|---|---|
| `verify` (real proof) | ~27.0M native / 28.8M via `verify_proof` in wasm | Same at depth 4 and depth 10, because the verifier does not depend on depth |
| `vote` (real proof) | ~27.4M native | Dominated by the verify |
| `add_member` at depth 10 | 12.8M wasm | About `depth` Poseidon hashes |
| `add_members` × 32 at ~1000 leaves | 76.1M wasm | About 2.2M per leaf + ~7M base, so **`MAX_BATCH = 32`** |
| `create_poll` | 6.5M wasm | |

TODO(M0) test 5: rerun these on testnet against the live
`stellar network settings` per-transaction limits and record real fees.

## Shared encodings (summary; details in [`INTERFACE.md`](INTERFACE.md))

### Proof

`lihim_common::Proof` is an `ScVal::Map` with symbol keys. Soroban
requires the keys in sorted order: `depth` (u32), `message` (u256),
`nullifier` (u256), `points` (vec of 8 u256), `root` (u256), `scope`
(u256). Using a generated client (`stellar contract bindings typescript`)
or a `contract.Spec` makes this automatic.

`points` is `packGroth16Proof(proof)` from `@semaphore-protocol/proof`
(`[a.x, a.y, b.x.c1, b.x.c0, b.y.c1, b.y.c0, c.x, c.y]`), passed through
unchanged. The contract does `hash(message)` and `hash(scope)` itself, so
send the raw message and scope (`message` = choice, `scope` = poll id).

### PollKind

`Single(n)` → `Vec[Symbol("Single"), U32(n)]`; `Rating` → `Vec[Symbol("Rating")]`;
`YesNo` → `Vec[Symbol("YesNo")]`.

### Admin authorization

```
digest = sha256( contract_strkey_ascii      // 56 bytes, "C…" of the contract being called
              || fn_tag_ascii               // e.g. "add_member"
              || be64(group_id)
              || be64(nonce)
              || args_xdr )                 // XDR of ScVal::Vec of the args below
sig    = Ed25519.sign(admin_secret, digest) // sign the 32 digest bytes themselves
```

| fn_tag | Contract | group_id | nonce source | args tuple |
|---|---|---|---|---|
| `create_group` | semaphore | `next_group_id()` | always 0 | `(admin_key: BytesN<32>)` |
| `add_member` | semaphore | group | `semaphore.nonce(group_id)` | `(commitment: U256)` |
| `add_members` | semaphore | group | same | `(commitments: Vec<U256>)` |
| `update_member` | semaphore | group | same | `(old: U256, new: U256, siblings: Vec<U256>)` |
| `remove_member` | semaphore | group | same | `(old: U256, siblings: Vec<U256>)` |
| `create_poll` | polls | group | `polls.nonce(group_id)`, a separate counter | `(kind: PollKind, closes_at: u64, meta_hash: BytesN<32>)` |

- The nonce advances only when a call succeeds.
- The per-group keys are derived from the **off-chain Supabase
  `groups.id` uuid** (`HKDF(prf_out, "lihim/sem/" + groups.id)` and
  `HKDF(prf_out, "lihim/admin/" + groups.id)`), which the browser generates
  before `create_group`. The digest still uses the **on-chain u64**: the
  client reads `next_group_id()`, signs with nonce 0, and submits
  `create_group`. If another group took that id first, the signature no
  longer matches and the call fails, and the client re-signs over the new
  id with the same key.
- A bad signature traps in the host (`ed25519_verify`), so the failure is a
  host crypto error, not a contract error code.
- `siblings` is the LeanIMT Merkle path from
  `group.generateMerkleProof(index).siblings`, which omits levels with no
  sibling.
- Known-answer vectors are in `test-vectors/admin-auth.json`. Recipe in TS
  (`@stellar/stellar-sdk` 17): `Buffer.from(xdr.ScVal.scvVec([...]).toXDR())`
  for `args_xdr` (in v17 `toXDR()` returns a `Uint8Array`), `nativeToScVal(x,
  {type:"u256"})` for U256, and `ed25519.sign(digest, seed)` from
  `@noble/curves`. This recipe reproduced all 8 vectors.

### Events

Topics are `(Symbol(name), id)`. Data is an `ScVal::Vec` in the order
shown, except for `poll_closed`, whose data is `Void`.

| Contract | Name | id | Data |
|---|---|---|---|
| semaphore | `group_created` | group_id u64 | `[admin: BytesN<32>]` |
| semaphore | `member_added` | group_id | `[index: u32, commitment: U256, root: U256]` |
| semaphore | `members_added` | group_id | `[start_index: u32, commitments: Vec<U256>, root: U256]` |
| semaphore | `member_updated` | group_id | `[index: u32, old: U256, new: U256, root: U256]` |
| semaphore | `member_removed` | group_id | `[index: u32, old: U256, root: U256]` |
| semaphore | `proof_validated` | group_id | `[caller: Address, root, nullifier, message, scope]` (the four after `caller` are U256) |
| polls | `poll_created` | poll_id u64 | `[group_id: u64, kind_tag: u32 (0 single, 1 rating, 2 yesno), n_options: u32, frozen_root: U256, frozen_size: u32, closes_at: u64, meta_hash: BytesN<32>]` |
| polls | `voted` | poll_id | `[nullifier: U256, choice: u32]` (choice = raw message: an option index, 0 = Yes / 1 = No, or a rating 1..=5) |
| polls | `poll_closed` | poll_id | `()` |

### Error codes

Codes are unique across contracts, so a client can map them without
knowing which contract raised them.

| Range | Contract | Codes |
|---|---|---|
| 100–116 | semaphore | 100 GroupNotFound, 101 LeafOutOfField, 102 LeafIsZero, 103 LeafExists, 104 LeafNotFound, 105 WrongSiblingNodes, 106 EmptyBatch, 107 BatchTooLarge, 108 DepthNotSupported, 109 DepthTooSmall, 110 GroupHasNoMembers, 111 RootNotInGroup, 112 RootExpired, 113 NullifierUsed, 114 InvalidProof, 115 MalformedProof, 116 FieldOutOfRange |
| 200–210 | polls | 200 PollNotFound, 201 TooFewMembers, 202 InvalidKind, 203 InvalidCloseTime, 204 PollClosed, 205 WrongRoot, 206 WrongScope, 207 ChoiceOutOfRange, 208 AlreadyVoted, 209 NotYetClosable, 210 AlreadyClosed |
| 300–305 | verifier | 300 Finalized, 301 DepthNotSupported, 302 VkNotSet, 303 MalformedVk, 304 MissingVks, 305 MalformedInput |

Relay mapping for `POST /vote` (simulate first):

- 208 or 113 → `409 already_answered`.
- Any other contract error or host trap → `400 invalid` with the code as
  `reason`.
- An RPC or submission failure → `502 not_sent`.

## Contract reference

### LihimVerifier

| Function | Auth | Effect |
|---|---|---|
| `__constructor(admin: Address)` | n/a | Sets the loader admin |
| `set_vk(depth, vk)` | admin `require_auth` | Stores the key for depth 1..=32 and validates the G1 points (on-curve, < p) and the G2 coordinates (< p). `ic` must hold 5 points |
| `finalize()` | admin | Requires all 32 keys and removes the admin for good, so keys become immutable |
| `verify(depth, points: Vec<U256>[8], signals: Vec<U256>[4]) -> bool` | n/a | Groth16 check. Returns `false` for coordinates ≥ p, signals ≥ r, or off-curve A or C. An invalid G2 `B` traps in the pairing host fn (sdk 28 has no G2 check fn) |
| `vk(depth)`, `admin()`, `is_finalized()` | view | |
| `bump()` | anyone | TTL extension for the instance and all keys |

### LihimSemaphore

| Function | Auth | Effect |
|---|---|---|
| `__constructor(verifier: Address)` | n/a | Group ids start at 1 |
| `create_group(admin_key, sig) -> u64` | admin sig | New empty group, `root_ttl` = 3600 s, nonce → 1 |
| `add_member(id, commitment, sig) -> root` | admin sig | LeanIMT insert. The old root goes to history |
| `add_members(id, commitments, sig) -> root` | admin sig | Batch insert, 1..=`MAX_BATCH` (32). Duplicates inside the batch are rejected |
| `update_member(id, old, new, siblings, sig) -> root` | admin sig | Replace a leaf |
| `remove_member(id, old, siblings, sig) -> root` | admin sig | Set the leaf to 0. `size` stays the same and `members` drops by 1 |
| `validate_proof(caller, id, proof)` | the proof + `caller.require_auth()` | Checks run in this order: depth 1..=32, 8 points, group exists, size > 0, root is current or replaced less than `root_ttl` ago, `depth` ≥ the root's tree depth, nullifier unused **in `caller`'s namespace**, Groth16 on `[root, nullifier, h(message), h(scope)]`. Then it stores the nullifier under `(caller, id)` and emits `proof_validated` |
| `validate_frozen_proof(caller, id, proof)` | same | Same, but accepts any root the group ever had. For apps that pin their own root (polls) |
| `verify_proof(caller, id, proof) -> bool` | view | Same checks, nullifier included (in `caller`'s namespace), with no writes. `false` means only that Groth16 failed |
| `has_nullifier(caller, id, nullifier)` | view | |
| `group`, `root`, `size`, `member_count`, `depth`, `is_member`, `index_of`, `nonce`, `next_group_id`, `root_ttl`, `root_record`, `verifier` | view | |
| `bump_group(id)`, `bump_keys(caller, id, leaves, nullifiers)` | anyone | Keeper TTL hooks |

`Group = { admin, size, members, depth, root, created_at }`. `size` is the
LeanIMT size (Semaphore's `getMerkleTreeSize`). `members` is the number of
active members: the anonymity set, and what `min_members` is checked against.

### LihimPolls

| Function | Auth | Effect |
|---|---|---|
| `__constructor(semaphore, min_members: u32, first_poll_id: u64)` | n/a | Deploy with `min_members = 8` |
| `create_poll(group_id, kind, closes_at, meta_hash, sig) -> poll_id` | group admin sig | `Single(n)` needs 2 ≤ n ≤ 32 and `closes_at` must be later than now. Freezes `root` and `members`, and rejects groups with `members < min_members` |
| `vote(poll_id, proof)` | the proof | Requires the poll to be open (not closed and `now < closes_at`), `proof.root == frozen_root`, `proof.scope == poll_id` and the message in range. A nullifier already used in the polls namespace gives `AlreadyVoted`. Otherwise it calls `semaphore.validate_frozen_proof(polls_address, …)` and increments the tally. Needs no auth entries: polls authorizes its own address as the direct invoker |
| `close(poll_id)` | anyone, at or after `closes_at` | `closed = true` |
| `poll`, `tally` (rating index 0 holds rating 1), `voters_count`, `nonce(group_id)`, `next_poll_id`, `min_members`, `semaphore` | view | |
| `bump_poll(poll_id)` | anyone | Keeper TTL hook |

## Storage and TTL

Everything except the config is persistent. There is one entry per logical
key: `Group(id)`, `Tree(id)` (side nodes), `RootTtl(id)`, `Nonce(id)`,
`Leaf(id, commitment)`, `Root(id, root)` (holding `RootRecord { replaced_at,
depth }`) and `Nullifier(caller, id, nullifier)`. Polls has `Poll(id)`, `Tally(id)`,
`Voters(id)` and `Nonce(group_id)`. Config (the contract addresses, the
counters and `min_members`) lives in instance storage.

Every write extends the entry to about 14 days when it has fewer than
about 7 days left (120 days made `create_group` cost ~478 XLM in rent on
testnet, above the per-transaction fee cap). The keeper should call `bump_group` and `bump_keys`
(with the leaves and nullifiers it has indexed from events) for active
groups (`caller` = the polls address for vote nullifiers), `bump_poll` for
open polls, and `verifier.bump()`. The ledger keys for a direct
`ExtendFootprintTTLOp` are in `INTERFACE.md` §9.

An expired persistent entry is archived, not deleted. Reading it requires a
restore and never looks like "absent", so a lapsed nullifier cannot be
reused. Keep bumping anyway, because restores cost fees.
TODO(M0): confirm this archival behaviour on the current protocol.

## Differences from the spec, and why

1. **`validate_frozen_proof`** (new). Polls freeze the root at open, but
   `validate_proof` rejects roots older than `root_ttl` (1 h). Without this
   function, any join during a multi-day poll would break voting for
   everyone. Polls checks `proof.root == frozen_root` before calling it.
   Using an old root directly gains nothing: it burns a nullifier only in
   the caller's own namespace (8).
2. **One storage entry per key, not one `Map` per group** for roots, leaves
   and nullifiers. A single `Map` entry would grow until it hit the
   ledger-entry size limit and would make every write rewrite the whole map.
3. **`Group.members`** (new) counts active members. Removed leaves stay in
   the LeanIMT `size`, so `size` would overstate the anonymity set.
   `frozen_size` and `min_members` use `members`.
4. **`first_poll_id`** constructor arg. Scope is the poll id, so a
   redeployed polls contract that restarted at 1 would give each member the
   same nullifier as in the old deployment's poll with that id, linking
   their two votes. (With (8) the new deployment has its own nullifier
   namespace, so reuse no longer blocks voting.)
5. **`verify_proof` also checks the nullifier.** The relay's simulation
   then gets an early, distinct `NullifierUsed`.
6. **The depth floor** (`proof.depth ≥ root's depth`) is from the spec. Upstream
   `Semaphore.sol` does not check it. Proofs at a greater depth are accepted,
   because Semaphore pads the path.
7. **Group and poll ids start at 1**, so 0 never looks like a real id.
8. **Nullifiers are namespaced by the calling app.** This is a deliberate
   difference from upstream Semaphore V4. `validate_proof` and
   `validate_frozen_proof` take `caller: Address` first and call
   `caller.require_auth()`. The nullifier is stored under
   `Nullifier(caller, group_id, nullifier)`, and `has_nullifier`,
   `verify_proof` and `bump_keys` take `caller` too. `proof_validated`
   carries `caller` as its first data element. Polls passes
   `env.current_contract_address()`, which it authorizes automatically as
   the direct invoker. Upstream, anyone who sees a proof in flight can
   submit it to `validateProof` first, burning the nullifier so the real
   vote fails as already answered. Here such a replay spends the nullifier
   only in the replayer's own namespace, and the vote through polls is
   unaffected. A side effect: the same proof can be "validated" once per
   caller, so a consumer must only trust nullifiers in its own namespace
   (polls counts votes only from its own `vote`).

## Known risks and open questions

- **Front-running a vote: fixed** by caller-namespaced nullifiers
  (difference 8). Someone who sees a proof can still *front-run the relay's
  transaction with the same `polls.vote` call*. That only submits the
  voter's own vote earlier, for the same choice, so it is harmless.
- **Member removal (D5).** `remove_member` needs the member's commitment,
  which only the member can compute. In the MVP the admin's "Remove" is
  off-chain only (roster, invites, push, future polls in the UI). The leaf
  stays on-chain, so a removed member can still produce a valid proof
  against roots that contain them, including roots frozen after the
  removal. A member-initiated "leave" or an admin "re-key group" is a later
  feature. The contract functions for it already exist.
- Admin model: per-group Ed25519 keys as in the spec. The alternative, a
  passkey smart account with `require_auth`, is still open.
- Delegated poll-creator keys (`Poll.creator_key`) are not implemented. Only
  the group admin can create polls.
- The verifier is not audited.

## TODO(M0) checklist

- [ ] Testnet run of acceptance test 4, with tampered, wrong-root and
      wrong-scope cases (see `test-vectors/README.md`).
- [ ] Test 5 numbers on testnet: verify, insert, batch, real fees. Tune
      `MAX_BATCH`.
- [ ] Confirm that the `@zk-kit/semaphore-artifacts@4.13.0` keys are the
      final ceremony keys.
- [ ] Confirm the testnet protocol exposes `bn254_g1_msm`, the multi-pairing
      check and the Poseidon permutation host fns that sdk 28 targets.
- [ ] Confirm that stellar CLI accepts the snake_case constructor flags
      (`--min_members`, `--first_poll_id`) used in `deploy-testnet.sh`.
- [x] HKDF `group_id` encoding: the off-chain `groups.id` uuid (D1). The
      exact uuid text form is the SDK's (`INTERFACE.md` §5.3).
- [ ] Confirm the RPC error strings (`Error(Contract, #n)`,
      `Error(Auth, InvalidAction)`, `Error(Crypto, InvalidInput)`) on
      testnet.
- [ ] Confirm the archival behaviour for persistent entries.
- [x] Poseidon, LeanIMT and keccak vectors (tests 1 to 3), natively.
- [x] Real V4 proofs at depth 4 and 10 verify natively (test 4, native half).

## Deploying to testnet (not done yet)

```sh
cd contracts
SOURCE=lihim-deployer ./scripts/deploy-testnet.sh
```

This builds the contracts, creates and funds `SOURCE` if it is missing,
deploys the verifier, loads `vks/1..32.json` with `set_vk`, finalizes,
deploys the semaphore with the verifier address, and deploys polls with
`MIN_MEMBERS` (default 8) and `FIRST_POLL_ID` (default 1). It then prints
the three contract ids for the app, relay and edge-function env. Set
`FINALIZE=no` to keep the admin role during M0 experiments.

Manual equivalent:

```sh
stellar keys generate lihim-deployer --network testnet --fund
stellar contract build
V=$(stellar contract deploy --wasm target/wasm32v1-none/release/lihim_verifier.wasm \
      --source-account lihim-deployer --network testnet -- --admin $(stellar keys address lihim-deployer))
for d in $(seq 1 32); do
  stellar contract invoke --id $V --source-account lihim-deployer --network testnet \
    -- set_vk --depth $d --vk "$(cat vks/$d.json)"
done
stellar contract invoke --id $V --source-account lihim-deployer --network testnet -- finalize
S=$(stellar contract deploy --wasm target/wasm32v1-none/release/lihim_semaphore.wasm \
      --source-account lihim-deployer --network testnet -- --verifier $V)
P=$(stellar contract deploy --wasm target/wasm32v1-none/release/lihim_polls.wasm \
      --source-account lihim-deployer --network testnet -- --semaphore $S --min_members 8 --first_poll_id 1)
```

`vks/` is generated by `scripts/vk-to-soroban.mjs` from
`@zk-kit/semaphore-artifacts@4.13.0`. G2 is written imaginary-first, as
Soroban expects.

TypeScript bindings for the SDK:
`stellar contract bindings typescript --wasm target/wasm32v1-none/release/lihim_polls.wasm --output-dir <dir>`.
