# Lihim — Product & Build Spec

*"lihim" — secret. Prove you belong; never say who you are.*

## What this is

Lihim is two things:

1. **Lihim Kit** — a maintained, **Semaphore V4–compatible** anonymous-membership
   toolkit for Stellar: Soroban contracts, a TypeScript SDK and an in-browser
   prover. Any Stellar app can add "only real members, one action each, nobody
   knows who" without writing its own circuit.
2. **Lihim Polls** — the first app on the kit: anonymous polls, ratings and
   feedback for small groups (student orgs, HOAs, class groups, ministries),
   where people need to be honest but can't afford to be identified, and where
   the result has to be trusted.

Pitch:

- **To members:** say what you really think. Only members can answer, each
  person answers once, and not even the admin can tell who said what.
- **To group leaders:** a result nobody can accuse you of rigging.
- **To Stellar developers:** official Semaphore on Soroban, maintained, with an
  SDK — instead of every team re-implementing Merkle trees and nullifiers.

Related documents (Instawards Ideas project):

- `claude/stellar-zk-ideas-for-individuals-research.md` — ideas #20, #21, #22
  and the ZK tooling notes this spec relies on.
- `claude/irecordmo-SPEC.md` — M3 integrates Lihim into iRecordMo. The
  integration is contract-to-contract on Stellar, so Lihim does not share a
  server with iRecordMo.
- `claude/tamang-pila-SPEC.md` — same passkey PRF identity pattern and
  Poseidon test-vector rule.

Screen IDs (L1–L9) are used throughout.

## The problem

| # | Failure | What happens today |
|---|---|---|
| F1 | Anonymous but open | Anonymous Google Form: anyone with the link answers, any number of times |
| F2 | Verified but exposed | Login-required form: one answer each, but the admin sees who said what |
| F3 | Face-to-face silence | Officer evaluations, HOA complaints, "approve the report?" — nobody says the real thing |
| F4 | Distrusted results | The organizer counts the votes; losers assume it was rigged; results can be edited |
| F5 | Brigading | Community polls flooded by outsiders or dummy accounts |
| F6 | Builder re-work | Every anonymous app on Stellar rebuilds the same circuit; the only Semaphore port for Stellar (ZencypherSolutions) predates Protocol 25 and is dormant since late 2024 |

## How each failure is addressed

| Failure | Fix | Uses ZK? |
|---|---|---|
| F1 Open forms | Only commitments in the group tree can produce a valid proof | Yes |
| F2 Exposed voters | Proof shows "a member", never which one; relayer submits so no account is linked | Yes |
| F3 Silence | Anonymity is the product; minimum group size before anonymity is promised | Yes |
| F4 Distrusted results | Votes verified and stored on Stellar; anyone can recount from chain data | No (append-only log) |
| F5 Brigading | One nullifier per member per poll | Yes |
| F6 Re-work | Kit = contracts + SDK + docs, compatible with the official Semaphore V4 circuits and JS libraries | Yes |

Be honest in the pitch: ZK guarantees **membership and one-per-member
anonymously**. It does not decide **who is a member** — that is the group
admin's job (see Threats: fake members).

## Who it's for

| Segment | Why they adopt | Priority |
|---|---|---|
| Student orgs (10–200 members) — officer evaluations, report approval, elections of minor posts | Retaliation fear is real; advisers want clean results | **Beachhead** |
| HOAs / condo residents | Complaints about guards, admin, repairs without becoming "the complainer" | Next |
| Class groups, barkadas, ministries, fan clubs | Contribution changes, outings, anonymous concerns, brigade-proof polls | Next |
| Stellar developers | Drop-in anonymous membership for their own apps | Parallel (the Kit) |

Not for: official government or school elections (legal frameworks apply),
polls with money attached, groups below the minimum size (8, MVP default).

## Product rules (non-negotiable)

1. **Lihim never moves money.** No payments, prizes, betting or paid votes.
2. **No identity on-chain.** On-chain: group roots, commitments, nullifiers,
   poll IDs, choices. Names and emails stay off-chain, visible only to the
   group admin's member list.
3. **The vote path is unauthenticated.** The relay endpoint never receives a
   session token, user ID or cookie. A vote that arrives with identity attached
   is a bug.
4. **Minimum group size.** A poll can't open unless the frozen member set has
   at least `min_members` (default 8). UI says plainly: "Small groups can still
   guess who voted what."
5. **Honest copy.** Say "Anonymous to the group and the public." Never
   "untraceable" or "100% anonymous".
6. **No crypto exposure.** Users never hold XLM, see fees or manage seed
   phrases. Passkey only.
7. **Stay Semaphore V4–compatible.** No custom circuit in the Kit. If a feature
   needs a new circuit, it goes in a separate, clearly labeled extension.

## Scope

### In scope (MVP)

- Kit: Semaphore contract (groups, members, proof validation, nullifiers),
  verifier with official V4 verification keys, TypeScript SDK, Web Worker
  prover, docs and examples.
- Polls app: create group, invite links, join with passkey, create poll
  (single choice, 1–5 rating, yes/no), vote, results page, public "verify this
  poll" page.
- Relayer that pays fees and submits votes without identity.
- Testnet first; mainnet for the pilot.

### Out of scope (MVP)

- Cryptographically sealed tallies (see Open questions; MVP hides live tallies
  in the UI only).
- Per-person uniqueness proofs to join (Campus Pass, PhilSys) — next milestone.
- Free-text anonymous comments (moderation burden) — after pilot.
- Native apps (PWA only), Messenger/Viber bots.
- Weighted, ranked-choice or quadratic voting.

## Background: Semaphore V4 in one page

All protocol details below are from the Semaphore V4 design as understood at
spec time. **M0 must confirm each one against the current Semaphore source
(`semaphore-protocol/semaphore`, packages `circuits`, `contracts`, `proof`,
`identity`, `group`) before code is written.**

- **Identity:** an EdDSA-Poseidon (Baby Jubjub) keypair. `secretScalar` is
  derived from the private key.
- **Commitment:** `Poseidon(publicKey.x, publicKey.y)` — the public "padlock"
  added to a group.
- **Group:** a Lean Incremental Merkle Tree (LeanIMT) of commitments, Poseidon
  hashed, depth grows with size (1–32).
- **Proof public signals:** `merkleTreeRoot`, `nullifier`, `hash(message)`,
  `hash(scope)`, where `hash(x) = keccak256(x) >> 8` (fits the BN254 field).
- **Nullifier:** `Poseidon(scope, secretScalar)` — same per identity per scope,
  unlinkable across scopes.
- **Proof system:** Groth16 over BN254, one verification key per tree depth,
  from PSE's multi-party trusted-setup ceremony. Proof = 8 field elements.

What Lihim adds is the Soroban side: LeanIMT with on-chain Poseidon, the
Groth16 BN254 verifier, nullifier storage, and the keccak/encoding match.

## Lifecycle

```
Group: Created ──▶ Members join (invites) ──▶ Active ──(members removed/added)──▶ ...
                                                  │
Poll:            Draft ──▶ Open (root frozen) ──▶ Closed ──▶ Results final
                              │
                    members vote (proof via relayer)
```

## Identity and keys

Privacy requirement: a user's groups must not be linkable on-chain. If the
same commitment appeared in every group, anyone could tell that the same
person is in the student org, the HOA and the fan club.

Design (same pattern as Tamang Pila):

- One **identity passkey** per user for Lihim (synced via iCloud Keychain /
  Google Password Manager).
- `prf_out = PRF(passkey, "lihim/v1")` via the WebAuthn **PRF extension**.
- Per group: `sem_priv(group) = HKDF(prf_out, "lihim/sem/" || group_id)` →
  Semaphore `Identity` from that private key. A **fresh, deterministic
  identity per group**, so commitments differ across groups.
- Admin actions use a per-group Ed25519 admin key:
  `admin_key(group) = Ed25519 from HKDF(prf_out, "lihim/admin/" || group_id)`.
- Lost phone → sign in with the synced passkey → same `prf_out` → same
  identities and votes stay valid.

Fallback where PRF is unsupported: random identity stored encrypted with a
recovery code. Decide in M0 after testing target phones.

### App login (Supabase Auth)

The same passkey also signs the user in to the app:

- If Supabase Auth supports passkey sign-in natively at implementation time,
  use it. **Confirm in M0.**
- Otherwise: run the WebAuthn ceremony with SimpleWebAuthn in an Edge
  Function (`auth-passkey`), store credentials in `passkey_credentials`, and
  mint a Supabase session for the user (custom sign-in flow; same approach as
  the tender architecture, since Supabase's built-in Web3 login doesn't cover
  Stellar).
- The PRF evaluation runs in the browser in the same WebAuthn call where
  possible (one Face ID / fingerprint prompt for login + identity). `prf_out`
  never leaves the device and is never sent to Supabase.

Operator caveat: the server knows which user joined which group (it shows the
admin a member list). It does **not** know which commitment is whose if the
client generates commitments locally and the server stores only "user X has
joined" — but the join request carries both. MVP accepts this; the privacy
notice says the operator can know membership, never votes. (Open question:
blind joins.)

## Architecture

No custom backend server. Supabase is the backend; the only other service is
the vote relay, which is deliberately kept outside Supabase.

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js PWA (Vercel)                                        │
│  • Polls app (L1–L8) • Public verify-poll page (L9)          │
│  • Passkey login + PRF → per-group Semaphore identity        │
│  • Admin actions signed in-browser (per-group Ed25519 key)   │
│  • @semaphore-protocol/proof in a Web Worker (snarkjs)       │
└──────┬──────────────────────────────────────┬────────────────┘
       │ supabase-js (authenticated)          │ HTTPS (UNauthenticated)
┌──────▼──────────────────────────────┐ ┌─────▼──────────────────────┐
│  Supabase                           │ │  Vote relay (separate)     │
│  • Auth (passkey login)             │ │  Vercel/Cloud Run function │
│  • Postgres + RLS                   │ │  • no cookies/tokens       │
│  • Realtime (live results, polls)   │ │  • no IP/request logging   │
│  • Edge Functions:                  │ │  • no Supabase access      │
│    auth-passkey, submit-admin-tx,   │ │  • simulate → submit       │
│    indexer, keeper, notify          │ │  • holds vote fee key only │
│  • pg_cron (indexer every 1 min,    │ └─────┬──────────────────────┘
│    keeper daily)                    │       │
└──────┬──────────────────────────────┘       │
       │ admin txs (fee key #1)               │ vote txs (fee key #2)
       ▼                                      ▼
                     Stellar RPC
                          │
 Soroban: LihimSemaphore (groups, LeanIMT, nullifiers)
            └─▶ LihimVerifier (Groth16 BN254, V4 vks per depth)
          LihimPolls (polls on top of LihimSemaphore)
                          │
              events ──▶ indexer Edge Function ──▶ Postgres (results cache)
```

Stack: Next.js on Vercel, Supabase (Auth, Postgres + RLS, Realtime, Edge
Functions on Deno, pg_cron), one small relay function, Soroban contracts. ZK:
official Semaphore V4 circuits and JS packages; verification with Protocol
25/26 BN254 host functions.

Why this split:

- Supabase handles everything that is **allowed to know who the user is**
  (accounts, groups, member lists, poll metadata).
- The relay handles the one thing that **must not know who the user is**
  (votes). It never receives a Supabase session and has no database
  credentials. Supabase never sees a vote arrive; it only reads tallies back
  from chain events.
- Two separate fee-payer keys (admin txs vs votes) so the vote fee key can be
  rotated or rate-limited without touching admin flows.

### Edge Functions

| Function | Trigger | Does |
|---|---|---|
| `auth-passkey` | HTTP (unauthenticated) | WebAuthn registration/login (if Supabase Auth lacks native passkeys); mints session |
| `submit-admin-tx` | HTTP (authenticated) | Receives an admin action **already signed in the browser**, checks the caller is that group's admin in Postgres, simulates, pays fee, submits; writes pending row |
| `indexer` | pg_cron every minute | RPC `getEvents` from last cursor; upserts `chain_events`, updates `poll_results`, `groups.member_count`, `polls.voters_count`; Realtime broadcasts changes |
| `keeper` | pg_cron daily | Extends TTL for active groups, trees, nullifier maps and polls |
| `notify` | DB trigger on new `polls` row / poll closing soon | Web push to all group members equally |

Server-held secrets: two fee-payer keys (admin key in Supabase secrets, vote
key in the relay's secrets). No server holds any user's identity or admin
signing key.

When to add a long-running worker instead of the `indexer` Edge Function: if
backfills or event volume exceed Edge Function time limits. That worker can be
a small Node service; it still writes to Supabase.

## Contracts (Soroban)

### LihimVerifier

- Groth16 BN254 verification using `bn254_multi_pairing_check`, with
  `bn254_g1_msm` (Protocol 26) for the public-input combination.
- Stores the official Semaphore V4 verification keys for depths 1–32 in
  persistent storage (loaded once by admin at init, then admin role removed).
- `verify(depth, points[8], signals[4]) -> bool`.
- Source: port a community BN254 verifier (ZK-VOTE, crisp) or adapt the
  official `soroban-examples` BLS12-381 verifier. Record the choice.
- Validate points are on-curve and field elements are `< p` (reject
  malleable/out-of-range inputs).

### LihimSemaphore

Mirrors the Semaphore V4 Solidity contract's interface where Soroban allows.

#### Storage

| Key | Type | Purpose |
|---|---|---|
| `group(id)` | Group | `{ admin: BytesN<32>, size: u32, depth: u32, root: U256, created_at }` |
| `tree(id)` | LeanIMT nodes | Side nodes per level (persistent) |
| `roots(id)` | Map<U256, u64> | Root → ledger time it was replaced (root history) |
| `root_ttl(id)` | u64 | How long old roots remain valid (default 1 hour) |
| `nullifiers(id)` | Map<U256, ()> | Used nullifiers per group |
| `nonces(id)` | u64 | Admin replay protection |

Persistent storage for all group data; bump TTL on every write and via a
keeper job (groups can sit idle between polls for months).

#### Admin authorization

Admin actions carry an Ed25519 signature by the group's admin key over:

```
msg = sha256( contract_address || fn_tag || group_id || nonce || args_xdr )
```

The relayer only submits; it has no role. (Alternative: admin as a Stellar
passkey smart account with `require_auth` — decide in M0.)

#### Functions

| Function | Signed by | Effect |
|---|---|---|
| `create_group(admin_key, sig)` | admin | New group id; empty tree |
| `add_member(id, commitment, sig)` | admin | LeanIMT insert; new root; old root → history |
| `add_members(id, commitments, sig)` | admin | Batch insert (measure max batch per tx) |
| `update_member(id, old, new, path, sig)` | admin | Replace a commitment (device reset without PRF) |
| `remove_member(id, old, path, sig)` | admin | Set leaf to 0 |
| `validate_proof(id, proof)` | — (proof is the auth) | Checks below; store nullifier; emit `ProofValidated` |
| `verify_proof(id, proof)` | view | Same checks, no state change (free via simulation) |
| views | — | `group`, `root`, `size`, `is_member`, `has_nullifier` |

`proof = { depth, root, nullifier, message: U256, scope: U256, points[8] }`

`validate_proof` checks:

1. `depth` in 1..=32 and ≥ the group's current depth requirement.
2. `root == group.root`, or `root` is in `roots(id)` and replaced less than
   `root_ttl` ago.
3. `nullifier` not in `nullifiers(id)`.
4. `LihimVerifier.verify(depth, points, [root, nullifier, h(message), h(scope)])`
   where `h(x) = keccak256(be32(x)) >> 8` — encoding must match the JS library
   byte-for-byte (test vectors in M0).
5. Store nullifier; emit `ProofValidated { group, root, nullifier, message, scope }`.

#### LeanIMT on Soroban

- Poseidon(2) via `rs-soroban-poseidon` over the BN254 host permutation.
- **Critical:** parameters must match circomlib's Poseidon used by the
  Semaphore circuits and `@zk-kit/lean-imt` (width, rounds, round constants,
  MDS). Test vectors gate M0.
- Insert cost ≈ `depth` Poseidon hashes per leaf. Measure; batch inserts
  should process up to the per-tx budget.

### LihimPolls

Thin app contract on top of `LihimSemaphore`.

```rust
pub struct Poll {
    pub group_id: u64,
    pub creator_key: BytesN<32>, // group admin key or delegated poll-creator key
    pub kind: PollKind,          // Single(n_options) | Rating(1..=5) | YesNo
    pub frozen_root: U256,       // group root at open
    pub frozen_size: u32,        // members at open (≥ min_members)
    pub opens_at: u64,
    pub closes_at: u64,
    pub meta_hash: BytesN<32>,   // hash of off-chain title/options JSON
    pub closed: bool,
}
```

| Function | Signed by | Effect |
|---|---|---|
| `create_poll(group_id, kind, closes_at, meta_hash, sig)` | admin | Freeze root and size; reject if `size < min_members` |
| `vote(poll_id, proof)` | — | Requires `proof.root == frozen_root`, `proof.scope == poll scope`, `message` in range; calls `validate_proof`; increments tally |
| `close(poll_id)` | anyone after `closes_at` | `closed = true` |
| views | — | `poll`, `tally`, `voters_count` |

- **Scope:** `scope = poll_id` (field element). One vote per member per poll;
  votes across polls unlinkable.
- **Message:** the choice index (0-based) or rating (1–5).
- **Frozen root:** only members present when the poll opened can vote; avoids
  the "joined mid-poll" problem and makes the anonymity set explicit.
- Nullifiers are stored per group in `LihimSemaphore`; because scope differs
  per poll, the same member can vote in every poll once.

## Data model (Supabase Postgres, off-chain)

| Table | Columns | Notes |
|---|---|---|
| `profiles` | id (= `auth.users.id`), display_name, created_at | |
| `passkey_credentials` | user_id, credential_id, public_key, counter, transports | Only if not using native Supabase passkeys |
| `groups` | id, chain_group_id, name, description, admin_user_id, admin_pubkey, min_members, member_count, created_at | `member_count` maintained by indexer |
| `group_members` | group_id, user_id, display_name, joined_at, status | **No commitment column** (see Open questions: blind joins) |
| `invites` | id, group_id, token_hash, max_uses, uses, expires_at | |
| `polls` | id, chain_poll_id, group_id, title, options jsonb, kind, opens_at, closes_at, hide_live_tally, voters_count, status | `voters_count` maintained by indexer |
| `poll_results` | poll_id, option_index, count, updated_at | Cache recomputed from chain events |
| `chain_events` | id, ledger, tx_hash, contract, type, payload jsonb | Indexer mirror |
| `indexer_cursor` | id, last_ledger, last_cursor | Single row |
| `pending_txs` | id, group_id, kind, tx_hash, status, error, created_at | Admin txs only, never votes |
| `push_subscriptions` | user_id, endpoint, keys jsonb | Web push |

### Row Level Security

RLS on every table. Edge Functions use the service role only where noted.

| Table | Read | Write |
|---|---|---|
| `profiles` | self | self |
| `groups` | members of the group; public fields (name, member_count) also via the public verify view | admin via `submit-admin-tx` (service role) after chain confirmation |
| `group_members` | **admin of the group: all rows.** Members: their own row only | Insert via invite redemption function; delete by admin |
| `invites` | admin of the group | admin |
| `polls` | members of the group; closed polls also via public view | admin via `submit-admin-tx` |
| `poll_results` | members of the group; hidden while open if `hide_live_tally` (enforced in policy: `status = 'closed' or not hide_live_tally`) | indexer (service role) only |
| `chain_events`, `indexer_cursor`, `pending_txs` | none (service role) | service role |
| `push_subscriptions` | self | self |

Members see the group's **member count**, not names (via `groups.member_count`
or a `security definer` view). Only the admin sees names, to manage the roster.

Public verify page (L9) reads from a `public_poll_audit` view exposing frozen
root, member count, nullifiers, choices and tally for **closed** polls only —
no names, no user IDs. It can also be rebuilt client-side straight from
Stellar RPC, which is the point.

**Never stored anywhere in Supabase:** which user cast which vote,
nullifier ↔ user mapping, commitment ↔ user mapping, `prf_out`, identity
private keys, admin signing keys.

**Operator note:** RLS protects users from each other, not from whoever holds
the service-role key. The privacy guarantee rests on the data above never
being written, not on RLS.

## Vote relay (separate service, outside Supabase)

- Hosted as its own function (Vercel or Cloud Run) on its own subdomain,
  e.g. `relay.lihim.app`, so the browser never attaches app cookies.
- **Not** a Supabase Edge Function: it must never receive a Supabase session
  token and must not depend on Supabase's platform request logs for privacy.
- Has no Supabase credentials and no database. Its only secret is the vote
  fee-payer key.
- Endpoint `POST /vote { poll_id, proof }`. No auth header accepted;
  CORS limited to the app origin; no cookies.
- The browser calls it with a plain `fetch`, not through `supabase-js`.
- Simulates `LihimPolls.vote`; rejects invalid proofs before paying fees.
- Rate limiting by proof validity, not by user (invalid proofs are free to
  reject via simulation). Add a small proof-of-work token if spam appears.
- Logging: no IPs, no user agents; log only `poll_id`, nullifier, tx hash,
  outcome.
- Optional timing protection: random delay 0–60 s before submission (helps in
  small groups where "who just opened the app" is observable).

## Indexer and integrity checks

- `indexer` Edge Function on pg_cron (every minute): RPC `getEvents` from
  `indexer_cursor` → `chain_events` → derived tables. Idempotent on
  `(tx_hash, event index)`; backfills gaps from the stored cursor.
- Realtime: the app subscribes to `poll_results` and `polls` changes for live
  turnout and (when allowed) live tallies.
- Recompute every group root from member events; alert on mismatch.
- Recompute every tally from `ProofValidated` events; L9 shows the recount.
- RPC event retention is limited; if the indexer is down longer than the
  retention window, backfill from a history source (e.g. Galexie/Hubble) —
  note the chosen fallback in M2.

## Frontend screens

| ID | Screen | Notes |
|---|---|---|
| L1 | Create group | Name, description, min group size (default 8), invite link settings |
| L2 | Join | Invite link → passkey → "You're in. Your answers in this group are anonymous." |
| L3 | Group home | Member count (not names, for members); open polls; past results |
| L4 | Members (admin only) | Names, joined date, remove; public member count shown to all |
| L5 | Create poll | Kind, options, closing time, "hide results until closing" toggle; blocked below min size with an explanation |
| L6 | Vote | One tap → "Proving you're a member…" (≈1 s) → "Recorded anonymously" |
| L7 | Results | Tally, turnout (23 of 31), "every vote verified" badge, link to L9 |
| L8 | Privacy explainer | Plain English: who can see what (admin sees members, nobody sees votes, small-group warning) |
| L9 | Verify this poll (public) | Frozen root, member count, each nullifier + choice, recomputed tally, no names |

Copy rules: no crypto words ("Recorded" not "on-chain", "Verified member" not
"ZK proof"). Microcopy is English only, written to ASD-STE100. Mobile-first at 360 px.

Reminders: PWA push for "New poll in Art Guild" and "Poll closes in 2 hours".
Notifications go to all members equally; never "you haven't voted yet" (that
would reveal the server tracks who voted — it doesn't, and it mustn't look
like it does).

## Threats and mitigations

| Threat | Mitigation | Residual risk |
|---|---|---|
| Admin adds fake members (sock puppets) | Public member count; single-use invites; admin actions on-chain and visible | **Real.** Needs uniqueness proof to join (Campus Pass / PhilSys) next |
| Outsider votes | Only tree members can prove | None |
| Double voting | Per-scope nullifier | None |
| Proof replayed to another poll | Scope bound in proof | None |
| Vote linked via submitting account | Relayer submits; no user account in tx | None |
| Vote linked via session/cookie | Relay is a separate unauthenticated service | Implementation bugs; test in M2 |
| Vote linked via IP/timing | No IP logs; optional random delay | Operator with network-level access |
| Small-group inference | `min_members`; hide-until-close; L8 warning | Unanimous or tiny results reveal votes |
| Commitments linked across groups | Per-group identities from PRF | Operator DB knows memberships |
| Member joins mid-poll | Frozen root at poll open | None |
| Poseidon mismatch contract vs circuit | Test vectors gate M0 | — |
| keccak/encoding mismatch | Test vectors gate M0 | — |
| Malformed proof points | On-curve and field-range checks | Verifier bugs until reviewed |
| Storage expiry (nullifiers lost → re-vote) | Persistent storage, TTL bumps, keeper | Keeper failure |
| Coercion ("show me your vote") | None in MVP (Semaphore isn't receipt-free) | Real for high-stakes votes; out of scope |

## Milestones

### M0 — Compatibility spike (go/no-go)

Prove that official Semaphore V4 proofs verify on Soroban.

**Acceptance tests:**

1. Contract Poseidon equals circomlib Poseidon (as used by `@zk-kit/lean-imt`)
   on 20 test vectors.
2. A LeanIMT built on-chain from 10 commitments has the same root as
   `@semaphore-protocol/group` off-chain.
3. `keccak256(be32(x)) >> 8` matches the JS library for message and scope on
   10 vectors.
4. A proof generated by `@semaphore-protocol/proof` (depth 4 and depth 10)
   verifies on testnet; a tampered proof, wrong root and wrong scope all fail.
5. Measure: verify cost (CPU instructions, fee), insert cost per leaf, max
   batch insert per tx. Record numbers here.
6. PRF derivation yields the same per-group identity on two devices sharing a
   synced passkey (Android Chrome + iOS Safari).
7. `@stellar/stellar-sdk` (via `npm:` import) builds, simulates and submits a
   transaction from a Supabase Edge Function (Deno). If not, move
   `submit-admin-tx` into the relay's Node runtime as a separate,
   authenticated route.
8. Passkey login: native Supabase Auth passkeys or the SimpleWebAuthn
   fallback works end to end, with PRF evaluated in the same prompt.

If 1–4 can't pass, stop and decide: fork the circuits (lose V4 compatibility)
or wait.

### M1 — Lihim Kit (developer release)

Contracts complete, TypeScript SDK, Web Worker prover, docs, example app.

**Acceptance tests:**

1. `npm i @lihim/sdk`; a developer creates a group, adds 3 members and
   validates a proof on testnet by following the README in under 30 minutes.
2. Batch add 100 members; roots match off-chain.
3. Double nullifier, stale root (beyond `root_ttl`) and wrong-depth proofs are
   rejected.
4. Remove a member; their old identity can no longer produce a valid proof
   against the new root.
5. Proving time recorded on an iPhone, a flagship Android and a ₱6–8K Android
   (3–4 GB RAM) for depths 5, 8, 10.

### M2 — Lihim Polls (pilot-usable)

Screens L1–L9, relay service, indexer, reminders.

**Acceptance tests:**

1. A student-org officer creates a group and invites 20 people in under 3
   minutes.
2. A member joins from an invite link on a phone with no prior account in
   under 1 minute.
3. A poll can't open with fewer than `min_members`.
4. 20 members vote; tally on L7 equals the recount on L9 from chain data.
5. A second vote from the same member is rejected with a friendly message.
6. **Privacy audit:** after the test poll, inspect the relay's platform logs,
   Supabase API/Edge Function logs and every table; nothing links any user to
   any vote. The relay request carries no cookie or token, and no vote request
   appears in Supabase logs at all.
7. **RLS audit:** as a regular member, query every table with `supabase-js`;
   member names, other members' rows and hidden live tallies are not
   returned.
8. A member who joined after the poll opened cannot vote in it.

### M3 — Pilot + iRecordMo integration

- Two real groups (one student org, one HOA or class), at least 3 polls each.
- iRecordMo: anonymous dispute on a ledger entry (scope = `entry_id`) and
  paid-member pass (proof against a "paid this term" group) — research idea #21.

**Acceptance tests:**

1. At least 6 polls closed with indexer-verified tallies.
2. An iRecordMo entry shows "2 anonymous member disputes", each from a
   distinct member, with no identity visible to the treasurer.
3. Zero support cases caused by lost identities.

## Pilot success metrics

- Turnout ≥ 60% of members per poll.
- Members rate "I felt safe giving my honest answer" ≥ 4/5 (post-poll survey).
- At least one result that differs from what the group expected (a signal of
  honest answers — e.g., a low officer rating).
- At least one group runs a second round of polls without prompting.
- At least one outside developer tries the Kit (issue, fork or question).

## Validation before heavy build

Run alongside M0:

1. Interview 10 student-org members and 3 advisers/presidents: how evaluations
   and approvals are done now, whether people hold back, whether the adviser
   would trust and use a result like this.
2. Concierge test: run one officer evaluation with the current tools (Google
   Form with a shared code word) and ask afterward what people didn't say.

## Funding positioning

- **SCF #46 (closes 2026-11-08):** M0 done, M1 in progress. Pitch:
  - **Building block:** maintained Semaphore V4 on Soroban — contracts, SDK,
    prover, docs. Fills a public-good gap (the only prior port is pre-Protocol
    25 and dormant) and matches SDF's "configurable privacy" direction at the
    application layer, which current funded ZK work (institutional payments,
    confidential tokens) doesn't cover.
  - **First real users:** student-org polls, then anonymous disputes and
    paid-member passes in iRecordMo.
  - **Next:** uniqueness proofs to join (Campus Pass / PhilSys) to close the
    fake-member gap; reuse in Tamang Pila and one-human contest votes (#22).
  - Lead with the Kit and the dispute use case, not "another voting app"
    (voting is crowded on Stellar: ZK-VOTE, Booth, Stellot, Tansu, ZKonfess).
- **Instawards (30-day build):** M0 + M2 on testnet with one real org poll.

## Prior art to review before building

| Project | What to take | Status |
|---|---|---|
| ZencypherSolutions/semaphore-stellar-contracts + semaphore-stellar-sdk | Interface ideas; what broke | Pre-P25, dormant |
| ZK-VOTE/ZK-VOTE | On-chain Poseidon tree on P25; BN254 verifier code | Hackathon, custom circuit |
| Soroban-ZK-Std (georgegoldman) | BN254/Poseidon helpers | Small, check activity |
| stellar/rs-soroban-poseidon | Poseidon hashes (official) | Audited per Stellar docs audit page — confirm |
| Tansu anonymous voting | BLS12-381 Pedersen approach (different design) | Live |
| ZKonfess, opauque-stellar | Possible overlap (anonymous confessions / provable reputation) | Unreviewed — check before SCF pitch |

## Open questions

- [ ] Confirm every item in "Semaphore V4 in one page" against current source
      and the final ceremony artifacts (vks per depth).
- [ ] Verifier source: port ZK-VOTE/crisp BN254 or adapt official BLS12-381
      example? Audit status.
- [ ] Admin auth: per-group Ed25519 key (as in Tamang Pila) or passkey smart
      account with `require_auth`?
- [ ] Sealed tallies: accept UI-only hiding for MVP, or add commit-reveal of
      choices (costs a second relayed tx per voter)?
- [ ] Blind joins: can the client register its commitment through the relay
      with a one-time invite token so the server never pairs user ↔
      commitment?
- [ ] Default `min_members` (8?) and `root_ttl` (1 hour?).
- [ ] WebAuthn PRF support on pilot users' phones; fallback recovery kit UX.
- [ ] Free-text anonymous comments: moderation approach before enabling.
- [ ] Budget Android proving time at depth 10+ (orgs above ~1,000 members).
- [ ] Data Privacy Act review of member lists and the privacy notice wording.
- [ ] Supabase Auth native passkey support vs SimpleWebAuthn fallback.
- [ ] Supabase project region (Singapore is closest to PH users) and plan
      limits for Edge Function invocations from a 1-minute indexer.
- [ ] Indexer fallback when RPC event retention is exceeded.

## Notes for the implementer

- Do the Poseidon and keccak test vectors first. A mismatch silently breaks
  every proof.
- Never add circuits to the Kit; compatibility with official Semaphore V4 is
  the product.
- Keep the vote relay physically separate from Supabase — own subdomain, no
  Supabase client, no session, no shared logs. Call it with plain `fetch`.
- Admin actions are signed in the browser; `submit-admin-tx` only checks the
  caller is the admin, then submits. Never move admin signing keys server-side.
- Treat RLS as protection between users, not from the operator; keep the
  "never stored" list enforced in code review.
- Freeze the root at poll open; don't rely on root history for polls.
- Bump TTL for groups, trees and nullifier maps; an expired nullifier map
  allows double votes.
- Never show "you haven't voted" reminders.
- Check current versions of soroban-sdk, rs-soroban-poseidon, the Semaphore
  packages and any BN254 verifier at implementation time; the ecosystem moves
  quickly.
