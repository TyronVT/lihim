# @lihim/sdk

TypeScript SDK for **Lihim**: anonymous group membership and polls on Soroban,
using official, unmodified Semaphore V4 proofs (Groth16 / BN254).

- Per-group identities derived from one passkey (WebAuthn PRF), so a person's
  groups cannot be linked to each other.
- Proof generation with the official `@semaphore-protocol/proof`, in a Web
  Worker in the browser.
- Thin clients that build and simulate `LihimSemaphore` / `LihimPolls`
  transactions with `@stellar/stellar-sdk`.

> Status: pre-release. Encodings, admin digests and storage keys are locked
> byte for byte against the Rust-written vectors in `contracts/test-vectors/`
> (see `contracts/INTERFACE.md`, the canonical interface). Items that need a
> live testnet run are marked `TODO(M0)`.

## Install

```sh
npm i @lihim/sdk @stellar/stellar-sdk
```

Node 20+ or any modern browser. ESM only.

## Two kinds of group id

| Id | Type | Used for |
|---|---|---|
| `groupUuid` | Supabase `groups.id` (uuid string, generated in the browser) | Key derivation only: `HKDF info = "lihim/sem/" + uuid` and `"lihim/admin/" + uuid` |
| `chainGroupId` | on-chain `u64` from `create_group` | Every contract call and the admin signature digest |

Keys come from the uuid, so the admin key exists before the on-chain id does
and stays the same if `create_group` has to be retried.

## Quickstart: a group, 3 members and a verified proof on testnet (~30 min)

You need the deployed contract ids (`contracts/scripts/deploy-testnet.sh`,
or the team's testnet deployment).

### 1. Network and a funded testnet account

```ts
import { Keypair, scValToNative, type Transaction } from "@stellar/stellar-sdk";
import { TESTNET, LihimSemaphoreClient, type LihimNetwork } from "@lihim/sdk";

const network: LihimNetwork = {
  ...TESTNET,
  semaphoreContractId: "C...", // LIHIM_SEMAPHORE_ID
  pollsContractId: "C...",     // LIHIM_POLLS_ID
  verifierContractId: "C...",  // LIHIM_VERIFIER_ID
};

const sem = new LihimSemaphoreClient(network);

// The submitter only pays fees; the admin signature is the authorization.
const submitter = Keypair.random();
await sem.server.fundAddress(submitter.publicKey()); // testnet friendbot
const opts = { source: submitter.publicKey() };

// Signs, submits and waits; throws unless the tx succeeded. Every SDK tx
// builder returns an unsigned, simulated transaction so you decide who signs.
async function send(tx: Transaction) {
  tx.sign(submitter);
  const res = await sem.submit(tx);
  if (res.status !== "SUCCESS") throw new Error(`tx ${res.hash}: ${res.status}`);
  return res.returnValue ? scValToNative(res.returnValue) : undefined;
}
```

### 2. Create a group

In the app the admin key comes from the user's passkey. For a script, any
32 random bytes stand in for the PRF output:

```ts
import { deriveAdminKey, newGroupUuid } from "@lihim/sdk";

const prfOut = crypto.getRandomValues(new Uint8Array(32)); // keep this!
const groupUuid = newGroupUuid();                          // becomes groups.id
const admin = deriveAdminKey(prfOut, groupUuid);

// Signs over semaphore.next_group_id() with nonce 0. If another group takes
// that id first, it re-reads the id and signs again with the same key.
const { chainGroupId } = await sem.createGroupWithRetry(admin, opts, send);
console.log("group", chainGroupId); // store next to groups.id
```

### 3. Add 3 members

```ts
import { deriveGroupIdentity } from "@lihim/sdk";

// Each member derives their own identity locally and shares only the commitment.
const members = [0, 1, 2].map(() =>
  deriveGroupIdentity(crypto.getRandomValues(new Uint8Array(32)), groupUuid),
);
const commitments = members.map((m) => m.commitment);

// One tx for up to MAX_BATCH (32); addMembersBatched chunks larger lists
// and sends them one after another (each chunk signs the next nonce).
await send(await sem.addMembers(chainGroupId, commitments, admin, opts));
// or: await sem.addMembersBatched(chainGroupId, commitments, admin, opts, send)

console.log("members", await sem.getMemberCount(chainGroupId)); // 3
```

Admin calls on one group share one nonce (`semaphore.nonce`), so run them
one at a time: read the nonce, sign, submit, wait. The builders read it for you.

### 4. Prove and validate

```ts
import { proveVote } from "@lihim/sdk";

// message = 0, scope = 1, both RAW (the contract hashes them). The first run
// downloads the depth-2 circuit artifacts (a few MB); later runs use the cache.
const proof = await proveVote({ identity: members[0], commitments, pollId: 1n, choice: 0 });

// Nullifiers are namespaced by the calling app (`caller`). A script spends
// them in its own namespace; caller === opts.source, so the envelope
// signature is the require_auth.
const me = submitter.publicKey();
console.log("verify (free, simulated):", await sem.verifyProof(me, chainGroupId, proof)); // true
await send(await sem.validateProof(me, chainGroupId, proof, opts)); // spends the nullifier for `me`

// Same identity, same scope → same nullifier → NullifierUsed (113) in this namespace.
const again = await proveVote({ identity: members[0], commitments, pollId: 1n, choice: 1 });
await sem.validateProof(me, chainGroupId, again, opts).catch((e) => console.log("rejected:", e.code)); // 113
```

That's the whole loop: the contract checked the proof against the group's
Merkle root and remembered the nullifier, without learning which member made it.

Because the namespace is the caller, replaying someone's proof straight into
the semaphore only burns it in the replayer's own namespace. Votes are spent
in the LihimPolls namespace, which only LihimPolls can write.

## Polls

```ts
import { LihimPollsClient } from "@lihim/sdk";
import { sha256 } from "@noble/hashes/sha2.js";

const polls = new LihimPollsClient(network);
// The group needs at least polls.getMinMembers() active members (8 in production).
const meta = new TextEncoder().encode(JSON.stringify({ title: "Field trip?", options: ["Yes", "No"] }));
const pollId = BigInt(await send(await polls.createPoll(
  { chainGroupId, kind: { kind: "yesno" }, closesAt: BigInt(Math.floor(Date.now() / 1000) + 86400), metaHash: sha256(meta) },
  admin, opts, // signs over the polls nonce (polls.nonce), separate from the semaphore's
))); // create_poll returns the new poll id

// Voters prove against the commitments present when the poll opened
// (frozen root) and hand the proof to the relay; they never submit themselves.
// choice: Single(n) 0..n, YesNo 0 = Yes / 1 = No, Rating 1..=5.
const vote = await proveVote({ identity: members[1], commitments, pollId, choice: 0 });

// Relay side: polls.vote(pollId, proof) needs no auth entries.
// AlreadyVoted (208) / NullifierUsed (113) mean "already answered".
await send(await polls.vote(pollId, vote, opts));

console.log(await sem.hasVoted(chainGroupId, vote.nullifier)); // true (polls namespace)
const tally = await polls.getTally(pollId); // [yes, no]
```

## Browser: passkey identity and the worker prover

```ts
import { getPrfOutput, deriveGroupIdentity, serializeProof } from "@lihim/sdk";
import { createProver } from "@lihim/sdk/prover";

// One biometric prompt; prfOutput never leaves the device.
const { prfOutput } = await getPrfOutput({ challenge, rpId: location.hostname, userVerification: "required" });
const identity = deriveGroupIdentity(prfOutput, groupUuid); // groups.id

const prover = createProver(); // Web Worker; falls back to main thread if unavailable
const proof = await prover.prove({ identity, commitments, pollId, choice });

await fetch(`${RELAY_URL}/vote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ poll_id: pollId.toString(), proof: serializeProof(proof) }),
});
```

`createProver()` uses `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`,
which Next.js, Vite and esbuild bundle automatically. To serve the worker
yourself, pass `createProver({ workerUrl })` pointing at `@lihim/sdk/worker`.

## Reference

| Export | What it does |
|---|---|
| `hashToField(x)` | `keccak256(be32(x)) >> 8`, identical to Semaphore's `hash` |
| `serializeProof` / `deserializeProof` | Wire JSON: bigints as base-10 strings; strict parser for untrusted input |
| `fromSemaphoreProof` / `toSemaphoreProof` | Convert to/from `@semaphore-protocol/proof` output |
| `getPrfOutput(options)` | WebAuthn `get` with PRF, salt `sha256("lihim/v1")` |
| `newGroupUuid()` / `canonicalGroupUuid(s)` | New `groups.id`; canonical text form (lowercase, hyphenated) used in HKDF info |
| `deriveGroupIdentity(prf, groupUuid)` | HKDF-SHA256, salt empty, info `lihim/sem/<groups.id>` → Semaphore `Identity` |
| `deriveAdminKey(prf, groupUuid)` | HKDF-SHA256, salt empty, info `lihim/admin/<groups.id>` → Ed25519 `{ publicKey, sign }` |
| `adminKeyFromSeed(seed)` | Ed25519 admin key from a raw 32-byte seed (scripts, vectors) |
| `adminMessage({...})` | `sha256(contract_strkey ‖ fn_tag ‖ be64(chain group id) ‖ be64(nonce) ‖ args_xdr)` |
| `adminArgs.<fn_tag>(...)`, `signAdminCall(...)` | Digest args per fn tag (INTERFACE.md §5.2) and the signature |
| `proveVote({...})` | Semaphore proof with message = choice, scope = poll id (both raw) |
| `proofToScVal(proof)` | `Proof` struct (sorted keys) for `validate_proof` / `verify_proof` / `vote` |
| `pollKindToScVal` / `pollKindFromNative` / `pollKindTag` | `PollKind` enum: `["Single", n]`, `["Rating"]`, `["YesNo"]`; event tag 0/1/2 |
| `storageKeys`, `contractDataKey` | Storage keys and ledger keys (`getLedgerEntries`, TTL extension) |
| `CONTRACT_ERRORS`, `parseContractErrorCode`, `ContractCallError.code` | Contract error codes (100–116, 200–210, 300–305) |
| `LihimSemaphoreClient`, `LihimPollsClient` | Build + simulate transactions, read views |

`points` keep the order of `packGroth16Proof`
(`[a.x, a.y, b.x1, b.x0, b.y1, b.y0, c.x, c.y]`, the Solidity verifier order).

Admin "Remove" in the app is off-chain only: `remove_member` needs the
member's commitment, which only the member knows (INTERFACE.md §11).

## Development

```sh
# from the repo root (npm workspaces)
npm run typecheck -w @lihim/sdk
npm test -w @lihim/sdk        # vectors + a real proof; first run downloads circuit artifacts
npm run build -w @lihim/sdk   # dist/index.js, dist/prover.js, dist/worker.js + .d.ts
```
