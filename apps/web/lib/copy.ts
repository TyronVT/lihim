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
 * - English only. "Lihim" (the app name) is the one word that is not English.
 * - Write to ASD-STE100 (Simplified Technical English):
 *   - One instruction per sentence. Start instructions with a verb ("Copy the link.").
 *   - Short sentences: 20 words or fewer for instructions, 25 or fewer for descriptions.
 *   - Active voice and simple tenses (present, simple past, simple future).
 *   - No contractions, idioms or slang. Write "cannot", not "can't".
 *   - One word for one meaning: "answer" (never "vote" or "response"), "group",
 *     "member", "poll", "invite link", "passkey", "alert".
 *
 * Strings from lihim-UIUX-SPEC.md are final unless marked "(draft copy)" next to them.
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const fmt = (n: number) => new Intl.NumberFormat("en-PH").format(n);

export const copy = {
  brand: {
    name: "Lihim",
    tagline: "Prove you belong. Never say who you are.",
    description: "Anonymous polls for your group. Only members can answer, and each member answers one time.",
  },

  common: {
    back: "Back",
    close: "Close",
    cancel: "Cancel",
    confirm: "Confirm",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Lihim cannot copy the text. Touch and hold the text to copy it.",
    retry: "Try again",
    loading: "Loading…",
    showFull: "Show the full value",
    privacyLink: "Who can see what",
    decrease: "Decrease",
    increase: "Increase",
    moreOptions: "More options",
  },

  anonymity: {
    banner: "Anonymous to the group and the public.",
    bannerVote: "Anonymous to the group and the public. The admin cannot see your answer.",
    bannerJoin: "Your answers in this group are anonymous. The admin can see that you joined. The admin cannot see your answers.",
    bannerCreatePoll: "Members answer anonymously. You will see the count and the results. You will not see who gave which answer.",
  },

  members: {
    count: (n: number) => `${fmt(n)} ${plural(n, "member", "members")}`,
    countLabel: (n: number) => plural(n, "member", "members"),
    rosterNote: "Only you can see this list. Members can see only the count.",
    joined: (date: string) => `Joined ${date}`,
    remove: "Remove",
    removeTitle: (name: string) => `Remove ${name}?`,
    // D5: removal is off-chain only (roster, invites, reminders, future polls). Polls that
    // opened while they were a member froze them into that poll's member list.
    removeBody:
      "This person will not get new polls from this group. If they joined before a poll opened, they can still answer that poll.",
    removeConfirm: "Remove member",
    removed: (name: string) => `${name} removed`,
  },

  smallGroup: {
    warning: "In a small group, people can sometimes guess who gave which answer.",
    blockedTitle: "The group does not have sufficient members for a poll",
    blockedBody: (min: number, current: number) =>
      `A poll needs a minimum of ${fmt(min)} members. This prevents guesses about who gave which answer. ` +
      `The group has ${fmt(current)}. Invite ${fmt(Math.max(min - current, 0))} more members to start.`,
    minSizeHelp:
      "A poll cannot open in a group smaller than this. In a very small group, people can guess who gave which answer.",
  },

  status: {
    /** P6: a "draft" is a poll whose create transaction is still in flight. Never say "Draft". */
    draft: "Opening…",
    /** P6: the create transaction failed (StatusPill status="didnt-open"). */
    didntOpen: "Did not open",
    open: "Open",
    closingSoon: "Closes soon",
    closed: "Closed",
  },

  vote: {
    proving: "Proving that you are a member…",
    provingReduced: "Proving…",
    slow: "This takes more time on some phones. Do not close this page.",
    recorded: "Your answer is recorded anonymously",
    alreadyAnswered: "You answered this poll before.",
    alreadyAnsweredBody: "Each member answers one time. Lihim counted your answer. Nobody can see your answer.",
    notSent: "Lihim did not send your answer. Nothing is recorded. Check your connection and try again.",
    invalid: "Lihim cannot record this answer. Refresh the page and try again.",
    notMember: "You were not a member when this poll opened. You cannot answer it.",
    pollClosed: "This poll is closed.",
    /** P4: L6 instruction line. */
    pickThenSend: "Select an answer, then send it. You cannot change your answer after you send it.",
    /** P4: the pinned primary (compact) / button under the options (expanded). */
    send: "Send answer",
    /** X2 joined-after-open: the text link (no primary). */
    backToGroup: "Back to group",
    /** Expanded only, under the options (draft copy). Pass the number of choices (2–8, or 5 for a rating). */
    keyboardHint: (max: number) => `Push 1–${max} to select an answer. Then push Enter to send it.`,
    /** The send button while proving/relaying; the live region carries `proving` (draft copy). */
    sending: "Sending…",
    ratingMin: "Not good",
    ratingMax: "Very good",
    ratingAria: (n: number) => `${n} out of 5`,
    yes: "Yes",
    no: "No",
    seeResults: "See the results",
    notFoundBody: "The link can be incorrect, or you are not a member of this group.",
    notOpenYet: "This poll is not open.",
    notOpenYetBody: "You can answer after the poll opens.",
    closedBody: "This poll does not accept answers now. The results are final.",
    proveFailedBody: "Nothing is recorded. Wait a moment and try again.",
  },

  results: {
    turnout: (answered: number, total: number) =>
      `${fmt(answered)} of ${fmt(total)} ${plural(total, "member", "members")} answered`,
    hiddenUntil: (time: string) => `The results show when the poll closes at ${time}.`,
    verified: "All answers are verified",
    average: (avg: string) => `Average rating ${avg} out of 5`,
    leading: (label: string) => label,
    tie: "Tie",
    noAnswers: "No answers yet.",
    title: "Results",
    /** "17 of 23 answers · 74%" under the leading option. */
    leadingDetail: (count: number, total: number, pct: string) =>
      `${fmt(count)} of ${fmt(total)} ${plural(total, "answer", "answers")} · ${pct}`,
    tiedOptions: (labels: string[]) => labels.join(" · "),
    live: "Live count. It can change until the poll closes.",
    final: "Final results.",
    tally: "Count",
    turnoutLabel: "Members who answered",
    hiddenNote: "While the poll is open, all members see only the number of answers. This includes the admin.",
    smallGroupBody:
      "In a group this small, people can sometimes guess who gave which answer. This is more possible when almost all answers are the same.",
    /** R15: shown instead of the verified badge while the poll is open. */
    verifyAfterClose: "After the poll closes, anyone can check the count.",
    /** Expanded rail, under the verified badge (draft copy; "public record" stays L9-only). */
    verifyRailBody: "Anyone can count all answers again on the verify page. The answers show no names.",
    /** UC14 freshness under turnout. Pass formatAgo(result.updatedAt): "Updated a minute ago". */
    updated: (ago: string) => `Updated ${ago}`,
  },

  poll: {
    /** Page title (≥ lg header) for L6/L7's not-found and load-error states. (draft copy) */
    title: "Poll",
    closesAt: (when: string) => `Closes ${when}`,
    closedAt: (when: string) => `Closed ${when}`,
    opensAt: (when: string) => `Opens ${when}`,
    kindSingle: "One choice",
    kindYesNo: "Yes or No",
    kindRating: "Rating 1–5",
    hideResults: "Hide the results until the poll closes",
    hideResultsHelp: "While the poll is open, members see only the number of answers.",
    maxOptions: "Maximum 8 options.",
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
    noPollsTitle: "No polls yet",
    noPollsBody: "When the admin opens a poll, it shows here.",
    noPollsAdminBody: "Ask the group a question. The answers are anonymous.",
    openPollsCount: (n: number) => `${fmt(n)} open ${plural(n, "poll", "polls")}`,
    /** Expanded page header context line on L3. */
    adminContext: "You are the admin",
    manageMembers: "Manage members",
    about: "About",
    minSize: (n: number) => `Minimum size ${fmt(n)}`,
  },

  /** L1. */
  createGroup: {
    title: "Create group",
    heading: "Create a group",
    intro: "Members join with an invite link. You will see who joined. You will not see the answers of a member.",
    name: "Group name",
    namePlaceholder: "Art Club",
    nameRequired: "Type a name for the group.",
    description: "Description",
    descriptionHint: "Optional. Members see this text when they open the invite link.",
    descriptionPlaceholder: "The art club of the university.",
    minSize: "Minimum group size",
    minSizeUnit: "members",
    inviteSettings: "Invite link",
    expiry: "The link works for",
    expiry1d: "1 day",
    expiry7d: "7 days",
    expiry30d: "30 days",
    maxUses: "Number of people who can join with it",
    maxUsesNone: "No limit",
    maxUsesHint: "The link stops after this number of people join. This makes it more difficult to add unknown members.",
    /** S5: the button label while the passkey prompt signs the group. */
    creating: "Creating…",
    failed: "Lihim cannot create the group. Try again.",
    /** ≥ 1280 rail: static "How groups work" card. Below that, the field hints carry it. (draft copy) */
    howTitle: "How groups work",
    howWhoTitle: "Who sees what",
    howWhoBody: "You see who joined. Members see only the number of members. Nobody sees the answers of a member. This includes you.",
    howMinTitle: "Why a minimum size",
    howMinBody: "A poll cannot open in a group smaller than this. In a very small group, people can guess who gave which answer.",
    howInviteTitle: "What an invite link does",
    howInviteBody:
      "Anyone with the link can join until it expires or until it is full. Each person joins with their own passkey. You can turn off the link on the group page.",
    // success state
    readyTitle: (name: string) => `${name} is ready`,
    readyBody: "Send this link to your members. Each person joins with their own passkey.",
    linkExpires: (when: string) => `The link works until ${when}.`,
    readyMin: (n: number) => `Polls can open when the group has ${fmt(n)} members.`,
    linkLabel: "Invite link",
    copyLink: "Copy link",
    share: "Share",
    shareText: (name: string) => `Join ${name} on Lihim. Lihim has anonymous polls for the group.`,
    goToGroup: "Go to group",
    inviteFailed: "The group is ready, but Lihim cannot make the invite link. You can make a link on the group page.",
  },

  /** L3 hub chrome (switcher, drafts, not-found). */
  hub: {
    title: "Group",
    adminCaption: "Only you see the names. Members see only the number of members.",
    memberCaption: (createdBy: string) => `Created by ${createdBy}`,
    adminActions: "Admin actions",
    noPastTitle: "No closed polls yet",
    noPastBody: "The results show here after a poll closes.",
    newPollCta: "Ask the group",
    switchTitle: "Your groups",
    allGroups: "All groups",
    current: "Current group",
    notFoundTitle: "Lihim cannot find this group",
    notFoundBody: "The group can be removed, or you are not a member. Ask the admin for an invite link.",
    home: "Your groups",
    /** R10 poll card meta: "16 of 31 answered". Turnout only, never who. */
    cardTurnout: (answered: number, total: number) => `${fmt(answered)} of ${fmt(total)} answered`,
    /** Accessible name of the L3 overflow (members: Leave group). */
    groupOptions: "Group options",
    /** Accessible name of the L3 rail / compact overview block. */
    overviewLabel: "About this group",
  },

  /** Invite sheet (L3, L4). */
  invite: {
    title: "Invite link",
    body: (group: string) =>
      `Anyone with this link can join ${group}. The admin sees who joined. Nobody sees the answers of a member.`,
    expires: (when: string) => `The link works until ${when}.`,
    noExpiry: "This link does not expire.",
    maxUses: (n: number) => `A maximum of ${fmt(n)} ${plural(n, "person", "people")} can join with it.`,
    making: "Making the link…",
    copyCta: "Copy link",
    shareCta: "Share",
    shareText: (group: string) => `Join ${group} on Lihim. Lihim has anonymous polls for the group.`,
    failed: "Lihim cannot make the link. Try again.",
    linkLabel: "Invite link",
    /** P3: uses of the active link. `max` null = no limit. */
    joined: (uses: number, max: number | null) =>
      max === null ? `${fmt(uses)} joined` : `${fmt(uses)} of ${fmt(max)} joined`,
    turnOff: "Turn off this link",
    turnOffTitle: "Turn off this link?",
    turnOffBody: "People with the link cannot join after this. Current members stay in the group.", // (draft copy)
    turnOffConfirm: "Turn off link",
    turningOff: "Turning off…",
    turnedOff: "The link is off. People with the link cannot join.",
    turnOffFailed: "Lihim cannot turn off the link. Try again.",
    makeNew: "Make a new link",
    /** Supabase keeps only a hash of the link, so a link made on another device can't be shown (draft copy). */
    madeElsewhere: "You made this link on a different device. Lihim cannot show it here. Turn it off, or make a new link.",
    none: "There is no invite link that works now.", // (draft copy)
  },

  /** L4 "Adding members" status row (R6, S6). */
  addingMembers: {
    running: (n: number) => `Adding ${fmt(n)} new ${plural(n, "member", "members")}…`,
    runningBody: "They can answer the polls that you open after this.",
    /** Toast. */
    done: (n: number) => `${fmt(n)} ${plural(n, "member", "members")} added`,
    failed: (n: number) => `Lihim cannot add ${fmt(n)} new ${plural(n, "member", "members")}.`,
    failedBody: "They cannot answer new polls until Lihim adds them.",
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
    noMatch: "No member has this name.",
    listLabel: "Member list",
    removeFailed: "Lihim cannot remove this member. Try again.",
    inviteCta: "Invite members",
    /** Keyboard hint drawn inside the search field at ≥ lg (spec §3: "/" focuses the member search). */
    searchKey: "/",
    removedListLabel: "Removed members",
  },

  /** L5. */
  newPoll: {
    title: "New poll",
    heading: (group: string) => `Ask ${group}`,
    kindLabel: "Poll type",
    question: "Question",
    questionPlaceholder: "Where do we go for the retreat this term?",
    questionRequired: "Type the question first.",
    options: "Options",
    optionLabel: (n: number) => `Option ${n}`,
    optionPlaceholder: (n: number) => (n === 1 ? "The beach" : n === 2 ? "The mountains" : ""),
    removeOption: (n: number) => `Remove option ${n}`,
    addOption: "Add option",
    optionCount: (n: number, max: number) => `${fmt(n)} of ${fmt(max)} options`,
    optionsRequired: "Add a minimum of 2 options.",
    optionsDuplicate: "Two options have the same text.",
    yesNoPreview: "Members answer Yes or No.",
    ratingPreview: "Members give a rating from 1 (Not good) to 5 (Very good).",
    closing: "Closing time",
    closingPresets: "Closes in",
    preset1d: "1 day",
    preset3d: "3 days",
    preset1w: "1 week",
    presetCustom: "Custom",
    customLabel: "Closes on",
    closingTooSoon: "Select a time that is a minimum of 1 hour from now.",
    closingTooFar: "A poll can stay open for a maximum of 30 days.",
    liveResultsHelp: "While the poll is open, members see the results change.",
    closesPreview: (when: string) => `Closes ${when}`,
    frozenNote: (n: number) =>
      `Only the ${fmt(n)} current ${plural(n, "member", "members")} can answer. People who join after the poll opens cannot answer.`,
    openCta: "Open poll",
    opening: "Opening…",
    failed: "Lihim cannot open the poll. Try again.",
    blockedInvite: "Invite link",
    /** R7 review sheet (compact/medium). */
    reviewTitle: "Check the poll before it opens",
    reviewBody: "You cannot change a poll after it opens.",
    reviewEdit: "Edit",
    reviewWho: (n: number) => `${fmt(n)} ${plural(n, "member", "members")} can answer`,
    reviewHidden: "The results are hidden until the poll closes",
    reviewLive: "The results show while the poll is open",
    /** Expanded preview rail. */
    previewTitle: "What members will see",
    /** After "Open poll" (P6): goes to L3 with an Opening… row. */
    openingToast: "The poll is opening. Members get an alert when it is open.",
    /** Review sheet row labels. (draft copy) */
    reviewCloses: "Closes",
    reviewWhoLabel: "Who can answer",
    reviewResults: "Results",
    /** Preview: shown in place of an option that's still empty. */
    previewOption: (n: number) => `Option ${n}`,
    /** createPoll rejected but left a "Didn't open" draft (P6): retry lives on L3, not here. (draft copy) */
    didntOpen: "The poll did not open. Try again on the group page.",
  },

  /** P6 — L3 rows for polls whose create transaction is pending or failed (admin only). */
  pollOpening: {
    sectionTitle: "Opening",
    opening: "Opening…",
    openingMeta: "This usually takes less than a minute.",
    didntOpen: "Did not open",
    didntOpenMeta: "Members cannot see it yet.", // (draft copy)
    retry: "Try again",
    retrying: "Trying again…",
    retryFailed: "The poll did not open. Wait a moment and try again.", // (draft copy)
    closingPassed: "The closing time of this poll is in the past. Discard it and make a new poll.", // (draft copy)
    options: (title: string) => `Options for ${title}`,
    discard: "Discard",
    discardTitle: "Discard this poll?",
    discardBody: "Members did not see this poll. You can make it again in New poll.", // (draft copy)
    discardConfirm: "Discard poll",
    discarding: "Discarding…",
    discarded: "Poll discarded",
  },

  /** P3 — L3 overflow (members only). Same on-chain limitation as removal (D5): don't promise more. */
  leaveGroup: {
    menuItem: "Leave group",
    title: (group: string) => `Leave ${group}?`,
    body:
      "You will not get the polls of this group after this. Lihim keeps the answers that you gave, and they stay anonymous. " +
      "To join again, you need a new invite link.",
    confirm: "Leave group",
    leaving: "Leaving…",
    left: (group: string) => `You left ${group}`,
    failed: "Lihim cannot remove you from the group now. Try again.", // (draft copy)
  },

  join: {
    cta: "Join with passkey",
    joined: "You are a member now. Your answers in this group are anonymous.",
    joinedShort: "You are a member now. Your answers here are anonymous.",
    invalidInvite: "This invite link expired, or the maximum number of people joined with it.",
    alreadyMember: "You are a member of this group.",
    title: "Invite",
    invitedTo: "You have an invite to",
    expires: (when: string) => `The invite works until ${when}`,
    waitingPasskey: "Waiting for your passkey…",
    joining: "Joining…",
    cancelled: "You cancelled the passkey. Nothing changed. Push the button to try again.",
    unsupported: "This browser cannot use passkeys. Open the link in Chrome or Safari on your phone.",
    failed: "Lihim cannot add you to the group now. Check your connection and try again.",
    invalidBody: "Ask the group admin for a new link.",
    openGroup: "Open group",
    home: "Your groups",
    /** X1 for a signed-out visitor (R11): secondary to L8. */
    whatIsLihim: "What is Lihim?",
    joinedBody: "The admin sees that you joined. Nobody sees your answers. This includes the admin.",
  },

  home: {
    title: "Your groups",
    emptyTitle: "You are not in a group",
    emptyBody: "Join a group with an invite link from the group admin, or create a group.",
    switcherLabel: "Change group",
  },

  /** P1 — L0 Sign in. */
  signin: {
    title: "Sign in",
    cta: "Sign in with passkey",
    waiting: "Waiting for your passkey…",
    createAccount: "New to Lihim? Create an account",
    /** Back from the new-account step to sign-in (draft copy). */
    haveAccount: "Do you have a passkey? Sign in",
    /** h1 of the new-account step. */
    createTitle: "Create your account", // (draft copy)
    nameLabel: "Your name",
    nameHint: "Only the admins of your groups see this name. Lihim never shows it with your answers.",
    nameRequired: "Type your name.", // (draft copy)
    continue: "Continue",
    creating: "Creating your account…", // (draft copy)
    cancelled: "You cancelled the sign-in. Try again when you are ready.",
    noPasskey:
      "This device has no Lihim passkey. If you made a passkey on a different phone, sync your passkeys from that phone. Or create a new account.",
    unsupported:
      "This browser cannot keep your answers private. Use Safari on a Mac or an iPhone, or use Chrome on a computer or an Android phone.",
    failed: "Lihim cannot sign you in now. Check your connection and try again.", // (draft copy)
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
    nameHint: "The admins of your groups see this name. Lihim never shows it with your answers.",
    nameSave: "Save",
    nameSaving: "Saving…",
    nameSaved: "Name saved",
    nameFailed: "Lihim cannot save your name. Try again.", // (draft copy)
    alertsTitle: "Alerts",
    alertsSwitch: "Poll alerts",
    alertsHelp: "Alerts for new polls and for polls that close soon. All members get the same alerts.",
    alertsBlocked:
      "Your browser blocks alerts from Lihim. To turn on alerts, allow notifications for this site in your browser settings. Then come back to this page.", // (draft copy)
    alertsUnsupported: "This browser cannot show alerts. On an iPhone, add Lihim to your Home Screen first.", // (draft copy)
    displayTitle: "Display",
    privacyTitle: "Privacy",
    accountTitle: "Account",
    signedInAs: (name: string) => `Signed in as ${name}`,
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutBody: "Your passkey stays on your device. You can use it to sign in again at any time.",
  },

  /** P2 — L2 success card (once per device) and toasts. */
  alerts: {
    askTitle: "Do you want an alert when a poll opens or closes soon?",
    askBody: "All members get the same alerts.", // (draft copy)
    turnOn: "Turn on alerts",
    notNow: "Not now",
    turnedOn: "Alerts on",
    blocked: "This browser blocks alerts. You can change this in Settings.", // (draft copy)
  },

  /** Desktop shells (lihim-UIUX-SPEC.md §3) and the mobile footer row (R14). */
  shell: {
    skipToContent: "Skip to content",
    sidebarLabel: "Lihim",
    homeLink: "Lihim: your groups",
    yourGroups: "Your groups",
    newGroup: "New group",
    privacy: "Who can see what",
    settings: "Settings",
    signIn: "Sign in",
    groupsHome: "Your groups",
    signedInAs: (name: string) => `Signed in as ${name}`,
    openPollsBadge: (n: number) => `${fmt(n)} open ${plural(n, "poll", "polls")}`,
    groupsFailed: "Lihim cannot load your groups.",
    noGroups: "You are not in a group.",
    /** Visually hidden label for the footer links landmark. */
    footerLabel: "More",
    /** Accessible name of a Screen's right rail. */
    railLabel: "Details",
  },

  reminders: {
    closesSoon: (groupName: string) => `A poll closes in 2 hours: ${groupName}`,
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
    membersAtOpen: "Members when the poll opened",
    answers: "Answers",
    recounted: "New count",
    closedOn: "Closed",
    groupFingerprint: "Member list fingerprint",
    tableTitle: "All answers",
    colIndex: "#",
    colReceipt: "Receipt",
    colAnswer: "Answer",
    footer: "This page counts the answers from the public record. It does not use the Lihim server.",
    footnote: "The public record is on Stellar. Anyone can count the answers again.",
    notClosed: "This poll is open. The full record is public after the poll closes.",
    notAvailableTitle: "There is no public record to show yet",
    recountMatches: "The new count is the same as the published count.",
    recountMismatch: "The new count is not the same as the published count.",
    recountMismatchBody:
      "The answers on the public record give a different count from the count in Lihim. Tell the group admin.",
    unknownAnswers: (n: number) =>
      `${fmt(n)} ${plural(n, "answer is", "answers are")} not an option. Lihim did not count ${plural(n, "it", "them")}.`,
    showTable: (n: number) => `Show all ${fmt(n)} ${plural(n, "answer", "answers")}`,
    hideTable: "Hide answers",
    showMore: (n: number) => `Show ${fmt(n)} more`,
    tableCaption: "The answers show in the sequence that they were recorded. The receipts show no names.",
    noRows: "No answers were recorded.",
    answerUnknown: "Not an option",
    recordRef: (pollId: string) => `Poll #${pollId} on the record`,
    footnoteLink: "See it on Stellar",
    /** R8: one line under the title, for someone opening a shared link cold. */
    intro: "This page counts the answers of a Lihim poll again from the public record. It shows all answers. It does not show who gave them.",
    recounting: "Counting the answers from the public record…",
    mismatchTitle: "The new count is not the same as the count in Lihim. Tell the group admin.",
    mismatchShown: "Lihim shows", // (draft copy)
    mismatchRecount: "New count", // (draft copy)
    stillOpen: (when: string) => `This poll is open. The full record shows when the poll closes on ${when}.`,
    notFound: "No poll has this link. Check the link that you received.",
    unreachable: "Lihim cannot get the public record now. Wait a minute and try again.",
    retry: "Try again",
  },

  /**
   * L8. Every claim here must hold against the threat table in lihim-SPEC.md: say exactly
   * who sees what and name what we can't protect against. No "public record" (L9-only) —
   * say "verify page".
   */
  privacy: {
    appBarTitle: "Privacy",
    title: "Who can see what",
    intro: "Anonymous to the group and the public. This page tells you what each person can see.",

    rows: [
      {
        icon: "members",
        who: "The admin",
        sees: "sees who is a member",
        body: "The admin sees names and join dates to manage the members. Other members see only the number of members.",
      },
      {
        icon: "anonymous",
        who: "Nobody",
        sees: "sees who gave which answer",
        body: "This includes the admin and the other members. The Lihim server never keeps which member gave which answer.",
      },
      {
        icon: "verify",
        who: "Anyone",
        sees: "can check the count",
        body: "Each closed poll has a verify page. Anyone can count the answers again there, also people who are not members. The answers show no names.",
      },
    ],

    smallGroupTitle: "Small groups",
    smallGroupBody:
      "In a small group, people can guess who gave which answer. This is also possible when almost all answers are the same. " +
      "For this reason, each group has a minimum size, and admins can hide the results until the poll closes.",

    limitsTitle: "What Lihim cannot protect against",
    limits: [
      {
        title: "Screenshots and stories",
        body: "If you show a screenshot of your answer, or tell people your answer, they know it. Lihim cannot hide what you share.",
      },
      {
        title: "Pressure or someone who watches",
        body:
          "If a person watches you when you answer, or forces you to show your answer, Lihim cannot protect you. " +
          "For sensitive polls, answer when you are alone.",
      },
      {
        title: "Your unlocked phone",
        body: "A person who can unlock your phone can use your passkey and answer as you. Lock your phone.",
      },
      {
        title: "Who the admin lets in",
        body: "The admin controls the invite link. If the number of members is too high for your group, ask the admin.",
      },
    ],
  },

  errors: {
    generic: "An error occurred. Try again.",
    notFound: "Lihim cannot find this page.",
    adminOnly: "Only the group admin can see this.",
  },
} as const;

export type Copy = typeof copy;
