/**
 * Data access for the Lihim app. Screens import `repo` from here and nothing else —
 * never a concrete implementation.
 *
 * Implementation is picked at build time by NEXT_PUBLIC_DATA:
 * - "mock" (default): lib/data/mock.ts, in-memory demo data.
 * - "supabase": lib/data/supabase.ts, against the RLS'd tables/RPCs/views in supabase/README.md.
 * Admin mutations (createGroup, createPoll, retryPoll, addPendingMembers) sign in the browser with the per-group
 * admin key and go through the `submit-admin-tx` Edge Function.
 *
 * Session (P1): screens don't call signIn/signUp/signOut/updateDisplayName directly — use the
 * wrappers in lib/session.ts, which also update the shell (sidebar name, auth gate).
 *
 * The vote path is NOT here on purpose: it goes through lib/vote.ts → lib/relay.ts
 * (plain fetch, separate origin, no session). `getFrozenCommitments` is public-record data
 * the prover needs; it never involves the viewer's identity.
 */
import { env } from "../env";
import { mockRepository } from "./mock";
import { supabaseRepository } from "./supabase";
import type {
  ActiveInvite,
  CreateGroupInput,
  CreateInviteInput,
  CreatePollInput,
  CurrentUser,
  GetMembersOptions,
  Group,
  GroupSummary,
  Invite,
  InvitePreview,
  Member,
  Poll,
  PollAudit,
  PollResult,
} from "./types";

export * from "./types";
export * from "./errors";

export interface LihimRepository {
  /** Signed-in user, or null. */
  getCurrentUser(): Promise<CurrentUser | null>;
  /**
   * L0 "Sign in with passkey": one WebAuthn prompt signs in AND unlocks the group identities
   * (PRF, kept in memory by lib/identity.ts). Rejects with PasskeyCancelledError,
   * PasskeyNotFoundError or PasskeyUnsupportedError (lib/data/errors.ts).
   */
  signIn(): Promise<CurrentUser>;
  /**
   * L0 "New here? Create an account" (and L2 for a signed-out visitor): creates the passkey, the
   * account and the session. `displayName` is asked once (P5); only admins of groups the user
   * joins see it. Same rejections as signIn.
   */
  signUp(displayName: string): Promise<CurrentUser>;
  /** L10 "Sign out". Forgets the session and the in-memory PRF output. The passkey stays on the device. */
  signOut(): Promise<void>;
  /** L10 "Your name". Also updates the name admins see on every roster the user is on. */
  updateDisplayName(displayName: string): Promise<CurrentUser>;

  /** Groups the viewer belongs to (admin or member), most recently active first. */
  listMyGroups(): Promise<GroupSummary[]>;
  /** null when not found or the viewer isn't a member. */
  getGroup(groupId: string): Promise<Group | null>;
  createGroup(input: CreateGroupInput): Promise<Group>;

  /**
   * Admin only — rejects with ForbiddenError otherwise. Active members, admin first; with
   * `{ includeRemoved: true }` the `status: "removed"` rows follow (L4's collapsed "Removed (n)").
   */
  getMembers(groupId: string, options?: GetMembersOptions): Promise<Member[]>;
  /**
   * Admin only. Off-chain deactivation (D5): roster, invites, push and future polls. The
   * member's leaf stays in the on-chain tree (removing it needs their commitment, which only
   * they know), so it does not shrink the anonymity set.
   */
  removeMember(groupId: string, memberId: string): Promise<void>;
  /**
   * Admin only. Signs `add_members` for every queued commitment (shuffled, in MAX_BATCH chunks)
   * so new members land in the on-chain tree. Also queues the admin's own commitment if it
   * isn't on-chain yet. Resolves to the number of commitments sent (0 when the queue is empty).
   */
  addPendingMembers(groupId: string): Promise<number>;
  /**
   * Admin only. How many joins are waiting for addPendingMembers (L4 "Adding 3 new members…").
   * May include the admin's own commitment while the group is new.
   */
  countPendingMembers(groupId: string): Promise<number>;
  /**
   * Member (not the admin — ForbiddenError) leaves the group (P3). Off-chain, same limitation as
   * removeMember (D5): roster, push and future polls stop, but the member's leaf stays in the
   * on-chain tree, so the anonymity set doesn't shrink and answers already given stay counted.
   * Rejoining needs a new invite link.
   */
  leaveGroup(groupId: string): Promise<void>;

  /** Admin only. */
  createInvite(groupId: string, input?: CreateInviteInput): Promise<Invite>;
  /**
   * Admin only. The newest invite that still works (not expired, not used up, not turned off),
   * or null. See ActiveInvite: the raw link may be unknown on this device.
   */
  getActiveInvite(groupId: string): Promise<ActiveInvite | null>;
  /** Admin only (P3 "Turn off this link"). Anyone holding the link can no longer join. Idempotent. */
  revokeInvite(inviteId: string): Promise<void>;
  /** Public-ish (anyone holding the token). null when the token is unknown. */
  getInvitePreview(token: string): Promise<InvitePreview | null>;
  /**
   * Joins the viewer to the invite's group. The real flow derives the per-group
   * Semaphore identity client-side and registers only its commitment.
   * Rejects with InviteError when expired/used up.
   */
  redeemInvite(token: string): Promise<{ groupId: string }>;

  /** All polls in a group, newest first (drafts — Opening / Didn't open, P6 — only for admins). */
  listPolls(groupId: string): Promise<Poll[]>;
  getPoll(pollId: string): Promise<Poll | null>;
  /**
   * Admin only. Rejects with SmallGroupError when memberCount < minMembers. Resolves as soon as
   * the create transaction is sent: the poll may come back `status: "draft"` with
   * `openState: "pending"` (L3 shows "Opening…") and turns "open" once it lands. If sending
   * fails it rejects, and the poll is left as a draft with `openState: "failed"`.
   */
  createPoll(input: CreatePollInput): Promise<Poll>;
  /**
   * Admin only, P6 "Try again" on a draft with `openState: "failed"`: re-signs and resends the
   * create transaction with the SAME poll id. Resolves to the poll (pending or open). Rejects with
   * PollClosingPassedError when the closing time has passed (offer Discard instead).
   */
  retryPoll(pollId: string): Promise<Poll>;
  /** Admin only, P6 "Discard" on a failed draft. Members never saw it. Rejects while it's still opening. */
  discardPoll(pollId: string): Promise<void>;
  /**
   * The poll's frozen member set: every leaf commitment of the group tree when the poll
   * opened, in leaf order (removed leaves as 0n). The prover rebuilds the Merkle tree from it,
   * so it must hash to `poll.frozenRoot`. Public-record data; [] for drafts.
   */
  getFrozenCommitments(pollId: string): Promise<bigint[]>;
  /** Respects hideLiveTally: `hidden: true` and null rows while open. */
  getResults(pollId: string): Promise<PollResult>;
  /** Public (no login). Closed polls only; null otherwise. */
  getPollAudit(pollId: string): Promise<PollAudit | null>;
}

export const repo: LihimRepository = env.data === "supabase" ? supabaseRepository : mockRepository;
