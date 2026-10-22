/**
 * App-side data shapes. These mirror the Supabase tables/views (supabase/migrations)
 * in camelCase; the future lib/data/supabase.ts maps rows into them.
 *
 * Conventions:
 * - Timestamps are ISO-8601 strings (UTC). Format with lib/format.ts.
 * - Chain ids (u64) are decimal strings — they can exceed Number.MAX_SAFE_INTEGER.
 * - Field elements shown to users (roots, nullifiers) are 0x-prefixed 64-char hex strings.
 *
 * Privacy invariants (lihim-SPEC.md → "Never stored anywhere in Supabase"):
 * nothing here links a user to a vote, a nullifier or a commitment. Don't add such fields.
 */

export type ISODateString = string;
/** u64 as decimal string. */
export type ChainId = string;
/** 0x + 64 lowercase hex chars. */
export type Hex32 = string;

export type GroupRole = "admin" | "member";

export interface CurrentUser {
  userId: string;
  displayName: string;
}

/** Row in "your groups" lists / the group switcher. */
export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
  role: GroupRole;
  openPollsCount: number;
}

export interface Group {
  /**
   * Supabase groups.id (uuid), generated in the browser before create_group. The identity and
   * admin keys are derived from THIS id ("lihim/sem/" / "lihim/admin/" + id, orchestrator D1).
   */
  id: string;
  /** LihimSemaphore group id (u64). Used in the admin signature digest, not in key derivation. Null while the create tx is pending. */
  chainGroupId: ChainId | null;
  name: string;
  description: string;
  /** Polls can't open below this frozen size (default 8, min 5). */
  minMembers: number;
  /** Maintained by the indexer from member events; the only member info non-admins get. */
  memberCount: number;
  createdAt: ISODateString;
  createdByName: string;
  /** The viewer's role in this group. */
  role: GroupRole;
}

/** Admin-only roster row (RLS: admin sees all rows, members only their own). No commitment. */
export interface Member {
  id: string;
  displayName: string;
  joinedAt: ISODateString;
  status: "active" | "removed";
  isAdmin: boolean;
}

export interface Invite {
  id: string;
  groupId: string;
  /** Raw token; only the admin ever sees it (the DB stores token_hash). */
  token: string;
  url: string;
  maxUses: number | null;
  uses: number;
  expiresAt: ISODateString | null;
}

/**
 * The group's current invite link as read back later (P3: invite sheet shows uses + expiry and
 * "Turn off this link"). The DB keeps only token_hash, so the raw link is known only on the
 * device that made it: `token`/`url` are null elsewhere, and the sheet offers "Make a new link".
 */
export interface ActiveInvite extends Omit<Invite, "token" | "url"> {
  token: string | null;
  url: string | null;
}

/** What L2 shows before joining. Readable without membership. */
export interface InvitePreview {
  token: string;
  /**
   * Supabase groups.id (uuid). Also the group id in the identity HKDF info
   * ("lihim/sem/" + groupId, orchestrator D1), so L2 can derive the commitment before joining.
   */
  groupId: string;
  groupName: string;
  description: string;
  memberCount: number;
  createdByName: string;
  expiresAt: ISODateString | null;
  /** false → expired or used up. */
  valid: boolean;
  alreadyMember: boolean;
}

export type PollKind = "single" | "yesno" | "rating";

/**
 * Stored status. "Closing soon" is derived for display — see lib/poll.ts.
 * "draft" is NOT a saved-for-later poll (P6: there is no save-as-draft): it is a poll whose
 * create transaction is still pending or has failed. `Poll.openState` tells which.
 */
export type PollStatus = "draft" | "open" | "closed";

/**
 * P6, admin only, `status === "draft"` only: "pending" while the create transaction is in flight
 * (L3 "Opening…"), "failed" when it didn't land (L3 "Didn't open · Try again"). null otherwise.
 */
export type PollOpenState = "pending" | "failed";

export interface PollOption {
  /**
   * The Semaphore message for this answer (build contract §5):
   * single → 0-based index; yesno → 0 = Yes, 1 = No; rating → 1..=5.
   */
  value: number;
  label: string;
}

export interface Poll {
  id: string;
  /** LihimPolls poll id (u64). Also the Semaphore scope. Null while draft/pending. */
  chainPollId: ChainId | null;
  groupId: string;
  title: string;
  kind: PollKind;
  /** Always populated, including the implicit Yes/No and 1–5 options. */
  options: PollOption[];
  opensAt: ISODateString;
  closesAt: ISODateString;
  /** UI-only hiding of live tallies while open (MVP; not cryptographically sealed). */
  hideLiveTally: boolean;
  /** Answers so far (indexer). Turnout is safe to show live. */
  votersCount: number;
  /** Members frozen at open — the anonymity set and the turnout denominator. */
  frozenSize: number;
  status: PollStatus;
  /** P6: pending vs failed for drafts (admin only); null for open/closed polls. */
  openState: PollOpenState | null;
  /** Group root frozen at open. Null for drafts. */
  frozenRoot: Hex32 | null;
}

export interface PollResultRow extends PollOption {
  count: number;
}

export interface PollResult {
  pollId: string;
  status: PollStatus;
  votersCount: number;
  frozenSize: number;
  /** True while open with hideLiveTally — rows/average are then null. */
  hidden: boolean;
  rows: PollResultRow[] | null;
  /** Rating polls only: mean of answers, null when hidden or no answers. */
  average: number | null;
  /** Values of the leading option(s); several on a tie, empty when no answers/hidden. */
  leadingValues: number[];
  /**
   * When the cached tally/turnout last changed (indexer runs every minute). L7's freshness line
   * ("Updated a minute ago"). null when unknown (e.g. nothing indexed yet).
   */
  updatedAt: ISODateString | null;
}

/** One answer on the public record. `nullifier` is shown as a "receipt" on L9 only. */
export interface AuditRow {
  nullifier: Hex32;
  /** Option value (same space as PollOption.value). */
  choice: number;
}

/** Public, closed polls only (public_poll_audit view, or rebuilt from Stellar RPC). */
export interface PollAudit {
  pollId: string;
  chainPollId: ChainId;
  groupName: string;
  title: string;
  kind: PollKind;
  options: PollOption[];
  closedAt: ISODateString;
  frozenRoot: Hex32;
  frozenSize: number;
  votersCount: number;
  /** Recounted from rows, in option order. */
  tally: PollResultRow[];
  rows: AuditRow[];
  contractId: string;
}

export interface CreateGroupInput {
  name: string;
  description: string;
  minMembers: number;
}

export interface CreateInviteInput {
  maxUses?: number | null;
  /** Hours until expiry; null = never. */
  expiresInHours?: number | null;
}

export interface GetMembersOptions {
  /** Also return `status: "removed"` rows (L4's collapsed "Removed (n)" section). Default false. */
  includeRemoved?: boolean;
}

export interface CreatePollInput {
  groupId: string;
  title: string;
  kind: PollKind;
  /** Labels for single-choice polls (2–8). Ignored for yesno/rating. */
  optionLabels?: string[];
  closesAt: ISODateString;
  hideLiveTally: boolean;
}
