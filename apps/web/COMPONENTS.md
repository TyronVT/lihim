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
- Screen shape: `<AppBar … />` → `<Screen withFooter>` → content → `<PinnedFooter>` with at most one
  primary `<Button>`. Max one hero `<Illustration>` per screen (≥ 48 px).
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
| Width | `max-w-app` 480 · `max-w-wide` 720 |
| Elevation | `shadow-raised` (dark: lit top edge; light: soft shadow) |
| Motion | `duration-fast` 120 · `duration-base` 200 · `duration-slow` 320 · `ease-standard` · `animate-rise-in` `animate-fade-in` `animate-bar-fill` (all reduced-motion safe) |
| Layout helpers | `pb-footer` (clear a PinnedFooter) · `pb-safe` |

Theme: dark default; light via `prefers-color-scheme` or the user override (`<ThemeSelect>`, stored per device).

## Components (`import { … } from "@/components"`)

| Component | File | Props (key) | Notes |
|---|---|---|---|
| `AppBar` | `components/app-bar.tsx` | `title?, backHref?, backLabel?, right?, wide?` | Sticky 56 px; title is the page `<h1>`; back = Lucide 24 px |
| `AppBarAction` | `components/app-bar.tsx` | `label, icon, onClick? \| href?` | 48 px icon button for `right` |
| `Screen` | `components/screen.tsx` | `wide?, withFooter?, …main attrs` | `<main>` 480 centred (720 when `wide`, L9), 16 gutter, 32 section gap |
| `Section` | `components/screen.tsx` | `title?, action?, children` | Heading + 12 px stacked children |
| `Card` | `components/screen.tsx` | `tone?: "surface" \| "raised"` | r16, p16, border, `shadow-raised` |
| `PageHeader` | `components/page-header.tsx` | `title, description?, illustration?, illustrationSize?=64, illustrationAlt?, level?=2, display?` | In-content heading (+ hero) |
| `PinnedFooter` | `components/pinned-footer.tsx` | `children, wide?` | Fixed bottom, 16 px + safe-area; pair with `<Screen withFooter>` |
| `Button` | `components/button.tsx` | `variant?: primary \| secondary \| destructive \| ghost, block?=true, asChild?, loading?, loadingLabel?` | h48 r12; `asChild` wraps `<Link>`; destructive always behind `ConfirmSheet` |
| `OptionGroup` | `components/option-group.tsx` | `options: PollOption[], value: number \| null, onSelect(v), phase?: "idle" \| "proving" \| "done", label? \| labelledBy?, disabled?` | Real radiogroup; tap/Space/Enter commits, arrows only move focus; proving = lock + fade others 40 % + silver line |
| `OptionRow` | `components/option-group.tsx` | `label, description?, selected, locked?, faded?, proving?, done?, tabbable?, onSelect?` | Presentational row (inside a `role="radiogroup"`) |
| `RatingRow` | `components/option-group.tsx` | `value: number \| null, onSelect(n), phase?, label? \| labelledBy?, disabled?, minLabel?, maxLabel?` | Five 56 px squares, "3 out of 5", captions "Hindi maganda"/"Napakaganda"; static "Proving…" under reduced motion |
| `ProgressLine` | `components/option-group.tsx` | `className?` | The proving line (used inside rows) |
| `VoteStatus` | `components/vote-status.tsx` | `phase: "idle" \| "proving" \| "sending" \| "recorded", slow?` | aria-live words for L6: "Pinapatunayang member ka…" over "Proving you're a member…"; recorded = Poll illustration rise-in + check |
| `ResultBar` | `components/results.tsx` | `label, count, total, leading?` | Count + % as text, bar aria-hidden |
| `TurnoutMeter` | `components/results.tsx` | `answered, total` | "23 of 31 members answered" + thin bar |
| `VerifiedBadge` | `components/badges.tsx` | `pollId` | Links to `/verify/[pollId]` |
| `StatusPill` | `components/badges.tsx` | `status: "draft" \| "open" \| "closing-soon" \| "closed"` | Derive with `pollDisplayStatus(poll)` |
| `AnonymityBanner` | `components/notices.tsx` | `children?` (default `copy.anonymity.banner`) | Use `copy.anonymity.bannerVote/bannerJoin/bannerCreatePoll` per screen |
| `SmallGroupWarning` | `components/notices.tsx` | `variant?: "inline" \| "blocking", memberCount?, minMembers?, action?` | inline when `isSmallGroup(frozenSize)`; blocking on L5 below `minMembers` |
| `Notice` | `components/notices.tsx` | `tone?: info \| success \| warning \| danger, title, children?, icon?, action?` | Icon + words status card (already answered, not sent, errors) |
| `MemberCountBlock` | `components/member-count-block.tsx` | `count, caption?` | Group illustration 64 + count in `display` |
| `HashChip` | `components/hash-chip.tsx` | `value, label, head?=6, tail?=4` | Mono, middle-out; tap text → full-value sheet; copy icon → clipboard + toast |
| `EmptyState` | `components/empty-state.tsx` | `illustration?, title, body?, action?` | 96 px hero; omit `illustration` (quiet card) when the screen already has its one hero (L3) |
| `OverflowMenu` | `components/overflow-menu.tsx` | `label?, items: {label, icon?, onSelect, destructive?}[], align?` | 48 px "…" trigger + 48 px items (Radix, non-modal); destructive items open a `ConfirmSheet` |
| `Illustration` | `components/illustration.tsx` | `name: "mark" \| "verified" \| "poll" \| "group", size?=96, alt?="", priority?, tile?=true` | 2×/3× WebP srcSet; ink-950 tile in light mode; `priority` only on L2/L6 success |
| `Wordmark` | `components/wordmark.tsx` | `size?=22` | "Lihim", Geist 600, −1.5 % |
| `Lockup` | `components/wordmark.tsx` | `markSize?=40, tagline?` | Mark (≥ 48) or Glyph + wordmark |
| `ListRow` | `components/list-row.tsx` | `title, meta?, leading?, trailing?, href? \| onClick?` | Card row ≥ 56 px (groups, poll cards, roster). No avatars |
| `Sheet` | `components/sheet.tsx` | `open?, onOpenChange?, trigger?, title, hideTitle?, description?, children?, footer?` | Radix Dialog bottom sheet |
| `ConfirmSheet` | `components/sheet.tsx` | `title, body?, confirmLabel, onConfirm (async ok; throw to stay open), destructive?, trigger? \| open/onOpenChange, busyLabel?` | Remove member etc. |
| `TextField` / `TextArea` | `components/form.tsx` | `label, hint?, error?, counter?, …input attrs` | 16 px text; error wires aria-invalid/aria-describedby |
| `Field` | `components/form.tsx` | `id, label, hint?, error?, counter?, children` | Shell for custom controls |
| `Switch` | `components/form.tsx` | `checked, onCheckedChange, label, description?, disabled?` | L5 "Hide results until closing" |
| `SegmentedControl` | `components/form.tsx` | `value, onValueChange, options: {value,label}[], label, disabled?` | L5 poll type |
| `Stepper` | `components/form.tsx` | `value, onChange, min?, max?, step?, label, hint?, unit?` | L1 min size (`DEFAULT_MIN_MEMBERS`, `MIN_MIN_MEMBERS`) |
| `ThemeSelect` | `components/theme-select.tsx` | `className?` | System / Dark / Light |
| `Skeleton` / `SkeletonList` | `components/skeleton.tsx` | `className?` / `count?` | Static placeholders (no shimmer) |
| `Toaster` / `notify` | `components/toast.tsx` | `notify(msg)`, `notify.success(msg)`, `notify.error(msg)` | Already mounted in layout; bottom, 4 s, one at a time |
| `Icon` / `Icons` | `components/icons.tsx` | `icon: IconName \| LucideIcon, size?=20, label?` | Concepts: `anonymous` eye-off · `members` users · `verified` shield-check · `poll` vote · `closing` clock · `warning` triangle-alert · `copy` · `verify` search-check · `invite` link. **Never a lock.** |

## Library (`lib/`)

| Module | Exports |
|---|---|
| `lib/data` | `repo: LihimRepository` (mock now; TODO `lib/data/supabase.ts`), all types (`Group`, `GroupSummary`, `Member`, `Invite`, `InvitePreview`, `Poll`, `PollOption`, `PollResult`, `PollResultRow`, `AuditRow`, `PollAudit`, `Create*Input`), errors (`ForbiddenError`, `NotFoundError`, `InviteError`, `SmallGroupError`) |
| `lib/data/hooks` | `useQuery(fn, deps)` → `{status, data, error, reload}` · `useMutation(fn)` → `{run, pending, error}` |
| `lib/vote` | `castVote(poll, choice, {onPhase, onSlow, signal})` (identity derived from `poll.groupId`, D1) → `recorded \| already_answered \| invalid \| not_sent \| prove_failed{notMember}`; `SLOW_PROVING_MS` |
| `lib/relay` | `submitVote(chainPollId, SerializedProof)` (plain fetch, `credentials: "omit"`, content-type only; 429 busy → `not_sent`; mock when `NEXT_PUBLIC_RELAY_URL` empty) |
| `lib/prover` | `proveVote(req, {mode})` — `mock` (~1.2 s, fake proof) or `sdk` (`createProver()`, Web Worker, main-thread fallback); `activeProverMode()` |
| `lib/identity` | `getPrfOutput()` (dev-only fixed PRF until passkeys), `groupIdentity(groupId)`, `groupAdminKey(groupId)`; lazy `loadSdk()` |
| `lib/answered` | `hasAnswered(pollId)`, `markAnswered(pollId)` — device-local, never stores the choice |
| `lib/poll` | `pollDisplayStatus`, `isSmallGroup`, `optionLabel`, `CLOSING_SOON_MS`, `SMALL_GROUP_WARNING_THRESHOLD` (15), `DEFAULT_MIN_MEMBERS` (8), `MIN_MIN_MEMBERS` (5), `MAX_POLL_OPTIONS` (8) |
| `lib/format` | `truncateMiddle`, `chunkHex`, `toHex32`, `formatCount`, `formatPercent`, `formatAverage`, `formatTime`, `formatDate`, `formatShortDate`, `formatWhen`, `formatClosing`, `formatRelative` (en-PH, Asia/Manila) |
| `lib/copy` | `copy.*` — every string |
| `lib/theme` | `useThemePreference`, `applyTheme` |
| `lib/env` | `env.*` public config |

`PollOption.value` is the Semaphore message: single 0-based index, yes/no 0 = Yes / 1 = No, rating 1–5.

## Mock data (`lib/data/mock.ts`)

Viewer "Ana Reyes". Group ids are fixed uuids (`MOCK_GROUP_IDS`, `5a1e0000-0000-4000-8000-00000000000N`),
because like `groups.id` they seed the identity HKDF (D1). Groups: `…0001` UP Sining (31, admin; polls
`poll_retreat` open single hidden tally, `poll_ga_rating` open rating live tally closing soon, `poll_finance`
closed yes/no, `poll_exhibit` closed single, `poll_draft` draft) · `…0002` Phase 2 HOA (54, member;
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

| ID | Route | Notes |
|---|---|---|
| — | `/` | Home (done): lockup, group switcher, "Create group" |
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
