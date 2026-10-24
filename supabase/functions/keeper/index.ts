// keeper: daily housekeeping on the public record. Invoked by pg_cron.
//
// 1. Extend the TTL of the contract instances + code and of every persistent
//    entry an active group or recent poll depends on (contracts/INTERFACE.md §9
//    "Keep alive"). Groups can sit idle between polls for months, and an
//    archived entry has to be restored before anyone can use it.
// 2. Call LihimPolls.close(poll_id) for polls past closes_at that nobody closed.
//
// TTLs are extended with ExtendFootprintTTLOp over the exact ledger keys
// (storage_keys.ts) rather than the contracts' bump_* hooks: it only pays for
// entries that are actually near expiry, and it also covers the contract code
// entries, which the hooks cannot touch.
//
// Paid with the admin fee key. Neither step needs an admin signature.

import {
  BASE_FEE,
  Contract,
  type Keypair,
  Operation,
  SorobanDataBuilder,
  type SupabaseClient,
  TransactionBuilder,
  xdr,
} from '../_shared/deps.ts';
import { classifyFailure, failureReason } from '../_shared/contract_errors.ts';
import { GROUP_MEMBER_EVENTS } from '../_shared/events.ts';
import { optionalEnv } from '../_shared/env.ts';
import { assertCron, handler, json } from '../_shared/http.ts';
import { adminClient, integrityAlert } from '../_shared/supabase.ts';
import { adminFeeKeypair, buildFeePaidInvocation, type StellarConfig, stellarConfig, submitAndWait } from '../_shared/stellar.ts';
import {
  leafKey,
  nullifierKey,
  pollKeys,
  pollsNonceKey,
  rootKey,
  semaphoreGroupKeys,
  verifierKeys,
} from '../_shared/storage_keys.ts';

// ~17,280 ledgers/day at 5 s. Extend to ~14 days whenever under ~7 days left
// (the contracts' own BUMP_AMOUNT / BUMP_THRESHOLD).
const EXTEND_TO = Number(optionalEnv('KEEPER_EXTEND_TO_LEDGERS', String(17_280 * 14)));
const THRESHOLD = Number(optionalEnv('KEEPER_THRESHOLD_LEDGERS', String(17_280 * 7)));
// Keeps each tx's footprint well under the per-tx read-entry limit.
const KEYS_PER_TX = 20;
// Polls closed within this window still get their entries extended (L9 reads them).
const CLOSED_POLL_KEEP_DAYS = 365;
const MAX_CLOSE_PER_RUN = 50;

/** A key we want alive. `required` keys must exist; a missing one is an alert (possibly archived). */
interface Tracked {
  key: xdr.LedgerKey;
  label: string;
  required: boolean;
}

Deno.serve(handler(async (req) => {
  assertCron(req);
  const db = adminClient();
  const cfg = stellarConfig();
  const fee = adminFeeKeypair();
  const tracked: Tracked[] = [];
  const seen = new Set<string>();
  const add = (label: string, required: boolean, ...keys: xdr.LedgerKey[]) => {
    for (const key of keys) {
      // e.g. two open polls frozen at the same root share one Root record.
      const id = key.toXdr('base64');
      if (seen.has(id)) continue;
      seen.add(id);
      tracked.push({ key, label, required });
    }
  };

  // --- contracts: instance + code (+ the verifier's Vk entries) -------------------
  const contracts: [string, string | null][] = [
    ['semaphore', cfg.semaphoreContractId],
    ['polls', cfg.pollsContractId],
    ['verifier', cfg.verifierContractId],
  ];
  for (const [name, id] of contracts) {
    if (!id) continue;
    add(`${name} instance`, true, new Contract(id).getFootprint());
    const instance = await cfg.server.getContractInstance(id);
    const exe = instance.executable;
    if (exe.type === 'contractExecutableWasm') {
      add(`${name} code`, true, xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: exe.wasmHash })));
    }
  }
  if (cfg.verifierContractId) {
    verifierKeys(cfg.verifierContractId).forEach((k, i) => add(`verifier Vk(${i + 1})`, true, k));
  }

  // --- groups: Group/Tree/RootTtl/Nonce, polls Nonce, every current Leaf ------------
  const { data: groups, error: gErr } = await db
    .from('groups')
    .select('id, chain_group_id, chain_root')
    .eq('status', 'active');
  if (gErr) throw gErr;
  const chainGroupOf = new Map<string, bigint>();
  for (const g of groups ?? []) {
    const gid = BigInt(g.chain_group_id);
    chainGroupOf.set(g.id, gid);
    const [group, tree, rootTtl, nonce] = semaphoreGroupKeys(cfg.semaphoreContractId, gid);
    add(`Group(${gid})`, true, group);
    // Tree is first written by the first insert.
    add(`Tree(${gid})`, g.chain_root !== null, tree);
    add(`RootTtl(${gid})`, true, rootTtl);
    add(`Nonce(${gid})`, true, nonce);
    // Written by the group's first create_poll.
    add(`polls Nonce(${gid})`, false, pollsNonceKey(cfg.pollsContractId, gid));
    for (const leaf of await currentLeaves(db, gid)) add(`Leaf(${gid})`, true, leafKey(cfg.semaphoreContractId, gid, leaf));
  }

  // --- polls: Poll/Tally/Voters, the frozen root's record, every vote nullifier ----
  const keepSince = new Date(Date.now() - CLOSED_POLL_KEEP_DAYS * 86_400_000).toISOString();
  const { data: polls, error: pErr } = await db
    .from('polls')
    .select('chain_poll_id, group_id, status, frozen_root')
    .not('chain_poll_id', 'is', null)
    .gte('closes_at', keepSince);
  if (pErr) throw pErr;
  for (const p of polls ?? []) {
    const pid = BigInt(p.chain_poll_id);
    const [poll, tally, voters] = pollKeys(cfg.pollsContractId, pid);
    add(`Poll(${pid})`, true, poll);
    add(`Tally(${pid})`, true, tally);
    add(`Voters(${pid})`, true, voters);
    const gid = chainGroupOf.get(p.group_id);
    if (gid === undefined) continue;
    // A Root record exists only once the frozen root has been replaced.
    if (p.status === 'open' && p.frozen_root) {
      add(`Root(${gid})`, false, rootKey(cfg.semaphoreContractId, gid, BigInt(p.frozen_root)));
    }
    // Votes spend nullifiers in the LihimPolls namespace (D3).
    for (const n of await voteNullifiers(db, p.chain_poll_id)) {
      add(`Nullifier(polls, ${gid})`, true, nullifierKey(cfg.semaphoreContractId, cfg.pollsContractId, gid, n));
    }
  }

  // --- extend whatever is close to expiry ----------------------------------------
  const latest = (await cfg.server.getLatestLedger()).sequence;
  const due: xdr.LedgerKey[] = [];
  const missingRequired: string[] = [];
  let missingOptional = 0;
  for (let i = 0; i < tracked.length; i += 100) {
    const chunk = tracked.slice(i, i + 100);
    const res = await cfg.server.getLedgerEntries(...chunk.map((t) => t.key));
    const found = new Set(res.entries.map((e) => e.key.toXdr('base64')));
    for (const t of chunk) {
      if (found.has(t.key.toXdr('base64'))) continue;
      if (t.required) missingRequired.push(t.label);
      else missingOptional++;
    }
    for (const e of res.entries) {
      if ((e.liveUntilLedgerSeq ?? 0) - latest < THRESHOLD) due.push(e.key);
    }
  }
  if (missingRequired.length) {
    // Either the indexer's view is wrong or the entry was archived.
    // TODO(M0): archived entries need a RestoreFootprintOp before they can be
    // extended; confirm how getLedgerEntries reports them on the current protocol.
    await integrityAlert(db, 'ttl_key_missing', 'keeper', {
      count: missingRequired.length,
      keys: [...new Set(missingRequired)].slice(0, 50),
    });
  }

  const extended: string[] = [];
  const failures: string[] = [];
  for (let i = 0; i < due.length; i += KEYS_PER_TX) {
    try {
      const outcome = await extendTtl(cfg, fee, due.slice(i, i + KEYS_PER_TX));
      (outcome.status === 'failed' ? failures : extended).push(outcome.hash);
    } catch (e) {
      failures.push((e as Error).message);
    }
  }

  // --- close polls that ran out of time ---------------------------------------------
  const closedOnChain: string[] = [];
  const { data: expired, error: eErr } = await db
    .from('polls')
    .select('chain_poll_id')
    .not('chain_poll_id', 'is', null)
    .lte('closes_at', new Date().toISOString())
    .gte('closes_at', keepSince);
  if (eErr) throw eErr;
  const closedEvents = await allEvents<{ topic_id: string | number }>((from, to) =>
    db.from('chain_events').select('topic_id').eq('type', 'poll_closed').order('event_id').range(from, to)
  );
  const alreadyClosed = new Set(closedEvents.map((e) => String(e.topic_id)));
  const toClose = (expired ?? []).filter((p) => !alreadyClosed.has(String(p.chain_poll_id))).slice(0, MAX_CLOSE_PER_RUN);
  for (const p of toClose) {
    try {
      const tx = await buildFeePaidInvocation(cfg, fee, cfg.pollsContractId, 'close', [
        xdr.ScVal.scvU64(BigInt(p.chain_poll_id)),
      ]);
      const outcome = await submitAndWait(cfg, tx);
      if (outcome.status !== 'failed') closedOnChain.push(String(p.chain_poll_id));
    } catch (e) {
      const f = classifyFailure(e);
      // 210 AlreadyClosed: the indexer just has not seen poll_closed yet.
      // 209 NotYetClosable: ledger time is a little behind wall-clock time.
      if (f.kind === 'contract' && (f.code === 210 || f.code === 209)) continue;
      console.warn('keeper: close', p.chain_poll_id, failureReason(f));
    }
  }

  return json(null, {
    ok: failures.length === 0 && missingRequired.length === 0,
    keys: tracked.length,
    missing_required: missingRequired.length,
    missing_optional: missingOptional,
    due: due.length,
    extend_txs: extended,
    failures,
    closed_on_chain: closedOnChain,
  });
}));

async function extendTtl(cfg: StellarConfig, fee: Keypair, keys: xdr.LedgerKey[]) {
  const account = await cfg.server.getAccount(fee.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: cfg.networkPassphrase })
    .setSorobanData(new SorobanDataBuilder().setReadOnly(keys).build())
    .addOperation(Operation.extendFootprintTtl({ extendTo: EXTEND_TO }))
    .setTimeout(60)
    .build();
  const prepared = await cfg.server.prepareTransaction(tx);
  prepared.sign(fee);
  return submitAndWait(cfg, prepared);
}

/** Every page of a chain_events query (PostgREST caps a response at 1000 rows). */
async function allEvents<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Commitments currently in the tree, replayed from member events (removed/updated leaves drop their Leaf entry). */
async function currentLeaves(db: SupabaseClient, chainGroupId: bigint): Promise<bigint[]> {
  const events = await allEvents<{ type: string; payload: Record<string, unknown> }>((from, to) =>
    db
      .from('chain_events')
      .select('type, payload')
      .eq('topic_id', chainGroupId.toString())
      .in('type', GROUP_MEMBER_EVENTS as string[])
      .order('event_id')
      .range(from, to)
  );
  const leaves = new Set<string>();
  for (const { type, payload: p } of events) {
    if (type === 'member_added') leaves.add(p.commitment as string);
    else if (type === 'members_added') for (const c of p.commitments as string[]) leaves.add(c);
    else if (type === 'member_updated') {
      leaves.delete(p.old as string);
      leaves.add(p.new as string);
    } else if (type === 'member_removed') leaves.delete(p.old as string);
  }
  return [...leaves].map((c) => BigInt(c));
}

/** Nullifiers spent by votes on one poll, from its `voted` events. */
async function voteNullifiers(db: SupabaseClient, chainPollId: string | number): Promise<bigint[]> {
  const events = await allEvents<{ payload: { nullifier?: string } }>((from, to) =>
    db
      .from('chain_events')
      .select('payload')
      .eq('type', 'voted')
      .eq('topic_id', String(chainPollId))
      .order('event_id')
      .range(from, to)
  );
  return [...new Set(events.map((e) => e.payload.nullifier).filter((n): n is string => !!n))].map((n) => BigInt(n));
}
