# Handoff — scaffold status (2026-10-22)

Scaffold of the Lihim monorepo, paused mid-integration. Read `lihim-SPEC.md`,
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

## Status at pause

All typecheck, lint, build and test commands pass. Local M0 vectors (Poseidon, LeanIMT
root, keccak, real depth-4 and depth-10 Groth16 proofs) pass in `cargo test`.
Nothing is deployed to testnet.

## Remaining work

1. **Wire the web app to the SDK** (interrupted): finish `lib/prover.ts`, `lib/identity.ts`
   and `lib/proof.ts` behind `NEXT_PUBLIC_PROVER=sdk|mock`. Write `lib/data/supabase.ts`
   (needs the `@supabase/supabase-js` dep). `lib/data/index.ts` is hard-wired to
   `mockRepository` until then.
2. **Members "Remove"**: call the `deactivate_member` RPC (see D5).
3. **Web/SDK**: handle the `submit-admin-tx` 409 `stale_signature` response (re-read
   nonce or `next_group_id`, then re-sign).
4. **Privacy audit**: run it across the repo against the spec's "never stored" list and
   product rules.
5. **Testnet M0 steps**: run `contracts/scripts/deploy-testnet.sh`, then test a real proof
   through the relay. Fill in the contract ids in `packages/sdk/src/networks.ts`.
6. **Remaining `TODO(M0)`s**: `grep -rn "TODO(M0)" --exclude-dir=node_modules .`

## Decisions made during the scaffold (need owner confirmation)

- **D1**: HKDF infos use the off-chain `groups.id` (uuid): `lihim/sem/<uuid>` and
  `lihim/admin/<uuid>`. The admin signature digest still uses the on-chain u64 id.
- **D3**: To stop front-running, LihimSemaphore namespaces nullifiers by the calling
  contract (`caller.require_auth()`). This is a deliberate difference from upstream
  Semaphore V4.
- **D5**: Admin "Remove" deactivates a member off-chain only. On-chain leaf removal needs
  the member's commitment, which only the member knows. Product decision pending.
- **D6**: Push notification URLs are `/p/{poll_id}` and `/g/{group_id}`.
