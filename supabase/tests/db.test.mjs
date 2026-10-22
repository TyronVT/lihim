// Runs supabase/migrations + seed.sql in PGlite (real Postgres compiled to
// WASM) on top of stubs.sql, then checks RLS, the RPCs and the privacy invariant
// the way supabase-js would hit them: as anon / authenticated with a JWT sub.
//
//   cd supabase/tests && npm install && npm test

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');

const ADMIN = '00000000-0000-4000-8000-000000000001';
const MEMBER = '00000000-0000-4000-8000-000000000002';
const OUTSIDER = '00000000-0000-4000-8000-00000000000a';
const GROUP = '11111111-1111-4111-8111-111111111111';
const POLL_OPEN_HIDDEN = '22222222-2222-4222-8222-000000000001';
const POLL_CLOSED = '22222222-2222-4222-8222-000000000002';
const POLL_OPEN_VISIBLE = '22222222-2222-4222-8222-000000000003';

// pg_net / pg_cron ship with the Supabase image; stubs.sql fakes their objects.
const stripExtensions = (sql) =>
  sql.replace(/^create extension if not exists (pg_net|pg_cron)\b[^;]*;$/gim, '-- (harness) $&');

/** @type {PGlite} */
let db;

before(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync(join(here, 'stubs.sql'), 'utf8'));
  const files = readdirSync(join(supabaseDir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      await db.exec(stripExtensions(readFileSync(join(supabaseDir, 'migrations', f), 'utf8')));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
  try {
    await db.exec(readFileSync(join(supabaseDir, 'seed.sql'), 'utf8'));
  } catch (e) {
    throw new Error(`seed.sql failed: ${e.message}`);
  }
});

/** Run fn inside a transaction as an API role, like PostgREST does. Commits unless fn throws. */
async function as(role, sub, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      sub ? JSON.stringify({ sub, role }) : '',
    ]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

const rows = async (role, sub, sql, params = []) => (await as(role, sub, (tx) => tx.query(sql, params))).rows;

async function rejects(role, sub, sql, params, pattern) {
  await assert.rejects(as(role, sub, (tx) => tx.query(sql, params)), pattern);
}

// --- schema-level -----------------------------------------------------------

test('RLS is enabled on every table in public', async () => {
  const { rows: r } = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
  );
  assert.deepEqual(r, []);
});

test('privacy invariant: no table pairs a user column with a commitment/nullifier/vote column', async () => {
  const { rows: cols } = await db.query(
    `select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  );
  const byTable = new Map();
  for (const { table_name, column_name } of cols) {
    if (!byTable.has(table_name)) byTable.set(table_name, []);
    byTable.get(table_name).push(column_name);
  }
  const userish = /(^|_)user_id$|^created_by$|^email$/;
  const secretish = /commitment|nullifier|choice|vote|prf|private_key|secret|sem_/;
  for (const [table, names] of byTable) {
    const u = names.filter((n) => userish.test(n));
    const s = names.filter((n) => secretish.test(n));
    assert.ok(!(u.length && s.length), `${table} pairs ${u} with ${s}`);
  }
  // The commitment queue must not be joinable back to a member by time either.
  assert.deepEqual(byTable.get('pending_commitments').sort(), ['commitment', 'group_id', 'id']);
  assert.ok(!byTable.has('group_members') || !byTable.get('group_members').includes('commitment'));
});

test('derived state from seed events matches what the indexer would compute', async () => {
  const [g] = (await db.query(`select member_count, chain_root from public.groups where id = $1`, [GROUP])).rows;
  assert.equal(g.member_count, 9);
  assert.equal(g.chain_root, '4242424242424242424242424242424242');

  const polls = (await db.query(`select id, status, voters_count, frozen_size, opens_at is not null as opened from public.polls order by chain_poll_id`)).rows;
  assert.deepEqual(polls.map((p) => [p.status, p.voters_count, p.frozen_size, p.opened]), [
    ['open', 3, 9, true],
    ['closed', 7, 9, true],
    ['open', 4, 9, true],
  ]);

  const tally = (await db.query(`select option_index, count from public.poll_results where poll_id = $1 order by 1`, [POLL_CLOSED])).rows;
  assert.deepEqual(tally.map((t) => [t.option_index, t.count]), [[1, 0], [2, 1], [3, 2], [4, 3], [5, 1]]);
});

test('profiles are created from auth.users with the display name', async () => {
  const r = await rows('authenticated', MEMBER, `select id, display_name from public.profiles`);
  assert.deepEqual(r, [{ id: MEMBER, display_name: 'Paolo' }]);
});

// --- RLS as members / admin / outsiders --------------------------------------

test('group_members: a member sees only their own row; the admin sees everyone', async () => {
  const mine = await rows('authenticated', MEMBER, `select user_id from public.group_members`);
  assert.deepEqual(mine.map((r) => r.user_id), [MEMBER]);
  const all = await rows('authenticated', ADMIN, `select user_id from public.group_members`);
  assert.equal(all.length, 9);
  assert.deepEqual(await rows('authenticated', OUTSIDER, `select * from public.group_members`), []);
});

test('groups and polls are visible to members only', async () => {
  assert.equal((await rows('authenticated', MEMBER, `select id from public.groups`)).length, 1);
  assert.equal((await rows('authenticated', MEMBER, `select id from public.polls`)).length, 3);
  assert.deepEqual(await rows('authenticated', OUTSIDER, `select id from public.groups`), []);
  assert.deepEqual(await rows('authenticated', OUTSIDER, `select id from public.polls`), []);
});

test('poll_results: hidden while open with hide_live_tally, for members and admin alike', async () => {
  for (const who of [MEMBER, ADMIN]) {
    const r = await rows('authenticated', who, `select distinct poll_id from public.poll_results order by 1`);
    assert.deepEqual(r.map((x) => x.poll_id), [POLL_CLOSED, POLL_OPEN_VISIBLE]);
  }
  assert.deepEqual(await rows('authenticated', OUTSIDER, `select * from public.poll_results`), []);
});

test('service-only tables are not readable by API roles', async () => {
  for (const t of ['chain_events', 'indexer_cursor', 'pending_txs', 'webauthn_challenges', 'integrity_alerts']) {
    await rejects('authenticated', ADMIN, `select * from public.${t}`, [], /permission denied/);
    await rejects('anon', null, `select * from public.${t}`, [], /permission denied/);
  }
});

test('members cannot write groups, polls, results or members directly', async () => {
  await rejects('authenticated', ADMIN, `update public.groups set member_count = 999`, [], /permission denied/);
  await rejects('authenticated', ADMIN, `insert into public.poll_results (poll_id, option_index, count) values ($1, 0, 5)`, [POLL_OPEN_HIDDEN], /permission denied/);
  await rejects('authenticated', MEMBER, `insert into public.group_members (group_id, user_id, display_name) values ($1, $2, 'x')`, [GROUP, OUTSIDER], /permission denied/);
  await rejects('authenticated', ADMIN, `update public.polls set status = 'closed'`, [], /permission denied/);
});

test('invites: admin manages them, members cannot see them', async () => {
  assert.deepEqual(await rows('authenticated', MEMBER, `select * from public.invites`), []);
  const hash = 'f'.repeat(64);
  await as('authenticated', ADMIN, (tx) =>
    tx.query(`insert into public.invites (group_id, token_hash, max_uses, expires_at) values ($1, $2, 1, now() - interval '1 minute')`, [GROUP, hash]),
  );
  assert.equal((await rows('authenticated', ADMIN, `select id from public.invites`)).length, 2);
  await assert.rejects(
    as('authenticated', MEMBER, (tx) => tx.query(`insert into public.invites (group_id, token_hash) values ($1, $2)`, [GROUP, 'e'.repeat(64)])),
    /row-level security/,
  );
});

// --- public audit view -------------------------------------------------------

test('public_poll_audit: anon sees closed polls only, with a matching recount and no identities', async () => {
  const r = await rows('anon', null, `select * from public.public_poll_audit`);
  assert.equal(r.length, 1);
  const a = r[0];
  assert.equal(a.poll_id, POLL_CLOSED);
  assert.equal(a.members_at_open, 9);
  assert.equal(a.answers, 7);
  assert.equal(a.votes.length, 7);
  assert.deepEqual(Object.keys(a.votes[0]).sort(), ['choice', 'ledger', 'nullifier', 'tx_hash']);
  assert.deepEqual(a.recount, { 2: 1, 3: 2, 4: 3, 5: 1 });
  assert.equal(a.tally_matches, true);
  for (const k of Object.keys(a)) assert.ok(!/user|email|display_name/.test(k), `leaks ${k}`);
  // ...and anon still has no route to the base tables.
  await rejects('anon', null, `select * from public.polls`, [], /permission denied/);
});

// --- RPCs ---------------------------------------------------------------------

test('invite_preview works for anon and reports invite state', async () => {
  const [p] = await rows('anon', null, `select * from public.invite_preview($1)`, ['demo-invite-token']);
  assert.equal(p.group_id, GROUP);
  assert.equal(p.invite_state, 'ok');
  assert.equal(p.member_count, 9);
  assert.deepEqual(await rows('anon', null, `select * from public.invite_preview('nope')`), []);
});

test('redeem_invite: joins once, consumes one use, is idempotent', async () => {
  const [r] = await rows('authenticated', OUTSIDER, `select public.redeem_invite($1, $2) as g`, ['demo-invite-token', '  Outsider Joined ']);
  assert.equal(r.g, GROUP);
  await rows('authenticated', OUTSIDER, `select public.redeem_invite($1, $2)`, ['demo-invite-token', 'Again']);
  const [inv] = (await db.query(`select uses from public.invites where token_hash = encode(sha256(convert_to('demo-invite-token','UTF8')),'hex')`)).rows;
  assert.equal(inv.uses, 1);
  const mine = await rows('authenticated', OUTSIDER, `select display_name, status from public.group_members`);
  assert.deepEqual(mine, [{ display_name: 'Outsider Joined', status: 'active' }]);
});

test('redeem_invite: rejects bad, expired and anonymous redemptions', async () => {
  await rejects('authenticated', OUTSIDER, `select public.redeem_invite('wrong', 'x')`, [], /invite_not_found/);
  // Expired invite created by the admin test above; use a fresh user.
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000bb', '{}')`);
  await db.query(`insert into public.invites (group_id, token_hash, expires_at) values ($1, encode(sha256(convert_to('old-token','UTF8')),'hex'), now() - interval '1 day')`, [GROUP]);
  await rejects('authenticated', '00000000-0000-4000-8000-0000000000bb', `select public.redeem_invite('old-token', 'Late')`, [], /invite_expired/);
  await rejects('anon', null, `select public.redeem_invite('demo-invite-token', 'x')`, [], /permission denied/);
});

test('poll_frozen_commitments: members get the leaf set at poll open; outsiders and anon do not', async () => {
  const leaves = Array.from({ length: 9 }, (_, i) => String(1000000000000000000000n + BigInt(i + 1)));
  const [{ c }] = await rows('authenticated', MEMBER, `select public.poll_frozen_commitments($1) as c`, [POLL_OPEN_HIDDEN]);
  assert.deepEqual(c, leaves);
  await rejects('authenticated', '00000000-0000-4000-8000-0000000000bb', `select public.poll_frozen_commitments($1)`, [POLL_OPEN_HIDDEN], /poll_not_found/);
  await rejects('anon', null, `select public.poll_frozen_commitments($1)`, [POLL_OPEN_HIDDEN], /permission denied/);
});

test('submit_commitment: members queue a commitment the admin can read; nobody else can', async () => {
  const c = '12345678901234567890';
  await rows('authenticated', OUTSIDER, `select public.submit_commitment($1, $2)`, [GROUP, c]);
  const adminView = await rows('authenticated', ADMIN, `select commitment from public.pending_commitments`);
  assert.deepEqual(adminView, [{ commitment: c }]);
  assert.deepEqual(await rows('authenticated', MEMBER, `select * from public.pending_commitments`), []);
  await rejects('authenticated', MEMBER, `select public.submit_commitment($1, '0')`, [GROUP], /invalid_commitment/);
  await rejects('authenticated', MEMBER, `select public.submit_commitment($1, $2)`, [GROUP, '21888242871839275222246405745257275088548364400416034343698204186575808495617'], /invalid_commitment/);
  await rejects('authenticated', '00000000-0000-4000-8000-0000000000bb', `select public.submit_commitment($1, '5')`, [GROUP], /not_a_member/);
  await rejects('anon', null, `select public.submit_commitment($1, '5')`, [GROUP], /permission denied/);
});

test('deactivate_member: admin "Remove" is off-chain only and blocks access and rejoining (D5)', async () => {
  // OUTSIDER joined through the invite above.
  await rejects('authenticated', MEMBER, `select public.deactivate_member($1, $2)`, [GROUP, OUTSIDER], /not_group_admin/);
  await rejects('authenticated', ADMIN, `select public.deactivate_member($1, $2)`, [GROUP, ADMIN], /cannot_remove_admin/);
  await rejects('authenticated', ADMIN, `select public.deactivate_member($1, $2)`, [GROUP, '00000000-0000-4000-8000-0000000000cc'], /member_not_found/);
  await rejects('anon', null, `select public.deactivate_member($1, $2)`, [GROUP, OUTSIDER], /permission denied/);

  const before = (await db.query(`select member_count from public.groups where id = $1`, [GROUP])).rows[0].member_count;
  await rows('authenticated', ADMIN, `select public.deactivate_member($1, $2)`, [GROUP, OUTSIDER]);
  await rows('authenticated', ADMIN, `select public.deactivate_member($1, $2)`, [GROUP, OUTSIDER]); // idempotent

  // Nothing on-chain changes, so the anonymity set (member_count) is untouched.
  assert.equal((await db.query(`select member_count from public.groups where id = $1`, [GROUP])).rows[0].member_count, before);
  assert.deepEqual(await rows('authenticated', OUTSIDER, `select id from public.groups`), []);
  assert.deepEqual(await rows('authenticated', OUTSIDER, `select id from public.polls`), []);
  assert.deepEqual(await rows('authenticated', OUTSIDER, `select status from public.group_members`), [{ status: 'removed' }]);
  await rejects('authenticated', OUTSIDER, `select public.submit_commitment($1, '5')`, [GROUP], /not_a_member/);
  await rejects('authenticated', OUTSIDER, `select public.redeem_invite('demo-invite-token', 'Back')`, [], /membership_removed/);

  // Active rows cannot be deleted directly (RLS filters them out); a removed row can ("allow back in").
  const kept = await as('authenticated', ADMIN, (tx) =>
    tx.query(`delete from public.group_members where group_id = $1 and user_id = $2 returning user_id`, [GROUP, MEMBER]),
  );
  assert.equal(kept.rows.length, 0);
  const gone = await as('authenticated', ADMIN, (tx) =>
    tx.query(`delete from public.group_members where group_id = $1 and user_id = $2 returning user_id`, [GROUP, OUTSIDER]),
  );
  assert.equal(gone.rows.length, 1);
});

test('indexer clears queued commitments once they land on the public record', async () => {
  await db.query(
    `insert into public.chain_events (event_id, ledger, tx_hash, event_index, contract, type, topic_id, payload)
     values ('0000000000000009999-0000000000', 9999, $1, 0, 'C', 'member_added', 1,
             jsonb_build_object('index', 9, 'commitment', '12345678901234567890', 'root', '777'))`,
    ['9'.repeat(64)],
  );
  const res = (await db.query(`select public.lihim_recompute_group(1) as r`)).rows[0].r;
  assert.deepEqual(res, { member_count: 10, root: '777' });
  assert.deepEqual((await db.query(`select * from public.pending_commitments`)).rows, []);
});

test('indexer RPCs are service-role only', async () => {
  await rejects('authenticated', ADMIN, `select public.lihim_recompute_poll(1)`, [], /permission denied/);
  await rejects('anon', null, `select public.lihim_close_expired_polls()`, [], /permission denied/);
  const r = await rows('service_role', null, `select public.lihim_close_expired_polls() as n`);
  assert.equal(r[0].n, 0);
});

test('push_subscriptions are self-only', async () => {
  await as('authenticated', MEMBER, (tx) =>
    tx.query(`insert into public.push_subscriptions (endpoint, keys) values ('https://push.example/abc', '{"p256dh":"x","auth":"y"}')`),
  );
  assert.equal((await rows('authenticated', MEMBER, `select * from public.push_subscriptions`)).length, 1);
  assert.deepEqual(await rows('authenticated', ADMIN, `select * from public.push_subscriptions`), []);
  await assert.rejects(
    as('authenticated', ADMIN, (tx) =>
      tx.query(`insert into public.push_subscriptions (user_id, endpoint, keys) values ($1, 'https://push.example/x', '{"p256dh":"x","auth":"y"}')`, [MEMBER]),
    ),
    /row-level security/,
  );
});

// --- schedules / triggers --------------------------------------------------------

test('cron jobs are registered', async () => {
  const jobs = (await db.query(`select jobname, schedule from cron.job order by jobname`)).rows;
  assert.deepEqual(jobs.map((j) => [j.jobname, j.schedule]), [
    ['lihim-closing-reminders', '*/10 * * * *'],
    ['lihim-indexer', '* * * * *'],
    ['lihim-keeper', '17 3 * * *'],
    ['lihim-webauthn-challenge-cleanup', '41 * * * *'],
  ]);
});

test('a poll becoming open calls the notify function with the cron secret', async () => {
  await db.query(`insert into vault.decrypted_secrets values ('lihim_project_url', 'https://proj.supabase.co/'), ('lihim_cron_secret', 's3cret')`);
  await db.query(`delete from net._calls`);
  await db.query(
    `insert into public.polls (id, group_id, title, options, kind, closes_at)
     values ('22222222-2222-4222-8222-000000000009', $1, 'Pizza or pancit?', '["Pizza","Pancit"]', 'single', now() + interval '1 day')`,
    [GROUP],
  );
  assert.equal((await db.query(`select * from net._calls`)).rows.length, 0, 'drafts do not notify');
  await db.query(`update public.polls set chain_poll_id = 9, status = 'open' where id = '22222222-2222-4222-8222-000000000009'`);
  const calls = (await db.query(`select url, body, headers from net._calls`)).rows;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://proj.supabase.co/functions/v1/notify');
  assert.deepEqual(calls[0].body, { type: 'poll_opened', poll_id: '22222222-2222-4222-8222-000000000009' });
  assert.equal(calls[0].headers['x-lihim-cron'], 's3cret');
});
