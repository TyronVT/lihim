# Handoff — deployment status (2026-10-24)

> The UI/UX + desktop build (screens L0–L10, line icons, landing page at `/`) is described in
> `HANDOFF-UIUX.md`. This file covers the backend, the testnet deployment and what is left.

Lihim runs end to end on Stellar testnet: passkey sign-up, groups, invites, on-chain members,
polls and anonymous votes through the relay, all tested in real browsers on 2026-10-24. Read
`lihim-SPEC.md`, `lihim-DESIGN.md` and `contracts/INTERFACE.md` (canonical cross-package
interface) first.

## Layout

| Path | What | Check |
|---|---|---|
| `contracts/` | Soroban: lihim-verifier, lihim-semaphore, lihim-polls, lihim-common | `cd contracts && cargo test && stellar contract build` |
| `packages/sdk` | `@lihim/sdk` + Web Worker prover | `npm test -w @lihim/sdk` |
| `apps/relay` | Vote relay (Hono), separate from Supabase | `npm test -w @lihim/relay` |
| `apps/web` | Next.js PWA, screens L0–L10 | `npm run build -w @lihim/web` |
| `supabase/` | Migrations, RLS, Edge Functions (Deno) | `npm test -w @lihim/supabase-tests` |
| `design/` | Brand assets; regenerate with `npm run assets` | — |

npm workspaces: run `npm install` once at the root. Build the SDK first
(`npm run build -w @lihim/sdk`): the web app typechecks against its `dist/`.

## Deployment (testnet)

### Contracts

| Contract | Id | Notes |
|---|---|---|
| LihimVerifier | `CCSRAKPYLQGMKGEFIF36WCKLIUDLCLOCCZ32RMSKKAL3P7FYR3PHS2DD` | 32 VKs loaded. **Not finalized** (`FINALIZE=no`): admin is the `lihim-deployer` key |
| LihimSemaphore | `CB6BG5NTMGK2MW33FGA2E4Q3DFU2LE5FPYV5HAJ425ZJX43OLUZRCWJW` | 14-day TTL bumps (see below) |
| LihimPolls | `CA2IH7CXYSVVYS6JI3D3XPTXS3F2HH7F64FZNFXSHYAT2T4QU4TR23D6` | **`MIN_MEMBERS=2`** for testing, `FIRST_POLL_ID=1` |

The ids are in `packages/sdk/src/networks.ts`. Indexer start ledger: `5355723`. Earlier
deployments from the same day (semaphore `CD6XG…UQ23`, polls `CALRV…F6D6` and `CCXPX…GZF5T`)
are superseded; nothing points at them.

### Services

| Piece | Where | Notes |
|---|---|---|
| Web | Vercel project `lihim`, **https://lihim.vercel.app** (canonical) | Root `apps/web`; build command in `apps/web/vercel.json` builds the SDK first. Vercel Authentication off |
| Relay | Vercel project `lihim-relay`, https://lihim-relay-tyronvts-projects.vercel.app | Root `apps/relay`, Hono preset. `APP_ORIGIN=https://lihim.vercel.app`. Vercel Authentication off |
| Supabase | project `cyixssswindlgaotuwbx` | 6 migrations applied, Vault secrets `lihim_project_url` + `lihim_cron_secret`, 5 Edge Functions deployed, indexer cron every minute |

Use only `lihim.vercel.app`: it is the WebAuthn RP id (`WEBAUTHN_RP_ID`) and the only origin
the relay and the Edge Functions allow (plus `http://localhost:3000` for Edge Function CORS).
Passkeys do not work on other origins, including `localhost` and the long
`lihim-tyronvts-projects.vercel.app` alias.

### Keys and secrets

Stellar keys are `stellar keys` identities on the owner's machine (`stellar keys show <name>`):

- `lihim-deployer`: deployed the contracts; verifier admin until `finalize`.
- `lihim-admin-fee`: fee key #1 (`ADMIN_FEE_SECRET`, Supabase function secret): admin txs + keeper.
- `lihim-relay-fee`: fee key #2 (`RELAY_FEE_SECRET`, Vercel `lihim-relay` env): votes.

Local env files (gitignored): `apps/relay/.env`, `apps/web/.env.local`, `supabase/functions/.env`.
Push function secrets with
`npx supabase@2 secrets set --env-file supabase/functions/.env --project-ref cyixssswindlgaotuwbx`.

The web's `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be the **publishable** key (`sb_publishable_…`).
On 2026-10-24 an `sb_secret_…` key sat there for about an hour; it shipped in the public bundle
and broke browser auth with a 401. That key was deleted in Supabase. After any change to a
`NEXT_PUBLIC_*` value, check the served JavaScript: only the supabase-js prefix check
`startsWith("sb_secret_")` may match `sb_secret_`. Edge Functions use the injected
`SUPABASE_SERVICE_ROLE_KEY`; nothing else needs a secret Supabase key.

### Deploy gotchas found on the way

- **Rent**: every write pays rent for its whole TTL extension up front. At 120 days,
  `create_group` simulated at ~478 XLM on testnet, above the per-transaction fee cap (testnet
  state is above its target size, so rent per KB is high). `BUMP_AMOUNT` is now 14 days and
  `BUMP_THRESHOLD` 7 days (`lihim-common`); the keeper defaults match
  (`KEEPER_EXTEND_TO_LEDGERS=241920`, `KEEPER_THRESHOLD_LEDGERS=120960`). `create_group` costs
  ~30 XLM on testnet now.
- **Vercel Hono preset** (relay): it type-checks `src/index.ts` itself (hence `typeRoots` in
  `apps/relay/tsconfig.json`), picks `app.*` before `index.*` (so no `src/app.ts`; the factory is
  `src/create-app.ts`), and requires the entry to import `hono`.
- **Vercel skips builds** when nothing under a project's root changed. After changing only env
  vars, redeploy by hand.
- **Migration versions**: migrations were applied through the Supabase MCP, which records the
  apply time (`20261024010441 init`, …), not the file names. Run `supabase migration repair`
  before any `supabase db push` from the CLI, or keep applying through the MCP.
- **Supabase Auth Site URL** is still the default `http://localhost:3000`. Passkey sign-in does
  not use it, but set it to `https://lihim.vercel.app`.

## Tested on testnet (2026-10-24)

- **Scripted** (fresh fee key, no browser): create group → add 3 members → create poll → real
  Semaphore proof → deployed relay → recorded. Double vote → 409 `already_answered`; outsider
  proof → 400 `root_mismatch`; proof for another poll → 400 `scope_mismatch`; tally `[1,1]`;
  the indexer mirrored all events.
- **Browser** (Android Chrome + Mac Chrome, passkeys in Google Password Manager): sign-up and
  sign-in, create group, invite and join, `add_members`, create poll, two anonymous votes through
  the relay, turnout 2 of 2.
- **PRF support**: works with Google Password Manager and iCloud Keychain. Brave (and Chromium's
  local "profile" passkey store) has no PRF, so sign-up stops with the "unsupported" notice.
- **Re-prompt after reload** (poll 3, 03:43 UTC): both accounts reloaded, voted, and got one
  passkey prompt each, limited to their own passkey; both votes recorded with no sign-in call.
- **Indexer on confirm** (poll 4, 03:45 UTC): `poll_created` was indexed ~3 s after the
  `create_poll` confirmation, between two cron runs, so the poll was answerable right away.
- **Passkey list**: one `passkey_credentials` request per page load (was two).
- Not yet checked on a phone: the back links and the Settings gear (`baabed2`).

## Done in this round

- Contracts deployed and wired into the SDK, relay, web and Edge Functions (see above).
- Passkey sign-in was already wired by the UI/UX work. New: **re-prompt after a reload**. The PRF
  output stays memory-only; when it is missing, `lib/identity.ts` calls an unlocker registered by
  `lib/data/supabase.ts` that runs one local passkey prompt limited to the signed-in user's own
  passkeys. Key-needing actions call `ensurePrfOutput()` first so the prompt follows the tap
  (Safari). A dismissed prompt on the vote screen returns quietly to picking.
  The viewer's credential ids are cached in memory when the session appears (one shared request,
  `c6c8a96`), so the prompt opens with no fetch in between.
- **Indexer on confirm**: migration `20261024000000_index_on_admin_tx` runs the indexer as soon as
  an admin tx is confirmed, so a new poll gets its `frozen_root` in seconds instead of up to a
  minute.
- **Navigation** (`baabed2`): back links that still pointed at `/` (the landing page since the
  home moved to `/groups`) now go to `APP_HOME`: Settings, Create group, the poll's error states,
  the join screen when signed in. Privacy keeps `/` because signed-out visitors reach it from the
  landing page. The group screen (L3) has a back arrow to "Your groups" on compact.
- **Settings from anywhere**: `AppBar` takes a `settings` flag that adds a gear link to
  `/settings` (and so Sign out); it is set on every signed-in screen except Settings. Desktop
  already had Settings in the sidebar.
- `.mcp.json` points Claude Code's Supabase MCP at the project.

## Remaining work

1. **Before any real use**
   - Raise the polls contract's `MIN_MEMBERS` (redeploy; it is a constructor arg). "Test Group 1"
     has `min_members = 2`, set directly in the database; the UI floor is
     `MIN_MIN_MEMBERS = 5` (`apps/web/lib/poll.ts`).
   - Measure mainnet rent and pick the production `BUMP_AMOUNT` (and keeper values to match).
   - Decide on `finalize` for the verifier.
2. **UX found in the browser test**
   - Error copy hides passkey problems: a missing or cancelled passkey on create group / create
     poll still shows the screens' generic error, and sign-in failures say "check your connection".
   - A vote screen opened before the poll's `frozen_root` exists says "not open yet" until
     reloaded. The indexer trigger shrank that window to a few seconds; the screen could still
     re-check by itself.
   - Members reach the chain only when the admin opens the Members screen; consider a reminder
     or sending on the group page.
   - The "unsupported browser" notice only names phone browsers; desktop Brave/Firefox users
     need a clearer pointer (desktop Safari or Chrome with Google Password Manager).
3. **M0 leftovers**: a tampered proof with a *valid* root on testnet (the scripted run only hit
   the root check), the exact RPC error strings, archival behaviour, and the remaining
   `TODO(M0)`s (`grep -rn "TODO(M0)" --exclude-dir=node_modules --exclude-dir=target .`). The
   Edge Functions were never `deno check`ed; they did run successfully in the tests.
4. **Privacy audit follow-ups** (not fixed):
   - Self-host the Semaphore wasm/zkey and pass `snarkArtifacts`. Today they are fetched from
     `snark-artifacts.pse.dev` just before each vote (third party sees IP + time + depth).
   - Relay hosting: Vercel's platform request logs can include client IP; confirm or move the
     relay before the pilot (`apps/relay/README.md`).
   - `RELAY_MAX_DELAY_MS` is 0 on the deployed relay; pick a non-zero production value.
   - `lib/answered.ts` is one list per device, not per account.
   - The dev mock PRF / prover / relay switch on by `NODE_ENV` and missing env; gate them on an
     explicit flag and fail a production build without `NEXT_PUBLIC_RELAY_URL`.
   - Should `poll_frozen_commitments` be callable by anon (fetched with no session)? The data is
     public on-chain, but it widens access, so it is members-only until the owner decides.

## Decisions made during the scaffold (need owner confirmation)

- **D1**: HKDF infos use the off-chain `groups.id` (uuid): `lihim/sem/<uuid>` and
  `lihim/admin/<uuid>`. The admin signature digest still uses the on-chain u64 id.
- **D3**: To stop front-running, LihimSemaphore namespaces nullifiers by the calling
  contract (`caller.require_auth()`). This is a deliberate difference from upstream
  Semaphore V4.
- **D5**: Admin "Remove" deactivates a member off-chain only. On-chain leaf removal needs
  the member's commitment, which only the member knows. Product decision pending.
- **D6**: Push notification URLs are `/p/{poll_id}` and `/g/{group_id}`.
