/**
 * Data access for the Lihim app. Screens import `repo` from here and nothing else —
 * never a concrete implementation.
 *
 * Implementation is picked at build time by NEXT_PUBLIC_DATA:
 * - "mock" (default): lib/data/mock.ts, in-memory demo data.
 * - "supabase": lib/data/supabase.ts — a SKELETON against the RLS'd tables/RPCs/views in
 *   supabase/README.md. Needs @supabase/supabase-js (not installed yet; see that file).
 * Admin mutations (createGroup, createPoll) sign in the browser with the per-group admin key
 * and go through the `submit-admin-tx` Edge Function.
 *
 * The vote path is NOT here on purpose: it goes through lib/vote.ts → lib/relay.ts
 * (plain fetch, separate origin, no session). `getFrozenCommitments` is public-record data
 * the prover needs; it never involves the viewer's identity.
 */
import { mockRepository } from "./mock";
import type {
  CreateGroupInput,
  CreateInviteInput,
  CreatePollInput,
  CurrentUser,
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

  /** Groups the viewer belongs to (admin or member), most recently active first. */
  listMyGroups(): Promise<GroupSummary[]>;
  /** null when not found or the viewer isn't a member. */
  getGroup(groupId: string): Promise<Group | null>;
  createGroup(input: CreateGroupInput): Promise<Group>;

  /** Admin only — rejects with ForbiddenError otherwise. Active members, admin first. */
  getMembers(groupId: string): Promise<Member[]>;
  /**
   * Admin only. Off-chain deactivation (D5): roster, invites, push and future polls. The
   * member's leaf stays in the on-chain tree (removing it needs their commitment, which only
   * they know), so it does not shrink the anonymity set.
   */
  removeMember(groupId: string, memberId: string): Promise<void>;

  /** Admin only. */
  createInvite(groupId: string, input?: CreateInviteInput): Promise<Invite>;
  /** Public-ish (anyone holding the token). null when the token is unknown. */
  getInvitePreview(token: string): Promise<InvitePreview | null>;
  /**
   * Joins the viewer to the invite's group. The real flow derives the per-group
   * Semaphore identity client-side and registers only its commitment.
   * Rejects with InviteError when expired/used up.
   */
  redeemInvite(token: string): Promise<{ groupId: string }>;

  /** All polls in a group, newest first (drafts only for admins). */
  listPolls(groupId: string): Promise<Poll[]>;
  getPoll(pollId: string): Promise<Poll | null>;
  /** Admin only. Rejects with SmallGroupError when memberCount < minMembers. */
  createPoll(input: CreatePollInput): Promise<Poll>;
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

// TODO: lib/data/supabase.ts is not written yet; NEXT_PUBLIC_DATA=supabase falls back to mock until it is.
export const repo: LihimRepository = mockRepository;
