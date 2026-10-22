// indexer: mirrors LihimSemaphore / LihimPolls events into chain_events and
// recomputes everything derived from them. Invoked every minute by pg_cron.
//
// Idempotent: chain_events is keyed on (tx_hash, event_index), and derived
// tables are recomputed from chain_events (never incremented), so overlapping
// runs or a replayed page cannot double-count.

import { rpc, SemaphoreGroup, type SupabaseClient } from '../_shared/deps.ts';
import { decodeLihimEvent, type DecodedEvent, GROUP_MEMBER_EVENTS } from '../_shared/events.ts';
import { assertCron, handler, json } from '../_shared/http.ts';
import { optionalEnv } from '../_shared/env.ts';
import { activateGroup, adminClient, integrityAlert } from '../_shared/supabase.ts';
import { stellarConfig } from '../_shared/stellar.ts';

const PAGE_LIMIT = 200;
// Edge Functions have a wall-clock limit; leave room for the recompute step.
const TIME_BUDGET_MS = 35_000;

Deno.serve(handler(async (req) => {
  assertCron(req);
  const db = adminClient();
  const cfg = stellarConfig();
  const contracts = { semaphore: cfg.semaphoreContractId, polls: cfg.pollsContractId };
  const filters: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [contracts.semaphore, contracts.polls] }];

  const { data: cur, error: curError } = await db.from('indexer_cursor').select('*').eq('id', 1).single();
  if (curError) throw curError;
  let cursor: string | null = cur.last_cursor;
  let lastLedger = Number(cur.last_ledger);

  const touchedGroups = new Set<string>();
  const touchedPolls = new Set<string>();
  const created: DecodedEvent[] = [];
  let inserted = 0;
  let pages = 0;
  const started = Date.now();

  while (Date.now() - started < TIME_BUDGET_MS) {
    let page: rpc.Api.GetEventsResponse;
    try {
      page = cursor
        ? await cfg.server.getEvents({ filters, cursor, limit: PAGE_LIMIT })
        : await cfg.server.getEvents({ filters, startLedger: await startLedger(db, cfg.server, lastLedger), limit: PAGE_LIMIT });
    } catch (e) {
      if (cursor) {
        // A cursor older than RPC retention is rejected; fall back to ledgers.
        console.warn('indexer: cursor rejected, restarting from ledger', lastLedger, (e as Error).message);
        cursor = null;
        continue;
      }
      throw e;
    }
    pages++;

    const rows: DecodedEvent[] = [];
    for (const ev of page.events) {
      const decoded = decodeLihimEvent(ev, contracts);
      if (!decoded) continue;
      if ('error' in decoded) {
        await integrityAlert(db, 'event_decode_failed', decoded.event_id, { error: decoded.error });
        continue;
      }
      rows.push(decoded);
    }

    if (rows.length) {
      const { data, error } = await db
        .from('chain_events')
        .upsert(rows, { onConflict: 'tx_hash,event_index', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      inserted += data?.length ?? 0;
      for (const r of rows) {
        if (r.type === 'poll_created' || r.type === 'voted' || r.type === 'poll_closed') touchedPolls.add(r.topic_id);
        else if (r.type !== 'proof_validated') touchedGroups.add(r.topic_id);
        if (r.type === 'group_created' || r.type === 'poll_created') created.push(r);
      }
      lastLedger = Math.max(lastLedger, ...rows.map((r) => r.ledger));
    }

    cursor = page.cursor || cursor;
    // A short page means the RPC scanned up to its latest ledger. Recording that
    // keeps a quiet contract from looking like an indexing gap once the cursor
    // ages out of RPC retention.
    if (page.events.length < PAGE_LIMIT) lastLedger = Math.max(lastLedger, page.latestLedger);
    // Store progress per page so a timeout never loses more than one page of work.
    const { error: cursorError } = await db
      .from('indexer_cursor')
      .update({ last_cursor: cursor, last_ledger: lastLedger, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (cursorError) throw cursorError;

    if (page.events.length < PAGE_LIMIT) break;
  }

  // Creations whose submit-admin-tx call timed out before confirmation.
  for (const ev of created) await reconcileCreation(db, ev);

  for (const id of touchedGroups) {
    const { error } = await db.rpc('lihim_recompute_group', { p_chain_group_id: id });
    if (error) throw error;
    if (optionalEnv('INDEXER_VERIFY_ROOTS', 'true') === 'true') await verifyGroupRoot(db, id);
  }
  for (const id of touchedPolls) {
    const { error } = await db.rpc('lihim_recompute_poll', { p_chain_poll_id: id });
    if (error) throw error;
  }
  const { data: closed, error: closeError } = await db.rpc('lihim_close_expired_polls');
  if (closeError) throw closeError;

  return json(null, {
    ok: true,
    pages,
    inserted,
    last_ledger: lastLedger,
    groups: touchedGroups.size,
    polls: touchedPolls.size,
    closed_expired: closed,
  });
}));

/**
 * Where to resume when there is no usable cursor. Re-reading last_ledger
 * itself is deliberate: the upsert ignores duplicates, and starting at +1
 * could skip later events of a partly processed ledger.
 */
async function startLedger(db: SupabaseClient, server: rpc.Server, lastLedger: number): Promise<number> {
  const health = await server.getHealth();
  const configured = Number(optionalEnv('INDEXER_START_LEDGER', '0'));
  const wanted = Math.max(lastLedger, configured);
  if (wanted === 0) return health.oldestLedger;
  if (wanted < health.oldestLedger) {
    // TODO(M2): backfill [wanted, oldestLedger) from a history source (Galexie/Hubble);
    // until then the gap is recorded so tallies are not silently trusted.
    await integrityAlert(db, 'indexer_gap', `${wanted}-${health.oldestLedger}`, {
      from_ledger: wanted,
      oldest_available: health.oldestLedger,
    });
    return health.oldestLedger;
  }
  return Math.min(wanted, health.latestLedger);
}

async function reconcileCreation(db: SupabaseClient, ev: DecodedEvent): Promise<void> {
  const { data: ptx } = await db
    .from('pending_txs')
    .select('id, group_id, poll_id, kind, status')
    .eq('tx_hash', ev.tx_hash)
    .maybeSingle();
  if (!ptx) return; // created outside this app, or already handled with a different hash

  if (ev.type === 'group_created' && ptx.kind === 'create_group') {
    await activateGroup(db, ptx.group_id, BigInt(ev.topic_id));
  } else if (ev.type === 'poll_created' && ptx.kind === 'create_poll' && ptx.poll_id) {
    await db
      .from('polls')
      .update({ chain_poll_id: ev.topic_id, status: 'open', opens_at: ev.ledger_closed_at })
      .eq('id', ptx.poll_id)
      .is('chain_poll_id', null);
  }
  if (ptx.status !== 'confirmed') await db.from('pending_txs').update({ status: 'confirmed', error: null }).eq('id', ptx.id);
}

/**
 * Rebuild the group's LeanIMT off-chain from its member events with the
 * official @semaphore-protocol/group and compare with the root the contract
 * reported. A mismatch means Poseidon/LeanIMT drift or a missed event.
 */
async function verifyGroupRoot(db: SupabaseClient, chainGroupId: string): Promise<void> {
  const events: { type: string; payload: Record<string, unknown>; event_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('chain_events')
      .select('type, payload, event_id')
      .eq('topic_id', chainGroupId)
      .in('type', GROUP_MEMBER_EVENTS as string[])
      .order('event_id')
      .range(from, from + 999);
    if (error) throw error;
    events.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  if (!events.length) return;

  try {
    const group = new SemaphoreGroup();
    for (const e of events) {
      const p = e.payload;
      switch (e.type) {
        case 'member_added':
          group.addMember(BigInt(p.commitment as string));
          break;
        case 'members_added':
          group.addMembers((p.commitments as string[]).map((c) => BigInt(c)));
          break;
        case 'member_updated':
          group.updateMember(Number(p.index), BigInt(p.new as string));
          break;
        case 'member_removed':
          group.removeMember(Number(p.index));
          break;
      }
    }
    const reported = BigInt(events[events.length - 1].payload.root as string);
    if (group.root !== reported) {
      await integrityAlert(db, 'root_mismatch', chainGroupId, {
        reported: reported.toString(),
        recomputed: group.root.toString(),
        size: group.size,
        last_event_id: events[events.length - 1].event_id,
      });
    }
  } catch (e) {
    await integrityAlert(db, 'root_replay_failed', chainGroupId, { error: (e as Error).message });
  }
}
