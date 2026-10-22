/**
 * In-memory demo repository with realistic Taglish data. State lives for the page
 * session (module scope); a full reload resets it.
 *
 * The default data layer (NEXT_PUBLIC_DATA=mock); lib/data/supabase.ts is the real one. Kept for
 * /dev/components, tests and offline UI work.
 *
 * Demo cast — the viewer is "Ana Reyes":
 * - UP Sining (31 members, Ana is admin): open single-choice poll, open rating poll,
 *   closed yes/no with results, closed single-choice with results, one draft.
 * - Phase 2 HOA, Camella Dasmariñas (54 members, Ana is member): open poll with hidden tally.
 * - BS Psych 3-B Thesis Circle (6 members, Ana is admin, min 8): blocked small-group state.
 * Invite tokens: "sining-2026" (valid), "hoa-phase2" (already member), "expired-demo" (invalid).
 *
 * Group ids are fixed uuids (MOCK_GROUP_IDS) because, like Supabase groups.id, they are the
 * HKDF info of the per-group identity (D1). With the "sdk" prover, getFrozenCommitments puts
 * the viewer's REAL commitment (derived from lib/identity.ts's dev-only PRF) among synthetic
 * ones, so a genuine Semaphore proof can be generated in the browser.
 */
import { groupIdentity } from "../identity";
import type { LihimRepository } from "./index";
import { ForbiddenError, InviteError, NotFoundError, SmallGroupError } from "./errors";
import type {
  CurrentUser,
  Group,
  GroupRole,
  GroupSummary,
  Hex32,
  Invite,
  InvitePreview,
  Member,
  Poll,
  PollAudit,
  PollOption,
  PollResult,
  PollResultRow,
} from "./types";

// ---------------------------------------------------------------------------
// Deterministic helpers (same values on server and client → no hydration drift)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex32(rand: () => number): Hex32 {
  let out = "0x";
  // Keep the top byte small so it reads like a BN254 field element (< p).
  out += Math.floor(rand() * 0x30).toString(16).padStart(2, "0");
  for (let i = 0; i < 31; i++) out += Math.floor(rand() * 256).toString(16).padStart(2, "0");
  return out;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Anchor demo times to the start of the current hour so server- and client-rendered
// values agree within the hour.
const NOW = Math.floor(Date.now() / HOUR) * HOUR;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const delay = (ms = 220) => new Promise<void>((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => structuredClone(v);
let idSeq = 1000;
const nextId = (prefix: string) => `${prefix}_${++idSeq}`;

export const YES_NO_OPTIONS: PollOption[] = [
  { value: 0, label: "Yes" },
  { value: 1, label: "No" },
];
export const RATING_OPTIONS: PollOption[] = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));
const singleOptions = (labels: string[]): PollOption[] => labels.map((label, value) => ({ value, label }));

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const me: CurrentUser = { userId: "user_ana", displayName: "Ana Reyes" };

/** Fixed demo group ids (uuids, like groups.id). Linked from /dev/components and COMPONENTS.md. */
export const MOCK_GROUP_IDS = {
  upsining: "5a1e0000-0000-4000-8000-000000000001",
  hoa: "5a1e0000-0000-4000-8000-000000000002",
  thesis: "5a1e0000-0000-4000-8000-000000000003",
  choir: "5a1e0000-0000-4000-8000-000000000004",
} as const;

interface GroupRecord extends Omit<Group, "role"> {
  adminUserId: string;
  memberUserIds: Set<string>;
  roster: Member[];
}

const FIRST = ["Ana", "Paolo", "Bea", "Miguel", "Kat", "Jerome", "Trish", "Carlo", "Mika", "Joaquin", "Leah", "Renz", "Sam", "Nico", "Gab", "Ella", "Andrei", "Pia", "Marco", "Jas", "Yna", "Kiko", "Rina", "Lance", "Bianca", "Josh", "Celine", "Enzo", "Hannah", "Rafa", "Dani", "Vince", "Aly", "Migs", "Toni"];
const LAST = ["Reyes", "Santos", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Villanueva", "Ramos", "Aquino", "Navarro", "Castillo", "Dela Cruz", "Gonzales", "Flores", "Lim", "Tan", "Soriano", "Pascual", "Domingo"];

function makeRoster(seed: number, size: number, adminName: string, startDaysAgo: number): Member[] {
  const rand = mulberry32(seed);
  const roster: Member[] = [
    { id: nextId("mem"), displayName: adminName, joinedAt: at(-startDaysAgo * DAY), status: "active", isAdmin: true },
  ];
  for (let i = 1; i < size; i++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)]!;
    const last = LAST[Math.floor(rand() * LAST.length)]!;
    roster.push({
      id: nextId("mem"),
      displayName: `${first} ${last}`,
      joinedAt: at(-Math.floor(rand() * startDaysAgo) * DAY - Math.floor(rand() * 20) * HOUR),
      status: "active",
      isAdmin: false,
    });
  }
  return roster.sort((a, b) => (a.isAdmin ? -1 : b.isAdmin ? 1 : a.joinedAt.localeCompare(b.joinedAt)));
}

const groups = new Map<string, GroupRecord>();

function addGroup(g: Omit<GroupRecord, "memberCount">) {
  groups.set(g.id, { ...g, memberCount: g.roster.filter((m) => m.status === "active").length });
}

addGroup({
  id: MOCK_GROUP_IDS.upsining,
  chainGroupId: "7",
  name: "UP Sining",
  description: "Org ng mga visual artists sa UP Diliman. Dito tayo nagdedesisyon nang tapat.",
  minMembers: 8,
  createdAt: at(-120 * DAY),
  createdByName: "Ana Reyes",
  adminUserId: me.userId,
  memberUserIds: new Set([me.userId]),
  roster: makeRoster(11, 31, "Ana Reyes", 120),
});

addGroup({
  id: MOCK_GROUP_IDS.hoa,
  chainGroupId: "12",
  name: "Phase 2 HOA, Camella Dasmariñas",
  description: "Homeowners ng Phase 2. Para sa mga desisyon sa dues, security at amenities.",
  minMembers: 10,
  createdAt: at(-300 * DAY),
  createdByName: "Rodel Santos",
  adminUserId: "user_rodel",
  memberUserIds: new Set([me.userId]),
  roster: makeRoster(23, 54, "Rodel Santos", 300),
});

addGroup({
  id: MOCK_GROUP_IDS.thesis,
  chainGroupId: "19",
  name: "BS Psych 3-B Thesis Circle",
  description: "Peer feedback sa thesis drafts.",
  minMembers: 8,
  createdAt: at(-9 * DAY),
  createdByName: "Ana Reyes",
  adminUserId: me.userId,
  memberUserIds: new Set([me.userId]),
  roster: makeRoster(37, 6, "Ana Reyes", 9),
});

interface PollRecord extends Poll {
  /** Mock-only: the public record (nullifier + choice). Never tied to a member. */
  ledger: { nullifier: Hex32; choice: number }[];
}

const polls = new Map<string, PollRecord>();
let chainPollSeq = 40;

function seedLedger(seed: number, counts: Record<number, number>) {
  const rand = mulberry32(seed);
  const entries: { nullifier: Hex32; choice: number }[] = [];
  for (const [choice, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) entries.push({ nullifier: hex32(rand), choice: Number(choice) });
  }
  // Shuffle so order carries no meaning (mirrors ledger order, not option order).
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [entries[i], entries[j]] = [entries[j]!, entries[i]!];
  }
  return entries;
}

function addPoll(p: Omit<PollRecord, "votersCount" | "chainPollId" | "frozenRoot"> & { seed: number }) {
  const { seed, ...rest } = p;
  const chainPollId = rest.status === "draft" ? null : String(++chainPollSeq);
  polls.set(rest.id, {
    ...rest,
    chainPollId,
    frozenRoot: rest.status === "draft" ? null : hex32(mulberry32(seed * 7)),
    votersCount: rest.ledger.length,
  });
}

addPoll({
  id: "poll_retreat",
  seed: 101,
  groupId: MOCK_GROUP_IDS.upsining,
  title: "Saan tayo mag-retreat this sem?",
  kind: "single",
  options: singleOptions(["Tagaytay", "Baguio", "La Union", "Sa campus na lang"]),
  opensAt: at(-2 * DAY),
  closesAt: at(2 * DAY + 6 * HOUR),
  hideLiveTally: true,
  frozenSize: 31,
  status: "open",
  ledger: seedLedger(101, { 0: 6, 1: 5, 2: 7, 3: 2 }),
});

addPoll({
  id: "poll_ga_rating",
  seed: 102,
  groupId: MOCK_GROUP_IDS.upsining,
  title: "Rate the GA last Friday",
  kind: "rating",
  options: RATING_OPTIONS,
  opensAt: at(-1 * DAY),
  closesAt: at(5 * HOUR),
  hideLiveTally: false,
  frozenSize: 31,
  status: "open",
  ledger: seedLedger(102, { 2: 2, 3: 5, 4: 6, 5: 3 }),
});

addPoll({
  id: "poll_finance",
  seed: 103,
  groupId: MOCK_GROUP_IDS.upsining,
  title: "Approve ba ang financial report ng 1st sem?",
  kind: "yesno",
  options: YES_NO_OPTIONS,
  opensAt: at(-12 * DAY),
  closesAt: at(-9 * DAY),
  hideLiveTally: true,
  frozenSize: 31,
  status: "closed",
  ledger: seedLedger(103, { 0: 17, 1: 6 }),
});

addPoll({
  id: "poll_exhibit",
  seed: 104,
  groupId: MOCK_GROUP_IDS.upsining,
  title: "Theme ng year-end exhibit?",
  kind: "single",
  options: singleOptions(["Lihim at liwanag", "Bahay", "Ingay", "Bukas"]),
  opensAt: at(-30 * DAY),
  closesAt: at(-25 * DAY),
  hideLiveTally: true,
  frozenSize: 29,
  status: "closed",
  ledger: seedLedger(104, { 0: 11, 1: 7, 2: 3, 3: 4 }),
});

addPoll({
  id: "poll_draft",
  seed: 105,
  groupId: MOCK_GROUP_IDS.upsining,
  title: "Officer evaluation: Treasurer",
  kind: "rating",
  options: RATING_OPTIONS,
  opensAt: at(1 * DAY),
  closesAt: at(4 * DAY),
  hideLiveTally: true,
  frozenSize: 0,
  status: "draft",
  ledger: [],
});

addPoll({
  id: "poll_dues",
  seed: 201,
  groupId: MOCK_GROUP_IDS.hoa,
  title: "Itaas ba ang monthly dues to ₱500 para sa dagdag na guard?",
  kind: "yesno",
  options: YES_NO_OPTIONS,
  opensAt: at(-3 * DAY),
  closesAt: at(1 * DAY + 10 * HOUR),
  hideLiveTally: true,
  frozenSize: 54,
  status: "open",
  ledger: seedLedger(201, { 0: 14, 1: 19 }),
});

const invites = new Map<string, Invite & { valid: boolean }>();
function addInvite(token: string, groupId: string, valid: boolean) {
  invites.set(token, {
    id: nextId("inv"),
    groupId,
    token,
    url: `/join/${token}`,
    maxUses: null,
    uses: valid ? 3 : 50,
    expiresAt: valid ? at(7 * DAY) : at(-1 * DAY),
    valid,
  });
}
addInvite("sining-2026", MOCK_GROUP_IDS.upsining, true);
addInvite("hoa-phase2", MOCK_GROUP_IDS.hoa, true);
addInvite("expired-demo", MOCK_GROUP_IDS.upsining, false);

// A group Ana can actually join from the invite flow.
addGroup({
  id: MOCK_GROUP_IDS.choir,
  chainGroupId: "23",
  name: "Our Lady of Fatima Youth Choir",
  description: "Choir ministry ng parish. Feedback sa practice schedule at songs.",
  minMembers: 8,
  createdAt: at(-60 * DAY),
  createdByName: "Kuya Jun Pascual",
  adminUserId: "user_jun",
  memberUserIds: new Set(),
  roster: makeRoster(51, 18, "Kuya Jun Pascual", 60),
});
addInvite("choir-fatima", MOCK_GROUP_IDS.choir, true);

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

const isMember = (g: GroupRecord) => g.memberUserIds.has(me.userId) || g.adminUserId === me.userId;
const roleOf = (g: GroupRecord): GroupRole => (g.adminUserId === me.userId ? "admin" : "member");

function toGroup(g: GroupRecord): Group {
  const { adminUserId: _a, memberUserIds: _m, roster: _r, ...rest } = g;
  return { ...rest, role: roleOf(g) };
}

function toPoll(p: PollRecord): Poll {
  const { ledger: _l, ...rest } = p;
  return clone(rest);
}

function tallyOf(p: PollRecord): PollResultRow[] {
  return p.options.map((o) => ({ ...o, count: p.ledger.filter((e) => e.choice === o.value).length }));
}

function leadingOf(rows: PollResultRow[]): number[] {
  const max = Math.max(0, ...rows.map((r) => r.count));
  return max === 0 ? [] : rows.filter((r) => r.count === max).map((r) => r.value);
}

function averageOf(p: PollRecord): number | null {
  if (p.kind !== "rating" || p.ledger.length === 0) return null;
  return p.ledger.reduce((s, e) => s + e.choice, 0) / p.ledger.length;
}

function requireGroup(groupId: string): GroupRecord {
  const g = groups.get(groupId);
  if (!g || !isMember(g)) throw new NotFoundError("Group not found");
  return g;
}

function requireAdmin(groupId: string): GroupRecord {
  const g = requireGroup(groupId);
  if (g.adminUserId !== me.userId) throw new ForbiddenError();
  return g;
}

function syncCount(g: GroupRecord) {
  g.memberCount = g.roster.filter((m) => m.status === "active").length;
}

// ---------------------------------------------------------------------------
// Mock-only hooks used by lib/relay.ts's mock path so a mock vote shows up in results.
// ---------------------------------------------------------------------------

/** @internal Mock relay only. Returns false when the nullifier was already used. */
export function mockRecordVote(chainPollId: string, nullifier: Hex32, choice: number): boolean {
  const p = [...polls.values()].find((x) => x.chainPollId === chainPollId);
  if (!p) return true; // Unknown poll in mock mode: accept so the UI flow still runs.
  if (p.ledger.some((e) => e.nullifier === nullifier)) return false;
  p.ledger.push({ nullifier, choice });
  p.votersCount = p.ledger.length;
  return true;
}


// ---------------------------------------------------------------------------
// Frozen member sets (sdk prover in dev)
// ---------------------------------------------------------------------------

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const frozenSets = new Map<string, Promise<bigint[]>>();

/**
 * `frozenSize` leaves: synthetic field elements plus, when the viewer is a member, the
 * viewer's real commitment at a deterministic position. The proof's root is therefore NOT
 * the decorative `frozenRoot` above (lib/vote.ts only warns about that in mock mode).
 */
function frozenCommitmentsOf(p: PollRecord, g: GroupRecord): Promise<bigint[]> {
  let set = frozenSets.get(p.id);
  if (!set) {
    set = (async () => {
      const rand = mulberry32(seedOf(p.id));
      const leaves = Array.from({ length: Math.max(0, p.frozenSize - 1) }, () => BigInt(hex32(rand)));
      if (isMember(g) && p.frozenSize > 0) {
        const viewer = (await groupIdentity(g.id)).commitment;
        leaves.splice(Math.floor(rand() * p.frozenSize), 0, viewer);
      }
      return leaves;
    })();
    set.catch(() => frozenSets.delete(p.id));
    frozenSets.set(p.id, set);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const mockRepository: LihimRepository = {
  async getCurrentUser() {
    await delay(50);
    return clone(me);
  },

  async listMyGroups() {
    await delay();
    const list: GroupSummary[] = [...groups.values()].filter(isMember).map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      role: roleOf(g),
      openPollsCount: [...polls.values()].filter((p) => p.groupId === g.id && p.status === "open").length,
    }));
    return list;
  },

  async getGroup(groupId) {
    await delay();
    const g = groups.get(groupId);
    return g && isMember(g) ? toGroup(g) : null;
  },

  async createGroup(input) {
    await delay(600);
    // Like the real flow: the browser picks groups.id (uuid) before create_group (D1).
    const id = crypto.randomUUID();
    addGroup({
      id,
      chainGroupId: String(30 + idSeq),
      name: input.name.trim(),
      description: input.description.trim(),
      minMembers: Math.max(5, input.minMembers),
      createdAt: new Date().toISOString(),
      createdByName: me.displayName,
      adminUserId: me.userId,
      memberUserIds: new Set([me.userId]),
      roster: [
        { id: nextId("mem"), displayName: me.displayName, joinedAt: new Date().toISOString(), status: "active", isAdmin: true },
      ],
    });
    return toGroup(groups.get(id)!);
  },

  async getMembers(groupId) {
    await delay();
    const g = requireAdmin(groupId);
    return clone(g.roster.filter((m) => m.status === "active"));
  },

  async removeMember(groupId, memberId) {
    await delay(400);
    const g = requireAdmin(groupId);
    const m = g.roster.find((x) => x.id === memberId);
    if (!m) throw new NotFoundError("Member not found");
    if (m.isAdmin) throw new ForbiddenError("The admin can't be removed");
    m.status = "removed";
    syncCount(g);
  },

  async addPendingMembers(groupId) {
    await delay(200);
    requireAdmin(groupId);
    // Mock joins land instantly (redeemInvite bumps memberCount), so nothing is ever queued.
    return 0;
  },

  async createInvite(groupId, input) {
    await delay(300);
    requireAdmin(groupId);
    const token = `inv-${Math.random().toString(36).slice(2, 10)}`;
    const hours = input?.expiresInHours ?? 24 * 7;
    const invite = {
      id: nextId("inv"),
      groupId,
      token,
      url: `/join/${token}`,
      maxUses: input?.maxUses ?? null,
      uses: 0,
      expiresAt: hours === null ? null : new Date(Date.now() + hours * HOUR).toISOString(),
      valid: true,
    };
    invites.set(token, invite);
    const { valid: _v, ...out } = invite;
    return clone(out);
  },

  async getInvitePreview(token) {
    await delay();
    const inv = invites.get(token);
    if (!inv) return null;
    const g = groups.get(inv.groupId);
    if (!g) return null;
    const preview: InvitePreview = {
      token,
      groupId: g.id,
      groupName: g.name,
      description: g.description,
      memberCount: g.memberCount,
      createdByName: g.createdByName,
      expiresAt: inv.expiresAt,
      valid: inv.valid,
      alreadyMember: isMember(g),
    };
    return preview;
  },

  async redeemInvite(token) {
    await delay(900);
    const inv = invites.get(token);
    if (!inv || !inv.valid) throw new InviteError();
    const g = groups.get(inv.groupId);
    if (!g) throw new InviteError();
    if (!isMember(g)) {
      g.memberUserIds.add(me.userId);
      g.roster.push({ id: nextId("mem"), displayName: me.displayName, joinedAt: new Date().toISOString(), status: "active", isAdmin: false });
      syncCount(g);
      inv.uses += 1;
    }
    return { groupId: g.id };
  },

  async listPolls(groupId) {
    await delay();
    const g = requireGroup(groupId);
    const admin = roleOf(g) === "admin";
    return [...polls.values()]
      .filter((p) => p.groupId === groupId && (admin || p.status !== "draft"))
      .sort((a, b) => b.opensAt.localeCompare(a.opensAt))
      .map(toPoll);
  },

  async getPoll(pollId) {
    await delay();
    const p = polls.get(pollId);
    if (!p) return null;
    const g = groups.get(p.groupId);
    if (!g || !isMember(g)) return null;
    if (p.status === "draft" && roleOf(g) !== "admin") return null;
    return toPoll(p);
  },

  async createPoll(input) {
    await delay(700);
    const g = requireAdmin(input.groupId);
    if (g.memberCount < g.minMembers) throw new SmallGroupError(g.memberCount, g.minMembers);
    const options =
      input.kind === "yesno"
        ? YES_NO_OPTIONS
        : input.kind === "rating"
          ? RATING_OPTIONS
          : singleOptions((input.optionLabels ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 8));
    if (input.kind === "single" && options.length < 2) throw new Error("A single-choice poll needs at least 2 options");
    const id = nextId("poll");
    const seed = idSeq;
    addPoll({
      id,
      seed,
      groupId: g.id,
      title: input.title.trim(),
      kind: input.kind,
      options: clone(options),
      opensAt: new Date().toISOString(),
      closesAt: input.closesAt,
      hideLiveTally: input.hideLiveTally,
      frozenSize: g.memberCount,
      status: "open",
      ledger: [],
    });
    return toPoll(polls.get(id)!);
  },

  async getFrozenCommitments(pollId) {
    await delay(150);
    const p = polls.get(pollId);
    if (!p) throw new NotFoundError("Poll not found");
    const g = requireGroup(p.groupId);
    if (p.status === "draft") return [];
    return [...(await frozenCommitmentsOf(p, g))];
  },

  async getResults(pollId) {
    await delay();
    const p = polls.get(pollId);
    if (!p) throw new NotFoundError("Poll not found");
    const hidden = p.status !== "closed" && p.hideLiveTally;
    const rows = hidden ? null : tallyOf(p);
    const result: PollResult = {
      pollId,
      status: p.status,
      votersCount: p.ledger.length,
      frozenSize: p.frozenSize,
      hidden,
      rows,
      average: hidden ? null : averageOf(p),
      leadingValues: rows ? leadingOf(rows) : [],
    };
    return result;
  },

  async getPollAudit(pollId) {
    await delay(350);
    const p = polls.get(pollId);
    if (!p || p.status !== "closed" || !p.chainPollId || !p.frozenRoot) return null;
    const g = groups.get(p.groupId)!;
    const audit: PollAudit = {
      pollId,
      chainPollId: p.chainPollId,
      groupName: g.name,
      title: p.title,
      kind: p.kind,
      options: clone(p.options),
      closedAt: p.closesAt,
      frozenRoot: p.frozenRoot,
      frozenSize: p.frozenSize,
      votersCount: p.ledger.length,
      tally: tallyOf(p),
      rows: clone(p.ledger),
      contractId: "CDLIHIMPOLLSDEMOCONTRACTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    };
    return audit;
  },
};
