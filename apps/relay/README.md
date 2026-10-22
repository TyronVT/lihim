# @lihim/relay

The vote relay. It takes an anonymous vote from the browser, checks it with a
free simulation, pays the fee and submits `LihimPolls.vote(poll_id, proof)`.
It is the one service that **must not know who is voting**, so it is small on
purpose: read `src/` top to bottom in a few minutes.

What it never has: a Supabase client, a database, a session, cookies, user
IDs, IP addresses or user agents in its logs. Its only secret is the vote
fee-payer key (`RELAY_FEE_SECRET`, "fee key #2" in the spec).

## API

`POST /vote` with `Content-Type: application/json`:

```json
{ "poll_id": "42", "proof": { "depth": 10, "root": "…", "nullifier": "…",
  "message": "1", "scope": "42", "points": ["…", "…", "…", "…", "…", "…", "…", "…"] } }
```

All big numbers are canonical base-10 strings (no leading zeros, no hex).
Unknown keys are rejected. `scope` must equal `poll_id`.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "status": "recorded", "tx_hash": "…" }` | Vote is in the public record |
| 409 | `{ "status": "already_answered" }` | This member already answered this poll |
| 400 | `{ "status": "invalid", "reason": "…" }` | Not accepted; nothing recorded |
| 429 | `{ "status": "not_sent", "reason": "busy" }` | Poll is getting too many invalid votes; retry after `Retry-After` |
| 502 | `{ "status": "not_sent" }` | Nothing recorded; safe to retry |

`reason` values: `malformed`, `identity_attached`, `scope_mismatch`, and the
contract-derived ones in `src/contract.ts`. `CONTRACT_ERRORS` there maps every
code in `contracts/INTERFACE.md` §8 (semaphore 100–116, polls 200–210,
verifier 300–305). The ones a vote can actually hit:

| Code | Contract error | Response |
|---|---|---|
| 208 | `AlreadyVoted` | 409 `already_answered` |
| 113 | `NullifierUsed` (same-ledger race) | 409 `already_answered` |
| 200 | `PollNotFound` | 400 `unknown_poll` |
| 204 | `PollClosed` | 400 `poll_closed` |
| 205 | `WrongRoot` | 400 `root_mismatch` |
| 206 | `WrongScope` | 400 `scope_mismatch` |
| 207 | `ChoiceOutOfRange` | 400 `choice_out_of_range` |
| 108 / 109 | `DepthNotSupported` / `DepthTooSmall` | 400 `bad_depth` / `depth_too_small` |
| 110 / 111 | `GroupHasNoMembers` / `RootNotInGroup` | 400 `empty_group` / `unknown_root` |
| 114 / 115 | `InvalidProof` / `MalformedProof` | 400 `bad_proof` / `malformed_proof` |
| 302–304 | verifier keys not loaded | 400 `verifier_not_ready` |

Any other contract code gets its own snake_case reason; a host trap with no
contract code (bad curve point, auth) or an unknown code gives `rejected`.

Nullifiers are namespaced by calling app (INTERFACE §6): `polls.vote`
spends them in the polls contract's namespace, so someone who copies a proof
off the wire and replays it straight into the semaphore cannot burn the real
vote. The `vote` transaction needs no auth entries.

Any request carrying `Cookie`, `Authorization`, `apikey` or `x-client-info`
is rejected with `identity_attached`. The last two are what `supabase-js`
adds: the app must call the relay with plain `fetch(url, { credentials:
"omit" })`, never through the Supabase client.

`GET /health` returns `{ "ok": true }`.

A 502 is only returned once the transaction can no longer land (the relay
keeps polling past the tx validity window). If a client retries after a 502
and the earlier attempt did land after all, it gets 409, which the UI shows
as "already answered".

## Flow

1. Strict body validation (`src/wire.ts`).
2. Per-poll invalid-vote limiter (`src/rate-limit.ts`). Counted by proof
   validity, never by caller.
3. Simulate `vote(poll_id: u64, proof: Proof)` (no fee). Contract errors
   map through `CONTRACT_ERRORS`. The `Proof` encoding is checked byte for
   byte against `contracts/test-vectors/scval.json` in the tests.
4. Optional random delay `0..RELAY_MAX_DELAY_MS`. The response waits for it,
   so the app only shows "Recorded" once it is.
5. Build with fresh sequence, re-simulate, sign, send, poll for the result.
   Submissions from the single fee account are serialized in-process.

## Develop

```sh
cp .env.example .env   # fill in RELAY_FEE_SECRET and POLLS_CONTRACT_ID
npm install
npm run dev            # node --watch src/server.ts on $PORT (8787)
npm test
npm run typecheck
npm run build          # dist/, run with npm start
```

Tests mock the network behind the `VoteChain` interface (`src/chain.ts`).

## Deploy: relay.lihim.app

The relay runs on **its own subdomain**, separate from the app and from
Supabase, so browsers never attach app cookies to it.

### Vercel

- New Vercel project with root directory `apps/relay`. `vercel.json` selects
  the Hono preset, which serves the default export of `src/index.ts`.
- Env vars: everything in `.env.example` except `PORT`. Set `APP_ORIGIN` to
  the exact app origin, e.g. `https://lihim.app`.
- Domain: add `relay.lihim.app` to this project only.
- Function max duration must cover `RELAY_MAX_DELAY_MS` plus up to ~45 s of
  confirmation polling. With a 60 s delay, set max duration to at least
  120 s in project settings.
- Do not set any cookie on `.lihim.app` (parent-domain cookies would be sent
  to the relay if a client ever used `credentials: "include"`).

### Cloud Run / any container host

`npm ci && npm run build && npm start` runs `dist/server.js` on `$PORT`.
Single instance plus in-process serialization avoids sequence-number clashes.

### Privacy audit (M2 acceptance test 6)

The relay's own output is limited to `{poll_id, nullifier, tx_hash, outcome}`
lines. The **hosting platform** is a separate matter:

- TODO(M2): Vercel's platform request logs and log drains can include client
  IP and user agent, outside this code's control. Verify what the current
  plan records. Before the pilot,
  either confirm the plan lets us disable/shorten them, or host on Cloud Run
  with an exclusion filter on the relay's request logs. Record the decision.
- Check no CDN/WAF in front of `relay.lihim.app` logs request details.

## Known gaps

- TODO(M2): one fee account means about one vote per ledger (~5 s). Add
  channel accounts if poll bursts queue up.
- TODO(M2): archived contract state (needs `RestoreFootprint`) is reported as
  502; the keeper job is expected to prevent it.
- The limiter is per instance and in memory; on serverless each instance
  counts separately. Good enough for spam; add the spec's proof-of-work token
  if real abuse shows up.
