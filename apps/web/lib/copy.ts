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
    draft: "Draft",
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
    tapToAnswer: "Tap an answer. You can't change it after.",
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
    drafts: "Drafts",
    draftMeta: "Not open yet — members can't see this",
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
  },

  /** L4. */
  roster: {
    title: "Members",
    adminTag: "Admin",
    you: "You",
    options: (name: string) => `Options for ${name}`,
    filterLabel: "Find a member",
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
    joinedBody: "The admin sees that you joined. Nobody — not even the admin — sees what you answer.",
  },

  home: {
    title: "Your groups",
    emptyTitle: "Wala ka pang group",
    emptyBody: "Open an invite link from your org, or start a group of your own.",
    switcherLabel: "Switch group",
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
