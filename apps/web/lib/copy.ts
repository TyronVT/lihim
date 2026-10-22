/**
 * Every user-facing string lives here so the voice rules are reviewable in one place.
 *
 * Voice rules (lihim-DESIGN.md → Voice and copy; build contract §7):
 * - Say who can see what on every screen that collects an answer.
 * - "Anonymous to the group and the public." Never "untraceable" / "100% anonymous".
 * - Never: blockchain, on-chain, wallet, ZK, proof, nullifier, Stellar, XLM, gas, fee.
 *   Only L9 (`copy.verify`) may say "public record", show hashes, and mention Stellar
 *   in its footnote.
 * - Never nudge individuals: no "you haven't voted".
 * - Taglish welcome; English for anything legal.
 *
 * Strings from lihim-UIUX-SPEC.md are final unless marked "(draft copy)" next to them.
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const fmt = (n: number) => new Intl.NumberFormat("en-PH").format(n);

export const copy = {
  brand: {
    name: "Lihim",
    tagline: "Prove you belong. Never say who you are.",
    taglineTl: "Sabihin ang totoo. Walang makakaalam kung sino ka.",
    description: "Anonymous polls for your group. Only members answer, once each.",
  },

  common: {
    back: "Back",
    close: "Close",
    cancel: "Cancel",
    confirm: "Confirm",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Hindi ma-copy. Long-press to copy instead.",
    retry: "Try again",
    loading: "Loading…",
    showFull: "Show full value",
    privacyLink: "Who can see what",
    decrease: "Decrease",
    increase: "Increase",
    moreOptions: "More options",
  },

  anonymity: {
    banner: "Anonymous to the group and the public.",
    bannerVote: "Anonymous to the group and the public. Not even the admin sees your answer.",
    bannerJoin: "Your answers in this group are anonymous. The admin sees that you joined, not what you answer.",
    bannerCreatePoll: "Members answer anonymously. You'll see the count and the results, never who said what.",
  },

  members: {
    count: (n: number) => `${fmt(n)} ${plural(n, "member", "members")}`,
    countLabel: (n: number) => plural(n, "member", "members"),
    rosterNote: "Only you see this list. Members see the count only.",
    joined: (date: string) => `Joined ${date}`,
    remove: "Remove",
    removeTitle: (name: string) => `Remove ${name}?`,
    // D5: removal is off-chain only (roster, invites, reminders, future polls). Polls that
    // opened while they were a member froze them into that poll's member list.
    removeBody:
      "They won't get new polls from this group. A poll that's already open can still take their answer if they joined before it opened.",
    removeConfirm: "Remove member",
    removed: (name: string) => `${name} removed`,
  },

  smallGroup: {
    warning: "Small groups can still guess who voted what.",
    blockedTitle: "Kulang pa ang members para mag-poll",
    blockedBody: (min: number, current: number) =>
      `A poll needs at least ${fmt(min)} members so answers can't be traced back by elimination. ` +
      `You have ${fmt(current)} — invite ${fmt(Math.max(min - current, 0))} more to start.`,
    minSizeHelp:
      "Polls can't open below this size. In a very small group, people can guess who answered what just by elimination.",
  },

  status: {
    /** P6: a "draft" is a poll whose create transaction is still in flight. Never say "Draft". */
    draft: "Opening…",
    /** P6: the create transaction failed (StatusPill status="didnt-open"). */
    didntOpen: "Didn't open",
    open: "Open",
    closingSoon: "Closing soon",
    closed: "Closed",
  },

  vote: {
    proving: "Proving you're a member…",
    provingTl: "Pinapatunayang member ka…",
    provingReduced: "Proving…",
    slow: "Medyo matagal sa phone na 'to — okay lang, tuloy pa rin.",
    recorded: "Recorded anonymously",
    alreadyAnswered: "You've already answered this poll.",
    alreadyAnsweredBody: "Each member answers once. Your answer was counted — nobody can see what it was.",
    notSent: "Hindi na-send. Check your connection and try again — wala pang na-record.",
    invalid: "Hindi ma-record ang sagot na 'to. Refresh the page and try again.",
    notMember: "You weren't a member when this poll opened, so you can't answer it.",
    pollClosed: "This poll is closed.",
    /** @deprecated One-tap answering (before P4). Use `pickThenSend`. */
    tapToAnswer: "Tap an answer. You can't change it after.",
    /** P4: L6 instruction line. */
    pickThenSend: "Pick an answer, then send. You can't change it after.",
    /** P4: the pinned primary (compact) / button under the options (expanded). */
    send: "Send answer",
    /** X2 joined-after-open: the text link (no primary). */
    backToGroup: "Back to group",
    /** Expanded only, under the options (draft copy). */
    keyboardHint: "Press 1–8 to pick an answer, then Enter to send.",
    ratingMin: "Hindi maganda",
    ratingMax: "Napakaganda",
    ratingAria: (n: number) => `${n} out of 5`,
    yes: "Yes",
    no: "No",
    seeResults: "See results",
    notFoundBody: "Baka mali ang link, o hindi ka member ng group na 'to.",
    notOpenYet: "Hindi pa bukas ang poll na 'to.",
    notOpenYetBody: "Makakasagot ka kapag binuksan na ng admin.",
    closedBody: "Wala nang tumatanggap ng sagot. The results are final.",
    proveFailedBody: "Walang na-record. Try again in a moment.",
  },

  results: {
    turnout: (answered: number, total: number) =>
      `${fmt(answered)} of ${fmt(total)} ${plural(total, "member", "members")} answered`,
    hiddenUntil: (time: string) => `Results show when the poll closes at ${time}.`,
    verified: "Every vote verified",
    average: (avg: string) => `Average rating ${avg} out of 5`,
    leading: (label: string) => label,
    tie: "Tie",
    noAnswers: "Wala pang sumasagot.",
    title: "Results",
    /** "17 of 23 answers · 74%" under the leading option. */
    leadingDetail: (count: number, total: number, pct: string) =>
      `${fmt(count)} of ${fmt(total)} ${plural(total, "answer", "answers")} · ${pct}`,
    tiedOptions: (labels: string[]) => labels.join(" · "),
    live: "Live tally — puwede pang magbago hanggang magsara.",
    final: "Final results.",
    tally: "Tally",
    turnoutLabel: "Turnout",
    hiddenNote: "Habang bukas ang poll, ang bilang lang ng sumagot ang makikita ng lahat — pati ng admin.",
    smallGroupBody:
      "In a group this small, people can sometimes work out who answered what by elimination — lalo na kung halos pareho ang sagot ng lahat.",
    /** R15: shown instead of the verified badge while the poll is open. */
    verifyAfterClose: "Anyone can check the count once it closes.",
    /** Expanded rail, under the verified badge (draft copy; "public record" stays L9-only). */
    verifyRailBody: "Anyone can recount every answer on the verify page. No names attached.",
    /** UC14 freshness under turnout. Pass formatAgo(result.updatedAt): "Updated a minute ago". */
    updated: (ago: string) => `Updated ${ago}`,
  },

  poll: {
    closesAt: (when: string) => `Closes ${when}`,
    closedAt: (when: string) => `Closed ${when}`,
    opensAt: (when: string) => `Opens ${when}`,
    kindSingle: "Single choice",
    kindYesNo: "Yes–No",
    kindRating: "Rating 1–5",
    hideResults: "Hide results until closing",
    hideResultsHelp: "Members only see how many answered while the poll is open.",
    maxOptions: "Up to 8 options.",
  },

  group: {
    create: "Create group",
    createdBy: (name: string) => `Created by ${name}`,
    openPolls: "Open polls",
    pastResults: "Past results",
    newPoll: "New poll",
    adminTag: "Admin",
    members: "Members",
    invite: "Invite link",
    inviteCopied: "Invite link copied",
    noPollsTitle: "Wala pang polls",
    noPollsBody: "When the admin opens a poll, it shows up here.",
    noPollsAdminBody: "Ask the group something. Answers stay anonymous.",
    openPollsCount: (n: number) => `${fmt(n)} open ${plural(n, "poll", "polls")}`,
    /** Expanded page header context line on L3. */
    adminContext: "You're the admin",
    manageMembers: "Manage members",
    about: "About",
    minSize: (n: number) => `Minimum size ${fmt(n)}`,
  },

  /** L1. */
  createGroup: {
    title: "Create group",
    heading: "Gawa tayo ng group",
    intro: "Members join with an invite link. You'll see who joined — never what anyone answers.",
    name: "Group name",
    namePlaceholder: "UP Sining",
    nameRequired: "Give the group a name.",
    description: "Description",
    descriptionHint: "Optional. Members see this when they open the invite.",
    descriptionPlaceholder: "Org ng mga visual artists sa UP Diliman.",
    minSize: "Minimum group size",
    minSizeUnit: "members",
    inviteSettings: "Invite link",
    expiry: "Link works for",
    expiry1d: "1 day",
    expiry7d: "7 days",
    expiry30d: "30 days",
    maxUses: "People who can join with it",
    maxUsesNone: "No limit",
    maxUsesHint: "The link stops working after this many joins, so it's harder to pad the group.",
    creating: "Ginagawa ang group…",
    failed: "Hindi magawa ang group. Try again.",
    // success state
    readyTitle: (name: string) => `Ready na ang ${name}`,
    readyBody: "Send this link to your members. Each person joins with their own passkey.",
    linkExpires: (when: string) => `Works until ${when}.`,
    readyMin: (n: number) => `Polls open once the group has ${fmt(n)} members.`,
    linkLabel: "Invite link",
    copyLink: "Copy link",
    share: "Share",
    shareText: (name: string) => `Join ${name} on Lihim — anonymous polls for the group.`,
    goToGroup: "Go to group",
    inviteFailed: "Group is ready, pero hindi nagawa ang invite link. You can make one from the group page.",
  },

  /** L3 hub chrome (switcher, drafts, not-found). */
  hub: {
    title: "Group",
    adminCaption: "Only you see names. Members see the count only.",
    memberCaption: (createdBy: string) => `Created by ${createdBy}`,
    adminActions: "Admin actions",
    /** @deprecated P6 — use copy.pollOpening.sectionTitle / .openingMeta. */
    drafts: "Opening",
    /** @deprecated P6 — use copy.pollOpening.openingMeta. */
    draftMeta: "Usually under a minute.",
    noPastTitle: "Wala pang tapos na poll",
    noPastBody: "Results show up here once a poll closes.",
    newPollCta: "Ask the group",
    switchTitle: "Your groups",
    allGroups: "All groups",
    current: "Current group",
    notFoundTitle: "Hindi mahanap ang group na 'to",
    notFoundBody: "It may have been removed, or you're not a member yet. Ask the admin for an invite link.",
    home: "Your groups",
  },

  /** Invite sheet (L3, L4). */
  invite: {
    title: "Invite link",
    body: (group: string) =>
      `Anyone with this link can join ${group}. The admin sees who joined — nobody sees what anyone answers.`,
    expires: (when: string) => `Works until ${when}.`,
    noExpiry: "This link doesn't expire.",
    maxUses: (n: number) => `Up to ${fmt(n)} ${plural(n, "person", "people")} can join with it.`,
    making: "Gumagawa ng link…",
    copyCta: "Copy link",
    shareCta: "Share",
    shareText: (group: string) => `Join ${group} on Lihim — anonymous polls for the group.`,
    failed: "Hindi magawa ang link. Try again.",
    linkLabel: "Invite link",
    /** P3: uses of the active link. `max` null = no limit. */
    joined: (uses: number, max: number | null) =>
      max === null ? `${fmt(uses)} joined` : `${fmt(uses)} of ${fmt(max)} joined`,
    turnOff: "Turn off this link",
    turnOffTitle: "Turn off this link?",
    turnOffBody: "Anyone who has it won't be able to join. People already in the group stay in.", // (draft copy)
    turnOffConfirm: "Turn off link",
    turningOff: "Turning off…",
    turnedOff: "Link turned off. Anyone who has it can't join.",
    turnOffFailed: "Hindi ma-turn off ang link. Try again.",
    makeNew: "Make a new link",
    /** Supabase keeps only a hash of the link, so a link made on another device can't be shown (draft copy). */
    madeElsewhere: "This link was made on another device, so it can't be shown here. Turn it off, or make a new one.",
    none: "No working invite link right now.", // (draft copy)
  },

  /** L4 "Adding members" status row (R6, S6). */
  addingMembers: {
    running: (n: number) => `Adding ${fmt(n)} new ${plural(n, "member", "members")}…`,
    runningBody: "They can answer polls you open after this.",
    /** Toast. */
    done: (n: number) => `${fmt(n)} ${plural(n, "member", "members")} added`,
    failed: (n: number) => `Couldn't add ${fmt(n)} new ${plural(n, "member", "members")}.`,
    failedBody: "They can't answer new polls yet.",
    retry: "Try again",
  },

  /** L4. */
  roster: {
    title: "Members",
    adminTag: "Admin",
    you: "You",
    options: (name: string) => `Options for ${name}`,
    filterLabel: "Find a member",
    /** L4 collapsed section (X4). */
    removedSection: (n: number) => `Removed (${fmt(n)})`,
    activeCount: (n: number) => `${fmt(n)} active`,
    colName: "Name",
    colJoined: "Joined",
    colRole: "Role",
    colActions: "Actions",
    roleMember: "Member",
    removedOn: "Removed",
    filterPlaceholder: "Name",
    noMatch: "Walang tugma sa pangalang 'yan.",
    listLabel: "Member list",
    removeFailed: "Hindi ma-remove. Try again.",
    inviteCta: "Invite members",
  },

  /** L5. */
  newPoll: {
    title: "New poll",
    heading: (group: string) => `Itanong sa ${group}`,
    kindLabel: "Poll type",
    question: "Question",
    questionPlaceholder: "Saan tayo mag-retreat this sem?",
    questionRequired: "Write the question first.",
    options: "Options",
    optionLabel: (n: number) => `Option ${n}`,
    optionPlaceholder: (n: number) => (n === 1 ? "Tagaytay" : n === 2 ? "Baguio" : ""),
    removeOption: (n: number) => `Remove option ${n}`,
    addOption: "Add option",
    optionCount: (n: number, max: number) => `${fmt(n)} of ${fmt(max)} options`,
    optionsRequired: "Add at least 2 options.",
    optionsDuplicate: "Two options have the same text.",
    yesNoPreview: "Members answer Yes or No.",
    ratingPreview: "Members rate from 1 (Hindi maganda) to 5 (Napakaganda).",
    closing: "Closing time",
    closingPresets: "Closes in",
    preset1d: "1 day",
    preset3d: "3 days",
    preset1w: "1 week",
    presetCustom: "Custom",
    customLabel: "Closes on",
    closingTooSoon: "Pick a time at least 1 hour from now.",
    closingTooFar: "Polls can stay open for up to 30 days.",
    liveResultsHelp: "Members see the results update while the poll is open.",
    closesPreview: (when: string) => `Closes ${when}`,
    frozenNote: (n: number) =>
      `Only the ${fmt(n)} current ${plural(n, "member", "members")} can answer. People who join after it opens can't.`,
    openCta: "Open poll",
    opening: "Binubuksan…",
    confirmTitle: "Open this poll?",
    confirmBody: (n: number, when: string) =>
      `You can't edit it once it's open. ${fmt(n)} ${plural(n, "member", "members")} can answer until ${when}.`,
    confirmCta: "Open poll",
    opened: "Bukas na ang poll",
    failed: "Hindi mabuksan ang poll. Try again.",
    blockedInvite: "Invite link",
    /** R7 review sheet (compact/medium). */
    reviewTitle: "Check before opening",
    reviewBody: "You can't edit a poll once it's open.",
    reviewEdit: "Edit",
    reviewWho: (n: number) => `${fmt(n)} ${plural(n, "member", "members")} can answer`,
    reviewHidden: "Results hidden until it closes",
    reviewLive: "Results show while it's open",
    /** Expanded preview rail. */
    previewTitle: "What members will see",
    /** After "Open poll" (P6): goes to L3 with an Opening… row. */
    openingToast: "Poll is opening. Members get an alert once it's live.",
  },

  /** P6 — L3 rows for polls whose create transaction is pending or failed (admin only). */
  pollOpening: {
    sectionTitle: "Opening",
    opening: "Opening…",
    openingMeta: "Usually under a minute.",
    didntOpen: "Didn't open",
    didntOpenMeta: "Members can't see it yet.", // (draft copy)
    retry: "Try again",
    retrying: "Trying again…",
    retryFailed: "Hindi pa rin nabuksan. Try again in a moment.", // (draft copy)
    closingPassed: "Lumipas na ang closing time nito. Discard it and make a new poll.", // (draft copy)
    options: (title: string) => `Options for ${title}`,
    discard: "Discard",
    discardTitle: "Discard this poll?",
    discardBody: "Members never saw it. You can make it again from New poll.", // (draft copy)
    discardConfirm: "Discard poll",
    discarding: "Discarding…",
    discarded: "Poll discarded",
  },

  /** P3 — L3 overflow (members only). Same on-chain limitation as removal (D5): don't promise more. */
  leaveGroup: {
    menuItem: "Leave group",
    title: (group: string) => `Leave ${group}?`,
    body:
      "You'll stop getting its polls. Answers you already gave stay counted and stay anonymous. " +
      "To rejoin you'll need a new invite link.",
    confirm: "Leave group",
    leaving: "Leaving…",
    left: (group: string) => `You left ${group}`,
    failed: "Hindi ka maka-alis ngayon. Try again.", // (draft copy)
  },

  join: {
    cta: "Join with passkey",
    joined: "You're in. Your answers in this group are anonymous.",
    joinedShort: "You're in. Your answers here are anonymous.",
    invalidInvite: "This invite link has expired or was already used up.",
    alreadyMember: "You're already in this group.",
    title: "Invite",
    invitedTo: "You're invited to",
    expires: (when: string) => `Invite works until ${when}`,
    waitingPasskey: "Waiting for your passkey…",
    joining: "Sumasali…",
    cancelled: "Passkey cancelled — walang nangyari. Tap the button to try again.",
    unsupported: "This browser can't use passkeys. Open the link in Chrome or Safari on your phone.",
    failed: "Hindi ka maisali ngayon. Check your connection and try again.",
    invalidBody: "Ask the group admin for a new link.",
    openGroup: "Open group",
    home: "Your groups",
    /** X1 for a signed-out visitor (R11): secondary to L8. */
    whatIsLihim: "What is Lihim?",
    joinedBody: "The admin sees that you joined. Nobody — not even the admin — sees what you answer.",
  },

  home: {
    title: "Your groups",
    emptyTitle: "Wala ka pang group",
    emptyBody: "Join with an invite link from your group admin, or start one.",
    switcherLabel: "Switch group",
  },

  /** P1 — L0 Sign in. */
  signin: {
    title: "Sign in",
    cta: "Sign in with passkey",
    waiting: "Waiting for your passkey…",
    createAccount: "New here? Create an account",
    /** Back from the new-account step to sign-in (draft copy). */
    haveAccount: "Already have a passkey? Sign in",
    nameLabel: "Your name",
    nameHint: "Only admins of groups you join see this. It's never attached to your answers.",
    nameRequired: "Enter your name.", // (draft copy)
    continue: "Continue",
    creating: "Creating your account…", // (draft copy)
    cancelled: "Sign-in cancelled. Try again when you're ready.",
    noPasskey:
      "No Lihim passkey on this device. If you made one on another phone, use that phone's passkey sync, or create a new account.",
    unsupported: "This browser can't keep your answers private yet. Try Chrome on Android or Safari on iPhone.",
    failed: "Hindi ka ma-sign in ngayon. Check your connection and try again.", // (draft copy)
    /** One line above the button when arriving with ?next=. */
    nextPoll: "Sign in to open this poll.",
    nextGroup: "Sign in to open this group.",
    nextOther: "Sign in to continue.", // (draft copy)
  },

  /** P1/P2/P5 — L10 Settings. Never anything about which polls you answered. */
  settings: {
    title: "Settings",
    nameTitle: "Your name",
    nameLabel: "Your name",
    nameHint: "Admins of your groups see this. It's never attached to your answers.",
    nameSave: "Save",
    nameSaving: "Saving…",
    nameSaved: "Name saved",
    nameFailed: "Hindi ma-save. Try again.", // (draft copy)
    alertsTitle: "Alerts",
    alertsSwitch: "Poll alerts",
    alertsHelp: "New polls and polls about to close. Every member gets the same alerts.",
    alertsBlocked:
      "Your browser is blocking alerts from Lihim. To turn them on, allow notifications for this site in your browser settings, then come back here.", // (draft copy)
    alertsUnsupported: "This browser can't show alerts. On iPhone, add Lihim to your Home Screen first.", // (draft copy)
    displayTitle: "Display",
    privacyTitle: "Privacy",
    accountTitle: "Account",
    signedInAs: (name: string) => `Signed in as ${name}`,
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutBody: "Your passkey stays on your device. Sign in again with it any time.",
  },

  /** P2 — L2 success card (once per device) and toasts. */
  alerts: {
    askTitle: "Get a heads-up when a poll opens or is about to close?",
    askBody: "Every member gets the same alerts.", // (draft copy)
    turnOn: "Turn on alerts",
    notNow: "Not now",
    turnedOn: "Alerts on",
    blocked: "Alerts are blocked in this browser. You can change that in Settings.", // (draft copy)
  },

  /** Desktop shells (lihim-UIUX-SPEC.md §3) and the mobile footer row (R14). */
  shell: {
    skipToContent: "Skip to content",
    sidebarLabel: "Lihim",
    homeLink: "Lihim — your groups",
    yourGroups: "Your groups",
    newGroup: "New group",
    privacy: "Who can see what",
    settings: "Settings",
    signIn: "Sign in",
    groupsHome: "Your groups",
    signedInAs: (name: string) => `Signed in as ${name}`,
    openPollsBadge: (n: number) => `${fmt(n)} open ${plural(n, "poll", "polls")}`,
    groupsFailed: "Hindi ma-load ang groups.",
    noGroups: "Wala ka pang group.",
    /** Visually hidden label for the footer links landmark. */
    footerLabel: "More",
    /** Accessible name of a Screen's right rail. */
    railLabel: "Details",
  },

  reminders: {
    closesSoon: (groupName: string) => `Poll closes in 2 hours — ${groupName}`,
    newPoll: (groupName: string) => `New poll in ${groupName}`,
  },

  theme: {
    label: "Theme",
    system: "System",
    dark: "Dark",
    light: "Light",
  },

  /** L9 only. The one place allowed to say "public record" and mention Stellar. */
  verify: {
    title: "Verify this poll",
    summary: "Summary",
    membersAtOpen: "Members at open",
    answers: "Answers",
    recounted: "Recounted tally",
    closedOn: "Closed",
    groupFingerprint: "Member list fingerprint",
    tableTitle: "Every answer",
    colIndex: "#",
    colReceipt: "Receipt",
    colAnswer: "Answer",
    footer: "Recounted from the public record, not from Lihim's server.",
    footnote: "The public record is kept on Stellar. Anyone can recount it.",
    notClosed: "This poll is still open. The full record is public once it closes.",
    notAvailableTitle: "Wala pang public record na maipapakita",
    recountMatches: "Recount matches the published tally.",
    recountMismatch: "Recount doesn't match the published tally.",
    recountMismatchBody:
      "The answers on the public record add up differently from what Lihim shows. Please tell the group admin.",
    unknownAnswers: (n: number) =>
      `${fmt(n)} ${plural(n, "answer doesn't", "answers don't")} match any option and weren't counted.`,
    showTable: (n: number) => `Show all ${fmt(n)} ${plural(n, "answer", "answers")}`,
    hideTable: "Hide answers",
    showMore: (n: number) => `Show ${fmt(n)} more`,
    tableCaption: "In the order they were recorded. Receipts carry no names.",
    noRows: "No answers were recorded.",
    answerUnknown: "Not an option",
    recordRef: (pollId: string) => `Poll #${pollId} on the record`,
    footnoteLink: "See it on Stellar",
    /** R8: one line under the title, for someone opening a shared link cold. */
    intro: "This page recounts a Lihim poll from the public record. It shows every answer, never who gave it.",
    recounting: "Recounting from the public record…",
    mismatchTitle: "The recount doesn't match what Lihim shows. Tell the group admin.",
    mismatchShown: "Lihim shows", // (draft copy)
    mismatchRecount: "Recount", // (draft copy)
    stillOpen: (when: string) => `This poll is still open. The full record appears when it closes on ${when}.`,
    notFound: "No poll with this link. Check the link you were sent.",
    unreachable: "Can't reach the public record right now. Try again in a minute.",
    retry: "Try again",
  },

  /**
   * L8. Every claim here must hold against the threat table in lihim-SPEC.md: say exactly
   * who sees what and name what we can't protect against. No "public record" (L9-only) —
   * say "verify page". English for anything legal.
   */
  privacy: {
    appBarTitle: "Privacy",
    title: "Who can see what",
    intro: "Anonymous to the group and the public. Ito ang eksaktong nakikita ng bawat isa.",

    rows: [
      {
        icon: "members",
        who: "The admin",
        sees: "sees who's a member",
        body: "Names and join dates, para ma-manage ang members. Other members only see the count.",
      },
      {
        icon: "anonymous",
        who: "Nobody",
        sees: "sees who answered what",
        body: "Not the admin, not other members. Lihim's server never stores which member gave which answer.",
      },
      {
        icon: "verify",
        who: "Anyone",
        sees: "can check the count",
        body: "Every closed poll has a verify page. Kahit hindi member, puwedeng i-recount ang mga sagot — no names attached.",
      },
    ],

    smallGroupTitle: "Small groups",
    smallGroupBody:
      "Kapag maliit ang group, o halos pareho ang sagot ng lahat, people can guess who answered what by elimination. " +
      "That's why every group has a minimum size, and admins can hide results until the poll closes.",

    limitsTitle: "What Lihim can't protect against",
    limits: [
      {
        title: "Screenshots at kuwento",
        body: "Kung i-screenshot mo o ikuwento ang sagot mo, alam na nila. Lihim can't take back what you share yourself.",
      },
      {
        title: "Pressure or someone watching",
        body:
          "Kung may nagbabantay habang sumasagot ka, o pinipilit kang ipakita ang sagot mo, hindi ka namin mapoprotektahan doon. " +
          "For sensitive polls, answer when you're alone.",
      },
      {
        title: "Your unlocked phone",
        body: "Anyone who can unlock your phone can use your passkey and answer as you. Lock your phone.",
      },
      {
        title: "Who the admin lets in",
        body: "The admin controls the invite link. If the member count looks too high for your group, ask about it.",
      },
    ],

    displayTitle: "Display",
  },

  errors: {
    generic: "May mali. Please try again.",
    notFound: "Hindi mahanap ang page na 'to.",
    adminOnly: "Only the group admin can see this.",
  },
} as const;

export type Copy = typeof copy;
