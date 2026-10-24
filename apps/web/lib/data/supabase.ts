/**
 * LihimRepository over Supabase (NEXT_PUBLIC_DATA=supabase). Reads go through the RLS'd tables,
 * RPCs and views in supabase/migrations; admin chain actions are signed here in the browser with
 * the per-group admin key and relayed by the `submit-admin-tx` Edge Function (supabase/README.md
 * → Flows). Votes never come through here (lib/vote.ts → lib/relay.ts).
 *
 * Privacy (lihim-SPEC.md → "Never stored anywhere in Supabase"): the only identity material that
 * leaves the browser is a member's commitment (submit_commitment, unlinked by design) and the
 * admin's PUBLIC key. prf_out, identity secrets and admin private keys stay in lib/identity.ts.
 *
 * Sign in / sign up (P1) run the passkey ceremony in lib/passkey.ts against the `auth-passkey`
 * Edge Function; the PRF output from the same prompt goes to lib/identity.ts (setPrfOutput).
 * After a full reload supabase-js restores the session but prf_out is gone (memory only), so
 * db() registers unlockPrf: one local passkey prompt, limited to the viewer's own passkeys.
 * Actions that need a key call ensurePrfOutput() first, so the prompt follows the tap directly.
 */
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminTxBody, LihimNetwork } from "@lihim/sdk";
import { env } from "../env";
import { toHex32 } from "../format";
import {
  PasskeyRequiredError,
  ensurePrfOutput,
  groupAdminKey,
  groupIdentity,
  loadSdk,
  setPrfOutput,
  setPrfUnlocker,
} from "../identity";
import { passkeySignIn, passkeySignUp, passkeyUnlock, type OwnCredential, type PasskeyResult } from "../passkey";
import type { LihimRepository } from "./index";
import { ForbiddenError, InviteError, NotFoundError, PollClosingPassedError, PollNotOpenedError, SmallGroupError } from "./errors";
import type {
  ActiveInvite,
  CurrentUser,
  Group,
  GroupRole,
  Invite,
  Member,
  Poll,
  PollAudit,
  PollKind,
  PollOpenState,
  PollOption,
  PollResult,
  PollResultRow,
  PollStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!client) {
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for NEXT_PUBLIC_DATA=supabase");
    }
    client = createClient(env.supabaseUrl, env.supabaseAnonKey);
    setPrfUnlocker(unlockPrf);
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // prf_out must not outlive the session that unlocked it (shared devices).
        setPrfOutput(null);
        ownCredentials = null;
        credentialsLoad = null;
      } else if (session && ownCredentials?.userId !== session.user.id) {
        // Deferred: supabase-js must not be called from inside this callback.
        const userId = session.user.id;
        setTimeout(() => void loadOwnCredentials(userId).catch(() => undefined), 0);
      }
    });
  }
  return client;
}

/**
 * The viewer's passkeys, loaded when a session appears and kept in memory so the unlock prompt
 * can open straight from a tap, with no fetch in between (Safari needs the gesture to be recent).
 */
let ownCredentials: { userId: string; credentials: OwnCredential[] } | null = null;
/** The load in flight, shared: supabase-js fires several auth events on startup (one fetch, not two). */
let credentialsLoad: { userId: string; promise: Promise<OwnCredential[]> } | null = null;

function loadOwnCredentials(userId: string): Promise<OwnCredential[]> {
  if (credentialsLoad?.userId === userId) return credentialsLoad.promise;
  const load = (async () => {
    const credentials = rowsOf(
      await db().from("passkey_credentials").select("credential_id, transports").eq("user_id", userId).returns<OwnCredential[]>(),
    );
    ownCredentials = { userId, credentials };
    return credentials;
  })();
  const promise = load.finally(() => {
    if (credentialsLoad?.promise === promise) credentialsLoad = null;
  });
  credentialsLoad = { userId, promise };
  return promise;
}

/** identity.ts's unlocker: prf_out again after a reload, from one of the viewer's own passkeys. */
async function unlockPrf(): Promise<Uint8Array> {
  const { data } = await db().auth.getSession();
  const viewer = data.session?.user.id;
  if (!viewer) throw new PasskeyRequiredError();
  const cached = ownCredentials?.userId === viewer ? ownCredentials.credentials : [];
  const credentials = cached.length > 0 ? cached : await loadOwnCredentials(viewer);
  if (credentials.length === 0) throw new PasskeyRequiredError();
  return passkeyUnlock(credentials);
}

function network(): LihimNetwork {
  return {
    rpcUrl: env.stellarRpcUrl,
    networkPassphrase: env.stellarNetworkPassphrase,
    semaphoreContractId: env.semaphoreContractId,
    pollsContractId: env.pollsContractId,
    verifierContractId: "",
  };
}

async function uid(): Promise<string> {
  const { data } = await db().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ForbiddenError("Sign in first");
  return id;
}

/** Throws the PostgREST error; RLS "no rows" is not an error and is handled by callers. */
function check<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** List form of `check`: rows hidden by RLS simply aren't there. */
function rowsOf<T>(res: { data: T[] | null; error: PostgrestError | null }): T[] {
  return check(res) ?? [];
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface GroupRow {
  id: string;
  chain_group_id: number | string | null;
  name: string;
  description: string;
  admin_user_id: string;
  min_members: number;
  member_count: number;
  created_at: string;
}

interface PollRow {
  id: string;
  chain_poll_id: number | string | null;
  group_id: string;
  title: string;
  kind: PollKind;
  options: string[] | null;
  opens_at: string | null;
  closes_at: string;
  hide_live_tally: boolean;
  voters_count: number;
  frozen_size: number | null;
  status: PollStatus;
  frozen_root: string | null;
  created_at: string;
}

const GROUP_COLS = "id, chain_group_id, name, description, admin_user_id, min_members, member_count, created_at";
const POLL_COLS =
  "id, chain_poll_id, group_id, title, kind, options, opens_at, closes_at, hide_live_tally, voters_count, frozen_size, status, frozen_root, created_at";

const str = (v: number | string | null): string | null => (v === null ? null : String(v));

/** Option values follow the vote message (types.ts PollOption): 0-based, ratings 1..=5. */
function optionsOf(kind: PollKind, labels: string[] | null): PollOption[] {
  if (kind === "rating") return [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));
  return (labels ?? (kind === "yesno" ? ["Yes", "No"] : [])).map((label, value) => ({ value, label }));
}

/** Labels stored in polls.options and hashed into meta_hash. */
function optionLabelsFor(kind: PollKind, labels: string[] | undefined): string[] | null {
  if (kind === "rating") return null;
  if (kind === "yesno") return ["Yes", "No"];
  return (labels ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 8);
}

function toGroup(g: GroupRow, viewer: string, adminName: string): Group {
  return {
    id: g.id,
    chainGroupId: str(g.chain_group_id),
    name: g.name,
    description: g.description,
    minMembers: g.min_members,
    memberCount: g.member_count,
    createdAt: g.created_at,
    createdByName: adminName,
    role: g.admin_user_id === viewer ? "admin" : "member",
  };
}

/** `openStates` comes from poll_open_states (admin only); drafts without an entry read as pending. */
function toPoll(p: PollRow, openStates?: Map<string, PollOpenState>): Poll {
  return {
    id: p.id,
    chainPollId: str(p.chain_poll_id),
    groupId: p.group_id,
    title: p.title,
    kind: p.kind,
    options: optionsOf(p.kind, p.options),
    opensAt: p.opens_at ?? p.created_at,
    closesAt: p.closes_at,
    hideLiveTally: p.hide_live_tally,
    votersCount: p.voters_count,
    frozenSize: p.frozen_size ?? 0,
    status: p.status,
    openState: p.status === "draft" ? (openStates?.get(p.id) ?? "pending") : null,
    frozenRoot: p.frozen_root ? toHex32(p.frozen_root) : null,
  };
}

/**
 * P6: pending vs failed for a group's drafts. pending_txs is service-role only, so the
 * poll_open_states RPC derives it (admin only; see the lifecycle migration).
 */
async function openStatesOf(groupId: string): Promise<Map<string, PollOpenState>> {
  const { data, error } = await db().rpc("poll_open_states", { group_id: groupId });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { poll_id: string; open_state: PollOpenState }[]).map((r) => [r.poll_id, r.open_state]));
}

// ---------------------------------------------------------------------------
// Session + invite links remembered on this device
// ---------------------------------------------------------------------------

async function startSession({ session, prfOutput }: PasskeyResult): Promise<CurrentUser> {
  const { error } = await db().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw new Error(error.message);
  setPrfOutput(prfOutput);
  const user = await supabaseRepository.getCurrentUser();
  if (!user) throw new Error("Signed in, but no session was stored");
  return user;
}

/**
 * The DB keeps only token_hash, so the raw link an admin made is remembered on that device
 * (invite id → token) for the invite sheet's "Copy link". Their own link; nothing about votes.
 */
const INVITE_TOKENS_KEY = "lihim:invite-tokens:v1";

function readInviteTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(INVITE_TOKENS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberInviteToken(inviteId: string, token: string) {
  try {
    localStorage.setItem(INVITE_TOKENS_KEY, JSON.stringify({ ...readInviteTokens(), [inviteId]: token }));
  } catch {
    // Storage blocked: the link just can't be shown again later on this device.
  }
}

/** invites.max_uses is NOT NULL; createInvite stores this for "no limit". */
const NO_LIMIT_USES = 10_000;

function leadingOf(rows: PollResultRow[]): number[] {
  const max = Math.max(0, ...rows.map((r) => r.count));
  return max === 0 ? [] : rows.filter((r) => r.count === max).map((r) => r.value);
}

/** The admin's display name: members can only read their own roster row, so others get "". */
async function adminNameOf(g: GroupRow, viewer: string): Promise<string> {
  if (g.admin_user_id !== viewer) return "";
  const res = await db().from("profiles").select("display_name").eq("id", viewer).maybeSingle();
  return (res.data?.display_name as string | undefined) ?? "";
}

async function groupRow(groupId: string): Promise<GroupRow | null> {
  return check(await db().from("groups").select(GROUP_COLS).eq("id", groupId).maybeSingle<GroupRow>());
}

async function requireAdmin(groupId: string): Promise<GroupRow & { chain_group_id: number | string }> {
  const viewer = await uid();
  const g = await groupRow(groupId);
  if (!g) throw new NotFoundError("Group not found");
  if (g.admin_user_id !== viewer) throw new ForbiddenError();
  if (g.chain_group_id === null) throw new Error("The group is still being created on-chain");
  return g as GroupRow & { chain_group_id: number | string };
}

// ---------------------------------------------------------------------------
// Admin transactions (signed here, relayed by submit-admin-tx)
// ---------------------------------------------------------------------------

const toBase64Xdr = async (args: Parameters<Awaited<ReturnType<typeof loadSdk>>["vec"]>[0]) =>
  (await loadSdk()).vec(args).toXDR("base64");

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * POST to submit-admin-tx. `build` re-reads the nonce / next_group_id on every call, so a
 * `409 stale_signature` is answered by re-signing (SDK submitAdminTx retries it).
 */
async function sendAdminTx(build: () => Promise<AdminTxBody>) {
  const sdk = await loadSdk();
  const { data } = await db().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new ForbiddenError("Sign in first");
  try {
    return await sdk.submitAdminTx({
      url: `${env.supabaseUrl}/functions/v1/submit-admin-tx`,
      accessToken,
      apiKey: env.supabaseAnonKey,
      build,
    });
  } catch (e) {
    if (e instanceof sdk.AdminTxError && e.code === "forbidden") throw new ForbiddenError(e.message);
    if (e instanceof sdk.AdminTxError && e.code === "not_found") throw new NotFoundError(e.message);
    throw e;
  }
}

function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0]! % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}

function randomToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const INVITE_ERRORS = new Set(["invite_not_found", "invite_expired", "invite_used_up", "membership_removed", "group_not_ready"]);

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const supabaseRepository: LihimRepository = {
  async getCurrentUser() {
    const { data } = await db().auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const profile = await db().from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    return { userId: user.id, displayName: (profile.data?.display_name as string | undefined) ?? "" };
  },

  async signIn() {
    return startSession(await passkeySignIn());
  },

  async signUp(displayName) {
    const name = displayName.trim();
    if (!name) throw new Error("Display name required");
    return startSession(await passkeySignUp(name));
  },

  async signOut() {
    await db().auth.signOut();
    // onAuthStateChange clears it too; do it here so it can't be missed.
    setPrfOutput(null);
  },

  async updateDisplayName(displayName) {
    await uid();
    const { error } = await db().rpc("update_display_name", { display_name: displayName.trim() });
    if (error) throw new Error(error.message);
    const user = await this.getCurrentUser();
    if (!user) throw new ForbiddenError("Sign in first");
    return user;
  },

  async listMyGroups() {
    const viewer = await uid();
    const groups = rowsOf(await db().from("groups").select(GROUP_COLS).returns<GroupRow[]>());
    const open = rowsOf(
      await db().from("polls").select("group_id").eq("status", "open").returns<{ group_id: string }[]>(),
    );
    return groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.member_count,
        role: (g.admin_user_id === viewer ? "admin" : "member") as GroupRole,
        openPollsCount: open.filter((p) => p.group_id === g.id).length,
      }))
      .sort((a, b) => b.openPollsCount - a.openPollsCount);
  },

  async getGroup(groupId) {
    const viewer = await uid();
    const g = await groupRow(groupId);
    return g ? toGroup(g, viewer, await adminNameOf(g, viewer)) : null;
  },

  async createGroup(input) {
    await ensurePrfOutput();
    const viewer = await uid();
    const sdk = await loadSdk();
    // The browser picks groups.id: both per-group keys are derived from it (D1).
    const id = sdk.newGroupUuid();
    const admin = await groupAdminKey(id);
    const semaphore = new sdk.LihimSemaphoreClient(network());

    await sendAdminTx(async () => {
      // Predicted on-chain id; a 409 stale_signature means it was taken, so re-read and re-sign.
      const chainGroupId = await semaphore.getNextGroupId();
      const args = sdk.signedAdminArgs(
        {
          contractId: semaphore.contractId,
          fnTag: "create_group",
          chainGroupId,
          nonce: 0n,
          args: sdk.adminArgs.create_group(admin.publicKey),
          leadingArgs: [],
        },
        admin,
      );
      return {
        action: "create_group",
        group_id: id,
        args_xdr: await toBase64Xdr(args),
        group: {
          name: input.name.trim(),
          description: input.description.trim(),
          min_members: input.minMembers,
          admin_pubkey: hex(admin.publicKey),
        },
      };
    });

    // The admin's own commitment joins like everyone else's (queued, then batched and shuffled
    // by addPendingMembers), so leaf 0 is not publicly "the admin". Fails while the create tx
    // is still pending; addPendingMembers queues it later in that case.
    await queueOwnCommitment(id).catch(() => undefined);

    const g = await groupRow(id);
    if (g) return toGroup(g, viewer, await adminNameOf(g, viewer));
    return {
      id,
      chainGroupId: null,
      name: input.name.trim(),
      description: input.description.trim(),
      minMembers: input.minMembers,
      memberCount: 0,
      createdAt: new Date().toISOString(),
      createdByName: "",
      role: "admin",
    };
  },

  async getMembers(groupId, options) {
    const g = await groupRow(groupId);
    if (!g) throw new NotFoundError("Group not found");
    if (g.admin_user_id !== (await uid())) throw new ForbiddenError();
    let query = db().from("group_members").select("user_id, display_name, joined_at, status").eq("group_id", groupId);
    if (!options?.includeRemoved) query = query.eq("status", "active");
    const rows = rowsOf(
      await query
        .order("joined_at")
        .returns<{ user_id: string; display_name: string; joined_at: string; status: Member["status"] }[]>(),
    );
    // Active first (admin on top), then removed.
    const rank = (m: Member) => (m.status === "removed" ? 2 : m.isAdmin ? 0 : 1);
    return rows
      .map((m) => ({
        id: m.user_id,
        displayName: m.display_name,
        joinedAt: m.joined_at,
        status: m.status,
        isAdmin: m.user_id === g.admin_user_id,
      }))
      .sort((a, b) => rank(a) - rank(b));
  },

  async removeMember(groupId, memberId) {
    // D5: off-chain deactivation only (see deactivate_member in the init migration).
    const { error } = await db().rpc("deactivate_member", { group_id: groupId, user_id: memberId });
    if (!error) return;
    if (error.message.includes("member_not_found")) throw new NotFoundError("Member not found");
    if (error.message.includes("cannot_remove_admin")) throw new ForbiddenError("The admin can't be removed");
    if (error.message.includes("not_group_admin")) throw new ForbiddenError();
    throw new Error(error.message);
  },

  async addPendingMembers(groupId) {
    await ensurePrfOutput();
    const g = await requireAdmin(groupId);
    await queueOwnCommitment(groupId).catch(() => undefined);
    const pending = rowsOf(
      await db().from("pending_commitments").select("commitment").eq("group_id", groupId).returns<{ commitment: string }[]>(),
    );
    if (pending.length === 0) return 0;

    const sdk = await loadSdk();
    const admin = await groupAdminKey(groupId);
    const semaphore = new sdk.LihimSemaphoreClient(network());
    const chainGroupId = BigInt(g.chain_group_id);
    // Shuffled so leaf order doesn't mirror join order.
    const commitments = shuffled([...new Set(pending.map((p) => BigInt(p.commitment)))]);
    // Chunks run one after another: each signs over the then-current nonce.
    for (const chunk of sdk.chunkCommitments(commitments)) {
      await sendAdminTx(async () => {
        const nonce = await semaphore.getNonce(chainGroupId);
        const args = sdk.signedAdminArgs(
          {
            contractId: semaphore.contractId,
            fnTag: "add_members",
            chainGroupId,
            nonce,
            args: sdk.adminArgs.add_members(chunk),
            leadingArgs: [sdk.u64(chainGroupId)],
          },
          admin,
        );
        return { action: "add_members", group_id: groupId, args_xdr: await toBase64Xdr(args) };
      });
    }
    return commitments.length;
  },

  async countPendingMembers(groupId) {
    const g = await groupRow(groupId);
    if (!g) throw new NotFoundError("Group not found");
    if (g.admin_user_id !== (await uid())) throw new ForbiddenError();
    const { count, error } = await db()
      .from("pending_commitments")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async leaveGroup(groupId) {
    // Off-chain, like removeMember (D5): see leave_group in the lifecycle migration.
    const { error } = await db().rpc("leave_group", { group_id: groupId });
    if (!error) return;
    if (error.message.includes("admin_cannot_leave")) throw new ForbiddenError("The admin can't leave the group");
    if (error.message.includes("not_a_member")) throw new NotFoundError("Group not found");
    throw new Error(error.message);
  },

  async createInvite(groupId, input) {
    await requireAdmin(groupId);
    const token = randomToken();
    const hours = input?.expiresInHours === undefined ? 24 * 7 : input.expiresInHours;
    const expiresAt = hours === null ? null : new Date(Date.now() + hours * 3_600_000).toISOString();
    const maxUses = input?.maxUses ?? NO_LIMIT_USES;
    const row = check(
      await db()
        .from("invites")
        .insert({ group_id: groupId, token_hash: await sha256Hex(token), max_uses: maxUses, expires_at: expiresAt })
        .select("id")
        .single<{ id: string }>(),
    );
    const invite: Invite = {
      id: row!.id,
      groupId,
      token,
      url: `/join/${encodeURIComponent(token)}`,
      maxUses: input?.maxUses ?? null,
      uses: 0,
      expiresAt,
    };
    rememberInviteToken(invite.id, token);
    return invite;
  },

  async getActiveInvite(groupId) {
    await requireAdmin(groupId);
    const rows = rowsOf(
      await db()
        .from("invites")
        .select("id, group_id, max_uses, uses, expires_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .returns<{ id: string; group_id: string; max_uses: number; uses: number; expires_at: string | null }[]>(),
    );
    const now = Date.now();
    const row = rows.find((r) => r.uses < r.max_uses && (r.expires_at === null || Date.parse(r.expires_at) > now));
    if (!row) return null;
    const token = readInviteTokens()[row.id] ?? null;
    const invite: ActiveInvite = {
      id: row.id,
      groupId: row.group_id,
      token,
      url: token ? `/join/${encodeURIComponent(token)}` : null,
      maxUses: row.max_uses >= NO_LIMIT_USES ? null : row.max_uses,
      uses: row.uses,
      expiresAt: row.expires_at,
    };
    return invite;
  },

  async revokeInvite(inviteId) {
    // "Turn off this link": expire it now. invite_preview/redeem_invite then report invite_expired.
    const rows = rowsOf(
      await db().from("invites").update({ expires_at: new Date().toISOString() }).eq("id", inviteId).select("id").returns<{ id: string }[]>(),
    );
    if (rows.length === 0) throw new NotFoundError("Invite not found");
  },

  async getInvitePreview(token) {
    const { data, error } = await db().rpc("invite_preview", { token });
    if (error) throw new Error(error.message);
    const row = (data as { group_id: string; group_name: string; member_count: number; invite_state: string }[] | null)?.[0];
    if (!row) return null;
    let alreadyMember = false;
    const { data: auth } = await db().auth.getSession();
    if (auth.session) {
      const own = await db()
        .from("group_members")
        .select("status")
        .eq("group_id", row.group_id)
        .eq("user_id", auth.session.user.id)
        .maybeSingle();
      alreadyMember = own.data?.status === "active";
    }
    // invite_preview exposes only what joining needs; description/creator/expiry stay private.
    return {
      token,
      groupId: row.group_id,
      groupName: row.group_name,
      description: "",
      memberCount: row.member_count,
      createdByName: "",
      expiresAt: null,
      valid: row.invite_state === "ok",
      alreadyMember,
    };
  },

  async redeemInvite(token) {
    // The commitment queued below needs the identity; prompt now, while the tap is fresh.
    await ensurePrfOutput();
    const viewer = await uid();
    const profile = await db().from("profiles").select("display_name").eq("id", viewer).maybeSingle();
    const displayName = ((profile.data?.display_name as string | undefined) ?? "").trim() || "Member";
    const { data: groupId, error } = await db().rpc("redeem_invite", { token, display_name: displayName });
    if (error) {
      const code = [...INVITE_ERRORS].find((c) => error.message.includes(c));
      if (code) throw new InviteError(code);
      throw new Error(error.message);
    }
    // A separate call, so nothing ties "this user joined" to the commitment in one transaction.
    await queueOwnCommitment(groupId as string);
    return { groupId: groupId as string };
  },

  async listPolls(groupId) {
    const rows = rowsOf(
      await db().from("polls").select(POLL_COLS).eq("group_id", groupId).order("created_at", { ascending: false }).returns<PollRow[]>(),
    );
    // Only admins can read drafts (RLS), so only they ever trigger the open-state lookup.
    const states = rows.some((r) => r.status === "draft") ? await openStatesOf(groupId) : undefined;
    return rows.map((r) => toPoll(r, states));
  },

  async getPoll(pollId) {
    const row = check(await db().from("polls").select(POLL_COLS).eq("id", pollId).maybeSingle<PollRow>());
    if (!row) return null;
    return toPoll(row, row.status === "draft" ? await openStatesOf(row.group_id) : undefined);
  },

  async createPoll(input) {
    await ensurePrfOutput();
    const g = await requireAdmin(input.groupId);
    if (g.member_count < g.min_members) throw new SmallGroupError(g.member_count, g.min_members);
    const labels = optionLabelsFor(input.kind, input.optionLabels);
    if (input.kind === "single" && (labels?.length ?? 0) < 2) throw new Error("A single-choice poll needs at least 2 options");
    // Same id on every retry (and on retryPoll), so a re-signed request updates the same draft row.
    const pollId = crypto.randomUUID();
    try {
      await sendCreatePoll(g, pollId, {
        title: input.title.trim(),
        kind: input.kind,
        labels,
        closesAt: input.closesAt,
        hideLiveTally: input.hideLiveTally,
      });
    } catch (e) {
      // submit-admin-tx writes the draft row before sending: if it exists, it's now "Didn't open".
      const draft = await this.getPoll(pollId).catch(() => null);
      if (draft?.status === "draft") throw new PollNotOpenedError(pollId, { cause: e });
      throw e;
    }
    const poll = await this.getPoll(pollId);
    if (!poll) throw new NotFoundError("Poll not found");
    return poll;
  },

  async retryPoll(pollId) {
    await ensurePrfOutput();
    const row = check(await db().from("polls").select(POLL_COLS).eq("id", pollId).maybeSingle<PollRow>());
    if (!row) throw new NotFoundError("Poll not found");
    const g = await requireAdmin(row.group_id);
    if (row.status !== "draft") return toPoll(row);
    if (Date.parse(row.closes_at) <= Date.now()) throw new PollClosingPassedError();
    // Re-sign with the CURRENT nonce and resend under the same id; the draft row is rewritten.
    await sendCreatePoll(g, row.id, {
      title: row.title,
      kind: row.kind,
      labels: row.options,
      closesAt: row.closes_at,
      hideLiveTally: row.hide_live_tally,
    });
    const poll = await this.getPoll(pollId);
    if (!poll) throw new NotFoundError("Poll not found");
    return poll;
  },

  async discardPoll(pollId) {
    const { error } = await db().rpc("discard_draft_poll", { poll_id: pollId });
    if (!error) return;
    if (error.message.includes("poll_not_found")) throw new NotFoundError("Poll not found");
    if (error.message.includes("not_group_admin")) throw new ForbiddenError();
    if (error.message.includes("poll_not_draft") || error.message.includes("poll_opening")) {
      throw new ForbiddenError("Only a poll that didn't open can be discarded");
    }
    throw new Error(error.message);
  },

  async getFrozenCommitments(pollId) {
    const { data, error } = await db().rpc("poll_frozen_commitments", { poll_id: pollId });
    if (error) {
      if (error.message.includes("poll_not_found")) throw new NotFoundError("Poll not found");
      throw new Error(error.message);
    }
    if (data === null) throw new Error("The poll's member set isn't on the public record yet; try again shortly");
    return (data as string[]).map((c) => BigInt(c));
  },

  async getResults(pollId) {
    const poll = await this.getPoll(pollId);
    if (!poll) throw new NotFoundError("Poll not found");
    const hidden = poll.status !== "closed" && poll.hideLiveTally;
    let rows: PollResultRow[] | null = null;
    let average: number | null = null;
    let updatedAt: string | null = null;
    if (!hidden) {
      const counts = rowsOf(
        await db()
          .from("poll_results")
          .select("option_index, count, updated_at")
          .eq("poll_id", pollId)
          .returns<{ option_index: number; count: number; updated_at: string }[]>(),
      );
      updatedAt = counts.reduce<string | null>((max, c) => (max === null || c.updated_at > max ? c.updated_at : max), null);
      const byValue = new Map(counts.map((c) => [c.option_index, c.count]));
      rows = poll.options.map((o) => ({ ...o, count: byValue.get(o.value) ?? 0 }));
      const total = rows.reduce((s, r) => s + r.count, 0);
      if (poll.kind === "rating" && total > 0) average = rows.reduce((s, r) => s + r.value * r.count, 0) / total;
    }
    const result: PollResult = {
      pollId,
      status: poll.status,
      votersCount: poll.votersCount,
      frozenSize: poll.frozenSize,
      hidden,
      rows,
      average,
      leadingValues: rows ? leadingOf(rows) : [],
      updatedAt,
    };
    return result;
  },

  async getPollAudit(pollId) {
    const row = check(
      await db()
        .from("public_poll_audit")
        .select("poll_id, chain_poll_id, group_name, title, kind, options, closes_at, frozen_root, members_at_open, answers, votes, cached_tally")
        .eq("poll_id", pollId)
        .maybeSingle<{
          poll_id: string;
          chain_poll_id: number | string;
          group_name: string;
          title: string;
          kind: PollKind;
          options: string[] | null;
          closes_at: string;
          frozen_root: string | null;
          members_at_open: number | null;
          answers: number;
          votes: { nullifier: string; choice: number }[];
          cached_tally: Record<string, number>;
        }>(),
    );
    if (!row || !row.frozen_root) return null;
    const options = optionsOf(row.kind, row.options);
    const rows = row.votes.map((v) => ({ nullifier: toHex32(v.nullifier), choice: v.choice }));
    const audit: PollAudit = {
      pollId: row.poll_id,
      chainPollId: String(row.chain_poll_id),
      groupName: row.group_name,
      title: row.title,
      kind: row.kind,
      options,
      closedAt: row.closes_at,
      frozenRoot: toHex32(row.frozen_root),
      frozenSize: row.members_at_open ?? 0,
      votersCount: row.answers,
      // What L7 shows (poll_results). L9 recounts `rows` itself and compares against this.
      tally: options.map((o) => ({ ...o, count: row.cached_tally[String(o.value)] ?? 0 })),
      rows,
      contractId: env.pollsContractId,
    };
    return audit;
  },
};

/**
 * Sign `create_poll` with the current nonce and send it under `pollId` (createPoll and retryPoll).
 * submit-admin-tx writes/rewrites the draft row before sending, so a failure leaves a draft that
 * poll_open_states reports as failed (P6).
 */
async function sendCreatePoll(
  g: GroupRow & { chain_group_id: number | string },
  pollId: string,
  p: { title: string; kind: PollKind; labels: string[] | null; closesAt: string; hideLiveTally: boolean },
): Promise<void> {
  const sdk = await loadSdk();
  const admin = await groupAdminKey(g.id);
  const polls = new sdk.LihimPollsClient(network());
  const chainGroupId = BigInt(g.chain_group_id);
  const kind = p.kind === "single" ? { kind: "single" as const, options: p.labels?.length ?? 0 } : { kind: p.kind };
  const closesAt = BigInt(Math.floor(Date.parse(p.closesAt) / 1000));
  const metaHash = sdk.pollMetaHash(p.kind, p.title, p.labels);

  try {
    await sendAdminTx(async () => {
      const nonce = await polls.getNonce(chainGroupId);
      const args = sdk.signedAdminArgs(
        {
          contractId: polls.contractId,
          fnTag: "create_poll",
          chainGroupId,
          nonce,
          args: sdk.adminArgs.create_poll(kind, closesAt, metaHash),
          leadingArgs: [sdk.u64(chainGroupId)],
        },
        admin,
      );
      return {
        action: "create_poll",
        group_id: g.id,
        args_xdr: await toBase64Xdr(args),
        poll: {
          id: pollId,
          title: p.title,
          kind: p.kind,
          options: p.labels,
          closes_at: new Date(Number(closesAt) * 1000).toISOString(),
          hide_live_tally: p.hideLiveTally,
        },
      };
    });
  } catch (e) {
    if (e instanceof sdk.AdminTxError && (e.code === "below_min_members" || e.contractErrorCode === 201)) {
      throw new SmallGroupError(g.member_count, g.min_members);
    }
    throw e;
  }
}

/**
 * Queue the viewer's commitment for this group unless it is already on-chain or queued. The
 * on-chain check is a public read (no session); only an admin can see the queue, which is fine:
 * a member's queued commitment is checked by submit_commitment's `on conflict do nothing`.
 */
async function queueOwnCommitment(groupId: string): Promise<void> {
  const commitment = (await groupIdentity(groupId)).commitment;
  const g = await groupRow(groupId);
  if (g?.chain_group_id != null && env.semaphoreContractId) {
    const sdk = await loadSdk();
    const semaphore = new sdk.LihimSemaphoreClient(network());
    if (await semaphore.isMember(BigInt(g.chain_group_id), commitment)) return;
  }
  const { error } = await db().rpc("submit_commitment", { group_id: groupId, commitment: commitment.toString() });
  if (error) throw new Error(error.message);
}
