# Lihim — Supabase backend

Supabase holds everything that is **allowed to know who the user is**: accounts,
groups, member lists, poll text. It never sees a vote arrive. Votes go
browser → vote relay (`apps/relay`) → Stellar, and Supabase only reads tallies
back from public contract events.

The on-chain interface (function signatures, admin-signature digest, events,
error codes, storage keys) is `contracts/INTERFACE.md`; the code here follows it.

```
supabase/
  config.toml                         local CLI config (project_id "lihim")
  migrations/
    20261022000000_init.sql           enums, tables, RLS, RPCs, indexer RPCs, Realtime
    20261022000100_public_poll_audit.sql   L9 public view (closed polls only)
    20261022000200_schedules.sql      pg_net/pg_cron jobs, Vault-backed function calls, push trigger
  seed.sql                            demo group "UP Sining (demo)", 3 polls, synthetic events
  functions/
    deno.json                         nodeModulesDir "none" (ignore the npm workspace's node_modules), no lockfile
    _shared/                          deps (pinned npm: imports), http/cors, supabase, stellar, events, meta,
                                      admin_actions (arg checks), storage_keys (DataKey ledger keys),
                                      contract_errors (codes 100-116 / 200-210 / 300-305)
    auth-passkey/                     WebAuthn sign-up/sign-in → Supabase session
    submit-admin-tx/                  relays browser-signed admin actions, pays the fee
    indexer/                          getEvents → chain_events → derived tables (every minute)
    keeper/                           TTL extension + close() expired polls (daily)
    notify/                           Web Push to all members equally
  tests/                              PGlite harness: migrations + seed + RLS/privacy assertions
```

## Never stored (privacy checklist)

Review every migration and Edge Function change against this list. RLS protects
users from each other; **this list is what protects them from the operator**
(whoever holds the service-role key). The `tests/` harness enforces the
column-level part automatically.

- [ ] **Which user cast which vote.** No table has a vote/choice column next to a
      user column. Votes exist only as `chain_events` rows (`voted`: nullifier +
      choice), copied from the public record, with no user reference.
- [ ] **Nullifier ↔ user.** Nullifiers appear only in `chain_events.payload`.
- [ ] **Commitment ↔ user.** `group_members` has no commitment column.
      `pending_commitments` has no user column, no timestamp, and a random id;
      `submit_commitment()` writes nothing else in the same transaction (not even a
      "submitted" flag on the member's row, which would share a transaction id).
      Rows are deleted once the commitment appears on-chain.
- [ ] **`prf_out`, Semaphore identity secrets, admin Ed25519 private keys.**
      Never sent to any function. `groups.admin_pubkey` is the public key only.
- [ ] **No vote ever touches Supabase.** No Edge Function accepts a proof.
      `pending_txs.kind` is the `admin_action` enum, which has no vote value.
- [ ] **Push is never per-voter.** `notify` sends one identical payload to every
      active member; there is no "you haven't voted" path because the server
      cannot know, and must not look like it knows.
- [ ] Coarse join times: `group_members.joined_at` is day-truncated so it cannot be
      lined up minute-by-minute with the order leaves were added on-chain.

Known, accepted exposure (spec "Operator caveat"): the operator knows who is in
which group, and request logs see a member's JWT on the `submit_commitment` call.
Blind joins (submitting the commitment through the relay with a one-time token)
would remove that; see the spec's open questions.

## Flows

**Sign in** — `auth-passkey`: `register/options` → `navigator.credentials.create`
→ `register/verify` returns `{ session }`; `login/options` →
`navigator.credentials.get` (the browser adds the PRF extension,
`eval.first = sha256("lihim/v1")`, also returned as `prf_salt`) → `login/verify`.
The browser calls `supabase.auth.setSession(session)`. Accounts get a synthetic
`<uuid>@passkey.lihim.invalid` email that is never mailed; the function trades an
admin-generated magic-link token for a session server-side.

**Create group (L1)** — the browser picks `groups.id` (uuid) itself, because both
per-group keys are derived from it (D1): `HKDF(prf_out, "lihim/sem/" + groups.id)`
and `HKDF(prf_out, "lihim/admin/" + groups.id)`, with `groups.id` in the
lowercase hyphenated form Postgres prints (`submit-admin-tx` rejects any other
spelling for `create_group`). The on-chain u64 id does not exist yet: the browser
signs the digest for the predicted `semaphore.next_group_id()` with nonce 0 and
calls `submit-admin-tx` with `{ action: 'create_group', group_id, args_xdr,
group: { name, description, min_members, admin_pubkey } }`. If that id was taken
meanwhile, the signature no longer verifies and the function answers
`409 stale_signature`; the browser re-reads `next_group_id`, re-signs with the same
key and resends with the same `group_id`. On confirmation the group becomes
`active`, gets `chain_group_id` from the return value, and the admin is added to
`group_members`.

**Admin tx errors** — `submit-admin-tx` simulates before paying. A contract error
comes back as `400 invalid` with `error_code` (INTERFACE.md §8) and a reason like
`LeafExists (#103)`; 201 is `409 below_min_members`, 103/105 are `409 conflict`.
A signature that does not verify (stale nonce, taken group id) is
`409 stale_signature`: re-read `semaphore.nonce(gid)` / `polls.nonce(gid)` and
re-sign. Admin calls on one nonce counter must not overlap, so a second one for the
same group and counter while the first is pending is `409 busy`.

**Join (L2)** — `invite_preview(token)` (anon OK) → sign in →
`redeem_invite(token, display_name)` → the client derives its per-group identity
and calls `submit_commitment(group_id, commitment)` → the admin's client reads
`pending_commitments`, signs `add_members` (shuffle the batch) → `submit-admin-tx`
→ the indexer sees `members_added`, updates `member_count`/`chain_root` and deletes
the queued rows. A member checks their own inclusion client-side (`is_member`).

**Remove member (L4, D5)** — `deactivate_member(group_id, user_id)` (admin only).
Off-chain only: the row becomes `removed`, so the person loses access to the group
and its polls (RLS), gets no more push, cannot queue a commitment and cannot rejoin
with an invite. Deleting a `removed` row is "allow back in". Nothing is sent
on-chain: `remove_member` needs the member's commitment and Merkle path, and by
design only the member knows their commitment. Their leaf stays in the tree, so
`member_count` (the on-chain anonymity set) does not drop, and they could still
produce a valid proof for a later poll. A member-initiated leave or re-keying the
group into a fresh one is the later fix (INTERFACE.md §11); not built. Any
commitment they had queued but not yet added stays in `pending_commitments`
(it cannot be told apart from the others, deliberately).

**Create poll (L5)** — `submit-admin-tx` with `action: 'create_poll'` and
`poll: { title, kind, options, closes_at, hide_live_tally }`. It refuses below
`min_members`, checks the `kind` (`Single(n)` with n = number of options, `Rating`,
`YesNo`), `closes_at` and `meta_hash` arguments against the row, and inserts a
`draft` poll that becomes `open` on confirmation (which fires the "New poll in …"
push, opening `/p/{polls.id}`; groups are `/g/{groups.id}`, D6).
`meta_hash = sha256(JSON.stringify({ v: 1, kind, title, options }))` with exactly
that key order and `options: []` for rating polls (`functions/_shared/meta.ts`).

**Results (L7)** — `poll_results` (Realtime) is readable by members once
`status = 'closed' or not hide_live_tally`. Turnout (`polls.voters_count`) is
always visible to members. `option_index` is the vote message: 0-based choice for
single/yes-no (0 = Yes), the rating value 1–5 for rating polls.

**Indexer and votes (D3)** — nullifiers are namespaced by the calling app, so a
proof replayed straight into the semaphore only burns it in the replayer's
namespace. The indexer counts votes from LihimPolls' `voted` events only, and
drops `proof_validated` events whose `caller` is not `LIHIM_POLLS_ID`.

**Keeper** — once a day it extends, with `ExtendFootprintTTLOp`, every entry
INTERFACE.md §9 lists as "keep alive": the three contracts' instance and code, the
verifier's 32 `Vk`s, each active group's `Group`/`Tree`/`RootTtl`/`Nonce`, every
current `Leaf` (replayed from member events), the polls `Nonce(gid)`, and for each
poll of the last year `Poll`/`Tally`/`Voters`, the open poll's frozen `Root` record
and every `Nullifier(LIHIM_POLLS_ID, gid, n)` from its `voted` events. A key that
must exist but is not found raises a `ttl_key_missing` integrity alert. It also
calls `close(poll_id)` on expired polls (210 AlreadyClosed / 209 NotYetClosable
are expected and ignored).

**Verify (L9)** — `select * from public_poll_audit where poll_id = …` as anon:
frozen root, members at open, every `{nullifier, choice, ledger, tx_hash}`, the
recount, the cached tally and `tally_matches`.

## Why `public_poll_audit` is a definer-rights view

Readers are anonymous and have no RLS access to `polls`/`chain_events`, so a
`security_invoker` view would return nothing. The view runs with its owner's
rights, but the row filter (`status = 'closed'`) and the column list are part of
the definition, `security_barrier` stops client predicates from being evaluated
before that filter, and anon gets `SELECT` on the view only — never on the base
tables. A view (vs a definer RPC) stays filterable and cacheable through PostgREST.

## RLS summary

| Table | Read | Write |
|---|---|---|
| profiles | self | self (`display_name` only) |
| passkey_credentials | self | `auth-passkey` (service role) |
| groups | members (admin counts as member) | `submit-admin-tx` |
| group_members | admin: all rows; member: own row | insert via `redeem_invite()`; "Remove" via `deactivate_member()`; admin deletes `removed` rows only |
| invites | admin | admin |
| pending_commitments | admin | insert via `submit_commitment()`; delete by indexer |
| polls | members (drafts: admin only); closed polls via `public_poll_audit` | `submit-admin-tx`, indexer |
| poll_results | members, only when closed or not `hide_live_tally` (admin too) | indexer |
| chain_events, indexer_cursor, pending_txs, webauthn_challenges, integrity_alerts | none | service role |
| push_subscriptions | self | self |

Table grants are narrowed too (Supabase's defaults grant everything to anon and
authenticated), so a forgotten policy is not the only line of defence.

## Running locally

```sh
supabase start                         # applies migrations + seed.sql
cp supabase/functions/.env.example supabase/functions/.env   # fill in contract ids + keys
supabase functions serve --env-file supabase/functions/.env
```

Vault secrets for pg_cron → Edge Functions (once per database):

```sql
select vault.create_secret('http://host.docker.internal:54321', 'lihim_project_url');
select vault.create_secret('<same value as CRON_SECRET>', 'lihim_cron_secret');
```

Demo data: sign-in users are seeded directly in `auth.users`
(`00000000-0000-4000-8000-000000000001` is the admin), invite token
`demo-invite-token`. Seeded hashes/roots are fake and will raise a `root_mismatch`
alert if the indexer ever replays that group.

## Tests

No Supabase CLI or Deno install is required:

```sh
npm test -w @lihim/supabase-tests      # from the repo root: migrations + seed in PGlite, 21 RLS/privacy checks
cd supabase/functions && npx -y deno@2.9.6 check --no-lock */index.ts _shared/*.ts
cd supabase/functions && npx -y deno@2.9.6 test --no-lock --allow-env _shared/shared_test.ts
cd supabase/functions && npx -y deno@2.9.6 lint
```

`shared_test.ts` checks the ledger keys and `PollKind` decoding byte for byte
against `contracts/test-vectors/scval.json`.

The PGlite harness stubs `auth`, Vault, pg_net and pg_cron (`tests/stubs.sql`)
and strips the two `create extension` lines; everything else runs as written.

## Open items

- `TODO(M0)` native Supabase passkeys vs this SimpleWebAuthn flow; GoTrue accepting
  the `.invalid` email domain; `verifyOtp` with `magiclink` + `token_hash`.
- `TODO(M0)` `@stellar/stellar-sdk` build/simulate/submit from the Deno edge runtime
  (spec M0 test 7). Fallback: move `submit-admin-tx` into the relay's Node runtime
  as a separate authenticated route.
- `TODO(M0)` restoring archived entries (`RestoreFootprintOp`) in the keeper, and
  how `getLedgerEntries` reports an archived entry.
- `TODO(M0)` the exact `Error(Crypto, …)` / `Error(Auth, …)` strings on testnet
  (`_shared/contract_errors.ts`).
- `TODO(M0)` web-push under the edge runtime.
- `TODO(M2)` indexer backfill when RPC retention is exceeded (gap alerts are written
  to `integrity_alerts` meanwhile).
- On-chain member removal (D5): member-initiated leave or re-keying the group. Not
  built; "Remove" is off-chain only (see Flows).
