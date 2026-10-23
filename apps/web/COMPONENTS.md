# apps/web — components, data layer, route map

Source of truth for look and copy: `../../lihim-DESIGN.md`. Product rules: `../../lihim-SPEC.md`.
Visual QA for everything below: **`/dev/components`** (`npm run dev`, then open it; toggle theme there).

## Rules for screen authors

- Import components from `@/components` (barrel), data from `@/lib/data`, strings from `@/lib/copy`.
- **No new packages** — everything needed is installed. No hex, no ink-ramp classes: only the semantic
  utilities below. Only the type scale below exists (`text-sm` etc. are gone on purpose).
- **Every user-facing string goes in `lib/copy.ts`**, following its header rules (no crypto words;
  "Anonymous to the group and the public"; never "you haven't voted"). L9 is the only screen that may use
  `copy.verify.*` ("public record", hashes, Stellar in the footnote).
- Screen shape: `<AppBar … />` → `<Screen withFooter header={<ShellHeader …/>}>` → content → `<PinnedFooter>`
  with at most one primary `<Button>`. Max one hero `<Illustration>` per screen (≥ 48 px). The desktop
  rules (AppBar/PinnedFooter vs ShellHeader, rails, shells) are in **"Desktop shell and UI/UX spec
  components"** at the end of this file — read it before touching a screen.
- Data is fetched **client-side** with `useQuery` (screens that read data are `"use client"`). Anything
  using `Date.now()` (closing times, "closing soon") must render client-side only — `useQuery` data
  arrives after hydration, so formatting it is safe; don't call `Date.now()` in a server component render.
- Next 16: page `params` is a Promise. Server page: `async function Page({ params }: { params: Promise<{ pollId: string }> }) { const { pollId } = await params; }`. Client page: `useParams<{ pollId: string }>()`.
- Status is never colour-only: pair `text-success|warning|danger` with an icon and words (`<Notice>`).

## Tokens (Tailwind utilities)

| Kind | Utilities |
|---|---|
| Colour | `bg-bg` `bg-surface` `bg-surface-raised` `border-border` `border-border-control` `text-text-1/2/3` `bg-primary-bg` `text-primary-fg` `*-accent` `*-success` `*-warning` `*-danger` `bg-bar-track` `bg-bar-fill` `bg-bar-fill-muted` `bg-overlay` |
| Type | `text-display` (28/34, 32/38 ≥ 768) `text-title` 22/28 `text-heading` 17/24 `text-body` 16/24 `text-label` 14/20 `text-caption` 13/18 `text-mono` 13/18 (+ `font-mono`) `text-overline` 11 (+ `uppercase`) · `tabular` for every count/percent |
| Radius | `rounded-sm` 8 (inputs, chips) · `rounded-md` 12 (buttons, option rows) · `rounded-lg` 16 (cards, sheets) · `rounded-full` |
| Spacing | 4 px base (`p-1`=4 … `p-14`=56) · `px-gutter` 16 · `p-card` 16 · `gap-card-gap` 12 · `gap-section` 32 |
| Width | `max-w-app` 480 · `max-w-form` 560 · `max-w-reading` 640 · `max-w-wide` 720 · `max-w-record` 960 · `w-sidebar` 264 · `w-rail` 320 |
| Elevation | `shadow-raised` (dark: lit top edge; light: soft shadow) |
| Motion | `duration-fast` 120 · `duration-base` 200 · `duration-slow` 320 · `ease-standard` · `animate-rise-in` `animate-fade-in` `animate-bar-fill` `animate-dialog-in/out` `animate-progress-indeterminate` (all reduced-motion safe, incl. variants) |
| Layout helpers | `pb-footer` (clear a PinnedFooter) · `pb-safe` |

Theme: dark default; light via `prefers-color-scheme` or the user override (`<ThemeSelect>`, stored per device).

## Components (`import { … } from "@/components"`)

| Component | File | Props (key) | Notes |
|---|---|---|---|
| `AppBar` | `components/app-bar.tsx` | `title?, backHref?, backLabel?, right?, wide?, keepOnDesktop?` | Sticky 56 px; title is the page `<h1>`; back = `arrowLeft` 24 px. **Hidden at ≥ lg inside a shell** |
| `AppBarAction` | `components/app-bar.tsx` | `label, icon: IconName \| Glyph, onClick? \| href?` | 48 px icon button for `right` |
| `Screen` | `components/screen.tsx` | `wide?, width?: "page" \| "form" \| "reading", withFooter?, header?, rail?, railPlacement?, railFrom?, railLabel?, …main attrs` | `<main id="main">` 480 → 560 (md) → 720/560/640 (lg); `wide` 720 → 960 (lg). See desktop section |
| `Section` | `components/screen.tsx` | `title?, action?, children` | Heading + 12 px stacked children |
| `Card` | `components/screen.tsx` | `tone?: "surface" \| "raised"` | r16, p16, border, `shadow-raised` |
| `PageHeader` | `components/page-header.tsx` | `title, description?, illustration?, illustrationSize?=64, illustrationAlt?, level?=2, display?` | In-content heading (+ hero) |
| `PinnedFooter` | `components/pinned-footer.tsx` | `children, wide?` | Fixed bottom, 16 px + safe-area; pair with `<Screen withFooter>`. **Hidden at ≥ lg inside a shell** |
| `Button` | `components/button.tsx` | `variant?: primary \| secondary \| destructive \| ghost, block?=true, asChild?, loading?, loadingLabel?, icon?: IconName \| Glyph` | h48 r12; `asChild` wraps `<Link>`; destructive always behind `ConfirmSheet`. `icon` = one 20 px leading decorative icon (also inside an `asChild` `<Link>`), dropped while `loadingLabel` shows. Use the prop, not a child `<Icon>` |
| `OptionGroup` | `components/option-group.tsx` | `options: PollOption[], value: number \| null, onSelect(v), phase?: "idle" \| "proving" \| "done", label? \| labelledBy?, disabled?` | Real radiogroup (P4): tap/Space/arrows/Home/End select; Enter on the selected row bubbles to the screen's "Send answer"; proving = lock + fade others 40 % + silver line |
| `OptionRow` | `components/option-group.tsx` | `label, description?, selected, locked?, faded?, proving?, done?, tabbable?, onSelect?` | Presentational row (inside a `role="radiogroup"`) |
| `RatingRow` | `components/option-group.tsx` | `value: number \| null, onSelect(n), phase?, label? \| labelledBy?, disabled?, minLabel?, maxLabel?` | Five 56 px squares, "3 out of 5", captions "Hindi maganda"/"Napakaganda"; static "Proving…" under reduced motion |
| `ProgressLine` | `components/option-group.tsx` | `className?` | The proving line (used inside rows) |
| `VoteStatus` | `components/vote-status.tsx` | `phase: "idle" \| "proving" \| "sending" \| "recorded", slow?` | aria-live (polite) words for L6: one proving string, "Proving you're a member…" (R13), plus the slow line; recorded = Poll illustration rise-in + check |
| `ResultBar` | `components/results.tsx` | `label, count, total, leading?` | Count + % as text, bar aria-hidden |
| `TurnoutMeter` | `components/results.tsx` | `answered, total` | "23 of 31 members answered" + thin bar |
| `VerifiedBadge` | `components/badges.tsx` | `pollId, status?, whileOpen?` | Links to `/verify/[pollId]`; 48 px link box (R9); with `status` renders only when closed (R15) |
| `StatusPill` | `components/badges.tsx` | `status: "draft" \| "didnt-open" \| "open" \| "closing-soon" \| "closed"` | Derive with `pollPillStatus(poll)`. "draft" reads **"Opening…"** (P6) |
| `CountBadge` | `components/badges.tsx` | `count, label` | Small `--text-1` count pill (open polls); `label` is the sr-only words |
| `AnonymityBanner` | `components/notices.tsx` | `children?` (default `copy.anonymity.banner`) | Use `copy.anonymity.bannerVote/bannerJoin/bannerCreatePoll` per screen |
| `SmallGroupWarning` | `components/notices.tsx` | `variant?: "inline" \| "blocking", memberCount?, minMembers?, action?` | inline when `isSmallGroup(frozenSize)`; blocking on L5 below `minMembers` |
| `Notice` | `components/notices.tsx` | `tone?: info \| success \| warning \| danger, title, children?, icon?: IconName \| Glyph, action?` | Icon + words status card (already answered, not sent, errors) |
| `MemberCountBlock` | `components/member-count-block.tsx` | `count, caption?` | Group illustration 64 + count in `display` |
| `HashChip` | `components/hash-chip.tsx` | `value, label, head?=6, tail?=4` | Mono, middle-out; tap text → full-value sheet; copy icon → clipboard + toast. 48 px box (R9) |
| `EmptyState` | `components/empty-state.tsx` | `illustration?, title, body?, action?` | 96 px hero; omit `illustration` (quiet card) when the screen already has its one hero (L3) |
| `OverflowMenu` | `components/overflow-menu.tsx` | `label?, items: {label, icon?: IconName \| Glyph, onSelect, destructive?}[], align?` | 48 px "…" trigger + 48 px items (Radix, non-modal); destructive items open a `ConfirmSheet` |
| `Illustration` | `components/illustration.tsx` | `name: "mark" \| "verified" \| "poll" \| "group", size?=96, alt?="", priority?, tile?=true` | 2×/3× WebP srcSet; ink-950 tile in light mode; `priority` only on L2/L6 success |
| `Wordmark` | `components/wordmark.tsx` | `size?=22` | "Lihim", Geist 600, −1.5 % |
| `Lockup` | `components/wordmark.tsx` | `markSize?=40, tagline?` | Mark (≥ 48) or Glyph + wordmark |
| `ListRow` | `components/list-row.tsx` | `title, meta?, status?, leading?, trailing?, href? \| onClick?` | Card row ≥ 56 px (groups, poll cards, roster). No avatars. `status` = pill in the meta row (R10); `trailing={null}` = no chevron |
| `Sheet` | `components/sheet.tsx` | `open?, onOpenChange?, trigger?, title, hideTitle?, description?, children?, footer?` | Radix Dialog: bottom sheet < 768, centred 480 dialog ≥ 768 (focus trap, Esc, focus returns) |
| `ConfirmSheet` | `components/sheet.tsx` | `title, body?, confirmLabel, onConfirm (async ok; throw to stay open), destructive?, trigger? \| open/onOpenChange, busyLabel?, confirmIcon?: IconName \| Glyph` | Remove member etc. |
| `TextField` / `TextArea` | `components/form.tsx` | `label, hint?, error?, counter?, …input attrs` | 16 px text; error wires aria-invalid/aria-describedby |
| `Field` | `components/form.tsx` | `id, label, hint?, error?, counter?, children` | Shell for custom controls |
| `Switch` | `components/form.tsx` | `checked, onCheckedChange, label, description?, disabled?` | Whole row (≥ 56 px) is a `<label>` hit target (R9). L5 hide results, L10 alerts |
| `SegmentedControl` | `components/form.tsx` | `value, onValueChange, options: {value,label}[], label, disabled?` | L5 poll type |
| `Stepper` | `components/form.tsx` | `value, onChange, min?, max?, step?, label, hint?, unit?` | L1 min size (`DEFAULT_MIN_MEMBERS`, `MIN_MIN_MEMBERS`) |
| `ThemeSelect` | `components/theme-select.tsx` | `className?` | System / Dark / Light |
| `Skeleton` / `SkeletonList` | `components/skeleton.tsx` | `className?` / `count?` | Static placeholders (no shimmer) |
| `Toaster` / `notify` | `components/toast.tsx` | `notify(msg)`, `notify.success(msg)`, `notify.error(msg)` | Already mounted in layout; 4 s, one at a time; bottom full-width (compact), bottom centre 400 (md), bottom right 400 (lg) |
| `Icon` / `Icons` | `components/icons.tsx` | `icon: IconName \| Glyph, size?=20, label?, strokeWidth?=1.75` | Lihim line icons (`design/ICONS.md`, 42 names; contact sheet `/dev/icons`). Decorative (`aria-hidden`) unless `label`. Sizes: 20 buttons/rows · 24 app bar (`APP_BAR_ICON_SIZE`) · 16 chips/inline links · 14 pills. Concepts: `anonymous` · `members` · `verified` · `poll` · `closing` · `warning` · `copy` · `verify` · `invite`. Actions: `passkey` `createAccount` `signOut` `settings` `alerts` `groups` `createGroup` `join` `send` `newPoll` `openPoll` `retry` `share` `linkOff` `removeMember` `leave` `results` `external`. UI: `arrowLeft/Right/Up/Down` `chevronRight/Down` `chevronsUpDown` `plus` `minus` `close` `check` `success` `alert` `info` `more`. **Never a lock.** |
| `createGlyph` / `Glyph` | `components/glyphs/glyph.tsx` | `createGlyph(name, svgChildren)` → `Glyph` (`size?`, SVG props) | Factory for a new icon: 24 viewBox, `currentColor`, stroke 1.75, round caps/joins, no fill. Add the glyph to a `glyphs/*.tsx` file, register its name in `Icons`, follow the drawing rules in `design/ICONS.md`, then check it on `/dev/icons`. `@/components` re-exports the `Glyph` / `GlyphProps` types only; import `createGlyph` from `@/components/glyphs` |

## Library (`lib/`)

| Module | Exports |
|---|---|
| `lib/data` | `repo: LihimRepository` (mock or `lib/data/supabase.ts`), all types (`Group`, `GroupSummary`, `Member`, `Invite`, `ActiveInvite`, `InvitePreview`, `Poll`, `PollOpenState`, `PollOption`, `PollResult`, `PollResultRow`, `AuditRow`, `PollAudit`, `GetMembersOptions`, `Create*Input`), errors (`ForbiddenError`, `NotFoundError`, `InviteError`, `SmallGroupError`, `PasskeyCancelledError`, `PasskeyNotFoundError`, `PasskeyUnsupportedError`, `PollClosingPassedError`) |
| `lib/data/hooks` | `useQuery(fn, deps)` → `{status, data, error, reload}` · `useMutation(fn)` → `{run, pending, error}` |
| `lib/vote` | `castVote(poll, choice, {onPhase, onSlow, signal})` (identity derived from `poll.groupId`, D1) → `recorded \| already_answered \| invalid \| not_sent \| prove_failed{notMember}`; `SLOW_PROVING_MS` |
| `lib/relay` | `submitVote(chainPollId, SerializedProof)` (plain fetch, `credentials: "omit"`, content-type only; 429 busy → `not_sent`; mock when `NEXT_PUBLIC_RELAY_URL` empty) |
| `lib/prover` | `proveVote(req, {mode})` — `mock` (~1.2 s, fake proof) or `sdk` (`createProver()`, Web Worker, main-thread fallback); `activeProverMode()` |
| `lib/identity` | `getPrfOutput()` (dev-only fixed PRF until passkeys), `groupIdentity(groupId)`, `groupAdminKey(groupId)`; lazy `loadSdk()` |
| `lib/answered` | `hasAnswered(pollId)`, `markAnswered(pollId)` — device-local, never stores the choice |
| `lib/poll` | `pollDisplayStatus`, `pollPillStatus`, `isSmallGroup`, `optionLabel`, `CLOSING_SOON_MS`, `SMALL_GROUP_WARNING_THRESHOLD` (15), `DEFAULT_MIN_MEMBERS` (8), `MIN_MIN_MEMBERS` (5), `MAX_POLL_OPTIONS` (8) |
| `lib/format` | `truncateMiddle`, `chunkHex`, `toHex32`, `formatCount`, `formatPercent`, `formatAverage`, `formatTime`, `formatDate`, `formatShortDate`, `formatWhen`, `formatClosing`, `formatRelative`, `formatAgo` (en-PH, Asia/Manila) |
| `lib/session` | `useSession()`, `signIn()`, `signUp(name)`, `signOut()`, `updateDisplayName(name)`, `refreshSession()`, `safeNextPath(next)`, `signInHref(next?)` — see desktop section |
| `lib/alerts` | `useAlertsState()`, `getAlertsState()`, `enableAlerts()`, `disableAlerts()`, `markAlertsAsked()`, `wasAlertsAsked()`, `shouldAskForAlerts()` (P2) |
| `lib/media` | `MEDIA.md/lg/xl`, `useMediaQuery(query)` (behaviour only; layout stays in CSS) |
| `lib/last-group` | `rememberLastGroup(id)`, `lastGroupId()`, `forgetLastGroup(id?)` (desktop `/groups`) |
| `lib/passkey` | Supabase passkey ceremony (`passkeySignIn`, `passkeySignUp`, `passkeysAvailable`) — screens use `lib/session`, not this |
| `lib/copy` | `copy.*` — every string |
| `lib/theme` | `useThemePreference`, `applyTheme` |
| `lib/env` | `env.*` public config |

`PollOption.value` is the Semaphore message: single 0-based index, yes/no 0 = Yes / 1 = No, rating 1–5.

## Mock data (`lib/data/mock.ts`)

Viewer "Ana Reyes". Group ids are fixed uuids (`MOCK_GROUP_IDS`, `5a1e0000-0000-4000-8000-00000000000N`),
because like `groups.id` they seed the identity HKDF (D1). Groups: `…0001` UP Sining (31, admin; polls
`poll_retreat` open single hidden tally, `poll_ga_rating` open rating live tally closing soon, `poll_finance`
closed yes/no, `poll_exhibit` closed single, `poll_draft` draft **failed** ("Didn't open"), `poll_opening` draft
**pending** ("Opening…", stays pending); 3 queued joins for L4's "Adding members"; 2 removed members; invite
`sining-2026` 12 of 50) · `…0002` Phase 2 HOA (54, member;
`poll_dues` open yes/no hidden) · `…0003` BS Psych 3-B (6 members, min 8, admin → blocked L5, no polls) ·
`…0004` choir (joinable). Invites: `sining-2026` (already member), `hoa-phase2` (already member),
`choir-fatima` (joinable, 18 members), `expired-demo` (invalid).

## Prover and data modes

| Env | Values | Notes |
|---|---|---|
| `NEXT_PUBLIC_PROVER` | `mock` (default) · `sdk` | `sdk` = real Semaphore proof via `@lihim/sdk/prover` in a Web Worker. Dev builds: `?prover=sdk` on `/p/<poll>` |
| `NEXT_PUBLIC_DATA` | `mock` (default) · `supabase` | `supabase` = `lib/data/supabase.ts` skeleton (needs `@supabase/supabase-js`) |

With `sdk` + mock data, `repo.getFrozenCommitments(pollId)` returns synthetic leaves plus the viewer's
real commitment derived from `lib/identity.ts`'s **dev-only, public** PRF bytes (passkeys aren't built), so
the browser generates a genuine proof; the dev console logs `[lihim/prover] proof generated (worker)` and
the mock relay logs the exact `/vote` body. The proof's root differs from the mock's decorative
`frozenRoot` (warned, not blocked, in mock mode). First proof downloads the depth-N circuit
(`snark-artifacts.pse.dev`) — TODO(M0): self-host the artifacts.

## Route map (screen agents implement these)

Files live under route groups (URLs unchanged): `app/(app)/…` = signed-in screens behind the auth gate in the
AppShell (`/groups`, `/groups/new`, `/g/**`, `/p/**`, `/privacy`, `/settings`); `app/(public)/…` = FocusedShell, never
gated (`/signin`, `/join/[token]`, `/verify/[pollId]`); `app/(marketing)/` = the `/` landing page, no shell,
never gated (`/welcome` redirects to it). Route constants: `LANDING` and `APP_HOME` in `lib/routes.ts`. `app/dev`, `not-found`, `layout.tsx`, icons and manifest
stay at `app/`.

| ID | Route | Notes |
|---|---|---|
| — | `/` | Landing page (`app/(marketing)`): hero, proof demo, stack. "Open app" → `/groups` |
| — | `/groups` | Home: lockup, group list, "Create group". ≥ lg: opens the last group (`groups/_home/desktop-home.tsx`) |
| L0 | `/signin` | **New** (`app/(public)/signin`, placeholder now). Sign in / create account, `?next=` |
| L10 | `/settings` | **New** (`app/(app)/settings`, placeholder now). Name, alerts, theme, privacy, sign out |
| L1 | `/groups/new` | Group hero, name / description / `Stepper` min size (8, ≥ 5) + why-hint; primary "Create group" |
| L2 | `/join/[token]` | `getInvitePreview` card → "Join with passkey" → Verified + `copy.join.joined` + link to `/privacy` |
| L3 | `/g/[groupId]` | `MemberCountBlock`, open polls (`ListRow` + `StatusPill` + `formatClosing`), past results; admin row: Members, New poll, Invite |
| L4 | `/g/[groupId]/members` | Admin only; `copy.members.rosterNote`; plain list, `OverflowMenu` → `ConfirmSheet` remove (off-chain deactivation only, D5) |
| L5 | `/g/[groupId]/polls/new` | `SegmentedControl` kind, question, options (≤ 8), closing time, `Switch` hide results; `SmallGroupWarning` blocking below min |
| L6 | `/p/[pollId]` | Question `display`, `AnonymityBanner`, `OptionGroup`/`RatingRow`, `castVote` + `VoteStatus`; already answered → `Notice tone="danger"` |
| L7 | `/p/[pollId]/results` | Headline, `ResultBar`s, `TurnoutMeter`, `VerifiedBadge`, `SmallGroupWarning` when small; hidden → `copy.results.hiddenUntil` + turnout |
| L8 | `/privacy` | Mark 96 (`alt="Lihim"`), who-sees-what table, small-group warning, limits; `ThemeSelect` can live here |
| L9 | `/verify/[pollId]` | Public, `<Screen wide>`; summary, recount, table # · `HashChip` · answer; `copy.verify.footer` + footnote |
| — | `/dev/components` | Visual QA (dev only, or `NEXT_PUBLIC_ENABLE_DEV_ROUTES=1`) |

## Desktop shell and UI/UX spec components

Source: `../../lihim-UIUX-SPEC.md` (§3 responsive system, §4 routes, §5 screens, §6 components). P1–P6 are
accepted as written. Breakpoints are Tailwind's: **compact** < 768 (today's mobile layout, source of truth for
content order) · **medium** `md` 768–1023 (same as compact, 560 column, sheets become dialogs) · **expanded**
`lg` ≥ 1024 (shells) · **wide** `xl` ≥ 1280 (right rail). Layout decisions stay in CSS (`md:`/`lg:`/`xl:`
classes); `useMediaQuery` is only for behaviour (what to fetch, where a toast goes).

### How the shells work

| Shell | Mounted by | ≥ lg | Below lg |
|---|---|---|---|
| `AppShell` | `app/(app)/layout.tsx` → `_shell/app-gate.tsx` when signed in | Fixed 264 px `Sidebar` (`<nav>`), page beside it; the window scrolls the page | Nothing extra |
| `FocusedShell` | `app/(public)/layout.tsx`; the gate for `/privacy` when signed out | `FocusedTopBar` (Lockup · "Who can see what" · "Sign in"/"Your groups") | Nothing extra |

Both put `data-shell` on their root and a "Skip to content" link (→ `#main`) first in tab order. Inside a
shell **at ≥ lg**, `AppBar`, `PinnedFooter` and `FooterLinks` hide themselves (`HIDE_IN_SHELL_LG`), and a
Screen's `header` band (`ShellHeader`) appears (`SHOW_IN_SHELL_LG`). Outside a shell (`/dev`, not-found)
nothing changes. Nothing is rendered twice in the accessibility tree: the hidden copy is `display: none`.

**Auth gate (P1).** `app/(app)/_shell/app-gate.tsx`: while the session loads, gated routes render nothing
(an sr-only "Loading…"); signed out → `router.replace("/signin?next=<path+query>")`; `/privacy` renders in
the FocusedShell when signed out and the AppShell when signed in. `(public)` routes are never gated.

### The pattern every screen follows

```tsx
const primary = (
  <Button icon="invite" onClick={invite} loading={busy} loadingLabel={copy.invite.making}>{copy.roster.inviteCta}</Button>
);
return (
  <>
    <AppBar title={copy.roster.title} backHref={`/g/${id}`} />            {/* compact/medium */}
    <Screen
      withFooter                                                         // drops its padding at ≥ lg
      header={
        <ShellHeader                                                     // ≥ lg only; holds the h1 there
          back={{ href: `/g/${id}`, label: group.name }}
          title={copy.roster.title}
          context={`${copy.members.count(n)} · ${copy.members.rosterNote}`}
          actions={primary}                                              // THE primary, same element
        />
      }
      rail={<GroupRail … />}                                             // optional: 320 px at ≥ xl
    >
      …content in compact order…
      <FooterLinks />                                                    // R14 row; hidden at ≥ lg in a shell
    </Screen>
    <PinnedFooter>{primary}</PinnedFooter>                               {/* compact/medium */}
  </>
);
```

- One primary per screen: build it once as a JSX value and render it in both `PinnedFooter` and `ShellHeader
  actions` (only one is ever displayed). Same handler, same state. A submit button can use `form="<form id>"`.
- **Until a screen passes `header`, it has no visible h1 and no primary at ≥ lg** (AppBar and PinnedFooter
  are hidden there). Every screen in a shell must pass `header`, or render its own visible h1 for ≥ lg.
- L6 is the exception the spec makes: "Send answer" sits under the options on desktop (not in the header);
  keep the PinnedFooter for compact and render an inline button with `hidden lg:flex` for expanded.
- Focused-shell screens (L0, L2, L9, L8 signed out) may also pass `header` (L9: question + intro line), or
  render an in-content h1 for ≥ lg (L0/L2 cards). L9 compact wants the top bar too (R8): render
  `<FocusedTopBar className="lg:hidden" />` instead of an `AppBar`.
- `/p/[pollId]/**` doesn't name its group: call `useCurrentGroup(poll?.groupId)` so the sidebar marks it (and
  desktop `/groups` can reopen it). `/g/[groupId]/**` is detected from the URL.
- After `createGroup`, `redeemInvite` or `leaveGroup`, call `useShell().refreshGroups()` so the sidebar
  list updates (and `forgetLastGroup(id)` after leaving).

### New components (`import { … } from "@/components"`)

| Component | File | Props | Notes |
|---|---|---|---|
| `AppShell` | `components/shell.tsx` | `children` | Mounted by the gate. Sidebar ≥ lg; context for `useShell` / `useCurrentGroup` |
| `Sidebar` | `components/shell.tsx` | — | Lockup → "/", "Your groups" (`CountBadge` of open polls, current group: 2 px `--accent` bar + `aria-current="page"` on its home, `"true"` on its child pages), "New group", then "Who can see what", "Settings", signed-in name. Fetches only at ≥ lg |
| `FocusedShell` | `components/shell.tsx` | `children` | `FocusedTopBar` at ≥ lg + content |
| `FocusedTopBar` | `components/shell.tsx` | `className?` | Sticky 64 px bar. "Sign in" → `/signin?next=<this page>`; "Your groups" when signed in; hidden on `/signin`; privacy link is icon-only below `sm` |
| `useShell()` | `components/shell.tsx` | — | `{ inAppShell, currentGroupId, refreshGroups() }` (no-ops outside a shell) |
| `useCurrentGroup(groupId)` | `components/shell.tsx` | `string \| null \| undefined` | Marks the sidebar's current group while mounted; remembers it as the last group |
| `ShellHeader` | `components/shell-header.tsx` | `title, context?, back?: { href, label }, actions?, titleId?` | Desktop page header: back link (parent's name), h1 (`title` 22/28), one context line, actions right (buttons render at natural width). Pass to `Screen header` |
| `DataTable<T>` | `components/data-table.tsx` | `columns: DataTableColumn<T>[], rows, rowKey, caption, captionVisible?, sort? + onSortChange? \| defaultSort?, maxHeight?, empty?, mono?` | Column = `{ key, header, cell(row,i), sortValue?, align?: "start"\|"end", width?, headerHidden?, className? }`. Sortable headers are buttons, `aria-sort` on the `<th>`; sticky header (to the viewport, or inside the panel with `maxHeight`); 56 px rows; `--surface-raised` row hover; rows are `group/row` |
| `StatusRow` | `components/status-row.tsx` | `state: "running" \| "done" \| "failed", title, body?, action?, trailing?` | running = indeterminate silver line (static under reduced motion), `role="status"`; done = success check; failed = `--danger` icon + title, `role="alert"`, `action` button(s); `trailing` for an `OverflowMenu` (Discard) |
| `FooterLinks` | `components/footer-links.tsx` | `settings?` | 48 px rows: eye-off "Who can see what" (+ "Settings"). Hidden ≥ lg in a shell |
| `CountBadge` | `components/badges.tsx` | `count, label` | See table above |
| `HIDE_IN_SHELL_LG` / `SHOW_IN_SHELL_LG` / `REVEAL_ON_ROW_HOVER` | `components/shell-classes.ts` | class strings | Last one: put on a row action (e.g. `OverflowMenu className`) inside a DataTable row — hidden until row hover/focus at ≥ lg on hover devices, always visible on touch / below lg |

### Changed components

- **`Screen`** — `width?: "page" | "form" | "reading"` caps the main column at ≥ lg (720 / 560 / 640); all
  screens are 480 compact and 560 medium; `wide` (L9) is 720, then 960 at ≥ lg. `header?: ReactNode` renders a
  full-width band (bottom border) above `<main>` at ≥ lg in a shell, aligned to the column. `rail?: ReactNode`
  is a 320 px `<aside aria-label={railLabel}>` beside the column at ≥ xl (sticky), and stacks
  `railPlacement="after"` (default) or `"before"` the content below xl (DOM order = compact order).
  Padding: 16 gutter → 32 at ≥ lg; `withFooter` clearance is dropped at ≥ lg in a shell.
- **`AppBar`** — hidden at ≥ lg in a shell (`keepOnDesktop` to opt out); inner width 560 at md.
- **`PinnedFooter`** — hidden at ≥ lg in a shell; 560 at md.
- **`Sheet` / `ConfirmSheet`** — centred 480 dialog at ≥ md (fade + 8 px rise), bottom sheet below. Every
  existing sheet gets it.
- **`Switch`** (R9) — the whole row is a `<label>` for the switch, min-height 56.
- **`VerifiedBadge`** (R9, R15) — 48 px link box; `status` + `whileOpen` hide it until the poll is closed:
  `<VerifiedBadge pollId={id} status={poll.status} whileOpen={<p className="text-caption text-text-2">{copy.results.verifyAfterClose}</p>} />`.
- **`HashChip`** (R9) — 48 px outer box; both buttons get a real 48 px target.
- **`ListRow`** (R10) — `status` puts a pill at the start of the meta row so the title gets the full width;
  `trailing={null}` removes the default chevron.
- **`StatusPill`** — `"draft"` now reads "Opening…"; new `"didnt-open"` ("Didn't open", danger + icon). Use
  `pollPillStatus(poll)`.
- **`Toaster`** — bottom right (400) at ≥ lg, bottom centre (400) at md, full width − 32 on compact.
- **`OptionGroup` / `OptionRow` / `RatingRow`** — tap/Space/arrows select (P4); Enter on the selected row
  bubbles to the screen's send. `OptionRow` has an optional `value`. L5's preview still uses `OptionGroup`
  read-only (`disabled`).
- **`VoteStatus`** — one proving string plus the slow line (R13), in a polite live region.
- **`ShellHeader`** — also `illustration?` (64 px, before the title: L8's Mark) and `titleClassName?` (L6 uses
  `text-display`). `context` renders in a `<div>`, so it can hold pills and blocks.
- **`Screen`** — `railFrom?: "lg" | "xl"` hides the rail below that breakpoint instead of stacking it (L1's
  "How groups work" at xl only; L5's live preview from lg).
- **`StatusRow`** — `failedTitle?: "danger" | "neutral"`: keep the title `--text-1` when it is a name and a
  pill in `body` says "Didn't open" (L3).
- **`TextField`** — `end?` decoration inside the input's right edge (L4's "/" key hint), aria-hidden.
- **`CountBadge`** — `words?` shows the label itself ("2 open polls", Home rows) instead of the number.

### Session (P1, P5) — `lib/session.ts`

```ts
const session = useSession(); // { status: "loading" | "signed-in" | "signed-out", user: CurrentUser | null }
await signIn();               // L0. Rejects PasskeyCancelledError | PasskeyNotFoundError | PasskeyUnsupportedError
await signUp(displayName);    // L0 new account / L2 signed-out join (name asked once)
await signOut();              // L10, then router.replace("/signin")
await updateDisplayName(name);// L10 "Your name" (also renames the user on every admin roster)
safeNextPath(searchParams.get("next")); // same-site path or APP_HOME (open-redirect guard)
signInHref(path);             // "/signin?next=…"
```

Always use these wrappers (not `repo.signIn` & co): they update the gate, sidebar and top bar together.
Error → copy: cancelled → `copy.signin.cancelled`, not found → `copy.signin.noPasskey`, unsupported →
`copy.signin.unsupported`, anything else → `copy.signin.failed`.

**Mock:** Ana is signed in by default. `signOut` persists `localStorage["lihim:mock:signed-out:v1"] = "1"`
(try/catch), so `/signin` and the gate can be exercised; `signIn`/`signUp` clear it after a ~0.9 s fake
prompt. `signUp(name)` keeps Ana's demo groups and renames her. Failure states on demand: add
`?mockFail=cancelled|no-passkey|unsupported` (sign in / sign up), `?mockFail=poll` (createPoll / retryPoll
leave a "Didn't open" draft and reject with `PollNotOpenedError`), `?mockFail=vote-network` / `vote-late` (L6:
relay unreachable / joined after it opened) or `?mockFail=mismatch` (L9 recount disagrees) to the page URL.
`getInvitePreview` reports `alreadyMember: false` while signed out.

**Supabase:** `lib/passkey.ts` runs the `auth-passkey` Edge Function ceremony with the PRF extension in the
same prompt (sign-up may need a second prompt on authenticators that only report `prf.enabled` at
creation), then `supabase.auth.setSession` and `setPrfOutput`. PRF results are never sent to the server.
TODO(passkey): after a full reload the session survives but `prf_out` (memory only) doesn't, so
`lib/identity.ts` still needs to re-prompt for the passkey in production.

### Alerts (P2) — `lib/alerts.ts`

`useAlertsState()` → `"unsupported" | "blocked" | "off" | "on"` · `await enableAlerts()` (asks for permission;
call from a click; resolves to the new state) · `disableAlerts()` · `shouldAskForAlerts()` (L2 success card:
true only once per device, when the browser can alert and they're off) · `markAlertsAsked()` (call on
"Turn on alerts" **and** "Not now") · `wasAlertsAsked()`. Storage is try/catch'd. TODO(push): the Web Push
subscription (`push_subscriptions`, sent by `supabase/functions/notify`) isn't wired yet; `enable()` only
asks for permission.

### Repository additions (`repo` from `@/lib/data`)

| Method | Notes |
|---|---|
| `signIn()`, `signUp(displayName)`, `signOut()`, `updateDisplayName(name)` → `CurrentUser` / `void` | Use via `lib/session.ts` |
| `getMembers(groupId, { includeRemoved: true })` | Active (admin first), then `status: "removed"` rows for L4's collapsed "Removed (n)" |
| `countPendingMembers(groupId): Promise<number>` | Admin. Joins waiting for `addPendingMembers` → "Adding 3 new members…" (mock: 3 in UP Sining; `addPendingMembers` then takes ~2.5 s and returns 3, then 0) |
| `leaveGroup(groupId): Promise<void>` | Member only (admin → `ForbiddenError`). Off-chain like `removeMember` (D5): the leaf stays, answers stay counted; rejoin needs a new invite |
| `getActiveInvite(groupId): Promise<ActiveInvite \| null>` | Admin. Newest working link: `{ id, groupId, token \| null, url \| null, maxUses \| null, uses, expiresAt }`. **`token`/`url` are null when the link was made on another device** (Supabase stores only a hash) → show `copy.invite.madeElsewhere` + "Turn off" / "Make a new link" |
| `revokeInvite(inviteId): Promise<void>` | Admin, "Turn off this link" (sets `expires_at = now()`) |
| `retryPoll(pollId): Promise<Poll>` | Admin, failed draft → re-signs and resends under the same id; returns the poll (`openState: "pending"` or open). `PollClosingPassedError` when its closing time passed (offer Discard) |
| `discardPoll(pollId): Promise<void>` | Admin, failed draft only (`ForbiddenError` while still opening) |
| `createPoll` (changed) | Now resolves with a **draft, `openState: "pending"`**; it turns `open` when the tx lands (mock: ~4 s). L3 should re-fetch while any draft is pending (e.g. every 5 s) |

Type changes: `Poll.openState: "pending" | "failed" | null` (drafts only, admins only); `PollResult.updatedAt`
(L7 "Updated …": `copy.results.updated(formatAgo(result.updatedAt))`, hide when null); `ActiveInvite`;
`GetMembersOptions`. Supabase side: migration `supabase/migrations/20261023000000_lifecycle.sql` adds
`poll_open_states`, `discard_draft_poll`, `leave_group`, `update_display_name` (tests in
`supabase/tests/db.test.mjs`).

### Copy namespaces added (`lib/copy.ts`)

`signin` (L0) · `settings` (L10) · `alerts` (L2 card) · `shell` (sidebar, top bar, skip link, footer row,
rail label) · `pollOpening` (P6 rows, retry/discard) · `leaveGroup` (P3) · `addingMembers` (R6) · additions to
`invite` (`joined(uses, max)`, `turnOff*`, `turnedOff`, `makeNew`, `madeElsewhere`, `none`), `roster`
(`removedSection(n)`, `activeCount(n)`, `colName/colJoined/colRole/colActions`, `roleMember`), `newPoll`
(`review*`, `previewTitle`, `openingToast`), `vote` (`send`, `sending`, `pickThenSend`, `backToGroup`,
`keyboardHint(max)`), `results` (`verifyAfterClose`, `verifyRailBody`, `updated(ago)`), `group`
(`adminContext`, `manageMembers`, `about`, `minSize(n)`), `join.whatIsLihim`, `verify` (`intro`,
`recounting`, `mismatchTitle/Shown/Recount`, `stillOpen(when)`, `notFound`, `unreachable`, `retry`),
`status.didntOpen`. Changed values: `status.draft` → "Opening…", `home.emptyBody` (spec text). Strings the spec didn't fix are marked
`// (draft copy)`.
