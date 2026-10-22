# Lihim line icons: inventory and drawing rules

Lihim's own UI icon set. It replaces Lucide everywhere in `apps/web`. It keeps
Lucide's grammar (24 px grid, round strokes, no fills), so it sits well next to
Geist and the rest of the UI, but every glyph is drawn fresh with Lihim's own
traits. These are UI icons. The four illustrated hero icons (Mark, Verified,
Poll, Group) are unchanged and still used at 48 px and up.

Code: `apps/web/components/glyphs/` (one `createGlyph` per icon), exposed
through `Icon` / `Icons` in `apps/web/components/icons.tsx`. Contact sheet:
`/dev/icons`.

## Drawing rules

| Rule | Value |
|---|---|
| Canvas | `viewBox="0 0 24 24"`. Live area 2–22. Optical padding: round shapes may touch 1.5–22.5. |
| Stroke | `currentColor`, 1.75 default (callers may pass another width), `round` caps and joins. |
| Fill | None. One exception: dots (eyes, an "i" dot) are `<circle r="1" fill="currentColor" stroke="none">`. |
| Corners | Rectangles use `rx="3"` (Lucide uses 2): a little softer. Inner corners of paths use radius ≥ 1.5. |
| Geometry | Snap to the 0.5 grid. Prefer whole-pixel centres for horizontals and verticals, so 20 px renders crisply. |
| Elements | At most 4 elements per icon. Nothing thinner than the stroke gap: keep ≥ 2 px between parallel strokes. |
| Output | `<path>`, `<circle>`, `<rect>`, `<line>`, `<polyline>` only. No transforms, no masks, no `<text>`. |

### The Lihim traits (what makes it ours)

1. **The withheld gap.** Every closed outer contour (circle, rounded rect,
   shield, speech shape) leaves one gap of about 2 px, usually at the upper
   right (1 to 2 o'clock). Something is held back: that's the product. Open
   shapes (arrows, chevrons, plus, check) have no gap. Where a gap would hurt
   recognition (copy, the small UI set), skip it.
2. **The hood.** People are never a circle on a bust. A person is the Mark's
   hood: a pointed arch (apex at the top) with a small V-shaped face opening,
   then the shoulder curve. One person = one hood. A group = a front hood with a
   second hood's edge peeking from behind.
3. **The ballot slip.** Poll concepts use a slip (rounded rect, `rx 3`) with a
   short tick or line on it, not Lucide's checkbox-in-box `vote`.
4. **Calm motion cues.** Arrows have short heads (arms ≈ 4 px at 45°). Nothing
   sparkles, no motion lines.

### Never

- A lock or padlock for "anonymous" or "private". A lock promises encrypted
  content, which is a different claim (lihim-DESIGN.md → Iconography).
- Crypto imagery: chains, coins, blocks, wallets, hexagon nodes.
- A copy of a Lucide path. Same metaphor is fine; the geometry must be our own.

## Inventory (42 icons)

Name = key in `Icons`. "Where" lists the main uses; the placement step may add
more where the same meaning appears.

### Concepts (replace the fixed Lucide mapping) — `glyphs/semantic.tsx`

| Name | Export | Meaning | Metaphor brief | Where |
|---|---|---|---|---|
| `anonymous` | `Anonymous` | Hidden / anonymous | Almond eye, crossed by one diagonal from upper left to lower right that stops short of the outline on both sides (a gap where it crosses) | "Who can see what", privacy notices, L8 rows |
| `members` | `Members` | Members, roster | Two hoods: front hood whole, second hood's edge behind at the upper right | Member count, Members button, L4 |
| `verified` | `Verified` | Verified result | Shield with a tick inside; shield outline keeps the gap at upper right | Verified badge, L9 match line, joined notice |
| `poll` | `Poll` | A poll | Ballot slip tilted into a slot line: slip rect + slot line below it | Poll meta rows, poll type hint |
| `closing` | `Closing` | Closing time | Clock face (gap at 1 o'clock) with hands at about 10 past | Closing time rows, "not open yet" |
| `warning` | `Warning` | Small-group / caution | Rounded triangle with a short stroke and a dot | Warning notices, small-group alert |
| `copy` | `Copy` | Copy text | Two offset slips, back one only drawn where it shows | Hash chips, Copy link |
| `verify` | `Verify` | Check the public record | Magnifier lens (gap) with a small tick inside the lens | Verify links, L9 entry points |
| `invite` | `Invite` | Invite link | Two open links (oval loops) joined at an angle, drawn as two hooks, not chain links | Invite link button, invite notices |

### Major actions (new, go on primary and secondary buttons) — `glyphs/account.tsx` and `glyphs/actions.tsx`

| Name | Export | File | Button(s) | Metaphor brief |
|---|---|---|---|---|
| `passkey` | `Passkey` | account | **Sign in with passkey**, top bar "Sign in", sign-in CTA on join | A key whose bow is a fingerprint-like set of 2 nested arcs; short bit with one tooth |
| `createAccount` | `CreateAccount` | account | **Create an account** / **Continue** (sign-up) | One hood with a small plus at the lower right |
| `signOut` | `SignOut` | account | **Sign out** | Open doorway (3 sides, gap) with an arrow leaving to the right |
| `settings` | `Settings` | account | Settings link (sidebar, footer row) | Gear with 6 rounded teeth and a hollow centre, not Lucide's cog outline |
| `alerts` | `Alerts` | account | **Turn on alerts**, alerts card, Settings alerts row | Bell with a soft shoulder, clapper as a short arc below |
| `groups` | `Groups` | account | **Your groups** (top bar), home links, back to groups | Three stacked rounded cards, offset, front one whole |
| `createGroup` | `CreateGroup` | account | **Create group**, sidebar "New group" | Two hoods (as `members`) with a plus at the lower right |
| `join` | `Join` | account | **Join group**, **Open group** after joining | Doorway (gap) with an arrow entering from the left |
| `send` | `Send` | actions | **Send answer** | Ballot slip being pushed up into a slot: slot line on top, slip with an up arrow |
| `newPoll` | `NewPoll` | actions | **New poll** (L3 header and actions) | Ballot slip with a plus in its upper right corner |
| `openPoll` | `OpenPoll` | actions | **Open poll** (L5 submit, review sheet confirm) | Ballot box seen from the front with its slot open and a short ray up |
| `retry` | `Retry` | actions | **Try again** everywhere | One circular arrow, about 300°, head at the top right |
| `share` | `Share` | actions | **Share link** | Slip with an arrow rising out of its top (not the 3-node graph) |
| `linkOff` | `LinkOff` | actions | **Turn off link** | `invite` geometry with the two hooks pulled apart and a short slash between |
| `removeMember` | `RemoveMember` | actions | **Remove** member (L4 menu, confirm) | One hood with a minus at the lower right |
| `leave` | `Leave` | actions | **Leave group** | Hood beside a doorway with an arrow leaving |
| `results` | `Results` | actions | **See results**, results links | Three horizontal bars of different lengths from a baseline at the left (Lihim results are horizontal bars) |
| `external` | `External` | actions | "See it on Stellar" and other outside links | Slip (gap at upper right) with an arrow leaving through the gap |

### UI glyphs — `glyphs/ui.tsx`

Simple and open, no gap trait. Arrow arms ≈ 4 px.

| Name | Export | Use |
|---|---|---|
| `arrowLeft` | `ArrowLeft` | Back (app bar, shell header) |
| `arrowRight` | `ArrowRight` | "Go to group", forward links |
| `arrowUp` | `ArrowUp` | Sort ascending |
| `arrowDown` | `ArrowDown` | Sort descending |
| `chevronRight` | `ChevronRight` | List rows, footer rows |
| `chevronDown` | `ChevronDown` | Group switcher, expanders |
| `chevronsUpDown` | `ChevronsUpDown` | Sortable column, not sorted |
| `plus` | `Plus` | Add option, stepper, New group |
| `minus` | `Minus` | Stepper |
| `close` | `Close` | Sheet close, remove option |
| `check` | `Check` | Chosen option, saved |
| `success` | `Success` | Circle (gap) with a tick: done, recorded |
| `alert` | `Alert` | Circle (gap) with a stroke and dot: error, didn't open |
| `info` | `Info` | Circle (gap) with a dot and stroke: info notices |
| `more` | `More` | Overflow menu: three dots in a row (dots may be filled circles r 1.25) |

## Placement rules

- Buttons that start or commit something carry a **leading** icon: the major
  actions above. Text buttons (ghost "New here? Create an account") stay text
  only. Loading labels drop the icon (the Button already swaps its children).
- One icon per button. Icon-only buttons need a label (`aria-label`), as now.
- Icon size: 20 in buttons and rows, 24 in the app bar, 16 in chips and inline
  links, 14 in pills.
- Icons are decorative next to words (`aria-hidden`). Status is never icon
  only.

### Placement exceptions (as shipped)

- **Turn off this link** is a ghost button but carries `linkOff`: it is a
  destructive commit, and the inventory names it.
- **See it on Stellar** (L9 footnote) puts `external` *after* the words at
  14 px, to match the small footnote text. Every other inline link icon leads at
  16 px.
- Expanders ("Show all N answers", group switcher, removed members) keep a
  trailing or leading chevron that rotates; that is a state cue, not a second
  action icon.
- No icon (nothing in the inventory fits): "Discard" (opening row menu),
  "Edit" (review sheet), "Not now", "Show more", "Back to group" / "All groups"
  text links.

## Review status and known weak spots

Drawn, reviewed and placed. Decisions made during review that differ from the
briefs above:

- **`leave`** is the badge hood with a right arrow in the badge slot, not "hood
  beside a doorway". A scaled-down hood beside a doorway turned into a blob at
  16 px and broke the one-hood rule. The doorway version is kept in the review
  contact sheet (`review2-actions.png`) if we want to revisit. `signOut` and
  `join` share one doorway (11 × 16, `rx 3`, opening from y 9 to 15).
- **`openPoll`** is a box with a lifted lid, not "slot open with a short ray
  up". It reads well; needs a design sign-off.
- Arrowheads at 45° step 3 units each way (arm ≈ 4.2). `retry` and
  `external` corner heads and all chevrons use 4-unit arms.
- Shared parts are byte-identical: one hood path (and a badge variant with the
  right shoulder cut), one ballot slip (12 × 13, `rx 3`, y 8–21), badges 6 long
  centred on (19, 17.5), gaps ≈ 2 px at the upper right.
- Off the 0.5 grid on purpose (rotated or mid-curve points): the tilted slip in
  `poll`, the eye pieces in `anonymous`, the gap shoulders in `verified`.

Still weak (revisit before 1.0):

1. **`poll`** reads a little like a tombstone at 48 px. Fine at 16–20 px.
2. **`invite`** reads a little like a paperclip at large sizes. Closed
   interlocking loops would be clearer but are chain links, which we ban.
3. **`openPoll`** metaphor differs from the brief (see above).
4. **`results`** can read as a text-align icon at 16 px.
5. **`settings`** teeth are slightly uneven after snapping (visible at 48 px and
   up). Small chevrons and the `more` dots are light at 16 px.
6. Not checked by eye in the running app yet: the FocusedTopBar "Sign in" /
   "Your groups" button is ~28 px wider with its icon; confirm it fits at
   360 px.
