# Lihim — UI/UX Spec (mobile + desktop)

*Companion to `lihim-SPEC.md` (what Lihim does) and `lihim-DESIGN.md` (how it
looks). This file says how each screen behaves, which states it has, and how it
lays out on a phone and on a desktop. Tokens, type, colour, motion and copy rules
stay in `lihim-DESIGN.md`; this file does not repeat them.*

Built from the use case diagram (UC01–UC17, steps S1–S6, extensions X1–X5):
https://claude.ai/artifact/1uthtU2piLJq4vfbjzTYPe

Screen IDs L1–L9 match the build spec. New screens in this file: **L0 Sign in**
and **L10 Settings**.

Where this file and `lihim-DESIGN.md` disagree, this file wins for:
**Layout → Width** (no longer "480 px column on every screen size") and
**Layout → Navigation** (desktop gets a sidebar). Everything else in the design
spec still applies.

## Status of this document

| Part | Status |
|---|---|
| Review of the current UI | Done 2026-10-23 against `main` @ `59244f8`, mock data, 360 × 800 and 1440 × 900 |
| Responsive system, desktop shell | Proposed |
| Screen specs L0–L10 | Proposed |
| Product decisions P1–P6 | **Need owner sign-off** before build |

---

## 1. Product decisions this spec assumes

The use case diagram exposed gaps. The spec is written against the defaults
below. Each one changes screens, so confirm or change them first.

| # | Gap | Proposed default | Changes |
|---|---|---|---|
| P1 | No sign-in or sign-out (UC04) | Add **L0 Sign in**: one passkey prompt signs in and unlocks group identities. New users enter a display name once. Sign-out lives in Settings. | New L0, L10 |
| P2 | No alert opt-in (UC09, UC17) | Ask for push permission **once, right after a successful join** (not on first launch). Toggle in Settings. | L2 success state, L10 |
| P3 | Missing lifecycle actions | **In MVP:** revoke an invite link, leave a group, retry a poll that failed to open. **Deferred:** close a poll early (contract only allows `close` after `closes_at`), delete group, hand admin to someone else, edit group details. | L3, L4, invite sheet |
| P4 | Answering is one tap and permanent (open question in `lihim-DESIGN.md`) | **Tap selects, a pinned "Send answer" button commits.** One extra tap removes the permanent mis-tap. The "one tap" spirit stays: no confirm sheet. | L6 |
| P5 | Display name is never asked for, yet the admin roster (L4) shows names | Ask once on first sign-up (L0). Editable in Settings. Copy says who sees it. | L0, L10 |
| P6 | "Draft" polls are really polls whose create transaction hasn't confirmed | Drop the word "Draft". Show **Opening…** while pending and **Didn't open · Try again** on failure. No save-as-draft feature in MVP. | L3, L5 |

---

## 2. Review of the current UI

Screens reviewed: Home, L1–L9, invite error, small-group blocked L5, the L6
proving and recorded states. All screens fit 360 px with no horizontal scroll.
The visual language matches `lihim-DESIGN.md` closely; most findings are about
flow and missing states, not styling.

Severity: **High** = blocks a use case or risks a wrong, permanent action.
**Medium** = confusing or breaks a design-spec rule. **Low** = polish.

| # | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| R1 | High | Desktop, all screens | Every screen is the 480 px phone column floating in an empty 1440 px window. The pinned footer stretches across the whole viewport. No navigation besides "back". | §3 desktop shell |
| R2 | High | L6 (UC07) | A single tap on an option sends the answer, and answers can't be changed. A mis-tap, a scroll-tap on a phone or a stray click on a laptop is permanent. | P4: select, then "Send answer" |
| R3 | High | UC04 | No sign-in screen and no sign-out. A member on a new device has no way back to their groups. | P1, L0 |
| R4 | High | L4 (UC12) | The roster shows names, but no screen ever asks a member for one. | P5 |
| R5 | Medium | L3 Drafts | "Draft · Not open yet" rows are dead: not tappable, no retry, no explanation. They are actually polls whose create transaction is still pending or failed. | P6 |
| R6 | Medium | L4 (S6) | Opening L4 publishes queued members to the group with no visible feedback. If it fails, the admin never knows that new members can't answer. | L4 "Adding members" status row |
| R7 | Medium | L5 (UC13) | No review before "Open poll", and a poll can't be edited once open. | Mobile: review sheet. Desktop: live preview |
| R8 | Medium | L9 (UC01) | The public page has no Lihim name or one-line explanation. An adviser opening a shared link cold doesn't know what they're looking at. | L9 top bar + intro line |
| R9 | Medium | Touch targets | Below the 48 px rule: "Every vote verified" badge (36), hash chip and copy button on L9 (36), "Hide results" switch on L5 (28, only the switch itself is the target). | Make whole rows the target; min 48 |
| R10 | Medium | L3 poll cards | The status pill on the right squeezes the title and meta: at 360 px "Rate the GA last Friday" and "16 of 31 members answered" both wrap. | Pill moves into the meta row; title gets full width |
| R11 | Medium | L2 invalid invite (X1) | The only action is "Your groups", which is wrong for a signed-out visitor holding a dead link. | Action depends on session (L2 spec) |
| R12 | Medium | Settings | The theme picker sits at the bottom of the privacy explainer (L8). There's no home for alerts, name or sign-out. | L10 Settings |
| R13 | Low | L6 proving | The label shows the same message two times, in two languages, one above the other. Two lines of the same message in the calmest moment of the app. | One string |
| R14 | Low | Every screen | "Who can see what" is a small, icon-less text link floating at the bottom. It's the app's main trust promise. | Consistent footer row with `eye-off` icon; sidebar item on desktop |
| R15 | Low | L7 open + hidden | "Every vote verified" shows while the poll is open, and links to L9, which only covers closed polls. | Hide badge until closed; show "Check the count when it closes" |
| R16 | Low | Home | Doesn't say who is signed in. | Account row in L10 and desktop sidebar |

What works and must survive the desktop work: the calm proving → recorded
sequence on L6, the blocked small-group state on L5, the "Only you see this
list" note on L4, the turnout framing on L7, the hash chips on L9, and the
plain microcopy (English, ASD-STE100; see lihim-DESIGN.md → Voice and copy).

---

## 3. Responsive system

### Breakpoints

| Name | Width | Layout |
|---|---|---|
| **Compact** | < 768 px | Today's mobile layout. Source of truth for content order. |
| **Medium** | 768–1023 px | Same as compact, content column 560 px. Bottom sheets become centred dialogs. Pinned footer stays. |
| **Expanded** | ≥ 1024 px | Desktop shell: sidebar + page. Pinned footer is removed; its action moves into the page header. |
| **Wide** | ≥ 1280 px | Expanded + a right rail on screens that have one (L3, L5, L7, L9). Below 1280 the rail content stacks under the main column. |

Use Tailwind's `md` (768), `lg` (1024) and `xl` (1280). Design and test at 360,
768, 1024, 1280 and 1440.

### Two shells

**App shell** (signed in: Home, L3–L7, L10, and L1):

```
Expanded (≥1024)
┌────────────────┬──────────────────────────────────────────────────────────┐
│ ◐ Lihim        │  Art Guild                              [ New poll ]     │ ← page header
│                │  31 members · You're the admin                           │   (title, context,
│ YOUR GROUPS    ├──────────────────────────────────────────────────────────┤    one primary action)
│ ▌Art Guild   2 │                                                          │
│  Phase 2 HOA 1 │   main column                     │  right rail (≥1280)  │
│  BS Psych 3-B  │   max 720                         │  320                 │
│ + New group    │                                   │                      │
│                │                                   │                      │
│ ────────────── │                                                          │
│ ⊘ Who can see  │                                                          │
│   what         │                                                          │
│ ⚙ Settings     │                                                          │
│ Ana Reyes      │                                                          │
└────────────────┴──────────────────────────────────────────────────────────┘
  sidebar 264, fixed                  page scrolls independently
```

- Sidebar: wordmark lockup, group list (name + open-poll count badge,
  current group marked with a 2 px `--accent` bar), "New group", then at the
  bottom "Who can see what", "Settings" and the signed-in name.
- Sidebar replaces both the Home group list and the L3 group switcher on
  desktop. The `/groups` route on desktop opens the last-visited group (or the
  empty state if none).
- Page header: back link when the page is a child (L4, L5, L6, L7), title,
  one line of context, and **the** primary action that the pinned footer holds
  on mobile. Still one primary per screen.
- Max content width 720 in the main column; forms cap at 560.

**Focused shell** (public or pre-account: L0, L2, L8 when signed out, L9):

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ◐ Lihim                                            Who can see what  │ Sign in │
├────────────────────────────────────────────────────────────────────────────┤
│                         centred content, max 560 (L9: 960)                 │
└────────────────────────────────────────────────────────────────────────────┘
```

No sidebar, so nothing suggests the visitor is inside someone's account. When
signed in, "Sign in" becomes "Your groups".

### Component behaviour by breakpoint

| Component | Compact | Medium | Expanded |
|---|---|---|---|
| Pinned footer | Bottom, safe-area aware | Same | Removed; action moves to page header (right) |
| Sheet (invite, confirm, remove, review) | Bottom sheet | Centred dialog, 480 | Centred dialog, 480 |
| Overflow menu | Menu from `⋯` | Same | Same, plus row-hover reveals the `⋯` |
| Group switcher | Title dropdown on L3 | Same | Sidebar |
| Lists (L4 roster, L9 answers) | Rows | Rows | Table with column headers |
| Toast | Bottom, full width − 32 | Bottom centre, 400 | Bottom right, 400 |
| Hero illustration | 64–96 px | Same | 64 px max in page header area; never above the fold on L4/L5 |
| Display type | 28/34 | 32/38 | 32/38 |

### Desktop interaction rules

- Every row that navigates is a real link: middle-click and cmd-click open a
  new tab.
- Hover state on rows and options: `--surface-raised`, 120 ms. Never the only
  signal; focus ring stays.
- Keyboard: Tab order follows reading order; sidebar first. `Esc` closes
  dialogs. On L6, number keys `1`–`8` pick an option (or rating), `Enter` sends.
  On L4, `/` focuses the member search.
- No hover-only actions on touch devices; the `⋯` stays visible below 1024.
- Width of a line of body text ≤ 70 characters everywhere.

---

## 4. Navigation and routes

| Route | Screen | Shell (desktop) | Signed out? |
|---|---|---|---|
| `/` | Landing page (public; "Open app" → `/groups`) | None (own top bar) | Yes |
| `/groups` | Home (compact) / last group (expanded) | App | → L0 |
| `/signin` | **L0 Sign in** (new) | Focused | Yes |
| `/groups/new` | L1 Create group | App | → L0 |
| `/join/[token]` | L2 Join | Focused | Yes |
| `/g/[groupId]` | L3 Group home | App | → L0 |
| `/g/[groupId]/members` | L4 Members (admin) | App | → L0 |
| `/g/[groupId]/polls/new` | L5 Create poll (admin) | App | → L0 |
| `/p/[pollId]` | L6 Answer | App | → L0, then back |
| `/p/[pollId]/results` | L7 Results | App | → L0, then back |
| `/privacy` | L8 Who can see what | App if signed in, else Focused | Yes |
| `/verify/[pollId]` | L9 Verify (public) | Focused | Yes |
| `/settings` | **L10 Settings** (new) | App | → L0 |

"→ L0, then back": redirect to `/signin?next=<path>` and return after sign-in.
Push notification URLs (`/p/…`, `/g/…`, decision D6) go through the same rule.

---

## 5. Screen specs

Each screen lists: the use cases it serves, content order (compact), states,
and the desktop layout. Copy in quotes is final unless marked *(draft copy)*.

### L0 Sign in — new (UC04, S2)

Purpose: get a returning member back to their groups, or start a new account,
with one passkey prompt.

Content (compact):
1. Lockup (Mark 64 + wordmark), tagline.
2. Primary: **"Sign in with passkey"**. One WebAuthn prompt does login + PRF.
3. Secondary text button: "New here? Create an account". Same prompt in
   create mode, then step 4.
4. New account only: "Your name" field. Helper: "Only admins of groups you
   join see this. It's never attached to your answers." Primary: "Continue".
5. Footer row: "Who can see what".

States:

| State | Shows |
|---|---|
| Prompt cancelled | Inline, `--text-2`: "Sign-in cancelled. Try again when you're ready." Button stays. |
| No passkey on this device | "No Lihim passkey on this device. If you made one on another phone, use that phone's passkey sync, or create a new account." |
| PRF unsupported | Recovery-code path *(design pending; spec'd separately once the M0 phone test picks a fallback)*. Until then: "This browser can't keep your answers private yet. Try Chrome on Android or Safari on iPhone." |
| Arrived with `?next=` | One line above the button: "Sign in to open this poll." / "…this group." |

Desktop (focused shell): one centred card, 440 wide, same order. Left of the
card on ≥ 1280: nothing. Keep it sparse.

Acceptance: a member with a synced passkey on a new laptop reaches their
group list in one prompt; a new user is asked for a name exactly once.

### Home — "Your groups" (UC05)

Compact: as today, plus:
- Group rows: name; meta "31 members · 2 open polls"; role chip "Admin" moved
  to the trailing side. A group with open polls shows the count as a small
  `--text-1` badge so it reads at a glance.
- Empty state (no groups): Group illustration 96, "You are not in a group",
  body "Join with an invite link from your group admin, or start one.",
  primary "Create group".
- Footer row: "Who can see what" (R14) and "Settings".

Expanded: Home is replaced by the sidebar; `/groups` opens the last group. If the
user has no groups, the main area shows the empty state above.

### L1 Create group (UC10, S5, then UC11)

Content as today: name, description, minimum group size stepper, invite link
settings (expiry, max uses).

Changes:
- Keep today's "ready" state after "Create group" (invite link shown with
  copy/share). It's the right next step for UC11. Its primary goes to L3.
- Signing states (S5): button label becomes "Creating…" with the passkey
  prompt; on failure, inline error above the button with "Try again". Never
  leave the user on a spinner without words.

Expanded: page header "Create group" with the primary "Create group" button
on the right. Main column 560 holds the form. Right rail (≥ 1280) holds a
static "How groups work" card: who sees what, why the minimum size exists, what
an invite link does. On < 1280 that card collapses into the helper text that's
already under each field.

### L2 Join (UC03, S2, X1)

Content as today: invite preview card, "Join with passkey", success state
"You're in. Your answers in this group are anonymous."

Changes:
- Signed out: the passkey button also creates the account (L0 step 4 inline:
  name field appears above the button for new users).
- Success state adds the alerts ask (P2), as a card under the confirmation:
  "Get a heads-up when a poll opens or is about to close?" Buttons
  "Turn on alerts" / "Not now". Shown once per device, never again after
  "Not now" (Settings still has it).
- Invite no longer valid (X1, R11): signed in → secondary "Your groups";
  signed out → secondary "What is Lihim?" to L8. No primary button.
- Already a member: card "You're already in this group." + primary "Open
  group".

Expanded: focused shell, card 480 centred. Success state keeps the same card.

### L3 Group home (UC06, entry to UC07, UC08, UC11–UC13)

Content order (compact):
1. App bar: group switcher (title dropdown).
2. Member count block. For admins only, the note "Only you see names.
   Members see the count only."
3. Description.
4. Admin actions row: Members · New poll · Invite link.
5. **Open polls**: cards.
6. **Opening** (admin only, P6): polls whose create tx is pending or failed.
7. **Past results**: cards.
8. Footer row: "Who can see what".
9. Overflow `⋯` in the app bar: "Leave group" (members, P3) — confirm sheet.

Poll card (R10): title on its own line(s), full width. Meta row: status pill ·
closing time · "16 of 31 answered". Whole card is the link: open poll → L6
(or L7 if already answered on this device), closed → L7.

Opening row (P6):
- Pending: "Opening…" with indeterminate line, meta "Usually under a minute."
- Failed: "Didn't open" in `--danger` + icon, action "Try again" (re-signs and
  resends with the same id), and `⋯` → "Discard".

Leave group (P3) confirm sheet: title "Leave Art Guild?", body "You'll stop
getting its polls. Answers you already gave stay counted and stay anonymous.
To rejoin you'll need a new invite link." Destructive button "Leave group".
*(Same on-chain limitation as D5: the leaf stays; copy must not promise more.)*

Expanded:

```
┌ page header ─────────────────────────────────────────────────────────────┐
│ Art Guild                                  [Invite link] [ New poll ]    │
│ 31 members · You're the admin                                            │
├──────────────────────────────────────────────┬───────────────────────────┤
│ Open polls                                   │ ◎  31 members             │
│ ┌──────────────────────────────────────────┐ │ Only you see names.       │
│ │ Rate the GA last Friday                  │ │ [ Manage members ]        │
│ │ ◷ Closing soon · Today 10:00 AM · 16/31  │ │                           │
│ └──────────────────────────────────────────┘ │ About                     │
│ ┌──────────────────────────────────────────┐ │ The visual artists of UP  │
│ │ Where do we go for the retreat?          │ │ Diliman. We decide here…  │
│ │ ● Open · Sun 11:00 AM · 20/31            │ │                           │
│ └──────────────────────────────────────────┘ │ Minimum size 8            │
│ Past results                                 │ ⊘ Who can see what        │
│  …                                           │ ⋯ Leave group             │
└──────────────────────────────────────────────┴───────────────────────────┘
```

Primary action "New poll" (admin) sits in the header; members get no primary.
Below 1280 the rail stacks above "Open polls" as a compact strip.

### L4 Members — admin only (UC12, S6, X4)

Content order (compact):
1. Member count block + "Only you see this list. Members see the count only."
2. **Adding members status** (R6, S6), only when there is a queue:
   - Running: "Adding 3 new members… They can answer polls you open after
     this." with indeterminate line.
   - Done: toast "3 members added".
   - Failed: `--danger` row "Couldn't add 3 new members. They can't answer
     new polls yet." Action "Try again".
3. Search ("Find a member").
4. Roster rows: name, "Joined Jun 26, 2026", "· Admin" on own row, `⋯` →
   "Remove from group" (X4).
5. Pinned footer: "Invite members".

Remove (X4) confirm sheet *(copy depends on D5)*: "Remove Ella Dela Cruz?"
body "They won't get new polls from this group. A poll that's already open can
still take their answer if they joined before it opened." Destructive
"Remove". Removed members move to a collapsed "Removed (2)" section at the
bottom instead of disappearing.

Invite sheet (UC11) additions (P3): shows the active link with uses
("12 of 50 joined") and expiry, "Copy link", "Share…", and a text button
"Turn off this link" → confirm → "Link turned off. Anyone who has it can't
join." then "Make a new link".

Expanded: table.

```
┌ page header ──────────────────────────────────────────────────────────────┐
│ ← Art Guild    Members                              [ Invite members ]    │
│ 31 members · Only you see this list. Members see the count only.          │
├───────────────────────────────────────────────────────────────────────────┤
│ [/ Find a member            ]                                  31 active   │
│ ┌──────────────────────────┬──────────────────┬────────────┬────────────┐ │
│ │ Name                     │ Joined           │ Role       │            │ │
│ ├──────────────────────────┼──────────────────┼────────────┼────────────┤ │
│ │ Ana Reyes                │ Jun 25, 2026     │ Admin      │            │ │
│ │ Ella Dela Cruz           │ Jun 26, 2026     │ Member     │ ⋯          │ │
│ │ …                        │                  │            │            │ │
│ └──────────────────────────┴──────────────────┴────────────┴────────────┘ │
│ ▸ Removed (2)                                                             │
└───────────────────────────────────────────────────────────────────────────┘
```

Table sorts by name or join date (header click, `aria-sort`). No avatars, no
initials (design rule). Remove opens the dialog version of the confirm sheet.

### L5 Create poll — admin only (UC13, S5, X5)

Content as today: poll type, question, options (2–8), closing time (1 day /
3 days / 1 week / custom), "Hide results until closing" (on by default), note
"Only the 31 current members can answer. People who join after it opens
can't."

Changes:
- R9: the whole "Hide results until closing" row toggles the switch; row
  min-height 56.
- R7 review step (compact/medium): "Open poll" opens a review sheet showing
  the question, options in order, closing time, who can answer (31), and the
  hide setting. Heading "Check before opening". Body "You can't edit a poll
  once it's open." Primary "Open poll", secondary "Edit".
- Blocked below minimum size (X5): unchanged (it's good). Keep the "Invite
  link" action inside the warning.
- After opening: go to L3 with an "Opening…" row (P6) and toast "Poll is
  opening. Members get an alert once it's live." (alerts only if P2 ships).

Expanded: two columns, no review sheet (the preview does that job).

```
┌ page header ──────────────────────────────────────────────────────────────┐
│ ← Art Guild    New poll                                   [ Open poll ]   │
├────────────────────────────────────────┬──────────────────────────────────┤
│ Poll type  [Single choice|Yes–No|1–5]  │ WHAT MEMBERS WILL SEE            │
│ Question                               │ ┌──────────────────────────────┐ │
│ [ Where do we go for the retreat?   ]  │ │ ● Open · Closes Mon 6:00 AM  │ │
│ Options                                │ │ Where do we go for the ret…  │ │
│ [ Tagaytay ]  [ Baguio ]  + Add option │ │ ⊘ Anonymous to the group…    │ │
│ Closing time  [1 day|3 days|1 week|…]  │ │ ○ Tagaytay                   │ │
│ ◷ Closes Mon, 6:00 AM                  │ │ ○ Baguio                     │ │
│ Hide results until closing      [●]    │ └──────────────────────────────┘ │
│                                        │ Only the 31 current members can  │
│                                        │ answer. You can't edit a poll    │
│                                        │ once it's open.                  │
└────────────────────────────────────────┴──────────────────────────────────┘
```

The preview is the real L6 option component in a non-interactive state,
updated as the admin types. Below 1280 the preview moves under the form and
the review sheet comes back.

### L6 Answer a poll (UC07, S3, S4, X2)

Content order: status pill + closing time, question (`display`), anonymity
banner, "Tap an answer. You can't change it after." → **becomes** "Pick an
answer, then send. You can't change it after.", options or rating row, pinned
primary.

Flow (P4):

| Step | UI |
|---|---|
| Nothing picked | Pinned "Send answer" disabled. |
| Picked | Selected row: `--surface-raised`, 2 px `--accent`. Button enabled. Picking another option moves the selection. |
| Sending (S3) | Rows lock, others fade to 40 %. Silver line under the selected row. Label: "Proving you're a member…" (one string, R13). > 4 s: add the slow-phone line from the design spec. |
| Relaying (S4) | Same visual; label unchanged (users don't need the two-step split). |
| Recorded | Poll illustration fades in, `--success` check, "Recorded anonymously". Primary becomes "See results". |
| Already answered (X2) | `--danger` card "You've already answered this poll." + "Each member answers once. Your answer was counted — nobody can see what it was." Primary "See results". |
| Joined after it opened (X2) | Card "You weren't a member when this poll opened, so you can't answer it." No primary; text link "Back to group". |
| Rejected / network | "Lihim did not send your answer. Nothing is recorded. Check your connection and try again." Button returns to "Send answer" with the selection kept. |
| Closed | Redirect to L7. |

Accessibility: options are a radiogroup; the button is outside it. Live region
announces "Proving you're a member" and "Recorded anonymously".

Expanded: app shell, content centred in a 560 column (the question is the
whole page; no right rail). "Send answer" sits under the options, not in the
header, so the eye goes question → options → send. Keyboard: `1`–`8` select,
`Enter` sends.

### L7 Results (UC08, X3)

Content as today: status, question, headline (leading option or average),
tally bars, "Final results.", turnout, verified badge.

Changes:
- R15: while open, no verified badge. Show text "Anyone can check the count
  once it closes." Closed: badge as today, min 48 px tall (R9).
- Small-group warning when frozen size < 15 (design spec), above the tally.
- Hidden until close (X3): unchanged.
- Freshness (UC14): under turnout, `caption`: "Updated a minute ago". The
  indexer runs every minute; Realtime pushes changes.

Expanded:

```
┌ page header ──────────────────────────────────────────────────────────────┐
│ ← Art Guild    Results                                                    │
├────────────────────────────────────────────┬──────────────────────────────┤
│ Closed · Oct 14                            │ Turnout                      │
│ Do you approve the first-term report?      │ 23 of 31 members answered    │
│ Yes                                        │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▭▭▭▭    │
│ 17 of 23 answers · 74%                     │                              │
│                                            │ [⛉ Every vote verified]      │
│ Yes  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▭▭▭  17 · 74%  │ Check the count yourself on  │
│ No   ▬▬▬▬▬▬▬▬▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭   6 · 26%  │ the public record.           │
│ Final results.                             │                              │
└────────────────────────────────────────────┴──────────────────────────────┘
```

### L8 Who can see what (UC02)

Content as today, minus the "Display" theme picker (moves to L10, R12).

Expanded: app shell if signed in, focused shell if not. Reading column 640.
The three "who can see what" rows become a three-column row at ≥ 1024 (The
admin · Nobody · Anyone), each with its icon on top; the rest stays a single
reading column.

### L9 Verify this poll — public (UC01, S1)

Content order:
1. **Top bar (R8):** Lihim lockup, "Who can see what" link. One intro line
   under the title: "This page recounts a Lihim poll from the public record.
   It shows every answer, never who gave it."
2. Question, group name.
3. Summary: closed date, members at open, answers, member list fingerprint
   (hash chip).
4. Recounted tally + "Recount matches the published tally." (or the mismatch
   state below).
5. Every answer: "Show all 23 answers" expands the list (receipt hash chip ·
   answer).
6. Footer: "Recounted from the public record, not from Lihim's server." +
   footnote naming Stellar, poll number on the record, explorer link.

States:

| State | Shows |
|---|---|
| Recounting | Skeleton for tally; "Recounting from the public record…" |
| Match | `--success` check + "Recount matches the published tally." |
| Mismatch | `--danger` card "The recount doesn't match what Lihim shows. Tell the group admin." Lists both numbers per option. |
| Poll still open | "This poll is still open. The full record appears when it closes on Oct 24, 3:00 PM." Turnout only. |
| Poll not found | "No poll with this link. Check the link you were sent." |
| Record unreachable | "Can't reach the public record right now. Try again in a minute." + "Try again". |

Hash chips: 48 px tall touch area (R9), copy feedback via toast "Copied".

Expanded (focused shell, max 960):

```
┌ ◐ Lihim ─────────────────────────────────────────── Who can see what ──────┐
│ Do you approve the first-term report?                                      │
│ Art Guild · This page recounts a Lihim poll from the public record.        │
│ ┌─────────────┬──────────────┬─────────────┬────────────────────────────┐  │
│ │ Closed      │ Members at   │ Answers     │ Member list fingerprint    │  │
│ │ Oct 14 5 AM │ open  31     │ 23          │ [0x0194ad58…c2954a38 ⧉]    │  │
│ └─────────────┴──────────────┴─────────────┴────────────────────────────┘  │
│ Recounted tally                      │ Every answer                 23     │
│ Yes ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▭▭▭  17 · 74%      │ #  Receipt                 Answer │
│ No  ▬▬▬▬▬▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭   6 · 26%      │ 1  0x1a2b…9f0e ⧉           Yes    │
│ ✓ Recount matches the published tally│ 2  0x77c1…02aa ⧉           No     │
│                                      │ …  (scrolls inside the panel)      │
├──────────────────────────────────────┴────────────────────────────────────┤
│ Recounted from the public record, not from Lihim's server. ¹              │
└────────────────────────────────────────────────────────────────────────────┘
```

On desktop the answers table is visible by default (no "Show all" button);
it scrolls inside its panel past 20 rows.

### L10 Settings — new (UC04 sign-out, UC09, P5)

Sections:

| Section | Controls |
|---|---|
| Your name | Text field + helper "Admins of your groups see this. It's never attached to your answers." Save inline. |
| Alerts (P2) | Switch "Poll alerts" + helper "New polls and polls about to close. Every member gets the same alerts." If the browser blocked notifications: instructions instead of the switch. |
| Display | Theme: System / Dark / Light (moved from L8). |
| Privacy | Link row "Who can see what". |
| Account | "Sign out" (secondary). Body under it: "Your passkey stays on your device. Sign in again with it any time." |

Never in Settings: anything about which polls you answered.

Compact: list of sections. Expanded: app shell, single 560 column, sections
as cards.

### Shared: footer row, empty and loading states

- Footer row (R14): `eye-off` + "Who can see what" as a 48 px tall row at the
  end of L2, L3, L5, L6, L7. Desktop: sidebar item instead (app shell) or top
  bar link (focused shell).
- Loading: skeletons that match the final layout (existing `Skeleton`). No
  full-page spinners.
- Errors: say what failed and what to do; never a bare code.

---

## 6. New and changed components

| Component | Notes |
|---|---|
| `AppShell` | Sidebar + page header + main/rail grid, ≥ 1024. Below 1024 renders today's `Screen` unchanged. |
| `FocusedShell` | Top bar (lockup, "Who can see what", Sign in / Your groups) + centred content. |
| `Sidebar` | Lockup, group list with badges, New group, footer links, signed-in name. `nav` landmark, `aria-current="page"` on the current group. |
| `PageHeader` | Back link, title, context line, one primary action slot. Replaces `PinnedFooter` at ≥ 1024. |
| `ResponsiveSheet` | Bottom sheet < 768, dialog ≥ 768. Focus trap, `Esc`, return focus to opener. |
| `DataTable` | L4 roster and L9 answers at ≥ 1024. Sortable headers with `aria-sort`, sticky header, row hover. |
| `PollPreview` | L5 desktop preview: L6 option component, `inert`. |
| `StatusRow` | L4 adding-members and L3 opening rows: running / done / failed with action. |
| `PollCard` (changed) | Pill moves to meta row (R10). |
| `Switch` row (changed) | Whole row is the hit target (R9). |
| `VerifiedBadge` (changed) | 48 px hit area; hidden while poll is open (R15). |

---

## 7. Accessibility and QA checklist

Everything in `lihim-DESIGN.md` → Accessibility, plus:

- [ ] Every screen at 360, 768, 1024, 1280, 1440; no horizontal scroll; text
      at 200 % zoom on desktop still reflows.
- [ ] Keyboard only: sign in, join, answer a poll, create a poll, remove a
      member, verify a poll. Focus always visible; dialogs trap and return focus.
- [ ] Sidebar is a `nav` landmark; page header has the `h1`.
- [ ] All touch targets ≥ 48 px on compact (R9 list fixed).
- [ ] L6 announces proving and recorded states; number-key shortcuts don't
      fire while focus is in a text field.
- [ ] L9 works with no session and no cookies at every breakpoint.
- [ ] Privacy copy check on every new screen: no crypto words, no "you
      haven't voted", nothing that implies the app knows who answered.
- [ ] Both themes on every new screen and the desktop shells.
- [ ] Budget Android (₱6–8K, 360 × 800, font 130 %): L0, L2, L6.

---

## 8. Build order

1. **Decisions P1–P6** signed off.
2. **Flow fixes on mobile** (no new layout): P4 send button, P6 opening rows,
   R6 adding-members status, R9 touch targets, R10 poll card, R11, R13, R15.
3. **L0 Sign in + L10 Settings** (needs passkey wiring from HANDOFF item 2).
4. **Desktop shells**: `AppShell`, `FocusedShell`, `PageHeader`,
   `ResponsiveSheet`, then L3 → L6 → L7 → L4 → L5 → L9 → the rest.
5. **Alerts** (P2) once push subscription exists in the web app.

## Open questions

- [ ] P1–P6 above.
- [ ] PRF-unsupported fallback (recovery code) — needs its own flow once M0
      picks the approach.
- [ ] Should a member see their own L9 receipt (kept only on their device) so
      they can confirm their answer was counted? Privacy-safe if it never
      leaves the device; adds a small "Your receipt" row on L7/L9.
- [ ] Is 1024 the right switch to the desktop shell for tablets in landscape,
      or should tablets keep the medium layout?
