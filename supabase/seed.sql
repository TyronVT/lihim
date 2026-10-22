-- Local-dev demo data: one group (9 members), three polls (open/hidden,
-- closed rating, open yes/no) and a synthetic public record for them.
-- Commitments, roots, nullifiers and tx hashes are fake; they will NOT pass the
-- indexer's Poseidon root check and are never sent to a network.
-- Demo invite link token: demo-invite-token

-- Users ------------------------------------------------------------------------
-- The empty-string token columns keep GoTrue from choking on NULLs when it
-- scans these rows.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  '',
  now(),
  '{"provider":"passkey","providers":["passkey"]}'::jsonb,
  jsonb_build_object('display_name', u.display_name),
  now(),
  now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@demo.lihim.invalid',   'Ria (demo admin)'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'member2@demo.lihim.invalid', 'Paolo'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'member3@demo.lihim.invalid', 'Bea'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'member4@demo.lihim.invalid', 'Migs'),
  ('00000000-0000-4000-8000-000000000005'::uuid, 'member5@demo.lihim.invalid', 'Trish'),
  ('00000000-0000-4000-8000-000000000006'::uuid, 'member6@demo.lihim.invalid', 'Carlo'),
  ('00000000-0000-4000-8000-000000000007'::uuid, 'member7@demo.lihim.invalid', 'Jam'),
  ('00000000-0000-4000-8000-000000000008'::uuid, 'member8@demo.lihim.invalid', 'Kat'),
  ('00000000-0000-4000-8000-000000000009'::uuid, 'member9@demo.lihim.invalid', 'Nico'),
  -- Signed up, not in any group: use to try the invite link.
  ('00000000-0000-4000-8000-00000000000a'::uuid, 'outsider@demo.lihim.invalid', 'Outsider')
) as u (id, email, display_name);

-- Group --------------------------------------------------------------------------
insert into public.groups (id, chain_group_id, name, description, admin_user_id, admin_pubkey, min_members, status)
values (
  '11111111-1111-4111-8111-111111111111',
  1,
  'UP Sining (demo)',
  'Demo student org for local development.',
  '00000000-0000-4000-8000-000000000001',
  repeat('ab', 32),
  8,
  'active'
);

insert into public.group_members (group_id, user_id, display_name)
select '11111111-1111-4111-8111-111111111111', p.id, p.display_name
from public.profiles p
where p.id <> '00000000-0000-4000-8000-00000000000a';

insert into public.invites (group_id, token_hash, max_uses, expires_at)
values (
  '11111111-1111-4111-8111-111111111111',
  encode(sha256(convert_to('demo-invite-token', 'UTF8')), 'hex'),
  25,
  now() + interval '30 days'
);

-- Polls (drafts; lihim_recompute_poll below promotes them from the events) -------
-- meta_hash = sha256 of the canonical meta JSON (see functions/_shared/meta.ts).
insert into public.polls (id, group_id, chain_poll_id, title, options, kind, closes_at, hide_live_tally, meta_hash)
values
  (
    '22222222-2222-4222-8222-000000000001',
    '11111111-1111-4111-8111-111111111111',
    1,
    'Which date works for the org outing?',
    '["Sat, Nov 8","Sun, Nov 9","Sat, Nov 15"]',
    'single',
    now() + interval '3 days',
    true,
    encode(sha256(convert_to('{"v":1,"kind":"single","title":"Which date works for the org outing?","options":["Sat, Nov 8","Sun, Nov 9","Sat, Nov 15"]}', 'UTF8')), 'hex')
  ),
  (
    '22222222-2222-4222-8222-000000000002',
    '11111111-1111-4111-8111-111111111111',
    2,
    'Rate the treasurer''s Q3 report',
    null,
    'rating',
    now() - interval '1 day',
    true,
    encode(sha256(convert_to('{"v":1,"kind":"rating","title":"Rate the treasurer''s Q3 report","options":[]}', 'UTF8')), 'hex')
  ),
  (
    '22222222-2222-4222-8222-000000000003',
    '11111111-1111-4111-8111-111111111111',
    3,
    'Approve the 2026 budget?',
    '["Yes","No"]',
    'yesno',
    now() + interval '1 day',
    false,
    encode(sha256(convert_to('{"v":1,"kind":"yesno","title":"Approve the 2026 budget?","options":["Yes","No"]}', 'UTF8')), 'hex')
  );

-- Synthetic public record ----------------------------------------------------------
-- Payload shapes match functions/_shared/events.ts (U256/u64 as decimal strings).
create temporary table seed_events (
  n int, type text, topic_id bigint, payload jsonb, closed_at timestamptz
);

insert into seed_events values
  (1, 'group_created', 1, jsonb_build_object('admin', repeat('ab', 32)), now() - interval '10 days'),
  (2, 'members_added', 1, jsonb_build_object(
      'start_index', 0,
      'commitments', (select jsonb_agg((1000000000000000000000 + i)::text order by i) from generate_series(1, 9) i),
      'root', '4242424242424242424242424242424242'
    ), now() - interval '9 days'),
  (3, 'poll_created', 2, jsonb_build_object(
      'group_id', '1', 'kind_tag', 1, 'n_options', 5,
      'frozen_root', '4242424242424242424242424242424242', 'frozen_size', 9,
      'closes_at', extract(epoch from date_trunc('second', now() - interval '1 day'))::bigint::text,
      'meta_hash', (select meta_hash from public.polls where chain_poll_id = 2)
    ), now() - interval '5 days'),
  (4, 'poll_created', 1, jsonb_build_object(
      'group_id', '1', 'kind_tag', 0, 'n_options', 3,
      'frozen_root', '4242424242424242424242424242424242', 'frozen_size', 9,
      'closes_at', extract(epoch from date_trunc('second', now() + interval '3 days'))::bigint::text,
      'meta_hash', (select meta_hash from public.polls where chain_poll_id = 1)
    ), now() - interval '1 hour'),
  (5, 'poll_created', 3, jsonb_build_object(
      'group_id', '1', 'kind_tag', 2, 'n_options', 2,
      'frozen_root', '4242424242424242424242424242424242', 'frozen_size', 9,
      'closes_at', extract(epoch from date_trunc('second', now() + interval '1 day'))::bigint::text,
      'meta_hash', (select meta_hash from public.polls where chain_poll_id = 3)
    ), now() - interval '50 minutes');

-- Answers: poll 2 (closed rating) x7, poll 1 (open, hidden) x3, poll 3 (open yes/no) x4.
insert into seed_events
select 100 + v.i, 'voted', v.poll, jsonb_build_object('nullifier', (7000000000000000000000 + 100 * v.poll + v.i)::text, 'choice', v.choice),
       now() - interval '4 days' + v.i * interval '5 minutes'
from (values
  (2, 1, 3), (2, 2, 4), (2, 3, 4), (2, 4, 5), (2, 5, 2), (2, 6, 4), (2, 7, 3),
  (1, 8, 0), (1, 9, 2), (1, 10, 0),
  (3, 11, 0), (3, 12, 0), (3, 13, 1), (3, 14, 0)
) as v (poll, i, choice);

insert into seed_events values
  (200, 'poll_closed', 2, '{}'::jsonb, now() - interval '23 hours');

insert into public.chain_events (event_id, ledger, ledger_closed_at, tx_hash, event_index, contract, type, topic_id, payload)
select
  lpad((1000 + n)::text, 19, '0') || '-' || lpad('0', 10, '0'),
  1000 + n,
  closed_at,
  encode(sha256(convert_to('lihim-seed-tx-' || n, 'UTF8')), 'hex'),
  0,
  case when type in ('poll_created', 'voted', 'poll_closed')
       then 'CDEMOPOLLSCONTRACTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
       else 'CDEMOSEMAPHORECONTRACTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' end,
  type,
  topic_id,
  payload
from seed_events;

drop table seed_events;

update public.indexer_cursor set last_ledger = 1200, last_cursor = null where id = 1;

-- Derive member_count, roots, poll status and tallies exactly as the indexer would.
select public.lihim_recompute_group(1);
select public.lihim_recompute_poll(id) from (values (1::bigint), (2), (3)) as polls (id);
