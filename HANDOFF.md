# Handoff — scaffold status (2026-10-22)

> **Newer:** UI/UX + desktop build on branch `uiux-desktop` — see `HANDOFF-UIUX.md`.

Scaffold of the Lihim monorepo; web ↔ SDK ↔ Supabase integration done, not yet on testnet. Read `lihim-SPEC.md`,
`lihim-DESIGN.md` and `contracts/INTERFACE.md` (canonical cross-package interface) first.

## Layout

| Path | What | Check |
|---|---|---|
| `contracts/` | Soroban: lihim-verifier, lihim-semaphore, lihim-polls, lihim-common | `cd contracts && cargo test && stellar contract build` |
| `packages/sdk` | `@lihim/sdk` + Web Worker prover | `npm test -w @lihim/sdk` |
| `apps/relay` | Vote relay (Hono), separate from Supabase | `npm test -w @lihim/relay` |
| `apps/web` | Next.js PWA, screens L1–L9 (mock data) | `npm run build -w @lihim/web` |
| `supabase/` | Migrations, RLS, Edge Functions (Deno) | `npm test -w @lihim/supabase-tests` |
| `design/` | Brand assets; regenerate with `npm run assets` | — |

npm workspaces: run `npm install` once at the root.

## Status

All typecheck, lint, build and test commands pass (`npm run build -w @lihim/sdk` first: the
web app typechecks against the SDK's `dist/`). Local M0 vectors (Poseidon, LeanIMT root,
keccak, real depth-4 and depth-10 Groth16 proofs) pass in `cargo test`. Nothing is deployed
to testnet.

Done since the first pause:

- **Web ↔ SDK**: `lib/prover.ts`, `lib/identity.ts`, `lib/proof.ts` behind `NEXT_PUBLIC_PROVER`.
  `lib/data/supabase.ts` implements the whole repository (`NEXT_PUBLIC_DATA=supabase`),
  including browser-signed `create_group` / `create_poll` / `add_members` via `submit-admin-tx`.
- **Members "Remove"** calls `deactivate_member` (D5). Opening L4 as admin also sends queued
  commitments on-chain (`repo.addPendingMembers`, shuffled, MAX_BATCH chunks). The admin's own
  commitment goes through the same queue (no publicly-known leaf 0).
- **409 `stale_signature`**: `submitAdminTx` in `@lihim/sdk` re-runs the caller's `build`
  (which re-reads the nonce / `next_group_id`) and resends, up to 3 attempts.
- **Frozen member set**: new member-only RPC `poll_frozen_commitments` (migration
  `20261022000300`). The vote screen prefetches it on open, so the authenticated request is not
  timed to the vote.
- **Privacy audit** run; results and what was fixed are below.

## Remaining work

1. **Testnet M0 steps**: run `contracts/scripts/deploy-testnet.sh`, then test a real proof
   through the relay. Fill in the contract ids in `packages/sdk/src/networks.ts` and the web
   `.env`. Needs the `stellar` CLI (not in the cloud session image).
2. **Passkey sign-in in the web app**: nothing calls `auth-passkey` or `setPrfOutput` yet, so
   outside dev builds `NEXT_PUBLIC_DATA=supabase` has no session and no PRF output.
3. **Privacy audit follow-ups** (not fixed):
   - Self-host the Semaphore wasm/zkey and pass `snarkArtifacts`. Today they are fetched from
     `snark-artifacts.pse.dev` just before each vote (third party sees IP + time + depth).
   - Relay hosting: confirm the platform keeps no request/IP logs (`apps/relay/README.md`).
   - `RELAY_MAX_DELAY_MS` defaults to 0; pick a non-zero production default.
   - `lib/answered.ts` is one list per device, not per account.
   - The dev mock PRF / prover / relay switch on by `NODE_ENV` and missing env; gate them on an
     explicit flag and fail a production build without `NEXT_PUBLIC_RELAY_URL`.
   - Should `poll_frozen_commitments` be callable by anon (fetched with no session)? The data is
     public on-chain, but it widens access, so it is members-only until the owner decides.
4. **Remaining `TODO(M0)`s**: `grep -rn "TODO(M0)" --exclude-dir=node_modules .`

## Decisions made during the scaffold (need owner confirmation)

- **D1**: HKDF infos use the off-chain `groups.id` (uuid): `lihim/sem/<uuid>` and
  `lihim/admin/<uuid>`. The admin signature digest still uses the on-chain u64 id.
- **D3**: To stop front-running, LihimSemaphore namespaces nullifiers by the calling
  contract (`caller.require_auth()`). This is a deliberate difference from upstream
  Semaphore V4.
- **D5**: Admin "Remove" deactivates a member off-chain only. On-chain leaf removal needs
  the member's commitment, which only the member knows. Product decision pending.
- **D6**: Push notification URLs are `/p/{poll_id}` and `/g/{group_id}`.
