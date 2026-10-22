export const meta = {
  name: 'lihim-uiux-screens',
  description: 'Lihim UI/UX spec: 5 parallel screen builders on top of the finished foundation, then integration checks',
  whenToUse: 'Resume the uiux-desktop build after the foundation step (see HANDOFF-UIUX.md). Pass {root: "<abs repo path>"} as args.',
  phases: [
    { title: 'Screens', detail: '5 builders with disjoint file ownership' },
    { title: 'Integrate', detail: 'typecheck, lint, build, tests; fix cross-file breakage' },
  ],
}

const ROOT = (args && args.root) || '.'
const WEB = ROOT + '/apps/web'
const CONTEXT = `
Project: Lihim Polls, Next.js App Router PWA at ${WEB} (npm workspaces root ${ROOT}; Tailwind v4 tokens in app/globals.css; components in components/, copy in lib/copy.ts, data layer in lib/data/).
Spec to implement: ${ROOT}/lihim-UIUX-SPEC.md (read it fully; it is the source of truth for behaviour, states, layout and copy). Visual rules (tokens, type, colour, motion, copy voice): ${ROOT}/lihim-DESIGN.md. Product/privacy rules: ${ROOT}/lihim-SPEC.md ("Product rules", "Frontend screens", copy rules). Existing component docs: ${WEB}/COMPONENTS.md and ${WEB}/AGENTS.md (read AGENTS.md: this Next.js version may differ from your training data; check node_modules/next/dist/docs if unsure of an API).
The product decisions P1-P6 in the spec are ACCEPTED as written (sign-in screen; alerts asked once after join; revoke invite + leave group + retry/discard failed poll in MVP, close-early deferred; select-then-"Send answer" on L6; display name asked at sign-up; "Draft" becomes "Opening…"/"Didn't open").
Hard rules: privacy invariants in lib/data/types.ts header and lihim-SPEC.md product rules (never link a user to a vote, never "you haven't voted", no crypto words in UI copy). Match surrounding code style, comment density and naming. Semantic tokens only (no raw hex in components). Touch targets >= 48px on compact. Keep prefers-reduced-motion support. Every interactive element keyboard-accessible with visible focus.
Breakpoints (spec section 3): compact < 768 = today's mobile layout (must stay visually the same unless the spec changes it); medium 768-1023; expanded >= 1024 (Tailwind lg) = desktop app shell with sidebar; wide >= 1280 (xl) = right rail.
Git: you are on branch uiux-desktop. Do NOT commit, push, or switch branches.
`

// The foundation step already ran (2026-10-23); its handoff lives in HANDOFF-UIUX.md.
const foundation = {
  handoff: `Read ${ROOT}/HANDOFF-UIUX.md, section "Foundation handoff", in full. It lists every shell component, repo method, copy key, the mock failure triggers and the screen pattern you must follow.`,
  unfinished: `See the "Unfinished / deviations" list in ${ROOT}/HANDOFF-UIUX.md.`,
}

const SCREENS = [
  {
    key: 'account',
    title: 'Account: L0 Sign in, L10 Settings, Home, L8 privacy',
    owns: 'app/(public)/signin/**, app/(app)/settings/**, app/(app)/page.tsx and app/(app)/_home/** (or wherever the home group list now lives), app/(app)/privacy/**, components/theme-select.tsx',
    spec: 'L0 Sign in, Home, L8, L10 Settings in section 5; R3, R4, R12, R14, R16 in section 2; P1, P2, P5 in section 1',
  },
  {
    key: 'group',
    title: 'Group hub: L3 group home, group switcher, invite sheet, leave group, L4 members',
    owns: 'app/(app)/g/[groupId]/page.tsx, app/(app)/g/[groupId]/_components/** (group-home, group-switcher, invite-sheet, states), app/(app)/g/[groupId]/members/**',
    spec: 'L3 and L4 in section 5 (incl. the invite sheet additions and Leave group); R5, R6, R10 in section 2; P3, P6 in section 1. L3 desktop: ShellHeader with New poll primary (admin) and Invite link secondary, right rail at xl with member count / manage members / about / leave group. L4 desktop: DataTable roster with sort by name or joined date, "/" focuses search, Removed (n) collapsed section, StatusRow for adding members (S6).',
  },
  {
    key: 'create',
    title: 'Create flows: L1 create group, L5 create poll',
    owns: 'app/(app)/groups/new/**, app/(app)/g/[groupId]/polls/new/**',
    spec: 'L1 and L5 in section 5; R7, R9 (switch row) in section 2; P6 in section 1 (after opening go to L3 with an Opening row). L5 compact/medium: review sheet "Check before opening" before Open poll. L5 >= xl: two columns with a live PollPreview built from the real L6 option components rendered inert (coordinate by importing them; do not edit components/option-group.tsx, which the answer builder owns — if you need a prop there, wrap instead). L1 desktop: form 560 + "How groups work" rail at xl.',
  },
  {
    key: 'answer',
    title: 'Answer and results: L6 vote, L7 results',
    owns: 'app/(app)/p/[pollId]/** including results, components/option-group.tsx, components/results.tsx, components/vote-status.tsx, lib/vote.ts',
    spec: 'L6 and L7 in section 5; R2, R13, R15 in section 2; P4 in section 1. L6: tap selects, Send answer commits (pinned below lg, under the options at lg+, 560 centred column), full state table (proving, recorded, already answered, joined late, network error keeps selection, closed redirects to L7), number keys 1-8 select and Enter sends at all widths when focus is not in a text field, live region announcements. L7: no verified badge while open (show the open-poll line), freshness caption, small-group warning when frozen size < 15, desktop rail at xl with turnout + verified badge. The create builder will import your option components for an inert preview; keep their public props backward compatible.',
  },
  {
    key: 'public',
    title: 'Public: L2 join, L9 verify',
    owns: 'app/(public)/join/**, app/(public)/verify/**, components/hash-chip.tsx',
    spec: 'L2 and L9 in section 5; R8, R11 in section 2; P1, P2, P5 in section 1. L2: FocusedShell, signed-out join creates the account inline (name field), post-join alerts card asked once per device using lib/alerts.ts, X1 actions depend on session. L9: FocusedShell max 960, top bar + intro line, all states in the L9 state table (recounting, match, mismatch, still open, not found, record unreachable), desktop summary in one 4-column row, tally and answers DataTable side by side with the answers visible by default and scrolling inside the panel past 20 rows; compact keeps "Show all" expand.',
  },
]

phase('Screens')
const built = await parallel(SCREENS.map(s => () => agent(`${CONTEXT}
You are the "${s.key}" SCREEN builder: ${s.title}.
Four other builders are editing other screens in the same working tree at the same time.

Foundation handoff (shells, components, repo methods, copy keys) from the foundation builder:
<<<
${foundation.handoff}
>>>
Foundation notes on unfinished/deviating work:
<<<
${foundation.unfinished}
>>>
Also read the "Desktop shell and UI/UX spec components" section of ${WEB}/COMPONENTS.md.

Implement, from the spec: ${s.spec}.
You OWN these paths (edit freely): ${s.owns}.
Outside them: you may ADD keys to lib/copy.ts only inside a namespace for your screens (Read the file immediately before each Edit, since others edit it too; never reformat or reorder other namespaces). Do not edit other shared components, the data layer, or other screens. If you need a change in a shared component or repo method, work around it locally and list the needed change in your result instead.

Each screen must be correct at compact (360), medium (768) and expanded (1024 and 1440): follow the COMPONENTS.md shell pattern exactly (AppBar + PinnedFooter below lg, ShellHeader with the single primary action at lg+, rail at xl where the spec has one, or FocusedShell for public screens). Keep every existing loading, empty and error state working, and add the spec's new states. Use copy from lib/copy.ts, never inline strings.

When done, run \`cd ${WEB} && npx tsc --noEmit\` and \`npx eslint <your files>\` and fix every error in files you own (errors in files other builders own may be their in-progress work: ignore them). Do not run next build or a dev server (other builders share .next).

Return: what you built per screen, files changed, any spec items you could not do and why, and shared-component or data-layer changes you need from someone else.`, {
  label: `screens:${s.key}`,
  phase: 'Screens',
  schema: {
    type: 'object',
    properties: {
      built: { type: 'string' },
      files: { type: 'array', items: { type: 'string' } },
      notDone: { type: 'string' },
      neededChanges: { type: 'string' },
    },
    required: ['built', 'files', 'notDone', 'neededChanges'],
  },
}).then(r => r && ({ key: s.key, ...r }))))

const results = built.filter(Boolean)
const missing = SCREENS.filter(s => !results.find(r => r.key === s.key)).map(s => s.key)
if (missing.length) log(`Screen builders that returned nothing: ${missing.join(', ')}`)

phase('Integrate')
const integration = await agent(`${CONTEXT}
You are the INTEGRATION builder. A foundation builder and five screen builders just implemented ${ROOT}/lihim-UIUX-SPEC.md in parallel in this working tree. Their reports:
<<<
${JSON.stringify({ foundation: { unfinished: foundation.unfinished }, screens: results, missingBuilders: missing }, null, 2)}
>>>
Do this:
1. Apply the "neededChanges" the screen builders asked for in shared components, the data layer or copy, where they are consistent with the spec, and update the callers.
2. Make all checks pass from ${ROOT}: \`npm run build -w @lihim/sdk\` (if needed), \`cd apps/web && npx tsc --noEmit\`, \`npx eslint .\` in apps/web, \`npm run build -w @lihim/web\`, and \`npm test\` for workspaces that have tests and run offline. Fix root causes; do not silence lint rules or add ts-ignore.
3. Look for cross-screen inconsistencies (two copies of the same string, duplicate local components that should use the shared one, a screen missing the desktop shell pattern, compact layouts that changed when the spec did not ask for it) and fix them.
4. Grep the changed UI copy for banned words from the copy rules (blockchain, on-chain, wallet, ZK, proof, nullifier, XLM, fee, "haven't voted") outside L9's allowed footnote, and fix any.
Do not commit. Return a summary of fixes and the final status of every check (command + pass/fail + the shortest decisive error line if failing).`, {
  label: 'integrate',
  phase: 'Integrate',
  schema: {
    type: 'object',
    properties: {
      fixes: { type: 'string' },
      checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, detail: { type: 'string' } }, required: ['command', 'passed'] } },
      openIssues: { type: 'string' },
    },
    required: ['fixes', 'checks', 'openIssues'],
  },
})

return { foundation: { unfinished: foundation.unfinished, checksPassed: foundation.checksPassed }, screens: results, missing, integration }
