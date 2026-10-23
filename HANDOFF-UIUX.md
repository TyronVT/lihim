# Handoff — UI/UX build (updated 2026-10-23)

Continues from `HANDOFF.md` (scaffold) and implements `lihim-UIUX-SPEC.md` (mobile review fixes +
desktop version). Use case diagram the spec is built on:
https://claude.ai/artifact/1uthtU2piLJq4vfbjzTYPe (private to the owner).

The UI/UX work is on `main` (commits `05515b0` foundation, `7816126` screens, `68eb023` icons). The
`uiux-desktop` branch named in older notes is no longer needed.

## Status

| Step | State |
|---|---|
| Use case diagram (UC01–UC17) | Done (artifact above) |
| `lihim-UIUX-SPEC.md` | Done. Product decisions P1–P6 treated as accepted by the owner ("build the new ui/ux") |
| Foundation: data layer, copy, route groups, desktop shells, shared components | Done (`05515b0`) |
| Screens L0–L10 | **Done** (`7816126`): L0 sign in, L10 settings, home, L8 privacy; L3 group home, invite sheet, leave group, L4 members table; L1/L5 create flows with review sheet and desktop live preview; L6 select-then-send and L7 results; L2 join and L9 verify |
| Integration | Done in the same commit: shared display-name rules, `PollNotOpenedError`, `getPollAudit` reads `cached_tally`, new mock failure triggers, shell component props |
| Line icons | **Done** (`68eb023`): 42 custom Lihim glyphs replace Lucide (`design/ICONS.md`, contact sheet at `/dev/icons`); `Button` has an `icon` prop; `lucide-react` removed |
| Landing page at `/` (app home moved to `/groups`) | **Done**: see "Landing page" below |
| Visual QA at every breakpoint (360/768/1024/1280/1440, dark + light) | **Not recorded** for the L0–L10 screens; do the pass in step 3 below. The landing page was checked at 375 and 1440 (dark) |

Checks on the current head (2026-10-23): `npx tsc --noEmit` and `npx eslint .` in `apps/web` pass,
`npm run build -w @lihim/web` passes, `npm test -w @lihim/supabase-tests` 27/27 pass.

The interim gaps listed in the earlier version of this file (no h1/primary action at ≥ 1024 px,
"Opening…" for failed drafts, L5 navigating to `/p/<id>`, placeholder `/signin` and `/settings`)
were closed by the screens commit.

## Landing page

`apps/web/app/(marketing)/` serves `/` (route group `(marketing)`, so no app shell and no auth gate):

- `page.tsx` (server): hero, comparison table, five steps, the Semaphore V4 section, tech stack,
  house rules, closing CTA, footer. Metadata uses the full tagline.
- `_components/hero.tsx`: the commitment field backdrop with a pointer "torch" (mouse only).
- `_components/proof-demo.tsx`: interactive depth-3 LeanIMT. Prove → path climbs to the root →
  public signals appear; answering twice is rejected by the nullifier; a new poll gives a new
  nullifier; "Your phone / The chain" toggles what each side can see.
- `_components/hex.ts`: deterministic stand-in hashes (not Poseidon; the page says so).
- `_components/reveal.tsx`: scroll reveal and the pointer-lit card edge.
- `landing.module.css`: display sizes and effects, kept out of the app's type scale on purpose.
  Graphite tokens only, no brand hue; everything degrades under reduced motion.

Routing (owner decision, 2026-10-23: "/ should be the landing page"):

- `/` is the landing page for everyone. The signed-in home moved to `/groups` (`app/(app)/groups/page.tsx`,
  `groups/_home/`); constants `LANDING` / `APP_HOME` in `lib/routes.ts`.
- `/welcome` redirects to `/` (`next.config.ts`).
- Sign out lands on `/`. The gate still sends signed-out visitors on app routes to `/signin` (with `?next=`
  for deep links), and sign-in without `?next=` goes to `/groups`.
- All "Your groups"/home links, the sidebar lockup and the not-found page point at `/groups`; the focused
  top bar's lockup goes to `/groups` when signed in, `/` when signed out.
- The PWA manifest now sets `start_url: "/groups"`, so the installed app skips the landing page.
- Checked on the production build at 375 and 1440 px: `/`, `/welcome` redirect, Open app, sign out,
  signed-out `/groups` and `/g/…`, sign in.

Open decisions for the owner:

- The page states the relay keeps no IP logs and that polls need 8+ members. Both match the spec,
  but the relay-hosting check (privacy follow-up in `HANDOFF.md`) is still open.
- The footer says Lihim is in development and not yet on testnet. Update it after M0.

## How to continue

1. `npm install` at the root, then `npm run build -w @lihim/sdk` (the web typecheck reads the SDK's `dist/`).
2. Read `lihim-UIUX-SPEC.md`, then the "Desktop shell and UI/UX spec components" section of
   `apps/web/COMPONENTS.md`, then the foundation handoff below.
3. Visual QA: run the web app on mock data (`npm run dev -w @lihim/web`) and check every screen at 360, 768,
   1024, 1280 and 1440, in dark and light. Mock failure triggers: `?mockFail=cancelled|no-passkey|unsupported`
   (sign in/up) and `?mockFail=poll` (poll fails to open). Mock is signed in as Ana; sign out persists in
   localStorage `lihim:mock:signed-out:v1`.
   Headless Chrome clamps the window to ~500 px wide, so phone screenshots need real device emulation
   (e.g. Playwright `viewport: {width: 360}`), not `--window-size`.
4. Then the backend items below and in `HANDOFF.md` (testnet M0 first).

## Open items carried over

- From `HANDOFF.md`: testnet deploy (M0), privacy audit follow-ups, decisions D1/D3/D5 still unconfirmed.
- `submit-admin-tx/index.ts`: foundation changed `upsertDraftPoll` to insert under the browser-picked id
  (fixes a 409 on first `createPoll`/`retryPoll`). Reviewed by hand only, no Deno check — verify.
- New migration `supabase/migrations/20261023000000_lifecycle.sql` (poll_open_states, discard_draft_poll,
  leave_group, update_display_name). Not applied to any live project.
- Supabase passkey sign-in/up implemented in `lib/passkey.ts` but never run live; `prf_out` is memory-only,
  so a full reload still needs a re-prompt (TODO(passkey)). PRF-unsupported recovery path still open (M0).
- Alerts: only notification permission is wired; Web Push subscription + `notify` hookup is TODO(push).
- Mock inconsistency: `removeMember` lowers the member count, `leaveGroup` doesn't (backend doesn't).

---

## Foundation handoff

*Verbatim from the foundation builder.*

FOUNDATION HANDOFF — Lihim desktop shell + UI/UX spec (branch uiux-desktop, nothing committed; git mv renames are staged).

Checks run and passing: `npm run build -w @lihim/sdk` (dist was stale before I started), `npx tsc --noEmit`, `npx eslint .`, `npm run build -w @lihim/web`, `npm test -w @lihim/supabase-tests` (27 pass, 5 new; runs offline in PGlite).
Verified with headless Chrome screenshots: compact screens at 360 px (using iframes) look the same as before. At 1024/1280/1440: the AppShell sidebar, the FocusedShell top bar, desktop "/" opening the last group, and the auth gate's redirect to /signin?next=… all work.
The full reference is the new section at the end of /Users/nyro/Projects/lihim/apps/web/COMPONENTS.md, "Desktop shell and UI/UX spec components". Read it first.

== ROUTES (URLs unchanged) ==
- app/(app)/…
  - What's here: /, groups/new, g/[groupId]/**, p/[pollId]/** (incl. results), privacy, settings (new, placeholder).
  - Layout: app/(app)/layout.tsx → app/(app)/_shell/app-gate.tsx (client gate).
    - Loading: gated routes render only an sr-only "Loading…".
    - Signed out: router.replace("/signin?next=<path+query>").
    - /privacy: FocusedShell when signed out, AppShell when signed in.
- app/(public)/…
  - What's here: signin (new, placeholder), join/[token], verify/[pollId].
  - Layout: FocusedShell; never gated.
- Unchanged at app/: app/dev, not-found, layout.tsx, icons, manifest.
- Desktop "/": app/(app)/_home/desktop-home.tsx.
  - At ≥ lg it replaces to the last-visited group (lib/last-group), else the first group.
  - With no groups it shows the EmptyState (group illustration, primary "Create group").
  - The compact home is wrapped in `lg:hidden`.
- Placeholders to replace:
  - app/(public)/signin/_components/sign-in-screen.tsx: button + error mapping, honours ?next=.
  - app/(app)/settings/_components/settings-screen.tsx: theme + sign out.

== THE PATTERN EVERY SCREEN MUST FOLLOW ==
```
const primary = <Button …>…</Button>;
<AppBar title=… backHref=… />                       // auto-hidden at ≥ lg inside a shell
<Screen withFooter width="page|form|reading" header={<ShellHeader title back={{href,label}} context actions={primary} />} rail={…} railPlacement="after|before">
  …content in compact order…
  <FooterLinks />                                    // auto-hidden at ≥ lg in a shell
</Screen>
<PinnedFooter>{primary}</PinnedFooter>              // auto-hidden at ≥ lg in a shell
```
- Until a screen passes `header`, it has NO visible h1 and NO primary action at ≥ lg.
  - All existing screens are in this state now, including L8 privacy.
- L6 exception: "Send answer" goes under the options on desktop. Use an inline button with `hidden lg:flex`; keep the PinnedFooter for compact.
- L9 compact top bar (R8): render `<FocusedTopBar className="lg:hidden" />` instead of AppBar.
- /p/** screens: call `useCurrentGroup(poll?.groupId)` so the sidebar marks the group (and it's remembered for desktop "/").
- After createGroup / redeemInvite / leaveGroup:
  - call `useShell().refreshGroups()`;
  - after leaving, also call `forgetLastGroup(id)` (lib/last-group).

== COMPONENTS (import from "@/components") ==
New:
- **AppShell** (components/shell.tsx)
  - Fixed 264 px Sidebar at ≥ lg; adds nothing below lg.
  - The window scrolls the page.
  - Sets data-shell and a "Skip to content" link.
- **Sidebar** (same file)
  - nav landmark: Lockup → "/" and "Your groups".
  - Each group shows a CountBadge with its open polls.
  - Current group: 2 px --accent bar. aria-current="page" on the group home, "true" on its child pages.
  - Then "New group", then "Who can see what" (eye-off), "Settings", and the signed-in name.
  - Only fetches at ≥ lg.
- **FocusedShell** (same file): FocusedTopBar at ≥ lg, plus a skip link.
- **FocusedTopBar({className?})** (same file)
  - Lockup, "Who can see what" (icon-only below sm), and "Sign in" (→ /signin?next=<page>) or "Your groups".
  - Hidden on /signin, and hidden while the session is loading.
- **useShell()** → `{inAppShell, currentGroupId, refreshGroups}`.
- **useCurrentGroup(groupId)**.
- **ShellHeader({title, context?, back?:{href,label}, actions?, titleId?, className?})** (components/shell-header.tsx)
  - h1 in the title style. Action buttons render at natural width.
  - Pass it to `Screen header`, which shows it only at ≥ lg inside a shell.
- **DataTable<T>({…})** (components/data-table.tsx)
  - Props: columns, rows, rowKey, caption, captionVisible?, sort? + onSortChange? OR defaultSort?, maxHeight?, empty?, mono?, className?
  - `DataTableColumn<T> = {key, header, cell(row,i), sortValue?(row): string|number, align?: "start"|"end", width?, headerHidden?, className?}`
  - Sortable headers are buttons, with aria-sort on the th.
  - Sticky header: to the viewport, or inside the panel when maxHeight is set (the panel scrolls and is focusable).
  - 56 px rows, --surface-raised hover, rows carry `group/row`.
  - Also exported: `SortState {key, direction: "ascending"|"descending"}`.
- **StatusRow({state: "running"|"done"|"failed", title, body?, action?, trailing?})** (components/status-row.tsx)
  - running: indeterminate silver line, role=status.
  - failed: danger icon + title, role=alert.
  - trailing: e.g. an OverflowMenu with "Discard".
- **FooterLinks({settings?})** (components/footer-links.tsx): 48 px eye-off "Who can see what" row, optional Settings row.
- **CountBadge({count, label})** (components/badges.tsx).
- Class helpers (components/shell-classes.ts): HIDE_IN_SHELL_LG, SHOW_IN_SHELL_LG, REVEAL_ON_ROW_HOVER.
  - REVEAL_ON_ROW_HOVER goes on an OverflowMenu `className` inside a DataTable row: hidden until row hover/focus at ≥ lg on hover devices.

Changed:
- **Screen**
  - Widths: 480 compact → 560 at md → at lg `width` page 720 (default) / form 560 / reading 640.
  - `wide`: 720, then 960 at ≥ lg.
  - `header`: full-width band at ≥ lg in a shell.
  - `rail`: 320 px `<aside aria-label={railLabel ?? "Details"}>` beside the column at ≥ xl (sticky). Below xl it stacks per railPlacement, in DOM order.
  - Gutter 16 → 32 at ≥ lg. withFooter padding is dropped at ≥ lg in a shell.
  - `<main id="main">` is kept.
- **AppBar**: hidden at ≥ lg in a shell (`keepOnDesktop` opts out); inner width 560 at md.
- **PinnedFooter**: hidden at ≥ lg in a shell; 560 at md.
- **Sheet / ConfirmSheet**: centred 480 dialog at ≥ md (dialog-in animation), bottom sheet below. Radix handles focus trap, Esc and return focus.
- **Switch (R9)**: the whole row is a `<label>`, min-height 56.
- **VerifiedBadge (R9/R15)**: 48 px link box. New props `status?: PollStatus` and `whileOpen?: ReactNode`; renders only when closed.
- **HashChip (R9)**: 48 px outer box.
- **ListRow (R10)**: new `status` prop puts a pill at the start of the meta row. `trailing={null}` means no chevron.
- **StatusPill**: "draft" now reads "Opening…"; new "didnt-open" ("Didn't open", danger + icon). Use `pollPillStatus(poll)` from lib/poll.
- **Toaster**: bottom-right at lg; bottom-centre at md and compact (400 px from 600 px up, full width − 32 below 600).
- **globals.css**
  - Tokens: max-w-form 560, max-w-reading 640, max-w-record 960, w-sidebar 264, w-rail 320.
  - Animations: animate-dialog-in/out, animate-progress-indeterminate.
  - Reduced motion now overrides the --animate-* variables, so it covers `md:`/`data-[]:` variants too. The old class-only rules didn't match those.
- NOT changed (the L6 builder owns them): OptionGroup, OptionRow, RatingRow, VoteStatus (P4, number keys, R13).
  - Keep `options/value/onSelect/phase/disabled/label` working: the L5 preview uses OptionGroup read-only.

== SESSION (lib/session.ts) ==
- `useSession()` → `{status: "loading"|"signed-in"|"signed-out", user}`.
- Wrappers (always use these, not `repo.*`, so the gate, sidebar and top bar update together):
  - `signIn()` and `signUp(displayName)` → CurrentUser
  - `signOut()` → void; then `router.replace("/signin")`
  - `updateDisplayName(name)` → CurrentUser
- Helpers: `refreshSession()`, `safeNextPath(next)` (open-redirect guard), `signInHref(next?)`.
- Errors (lib/data, errors.ts) → copy:
  - PasskeyCancelledError → copy.signin.cancelled
  - PasskeyNotFoundError → copy.signin.noPasskey
  - PasskeyUnsupportedError → copy.signin.unsupported
  - anything else → copy.signin.failed
- The join flow's passkey.ts now re-exports the shared PasskeyCancelledError/PasskeyUnsupportedError, so instanceof works across L0 and L2.

Mock session:
- Ana is signed in by default.
- signOut sets `localStorage["lihim:mock:signed-out:v1"]="1"` (try/catch), so it survives reloads.
- signIn/signUp clear it after a ~0.9 s fake prompt. signUp keeps Ana's groups and renames her.
- Failure triggers, added to the page URL:
  - `?mockFail=cancelled|no-passkey|unsupported` → sign in / sign up fail with the matching error.
  - `?mockFail=poll` → createPoll/retryPoll leave the poll as "Didn't open" and reject.

Supabase session (implemented, not throwing; untested against a live project):
- lib/passkey.ts runs the auth-passkey Edge Function ceremony (login/options→verify, register/options→verify).
- PRF is requested in the same prompt. Sign-up needs a second prompt if the authenticator only reports prf.enabled at creation.
- PRF results are stripped before anything is sent. Then supabase.auth.setSession + setPrfOutput.
- TODO(passkey): after a full reload prf_out is gone (memory only), so identity.getPrfOutput still needs to re-prompt in production.

== ALERTS (lib/alerts.ts, P2) ==
- `useAlertsState()` / `getAlertsState()` → "unsupported"|"blocked"|"off"|"on"
- `enableAlerts()`: must be called from a click; resolves to the new state.
- `disableAlerts()`
- `shouldAskForAlerts()`: for the L2 card; true at most once per device, and only when supported and off.
- `markAlertsAsked()`: call on BOTH "Turn on alerts" and "Not now".
- `wasAlertsAsked()`
- TODO(push): only notification permission is wired; the push_subscriptions / notify Edge Function hookup isn't.

== REPO (import { repo } from "@/lib/data") ==
- `signIn()`, `signUp(displayName)`, `signOut()`, `updateDisplayName(name)` — use them via lib/session.
- `getMembers(groupId, {includeRemoved?: boolean})`: active members (admin first), then status "removed".
- `countPendingMembers(groupId): Promise<number>` (admin).
  - Mock: 3 in UP Sining. addPendingMembers then takes ~2.5 s, returns 3, and returns 0 afterwards.
- `leaveGroup(groupId): Promise<void>`
  - Member only; ForbiddenError for the admin.
  - Off-chain, same limitation as D5: the leaf stays and answers stay counted. Rejoin needs a new invite.
- `getActiveInvite(groupId): Promise<ActiveInvite|null>` (admin)
  - `ActiveInvite = {id, groupId, token: string|null, url: string|null, maxUses: number|null, uses, expiresAt}`
- `revokeInvite(inviteId): Promise<void>` (admin): sets expires_at = now.
- `retryPoll(pollId): Promise<Poll>` (admin): same id, re-signed. Throws PollClosingPassedError if the closing time has passed.
- `discardPoll(pollId): Promise<void>` (admin): failed drafts only; ForbiddenError while still opening.
- `createPoll` CHANGED: resolves with a draft (`openState:"pending"`) that opens when the transaction lands (mock: ~4 s). L3 should re-fetch, e.g. every 5 s, while a pending draft exists.

Type changes:
- `Poll.openState: "pending"|"failed"|null` (drafts, admins only).
- `PollResult.updatedAt: string|null`. Use `copy.results.updated(formatAgo(updatedAt))`; formatAgo is new in lib/format.
- New: `GetMembersOptions`, `ActiveInvite`, `PollOpenState`.

Mock seed:
- UP Sining poll_draft = failed ("Officer evaluation: Treasurer").
- New poll_opening = pending, stays pending.
- 2 removed members; invite sining-2026 shows 12 of 50.

Supabase migration supabase/migrations/20261023000000_lifecycle.sql (RLS'd security-definer RPCs, admin/self checks):
- `poll_open_states(group_id)`: pending, or failed when the last create_poll tx failed, is missing, or has been in flight > 10 min.
- `discard_draft_poll(poll_id)`
- `leave_group(group_id)`: deletes the caller's own active row; the admin can't.
- `update_display_name(text)`: renames both profiles and group_members.

== COPY (lib/copy.ts) ==
New namespaces:
- `signin`: title, cta, waiting, createAccount, haveAccount, nameLabel, nameHint, nameRequired, continue, creating, cancelled, noPasskey, unsupported, failed, nextPoll, nextGroup, nextOther.
- `settings`: title, nameTitle, nameLabel, nameHint, nameSave, nameSaving, nameSaved, nameFailed, alertsTitle, alertsSwitch, alertsHelp, alertsBlocked, alertsUnsupported, displayTitle, privacyTitle, accountTitle, signedInAs(name), signOut, signingOut, signOutBody.
- `alerts`: askTitle, askBody, turnOn, notNow, turnedOn, blocked.
- `shell`: skipToContent, sidebarLabel, homeLink, yourGroups, newGroup, privacy, settings, signIn, groupsHome, signedInAs, openPollsBadge(n), groupsFailed, noGroups, footerLabel, railLabel.
- `pollOpening`: sectionTitle, opening, openingMeta, didntOpen, didntOpenMeta, retry, retrying, retryFailed, closingPassed, options(title), discard, discardTitle, discardBody, discardConfirm, discarding, discarded.
- `leaveGroup`: menuItem, title(group), body, confirm, leaving, left(group), failed.
- `addingMembers`: running(n), runningBody, done(n), failed(n), failedBody, retry.

Additions to existing namespaces:
- `invite`: joined(uses, max), turnOff, turnOffTitle, turnOffBody, turnOffConfirm, turningOff, turnedOff, turnOffFailed, makeNew, madeElsewhere, none.
- `roster`: removedSection(n), activeCount(n), colName, colJoined, colRole, colActions, roleMember, removedOn.
- `newPoll`: reviewTitle, reviewBody, reviewEdit, reviewWho(n), reviewHidden, reviewLive, previewTitle, openingToast.
- `vote`: send, pickThenSend, backToGroup, keyboardHint. tapToAnswer is deprecated.
- `results`: verifyAfterClose, verifyRailBody, updated(ago).
- `group`: adminContext, manageMembers, about, minSize(n).
- `join`: whatIsLihim.
- `verify`: intro, recounting, mismatchTitle, mismatchShown, mismatchRecount, stillOpen(when), notFound, unreachable, retry.
- `status`: didntOpen.

Changed values:
- status.draft → "Opening…"
- hub.drafts → "Opening" and hub.draftMeta → "Usually under a minute." (both deprecated)
- home.emptyBody → the spec text

Wording the spec didn't fix is marked `// (draft copy)`.

## Unfinished / deviations

- **Changed signature:** `getActiveInvite` returns `ActiveInvite`, where `token` and `url` can be null, instead of `Invite`. Supabase only stores a hash of the link, so the raw link can't be read back. The link is cached in localStorage on the device that created it; on any other device the invite sheet has to offer "Turn off" or "Make a new link".
- **Fix outside my brief, in `supabase/functions/submit-admin-tx/index.ts`:** `upsertDraftPoll` now inserts the poll under the browser-picked id when no draft exists. Before this, the web app's `createPoll` sent that id on its first attempt and would have been rejected with a 409, and `retryPoll` needs the same path. There is no Deno check for this file; it was reviewed by hand only.
- **Supabase passkey sign-in and sign-up are implemented, not stubbed, but never run against a live project:**
  - They depend on the existing auth-passkey Edge Function and its own TODO(M0) about session minting.
  - TODO(passkey): after a full reload the session survives but `prf_out` (memory only) is gone, so `lib/identity.ts` still has to re-prompt for the passkey in production.
  - The recovery-code fallback for browsers without PRF is still an open M0 question.
- **Alerts only ask for notification permission.** The Web Push subscription (`push_subscriptions` plus the notify Edge Function) is not wired; marked TODO(push).
- **Until each screen builder passes `Screen header`, existing screens have no h1 and no primary button at 1024 px and up.** This includes L8 privacy. On mobile they are unchanged.
- **Interim behaviour in existing screens until their builders update them:**
  - L3 shows the failed draft as "Opening…".
  - L5 still navigates to /p/<id> after creating a poll, which is now a pending draft. The spec wants L3 plus the opening toast.
- **Not touched, left to the L6 builder:** `OptionGroup`, `OptionRow`, `RatingRow` and `VoteStatus`. That covers P4 select-then-send, the number-key shortcuts and the R13 single proving string.
- **Placeholders:** `/signin` and `/settings` are minimal and meant to be replaced by the account builder.
- **Mock data behaviour:**
  - `createPoll` now returns a pending draft that opens after about 4 seconds.
  - `leaveGroup` leaves the member count unchanged, matching how the real backend behaves.
  - `removeMember` still lowers the count, which is older mock behaviour and inconsistent with that.
- **Small deviations from the spec:**
  - Sidebar rows are 44 px tall (desktop only, so the 48 px touch rule doesn't apply there).
  - `ShellHeader` puts the back link above the title rather than inline beside it.
  - The L7 rail line says "verify page" instead of "public record", because the copy rules keep "public record" for L9 only.
  - The medium 560 px column is applied to every Screen.
- **Leftover:** I deleted stale generated route types under `.next/dev/types`. They pointed at the old route paths and broke the typecheck.

checksPassed: True
