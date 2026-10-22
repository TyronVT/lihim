# Test vectors

Compatibility vectors produced by the official JS libraries and checked by
the contract tests. A mismatch here silently breaks every proof, so these
gate M0.

| File | Produced by | Checked by | M0 test |
|---|---|---|---|
| `poseidon.json` | `poseidon-lite@0.3.0` `poseidon2` (what `@zk-kit/lean-imt` / `@semaphore-protocol/group` hash with) | `lihim-semaphore` `m0_poseidon_20_vectors` | 1 |
| `leanimt.json` | `@semaphore-protocol/group@4.14.5`: 10 commitments from `new Identity("lihim-m0-identity-<i>")`, root after each insert, then `updateMember(7)` and `removeMember(3)` with their Merkle siblings | `lihim-semaphore` `m0_leanimt_10_commitments_root` | 2 |
| `keccak.json` | `hash(x) = BigInt(keccak256(toBeHex(x, 32))) >> 8n` (copied from `@semaphore-protocol/proof` `src/hash.ts`, which the package does not export) | `lihim-semaphore` `m0_keccak_hash_10_vectors` | 3 |
| `groth16.json` | `@semaphore-protocol/proof@4.14.5` `generateProof` at depth 4 and 10 (identity 2 of the group above, message 1, scope 42) using local `@zk-kit/semaphore-artifacts@4.13.0`, and verified off-chain with snarkjs before it is written. It includes the matching verification keys in Soroban encoding. | `lihim-verifier` `m0_semaphore_v4_groth16_vectors`; `lihim-polls` `end_to_end_real_semaphore_v4_proof` | 4 (native half) |
| `admin-auth.json` | `lihim-semaphore` test `admin_auth_vectors`, which runs the Rust side and is the source of truth | the same test (fails if stale); `check-js.mjs` rebuilds all 8 with `@stellar/stellar-sdk@17.3.0` + `@noble/curves@2.4.0` | n/a (SDK contract) |
| `scval.json` | `lihim-semaphore` test `scval_vectors`: XDR of a `Proof`, the three `PollKind`s, and every storage key of the three contracts as a key `ScVal` and as a full persistent `LedgerKey` (including `Nullifier(caller, group_id, nullifier)` and the instance key) | the same test (fails if stale); `check-js.mjs` rebuilds all 17 from the `INTERFACE.md` recipes | n/a (SDK / relay / keeper contract) |

The keccak vectors are also implicitly cross-checked. `groth16.json`
proofs only verify on-chain if `hash_to_field(message/scope)` equals what the
circuit was fed, and the verifier test asserts that equality directly.

## Regenerating

`generate.mjs` resolves its dependencies from a directory you pass in, so
`contracts/` never needs a `package.json`:

```sh
DEPS=$(mktemp -d)
(cd "$DEPS" && echo '{"private":true,"type":"module"}' > package.json && \
  npm install --ignore-scripts \
    @semaphore-protocol/group@4.14.5 @semaphore-protocol/identity@4.14.5 \
    @semaphore-protocol/proof@4.14.5 poseidon-lite@0.3.0 ethers@6 \
    @zk-kit/semaphore-artifacts@4.13.0)        # ~170 MB: zkeys for depths 1-32
node contracts/test-vectors/generate.mjs --deps "$DEPS" --out contracts/test-vectors
node contracts/scripts/vk-to-soroban.mjs "$DEPS/node_modules/@zk-kit/semaphore-artifacts" contracts/vks
LIHIM_WRITE_VECTORS=1 cargo test -p lihim-semaphore admin_auth_vectors   # from contracts/
LIHIM_WRITE_VECTORS=1 cargo test -p lihim-semaphore scval_vectors        # from contracts/
```

Cross-check the Rust-written vectors from JS (any directory with
`@stellar/stellar-sdk@17` and `@noble/curves@2` installed, e.g. the repo
root):

```sh
node contracts/test-vectors/check-js.mjs --deps .   # from the repo root
# ok: 8 admin-auth + 4 values + 13 ledger keys (25)
```

The caller-namespaced nullifiers (`../README.md`, difference 8) changed no
admin digest, so `admin-auth.json` is byte-identical to before.

`poseidon.json`, `keccak.json` and `leanimt.json` are deterministic, so
regenerating them must produce no diff. `groth16.json` proofs are randomized
by snarkjs, so the bytes change on every run. Its keys must not change.

## Still TODO(M0)

- Test 4 on **testnet**: deploy with `scripts/deploy-testnet.sh`, create a
  group with the 10 `leanimt.json` commitments, open a poll with
  `FIRST_POLL_ID=42`, and submit the depth-4 and depth-10 proofs. The first
  should record a vote and the second should fail as already answered. Then
  check that a tampered proof, a wrong root and a wrong scope all fail.
- Test 5: record real fees. Native and wasm test-env estimates are in
  `../README.md`.
- Confirm that the `@zk-kit/semaphore-artifacts@4.13.0` keys are the final
  PSE ceremony keys, i.e. the ones embedded in the deployed
  `SemaphoreVerifier.sol`.
