// submit-admin-tx: relays an admin action that was ALREADY signed in the
// browser with the group's per-group Ed25519 admin key.
//
// This function never holds or derives an admin key. It checks the caller is
// the group's admin in Postgres, cross-checks the arguments against the rows it
// is about to create, simulates, pays the fee with ADMIN_FEE_SECRET and submits.
// The contract verifies the admin signature; a forged request fails simulation.
//
// group_id is the off-chain groups.id (uuid). It is also the HKDF info of the
// per-group keys ("lihim/sem/" + id, "lihim/admin/" + id; D1), so for
// create_group the browser picks it and must send it in canonical form
// (lowercase, hyphenated, as Postgres prints it). The on-chain u64 group id
// only appears inside the signed args and the admin-signature digest.
//
// POST (Authorization: Bearer <user JWT>)
// {
//   action: 'create_group' | 'add_member' | 'add_members' | 'update_member' | 'remove_member' | 'create_poll',
//   group_id: uuid,                  // groups.id; for create_group the client picks it (it seeds the HKDF info)
//   args_xdr?: base64 ScVal::Vec,    // payload mode: full contract args incl. sig; we build + fee-pay the tx
//   tx_xdr?: base64 envelope,        // envelope mode: browser-built signed tx; we fee-bump it
//   group?: { name, description?, min_members?, admin_pubkey },              // create_group
//   poll?:  { id?, title, kind, options, closes_at (ISO), hide_live_tally? }  // create_poll
// }
// → 200 { status: 'confirmed', tx_hash, group_id, chain_group_id?, poll_id?, chain_poll_id? }
// → 202 { status: 'submitted', tx_hash, ... }  (indexer reconciles when it lands)
// → 4xx { status: <code>, reason, error_code? }
//     400 invalid             bad request, or a contract error (error_code = INTERFACE.md §8 code)
//     409 stale_signature     the admin sig did not verify: re-read semaphore.nonce / polls.nonce
//                             (create_group: semaphore.next_group_id), re-sign, resend
//     409 busy                another admin tx on the same nonce counter is in flight
//     409 below_min_members   create_poll below min_members (also contract 201)
//     409 conflict            e.g. LeafExists (103), WrongSiblingNodes (105), group exists
// → 502 { status: 'not_sent', reason }  RPC/simulation trouble or the tx failed on-chain

import { FeeBumpTransaction, rpc, scValToNative, TransactionBuilder, type Transaction } from '../_shared/deps.ts';
import {
  ADMIN_ACTIONS,
  type AdminAction,
  argBytesHex,
  argPollKind,
  argU64,
  type Invocation,
  invocationFromArgs,
  invocationFromEnvelope,
  isAdminAction,
  nonceCounter,
} from '../_shared/admin_actions.ts';
import { classifyFailure, failureReason, type HostFailure } from '../_shared/contract_errors.ts';
import { handler, HttpError, json, readJson } from '../_shared/http.ts';
import { pollMetaHash, type PollKind } from '../_shared/meta.ts';
import { activateGroup, adminClient, requireUser } from '../_shared/supabase.ts';
import { adminFeeKeypair, buildFeePaidInvocation, stellarConfig, submitAndWait } from '../_shared/stellar.ts';

interface Body {
  action?: unknown;
  group_id?: string;
  args_xdr?: string;
  tx_xdr?: string;
  group?: { name?: string; description?: string; min_members?: number; admin_pubkey?: string };
  poll?: {
    id?: string;
    title?: string;
    kind?: PollKind;
    options?: string[] | null;
    closes_at?: string;
    hide_live_tally?: boolean;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// An earlier admin tx on the same counter that is still pending blocks a new
// one for this long (its signature would use the same nonce). After that the
// row is treated as abandoned.
const IN_FLIGHT_MS = 2 * 60 * 1000;

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);
  const body = await readJson<Body>(req);

  if (!isAdminAction(body.action)) throw new HttpError(400, 'invalid', 'unknown action');
  const action: AdminAction = body.action;
  if (!body.group_id || !UUID.test(body.group_id)) throw new HttpError(400, 'invalid', 'group_id must be a uuid');
  if (!!body.args_xdr === !!body.tx_xdr) throw new HttpError(400, 'invalid', 'send exactly one of args_xdr, tx_xdr');

  const cfg = stellarConfig();
  const inv: Invocation = body.args_xdr
    ? invocationFromArgs(cfg, action, body.args_xdr)
    : invocationFromEnvelope(cfg, action, body.tx_xdr!);

  // --- authorize + cross-check against Postgres -----------------------------
  const groupId = body.group_id.toLowerCase();
  let pollId: string | null = null;

  if (action === 'create_group') {
    // The keys were derived from this exact string; a different spelling stored
    // here would derive different keys later.
    if (body.group_id !== groupId) throw new HttpError(400, 'invalid', 'group_id must be a lowercase uuid');
    const g = body.group ?? {};
    const adminPubkey = (g.admin_pubkey ?? '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(adminPubkey)) throw new HttpError(400, 'invalid', 'group.admin_pubkey must be 32-byte hex');
    if (argBytesHex(inv.args, 0, 32, 'admin_key') !== adminPubkey) {
      throw new HttpError(400, 'invalid', 'admin_key argument does not match group.admin_pubkey');
    }
    const { data: existing } = await db.from('groups').select('admin_user_id, status').eq('id', groupId).maybeSingle();
    if (existing) {
      // Retrying a create that failed or timed out is fine; taking over someone else's id is not.
      if (existing.admin_user_id !== user.id || existing.status !== 'pending') throw new HttpError(409, 'conflict', 'group exists');
      await db.from('groups').update({ admin_pubkey: adminPubkey }).eq('id', groupId);
    } else {
      const { error } = await db.from('groups').insert({
        id: groupId,
        name: (g.name ?? '').trim(),
        description: (g.description ?? '').trim(),
        min_members: g.min_members ?? 8,
        admin_user_id: user.id,
        admin_pubkey: adminPubkey,
        status: 'pending',
      });
      if (error) throw new HttpError(400, 'invalid', error.message);
    }
  } else {
    const { data: group } = await db
      .from('groups')
      .select('id, admin_user_id, chain_group_id, status, member_count, min_members')
      .eq('id', groupId)
      .maybeSingle();
    if (!group) throw new HttpError(404, 'not_found', 'group not found');
    if (group.admin_user_id !== user.id) throw new HttpError(403, 'forbidden', 'only the group admin can do this');
    if (group.status !== 'active' || group.chain_group_id === null) throw new HttpError(409, 'conflict', 'group not active yet');
    if (argU64(inv.args, 0, 'group_id') !== BigInt(group.chain_group_id)) {
      throw new HttpError(400, 'invalid', 'group_id argument does not match this group');
    }
    await assertNotInFlight(db, groupId, action);

    if (action === 'create_poll') {
      if (group.member_count < group.min_members) {
        throw new HttpError(409, 'below_min_members', `needs at least ${group.min_members} members`);
      }
      pollId = await upsertDraftPoll(db, groupId, body.poll ?? {}, inv);
    }
  }

  const { data: ptx, error: ptxError } = await db
    .from('pending_txs')
    .insert({ group_id: groupId, poll_id: pollId, kind: action, status: 'pending' })
    .select('id')
    .single();
  if (ptxError) throw ptxError;
  const markTx = (patch: Record<string, unknown>) => db.from('pending_txs').update(patch).eq('id', ptx.id);

  // --- simulate, pay, submit -----------------------------------------------------
  const fee = adminFeeKeypair();
  let tx: Transaction | FeeBumpTransaction;
  try {
    if (inv.inner) {
      const sim = await cfg.server.simulateTransaction(inv.inner);
      if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
      // Fee-bump base fee is per operation (inner op + the bump); inner.fee already
      // includes the resource fee from the browser's own simulation.
      tx = TransactionBuilder.buildFeeBumpTransaction(fee, inv.inner.fee, inv.inner, cfg.networkPassphrase);
      tx.sign(fee);
    } else {
      tx = await buildFeePaidInvocation(cfg, fee, inv.contractId, inv.fn, inv.args);
    }
  } catch (e) {
    const failure = classifyFailure(e);
    await markTx({ status: 'failed', error: failureReason(failure) });
    throw simulationError(failure);
  }

  const outcome = await submitAndWait(cfg, tx, async (hash) => {
    await markTx({ status: 'submitted', tx_hash: hash });
  });

  if (outcome.status === 'failed') {
    await markTx({ status: 'failed', tx_hash: outcome.hash, error: outcome.reason });
    return json(req, { status: 'not_sent', reason: outcome.reason, tx_hash: outcome.hash }, 502);
  }
  if (outcome.status === 'submitted') {
    return json(req, { status: 'submitted', tx_hash: outcome.hash, group_id: groupId, poll_id: pollId }, 202);
  }

  // --- confirmed: record what the chain assigned ------------------------------------
  const result: Record<string, unknown> = { status: 'confirmed', tx_hash: outcome.hash, group_id: groupId };
  const ret = outcome.returnValue ? scValToNative(outcome.returnValue) : undefined;

  if (action === 'create_group') {
    if (typeof ret !== 'bigint') throw new Error('create_group returned no group id');
    await activateGroup(db, groupId, ret);
    result.chain_group_id = ret.toString();
  } else if (action === 'create_poll' && pollId) {
    if (typeof ret !== 'bigint') throw new Error('create_poll returned no poll id');
    const { error } = await db
      .from('polls')
      .update({ chain_poll_id: ret.toString(), status: 'open', opens_at: new Date().toISOString() })
      .eq('id', pollId)
      .eq('status', 'draft');
    if (error) throw error;
    result.poll_id = pollId;
    result.chain_poll_id = ret.toString();
  }
  // add/update/remove: member_count and the root come from the indexer, which
  // reads them from the events rather than trusting this request.

  await markTx({ status: 'confirmed' });
  return json(req, result);
}));

async function upsertDraftPoll(
  db: ReturnType<typeof adminClient>,
  groupId: string,
  p: NonNullable<Body['poll']>,
  inv: Invocation,
): Promise<string> {
  const kind = p.kind;
  if (kind !== 'single' && kind !== 'rating' && kind !== 'yesno') throw new HttpError(400, 'invalid', 'poll.kind');
  const title = (p.title ?? '').trim();
  const options = kind === 'rating' ? null : (p.options ?? []).map((o) => String(o).trim());
  const closesAt = p.closes_at ? new Date(p.closes_at) : null;
  if (!closesAt || Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= Date.now()) {
    throw new HttpError(400, 'invalid', 'poll.closes_at must be in the future');
  }

  // The contract stores meta_hash and closes_at; make sure they describe this row.
  const metaHash = await pollMetaHash(kind, title, options);
  if (argBytesHex(inv.args, 3, 32, 'meta_hash') !== metaHash) {
    throw new HttpError(400, 'invalid', 'meta_hash does not match title/options');
  }
  if (argU64(inv.args, 2, 'closes_at') !== BigInt(Math.floor(closesAt.getTime() / 1000))) {
    throw new HttpError(400, 'invalid', 'closes_at argument does not match poll.closes_at');
  }
  const kindArg = argPollKind(inv.args, 1);
  if (kindArg.kind !== kind) throw new HttpError(400, 'invalid', 'kind argument does not match poll.kind');
  if (kindArg.kind === 'single' && kindArg.n !== options!.length) {
    throw new HttpError(400, 'invalid', 'Single(n) argument does not match the number of options');
  }

  const row = {
    group_id: groupId,
    title,
    kind,
    options,
    closes_at: closesAt.toISOString(),
    hide_live_tally: p.hide_live_tally ?? true,
    meta_hash: metaHash,
    status: 'draft' as const,
  };

  if (p.id) {
    // Retry of an earlier attempt: only a draft in the same group may be rewritten.
    const { data, error } = await db
      .from('polls')
      .update(row)
      .eq('id', p.id)
      .eq('group_id', groupId)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    if (error) throw new HttpError(400, 'invalid', error.message);
    if (!data) throw new HttpError(409, 'conflict', 'poll is not a draft of this group');
    return data.id;
  }
  const { data, error } = await db.from('polls').insert(row).select('id').single();
  if (error) throw new HttpError(400, 'invalid', error.message);
  return data.id;
}

/** One admin tx per group and nonce counter at a time (INTERFACE.md §5.2). */
async function assertNotInFlight(db: ReturnType<typeof adminClient>, groupId: string, action: AdminAction) {
  const counter = nonceCounter(action);
  if (!counter) return;
  const sameCounter = ADMIN_ACTIONS.filter((a) => nonceCounter(a) === counter);
  const { count, error } = await db
    .from('pending_txs')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .in('kind', sameCounter)
    .in('status', ['pending', 'submitted'])
    .gte('created_at', new Date(Date.now() - IN_FLIGHT_MS).toISOString());
  if (error) throw error;
  if (count) throw new HttpError(409, 'busy', 'another admin transaction for this group is still in flight');
}

/** Map a failed simulation to the response the browser can act on. */
function simulationError(f: HostFailure): HttpError {
  const reason = failureReason(f);
  switch (f.kind) {
    case 'signature':
      return new HttpError(409, 'stale_signature', `${reason}: re-read the nonce (or next_group_id) and sign again`);
    case 'contract':
      if (f.code === 201) return new HttpError(409, 'below_min_members', reason, { error_code: f.code });
      if (f.code === 103 || f.code === 105) return new HttpError(409, 'conflict', reason, { error_code: f.code });
      return new HttpError(400, 'invalid', reason, { error_code: f.code });
    case 'auth':
    case 'host':
      return new HttpError(400, 'invalid', reason);
    case 'unknown':
      return new HttpError(502, 'not_sent', reason);
  }
}
