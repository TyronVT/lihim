# Lihim — Design Spec

*Companion to `claude/lihim-SPEC.md`. That file says what Lihim does; this one
says how it looks, sounds and moves. Screen IDs (L1–L9) match the build spec.*

## Design intent

Lihim asks people to say the thing they normally keep to themselves. The design
has one job: make that feel **safe, quiet and trustworthy** — never sneaky,
never "crypto", never playful about the stakes.

Three words the UI should earn:

| Word | Means in practice |
|---|---|
| **Hushed** | Dark, low-contrast graphite surfaces; few colours; no confetti, no loud gradients |
| **Honest** | Copy says exactly who can see what; no "100% anonymous", no hidden caveats |
| **Solid** | Results look final and checkable: tabular numbers, a verify link on every result, monospace receipts on L9 |

Anti-goals: hacker/terminal aesthetics (green-on-black, glitch effects),
blockchain visual clichés (cubes, chains, neon), and anything that makes a
student-org adviser or HOA officer wonder if the app is shady.

## Brand assets: the icon set

Four illustrated icons, one family: soft-lit graphite forms on near-black,
light from the upper left, fine grain texture, a single dark "void" cut-out as
the focal point.

| Icon | Name | Meaning | Where it's used |
|---|---|---|---|
| Hooded figure | **Mark** (`lihim-mark`) | Lihim itself — someone present but unnamed | App icon, splash, favicon, L8 header, empty states |
| Shield + four-point star | **Verified** (`lihim-verified`) | "Every vote verified" — the guarantee | L7 verified badge, L9 header, L2 confirmation |
| Ballot box | **Poll** (`lihim-poll`) | Casting an answer | L5 header, L6 success state, "no polls yet" empty state |
| People in a ring | **Group** (`lihim-group`) | The members — the anonymity set | L1 header, L3 member-count block, L4 header |

These are **hero illustrations**, not UI icons. Use them at 48 px and up, at
most one per screen. Below 48 px, use the line icon set (see Iconography).

### App icon: the Mark

Decision: the hooded figure is the app icon.

Why it works: it's the only one of the four that is a *character* rather than
a generic symbol (shields, ballot boxes and people-rings are on hundreds of
apps). It reads as "lihim" — hidden — before anyone reads the name.

Risk to manage: hooded figure + glowing eyes is also the stock-photo "hacker".
For a beachhead of student orgs and HOAs, the icon should read *quiet
confidant*, not *threat*. Guardrails:

- Keep the eyes **soft grey** (`#9C9B9D`–`#B5B4B8`), almond-shaped and calm.
  Never red, green, glowing or slanted downward.
- Never pair the Mark with hacker cues (code rain, terminal fonts, skulls,
  "dark web" language).
- Pilot check: show the icon to 5 advisers/officers during validation
  interviews and ask "what do you think this app does?" If "hacking" comes up
  more than once, soften (rounder hood, smaller eyes) before launch.

#### Construction

- Canvas: square, full-bleed background `--ink-950` (`#0A0B0D`). No
  transparency — iOS fills transparent pixels with black anyway, and Android
  launchers may fill with white.
- Figure centred optically (shift up ~3% of canvas; the cape's wide base
  makes true centre look low).
- Figure height: **≈ 64%** of canvas for the standard icon, so the full hood
  and cape survive iOS corner rounding and Android circle masks.
- Maskable / adaptive variants: figure must sit inside the **central 80%
  circle** (PWA maskable) and the **66 dp safe zone of the 108 dp** Android
  adaptive canvas. In practice: scale the figure to ≈ 52% of canvas height for
  these variants.
- Keep the grain texture at icon sizes ≥ 180 px; drop it below that (it turns
  into noise).

#### Small sizes (≤ 48 px): the Glyph

The full illustration loses the hood edge and the eyes merge below ~48 px.
Make a simplified flat **Glyph** for favicon, browser tab, notification badge
and status bar:

- Silhouette only: hood + shoulders as one flat shape in `#64656A` on
  `#0A0B0D`, face void cut out, two eye dots in `#B5B4B8`.
- No gradient, no grain, no cape fold detail.
- Monochrome variant (single colour on transparent) for Android notification
  small icon: white silhouette with the face void and eyes cut out.
- Ship as SVG so it stays crisp; test at 16, 24 and 32 px before export.

#### Export checklist (Next.js PWA)

| File | Size | Notes |
|---|---|---|
| `app/icon.svg` | vector | Glyph; modern browsers' favicon |
| `app/favicon.ico` | 16, 32, 48 | Glyph, multi-size ICO |
| `app/apple-icon.png` | 180×180 | Full Mark, opaque, no rounded corners (iOS rounds) |
| `public/icons/icon-192.png` | 192×192 | Full Mark, `purpose: "any"` |
| `public/icons/icon-512.png` | 512×512 | Full Mark, `purpose: "any"` |
| `public/icons/maskable-512.png` | 512×512 | Mark at 52% scale, `purpose: "maskable"` |
| `public/icons/badge-96.png` | 96×96 | Monochrome Glyph for push notification `badge` |
| `public/og.png` | 1200×630 | Mark left, "Lihim" wordmark + tagline right, `--ink-950` background |
| `public/illustrations/*.webp` | 2× and 3× at 160 px base | All four hero icons, transparent background, grain kept |

```json
// app/manifest.ts → output
{
  "name": "Lihim",
  "short_name": "Lihim",
  "description": "Anonymous polls for your group. Only members answer, once each.",
  "theme_color": "#0A0B0D",
  "background_color": "#0A0B0D",
  "display": "standalone",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Test the maskable icon at maskable.app before shipping.

### Wordmark

- "Lihim" set in the UI typeface (Geist), weight 600, tracking −1.5%.
- Colour `--text-1` on dark, `--ink-950` on light. No logotype tricks (no
  hidden letters, no redacted bars) — the Mark already carries the idea.
- Lockup: Mark (or Glyph) left of wordmark, gap = 0.4 × Mark height, wordmark
  cap height ≈ 40% of Mark height.
- Tagline: *Prove you belong. Never say who you are.* English only, also on
  social posts.

## Colour

Sampled from the icon sheet: the whole family lives in a cool graphite ramp
(slight blue cast) on near-black. The UI keeps that ramp and adds only
functional colours, all desaturated so nothing shouts.

**Dark is the default theme** (it's the brand, and the illustrations are drawn
for it). Light theme is supported for daylight use on budget phones; the hero
illustrations always sit on an `--ink-950` tile in light mode rather than being
redrawn.

### Graphite ramp (from the icons)

| Token | Hex | Sampled from |
|---|---|---|
| `--ink-950` | `#0A0B0D` | Background, face void, star cut-out |
| `--ink-900` | `#141518` | — (surface step) |
| `--ink-850` | `#1C1D21` | Ballot box side (shadow face) |
| `--ink-800` | `#2C2D32` | Hood/cape shadow side, box front |
| `--ink-700` | `#46474D` | Side people in Group |
| `--ink-600` | `#64656A` | Hood/shield lit side |
| `--ink-400` | `#8C8C8F` | Ring, ballot card |
| `--ink-300` | `#B5B4B8` | Eye highlight (lightened for UI use) |
| `--ink-100` | `#ECECEE` | — (primary text) |

### Semantic tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0A0B0D` | `#F6F6F7` | Page |
| `--surface` | `#141518` | `#FFFFFF` | Cards, sheets |
| `--surface-raised` | `#1C1D21` | `#FFFFFF` + shadow | Menus, selected option, modal |
| `--border` | `#2C2D32` | `#E2E2E5` | Dividers, card outlines (decorative) |
| `--border-control` | `#6A6B71` | `#85868C` | Inputs, unselected radio/option outlines (≥ 3:1) |
| `--text-1` | `#ECECEE` | `#111214` | Body, headings |
| `--text-2` | `#A3A3A8` | `#4E4F55` | Secondary, labels |
| `--text-3` | `#88888E` | `#6B6C72` | Hints, timestamps (still ≥ 4.5:1) |
| `--primary-bg` | `#ECECEE` | `#111214` | Primary button fill (inverse) |
| `--primary-fg` | `#0A0B0D` | `#F6F6F7` | Primary button label |
| `--accent` | `#C9C8CC` | `#2C2D32` | Focus ring, selected option, active tab, bar fill |
| `--success` | `#7FC4A0` | `#1F7A50` | "Recorded", "Verified" |
| `--warning` | `#E0B66A` | `#8A5A00` | Small-group warning, closing soon |
| `--danger` | `#E08A7E` | `#B23A2C` | Errors, "already answered", remove member |

There is deliberately **no brand hue**. The primary action is an inverse
(light-on-dark) button; the "accent" is the eye-highlight silver. If a hue is
ever needed (marketing site, charts with many series), add it as a separate
decision — don't sneak one into the app.

### Contrast (checked)

| Pair | Ratio |
|---|---|
| `--text-1` on `--bg` (dark) | 16.7 : 1 |
| `--text-2` on `--surface-raised` (dark) | 6.7 : 1 |
| `--text-3` on `--surface-raised` (dark) | 4.8 : 1 |
| `--success` / `--warning` / `--danger` on `--bg` (dark) | 9.7 / 10.4 / 7.6 : 1 |
| `--success` / `--warning` / `--danger` on `--bg` (light) | 4.9 / 5.5 / 5.5 : 1 |
| `--border-control` on `--surface` (dark) | 3.4 : 1 |
| Primary button label on fill (both themes) | ≥ 16 : 1 |

Status is never colour-only: every success/warning/danger state also has an
icon and words.

## Texture and depth

The illustrations use soft top-left light and fine grain. The UI borrows a
little of that, no more:

- **Grain:** one tiled noise PNG (or SVG `feTurbulence`) at **3% opacity** on
  `--bg` only, dark theme only. Never on text surfaces, never animated.
- **Elevation:** dark theme uses surface steps (`--bg` → `--surface` →
  `--surface-raised`) plus a 1 px top inner highlight
  (`inset 0 1px 0 rgba(255,255,255,0.04)`) to echo the lit edges of the
  icons. No drop shadows in dark mode. Light theme: one shadow,
  `0 1px 2px rgba(17,18,20,0.06), 0 4px 12px rgba(17,18,20,0.06)`.
- **No glassmorphism, no glows.** The only "light" in the app is the silver
  accent.

## Typography

| Role | Font | Why |
|---|---|---|
| UI + headings | **Geist** (variable, `next/font/google`) | Neutral, tight, made for Next.js; doesn't fight the illustrations |
| Receipts, hashes, numbers on L9 | **Geist Mono** | Roots and nullifiers must look like checkable receipts |

Fallback: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

Scale (mobile-first at 360 px; one step up at ≥ 768 px for display sizes only):

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 28 / 34 (32 / 38 ≥ 768) | 600 | Poll question on L6, result headline on L7 |
| `title` | 22 / 28 | 600 | Screen titles |
| `heading` | 17 / 24 | 600 | Card titles, section heads |
| `body` | 16 / 24 | 400 | Default; never below 16 for inputs (iOS zoom) |
| `label` | 14 / 20 | 500 | Buttons, option labels, field labels |
| `caption` | 13 / 18 | 400 | Hints, timestamps, footnotes |
| `mono` | 13 / 18 | 400 | Hashes, roots, tx refs |

Rules:

- Tabular figures (`font-variant-numeric: tabular-nums`) on every count,
  tally, percentage and turnout.
- Headings −1% tracking; everything else default.
- Sentence case everywhere. No ALL CAPS except 11 px overline labels
  (`+6%` tracking), used sparingly.
- Long hashes are truncated middle-out (`0x7f3a…c91e`) with tap-to-copy and a
  full-value sheet; never wrap a 64-character hash across lines.

## Layout, spacing, shape

- **Spacing scale (px):** 4, 8, 12, 16, 20, 24, 32, 40, 56. Default gutter 16,
  card padding 16, gap between cards 12, section gap 32.
- **Width:** design at 360 px; content max-width 480 px, centred, on larger
  screens (it's a phone app that also opens on laptops). L9 may widen to
  720 px for the vote table.
- **Radius:** 8 (inputs, chips), 12 (buttons, option rows), 16 (cards,
  sheets), full (avatars-without-faces, badges). The illustrations are soft;
  nothing in the UI is sharp-cornered.
- **Touch targets:** ≥ 48 px tall. Option rows on L6 are ≥ 56 px.
- **Navigation:** no global tab bar. Group home (L3) is the hub; screens below
  it use a top app bar with back. A user in several groups gets a group
  switcher at the top of L3.

## Iconography (UI)

- **Lihim line icons**, our own set (replaces Lucide). Inventory, drawing rules
  and placement rules: [`design/ICONS.md`](design/ICONS.md). Code:
  `apps/web/components/glyphs/` through `Icon` / `Icons`
  (`apps/web/components/icons.tsx`); contact sheet at `/dev/icons`.
- Same grammar as Lucide so it sits next to Geist: 24 grid, 1.75 px stroke,
  round caps and joins, no fills, colour `currentColor`. 20 px default, 24 px in
  the app bar, 16 px in chips and inline links, 14 px in pills.
- What makes it ours: the **withheld gap** (closed outlines leave a ~2 px gap at
  the upper right), the **hood** (people are the Mark's pointed hood, never a
  circle on a bust), the **ballot slip** (poll actions use an `rx 3` slip), and
  short, calm arrowheads. Rectangles use `rx 3`.
- Fixed mapping so meaning never drifts:

| Concept | Icon name |
|---|---|
| Anonymous / hidden | `anonymous` (almond eye with a broken diagonal) |
| Members | `members` (two hoods) |
| Verified | `verified` (shield with a tick, gap at upper right) |
| Poll | `poll` (slip into a slot) |
| Closing time | `closing` (clock with a gap at 1 o'clock) |
| Small-group warning | `warning` |
| Copy hash | `copy` |
| Verify / audit | `verify` (lens with a tick) |
| Invite | `invite` (two open hooks) |

- Major actions carry one leading icon (via `<Button icon>`): Sign in with
  passkey `passkey` · Create an account `createAccount` · Sign out `signOut` ·
  Create group `createGroup` · Join / Open group `join` · Your groups `groups` ·
  Send answer `send` · New poll `newPoll` · Open poll `openPoll` · See results
  `results` · Try again `retry` · Share link `share` · Turn off link `linkOff` ·
  Remove member `removeMember` · Leave group `leave` · Turn on alerts `alerts` ·
  Settings `settings` · outside links `external`. Ghost text buttons stay text
  only (the one exception is "Turn off this link", which carries `linkOff`).
- Never use a lock icon to mean "anonymous" — a lock implies encryption of
  content, which is a different promise. No crypto imagery (chains, coins,
  blocks, wallets).

## Motion

Calm and short. Nothing bounces.

| Token | Duration | Easing | Use |
|---|---|---|---|
| `fast` | 120 ms | `ease-out` | Press states, toggles |
| `base` | 200 ms | `cubic-bezier(0.2, 0, 0, 1)` | Sheets, option select, page transitions |
| `slow` | 320 ms | same | Result bars filling, success state |

**The proving moment (L6)** is the one piece of signature motion:

1. Tap an option → option row locks, other rows fade to 40%.
2. A thin silver progress line runs along the bottom of the selected row while
   the Web Worker proves (≈ 1 s; indeterminate if > 1.5 s). Label:
   "Proving that you are a member…".
3. On relay success: the Poll illustration fades in (320 ms, 8 px rise), label
   becomes "Your answer is recorded anonymously", `--success` check.
4. If proving takes > 4 s (budget Androids at higher depths): add the line
   "This takes more time on some phones. Do not close this page." Never show a
   spinner with no words.

`prefers-reduced-motion`: replace all movement with 120 ms opacity fades; the
progress line becomes a static "Proving…" label.

## Components

Built on shadcn/ui primitives, restyled with the tokens above.

| Component | Spec |
|---|---|
| **Button – primary** | `--primary-bg` fill, `--primary-fg` label, radius 12, height 48, full-width on mobile. One per screen. |
| **Button – secondary** | Transparent, 1 px `--border-control`, `--text-1` label. |
| **Button – destructive** | Secondary style with `--danger` label; always behind a confirm sheet. |
| **Option row** (single choice / yes-no) | `--surface`, 1 px `--border-control`, radius 12, min-height 56, label left, radio right. Selected: `--surface-raised`, 2 px `--accent` border. |
| **Rating row** (1–5) | Five equal 56 px square buttons, numbers in `label` weight, end labels in `caption` ("Not good" / "Very good"). No stars — stars feel like product reviews. |
| **Result bar** | Track `--ink-800`, fill `--accent` (`--ink-600` for non-leading options), height 8, radius full; count + % right-aligned, tabular. Leading option label in 600 weight; no trophy, no colour change. |
| **Turnout meter** | "23 of 31 members answered" + thin bar. Never "8 haven't answered" (that framing implies we know who). |
| **Verified badge** | Pill: `shield-check` + "Every vote verified", `--success` text on `--surface-raised`. Tap → L9. |
| **Anonymity banner** | `eye-off` + one line of copy, `--surface-raised`, radius 12. Appears on L2, L6 and L5. |
| **Small-group warning** | `triangle-alert` in `--warning` + "Small groups can still guess who voted what." Shown on L5 and L7 when the frozen member count is < 15. Blocking state on L5 below `min_members`. |
| **Member count block** | Group illustration (64 px) + "31 members" in `display`. For members, no names or avatars anywhere. |
| **Hash chip** | `mono` text, `--surface-raised`, radius 8, truncated middle-out, `copy` icon. |
| **Status pill** | Draft (`--text-3`), Open (`--text-1` + dot), Closing soon (`--warning`), Closed (`--text-2`). |
| **Empty state** | Hero illustration at 96 px, one-line heading, one-line body, one action. |
| **Toast** | Bottom, `--surface-raised`, 4 s, max one at a time. |

Avatars: Lihim never shows faces or initials next to anything a member did.
The admin's roster (L4) shows names in a plain list, no avatars.

## Screens

Mobile at 360 px is the source of truth. Every screen: top app bar (title,
back), content, at most one primary button pinned to the bottom with 16 px
padding and safe-area inset.

| ID | Screen | Hero icon | Design notes |
|---|---|---|---|
| L1 | Create group | Group | Fields: name, description, min group size (stepper, default 8, min 5). Inline explanation under min size: why it exists. Primary: "Create group". |
| L2 | Join | Group → Verified | Invite preview card: group name, member count, who created it. Primary: "Join with passkey". After: Verified illustration + "You're in. Your answers in this group are anonymous." + link to L8. |
| L3 | Group home | Group (64 px) | Member count block, then "Open polls" (cards with status pill + closing time), then "Past results". Admin sees a second row of actions (Members, New poll). |
| L4 | Members (admin) | Group | Plain list: name, joined date, overflow → Remove (confirm sheet). Header note: "Only you see this list. Members see the count only." |
| L5 | Create poll | Poll | Type segmented control (Single choice / Yes–No / Rating 1–5), question, options (add/remove, max 8), closing time, "Hide results until closing" switch (on by default). Below `min_members`: whole form disabled under a warning card explaining why. |
| L6 | Vote | Poll (success only) | Question in `display`. Option rows. Anonymity banner above options. Tap = answer (no separate submit; confirm sheet only for Yes/No polls tagged "important" — open question). Proving moment as above. Already answered → `--danger` card "You've already answered this poll" with no hint of what they chose. |
| L7 | Results | Verified (badge) | Headline: leading option or average rating. Result bars. Turnout meter. Verified badge → L9. Small-group warning if applicable. While open and hidden: "Results show when the poll closes at 6:00 PM" + turnout only. |
| L8 | Privacy explainer | Mark (96 px) | Three-row "who can see what" table with icons: Admin sees *who's a member*; Nobody sees *who answered what*; Anyone can *check the count*. Then the small-group warning, then "What Lihim cannot protect against" (screenshots, coercion) in plain English. |
| L9 | Verify this poll (public) | Verified | Public, no login. Summary card (question, closed date, members at open, answers, recounted tally) then an expandable table: # · nullifier (hash chip) · answer. Footer: "Recounted from the public record, not from Lihim's server." Monospace-heavy is fine here; it's a receipt. |

## Voice and copy

From the build spec's product rules, made concrete:

- **Say who can see what.** Every screen that collects an answer says it.
- **Never overclaim.** "Anonymous to the group and the public." Not
  "untraceable", "100% anonymous", "military-grade".
- **No crypto words.** Users never see: blockchain, on-chain, wallet, ZK,
  proof, nullifier, Stellar, XLM, gas, fee. Exceptions: L9 may say "public
  record" and show hashes, with "Stellar" in a footnote link for the curious.
- **English only**, written to ASD-STE100 (Simplified Technical English).
  "Lihim", the app name, is the one word that is not English. Rules:
  one instruction per sentence, started with a verb; 20 words or fewer for
  instructions and 25 or fewer for descriptions; active voice and simple
  tenses; no contractions, idioms or slang ("cannot", not "can't"); one word
  for one meaning ("answer", never "vote" or "response").
- **Never nudge individuals about voting.** No "you haven't voted yet".

| Situation | ✅ Use | ❌ Avoid |
|---|---|---|
| Answer recorded | "Your answer is recorded anonymously" | "Transaction confirmed on-chain" |
| Proving | "Proving that you are a member…" | "Generating ZK proof…" |
| Verified result | "All answers are verified" | "Cryptographically secured" |
| Double answer | "You answered this poll before." | "Nullifier already used" |
| Small group | "In a small group, people can sometimes guess who gave which answer." | (silence) |
| Reminder push | "A poll closes in 2 hours: Art Guild" | "You haven't voted yet!" |
| Joined | "You are a member now. Your answers here are anonymous." | "Identity commitment registered" |
| Admin roster | "Only you can see this list." | — |
| Network fail | "Lihim did not send your answer. Nothing is recorded. Check your connection and try again." | "Error 500" |

## Accessibility

- WCAG 2.2 AA minimum; all text tokens pass 4.5 : 1 on every surface they're
  used on (see Contrast).
- Focus ring: 2 px `--accent` outline, 2 px offset, on every interactive
  element. Never removed.
- Hero illustrations are decorative (`alt=""`); the Mark in the app bar on
  L8 has `alt="Lihim"`.
- Option rows are real radio groups (`role="radiogroup"`), rating is a radio
  group with numeric labels read as "3 out of 5".
- Result bars expose the number as text; the bar is `aria-hidden`.
- Proving state announced via `aria-live="polite"`.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`; user can
  override theme in settings.
- Test on a ₱6–8K Android at 360 × 800 with system font size at 130%.

## Implementation notes

- Tokens live in `app/globals.css` as CSS variables under `:root` (dark) and
  `[data-theme="light"]`, mapped into Tailwind via `@theme`. Components only
  reference semantic tokens, never ramp values or hex.
- Illustrations: export from the source file as transparent WebP at 2× and 3×
  (160 px base); load with `next/image`, `priority` only on L2/L6 success
  states. Keep originals (PNG/PSD) in `design/source/`, not `public/`.
- Grain: a 128 × 128 tiled PNG under 4 KB, applied as `body::before` with
  `pointer-events: none`.
- No icon fonts and no icon library. UI icons are inline SVG components from
  `components/glyphs/` (`createGlyph`), so only the icons a page uses ship.

## Open questions

- [ ] Hood perception check with 5 advisers/officers (see App icon risk).
- [ ] Do the four illustrations have a source file (vector/layered)? Needed for
      the Glyph and the maskable variant; redraw the Glyph as SVG either way.
- [ ] Confirm sheet before answering: always, never, or only for "important"
      polls? (Answers can't be changed, so a mis-tap is permanent.)
- [ ] Small-group warning threshold on L7: 15 members, or tie to
      `min_members × 2`?
- [ ] Light theme in MVP, or dark-only until after the pilot?
- [ ] Marketing site / Kit docs: same tokens, or give the developer Kit its
      own lighter docs theme?
