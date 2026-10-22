-- Lihim: initial schema, RLS and RPCs.
--
-- Privacy invariant (enforced in review and by supabase/tests): no table pairs a
-- user with a commitment, a nullifier or a vote. RLS protects users from each
-- other; the invariant is what protects them from whoever holds the service key.
-- See supabase/README.md for the "never stored" checklist.

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------

-- RLS helpers and trigger functions. Not exposed through PostgREST
-- (config.toml api.schemas), so they cannot be called as RPCs.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.poll_kind as enum ('single', 'rating', 'yesno');

-- draft: row exists, create_poll not yet confirmed. open: confirmed, accepting
-- answers. closed: past closes_at or poll_closed seen on the public record.
create type public.poll_status as enum ('draft', 'open', 'closed');

-- removed: the admin's "Remove" (D5). Off-chain only: the member loses access
-- to the group, its polls and its push, and cannot rejoin with an invite. Their
-- leaf stays in the on-chain tree, because removing it needs their commitment,
-- which by design only they know (contracts/INTERFACE.md §11).
create type public.member_status as enum ('active', 'removed');

create type public.pending_tx_status as enum ('pending', 'submitted', 'confirmed', 'failed');

-- pending: create_group not yet confirmed, so no chain_group_id.
create type public.group_status as enum ('pending', 'active');

-- Admin actions only. There is intentionally no 'vote' value: votes go through
-- the separate relay and must never appear in pending_txs.
create type public.admin_action as enum (
  'create_group', 'add_member', 'add_members', 'update_member', 'remove_member', 'create_poll'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

-- TODO(M0): drop this table (and webauthn_challenges) if Supabase Auth ships
-- native passkey sign-in with PRF support.
create table public.passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique,              -- base64url
  public_key text not null,                        -- base64url COSE public key
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  webauthn_user_id text not null,                  -- WebAuthn user handle (base64url), not the auth uid
  device_type text check (device_type in ('singleDevice', 'multiDevice')),
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index passkey_credentials_user_id_idx on public.passkey_credentials (user_id);

-- Short-lived WebAuthn challenges. Service role only.
create table public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('registration', 'authentication')),
  challenge text not null,
  webauthn_user_id text,
  display_name text check (char_length(display_name) <= 80),
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);
create index webauthn_challenges_expires_at_idx on public.webauthn_challenges (expires_at);

create table public.groups (
  -- Picked by the browser before create_group, because it is the HKDF info of the
  -- per-group keys: "lihim/sem/" || id and "lihim/admin/" || id (D1), in the
  -- lowercase hyphenated text form Postgres prints. Never derived from chain_group_id.
  id uuid primary key default gen_random_uuid(),
  -- On-chain u64 group id (starts at 1), assigned by create_group.
  chain_group_id bigint unique check (chain_group_id >= 0),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  admin_user_id uuid not null references auth.users (id) on delete restrict,
  -- Per-group Ed25519 admin public key (hex). The private key never leaves the browser.
  admin_pubkey text not null check (admin_pubkey ~ '^[0-9a-f]{64}$'),
  min_members int not null default 8 check (min_members between 2 and 10000),
  -- Maintained by the indexer from member events: the size of the anonymity set,
  -- not the number of group_members rows.
  member_count int not null default 0 check (member_count >= 0),
  chain_root text check (chain_root ~ '^[0-9]{1,78}$'),  -- latest root seen on the public record
  status public.group_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint groups_active_has_chain_id check (status = 'pending' or chain_group_id is not null)
);
create index groups_admin_user_id_idx on public.groups (admin_user_id);

-- Who joined which group. NO commitment column: the server records "user X has
-- joined", never which leaf is theirs (spec: Open questions, blind joins).
create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  -- Day precision is all L4 shows ("joined date"), and coarse timestamps make it
  -- harder to line joins up against the order leaves were added on the public record.
  joined_at timestamptz not null default date_trunc('day', now()),
  status public.member_status not null default 'active',
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- hex sha256 of the raw token. The raw token only exists in the invite link.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Single-use by default: multi-use links make sock-puppet joins easier.
  max_uses int not null default 1 check (max_uses between 1 and 10000),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invites_uses_within_max check (uses <= max_uses)
);
create index invites_group_id_idx on public.invites (group_id);

-- Commitments waiting for the admin to add them to the group tree.
-- Deliberately has no user_id, no timestamp and a random id, so a row cannot be
-- joined back to the member who submitted it. Rows are deleted by the indexer
-- once the commitment shows up in a member_added/members_added event.
create table public.pending_commitments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  commitment text not null check (commitment ~ '^[0-9]{1,78}$'),
  unique (group_id, commitment)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  chain_poll_id bigint unique check (chain_poll_id >= 0),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- single: 2..8 labels. yesno: 2 labels (index 0 = Yes, 1 = No). rating: null (values 1..5).
  options jsonb,
  kind public.poll_kind not null,
  opens_at timestamptz,
  closes_at timestamptz not null,
  hide_live_tally boolean not null default true,
  voters_count int not null default 0 check (voters_count >= 0),  -- maintained by the indexer
  status public.poll_status not null default 'draft',
  frozen_root text check (frozen_root ~ '^[0-9]{1,78}$'),       -- from poll_created
  frozen_size int check (frozen_size >= 0),                       -- members at open
  meta_hash text check (meta_hash ~ '^[0-9a-f]{64}$'),           -- sha256 of canonical title/options JSON
  closing_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint polls_options_shape check (
    case kind
      when 'rating' then options is null
      when 'yesno' then jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 2
      else jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8
    end
    and (options is null or not jsonb_path_exists(options, '$[*] ? (@.type() != "string")'))
  ),
  constraint polls_non_draft_has_chain_id check (status = 'draft' or chain_poll_id is not null),
  constraint polls_closes_after_opens check (opens_at is null or closes_at > opens_at)
);
create index polls_group_id_status_idx on public.polls (group_id, status);
create index polls_open_closes_at_idx on public.polls (closes_at) where status = 'open';

-- Tally cache. option_index is the vote message as in the voted event: the
-- 0-based choice for single/yesno (0 = Yes), the rating value 1..5 for rating
-- polls. (The contract's own tally() vector is 0-based for ratings: bucket = message - 1.)
create table public.poll_results (
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_index int not null check (option_index between 0 and 255),
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (poll_id, option_index)
);

-- Mirror of LihimSemaphore / LihimPolls contract events. Public data; written
-- only by the indexer. topic_id is topic[1]: the group id or poll id.
create table public.chain_events (
  id bigint generated always as identity primary key,
  event_id text not null unique,  -- RPC event id; zero-padded, so it sorts in chain order
  ledger bigint not null,
  ledger_closed_at timestamptz,
  tx_hash text not null check (tx_hash ~ '^[0-9a-f]{64}$'),
  event_index int not null check (event_index >= 0),
  contract text not null,
  type text not null,
  topic_id bigint,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (tx_hash, event_index)
);
create index chain_events_type_topic_idx on public.chain_events (type, topic_id, event_id);

create table public.indexer_cursor (
  id smallint primary key default 1 check (id = 1),
  last_ledger bigint not null default 0,
  last_cursor text,
  updated_at timestamptz not null default now()
);
insert into public.indexer_cursor (id) values (1);

-- Admin transactions only (see admin_action). Never votes.
create table public.pending_txs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  poll_id uuid references public.polls (id) on delete set null,
  kind public.admin_action not null,
  tx_hash text unique check (tx_hash ~ '^[0-9a-f]{64}$'),
  status public.pending_tx_status not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pending_txs_group_id_idx on public.pending_txs (group_id, created_at desc);
create index pending_txs_open_idx on public.pending_txs (status) where status in ('pending', 'submitted');

-- Root/tally mismatches and indexer gaps. Service role only.
create table public.integrity_alerts (
  id bigint generated always as identity primary key,
  kind text not null,
  subject text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://'),
  keys jsonb not null check (keys ? 'p256dh' and keys ? 'auth'),
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ---------------------------------------------------------------------------
-- Trigger helpers
-- ---------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pending_txs_touch_updated_at
  before update on public.pending_txs
  for each row execute function private.touch_updated_at();

-- A profile row for every auth user. auth-passkey passes display_name in user metadata.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helpers
--
-- security definer so policies on group_members/groups can consult those tables
-- without recursing through their own policies. search_path = '' forces every
-- reference to be schema-qualified.
-- ---------------------------------------------------------------------------

create function private.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.admin_user_id = (select auth.uid())
  );
$$;

-- The admin counts as a member (they can see their own group and its polls).
create function private.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ) or private.is_group_admin(p_group_id);
$$;

-- Live tallies stay hidden while a poll is open with hide_live_tally, for
-- everyone including the admin: in small groups a live count can expose voters.
create function private.can_read_poll_results(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.polls p
    where p.id = p_poll_id
      and p.status <> 'draft'
      and (p.status = 'closed' or not p.hide_live_tally)
      and private.is_group_member(p.group_id)
  );
$$;

revoke all on function private.is_group_admin(uuid) from public;
revoke all on function private.is_group_member(uuid) from public;
revoke all on function private.can_read_poll_results(uuid) from public;
grant execute on function private.is_group_admin(uuid) to authenticated, service_role;
grant execute on function private.is_group_member(uuid) to authenticated, service_role;
grant execute on function private.can_read_poll_results(uuid) to authenticated, service_role;
revoke all on function private.touch_updated_at() from public;
revoke all on function private.handle_new_user() from public;

-- ---------------------------------------------------------------------------
-- Row Level Security: on for every table. No policy = no access for anon and
-- authenticated; service_role bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.passkey_credentials enable row level security;
alter table public.webauthn_challenges enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invites enable row level security;
alter table public.pending_commitments enable row level security;
alter table public.polls enable row level security;
alter table public.poll_results enable row level security;
alter table public.chain_events enable row level security;
alter table public.indexer_cursor enable row level security;
alter table public.pending_txs enable row level security;
alter table public.integrity_alerts enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles: self / self
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- passkey_credentials: users can list their own devices; writes go through auth-passkey.
create policy passkey_credentials_select_self on public.passkey_credentials
  for select to authenticated using (user_id = (select auth.uid()));

-- groups: members read; writes only by submit-admin-tx (service role) after confirmation.
create policy groups_select_member on public.groups
  for select to authenticated using (private.is_group_member(id));

-- group_members: admin sees every row, a member sees only their own.
-- Insert only via redeem_invite(). "Remove" is deactivate_member() (status =
-- 'removed'); the admin deleting a removed row is "allow back in" (they can
-- then redeem an invite again). Active rows cannot be deleted directly.
create policy group_members_select_admin on public.group_members
  for select to authenticated using (private.is_group_admin(group_id));
create policy group_members_select_self on public.group_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy group_members_delete_admin on public.group_members
  for delete to authenticated using (private.is_group_admin(group_id) and status = 'removed');

-- invites: admin only.
create policy invites_select_admin on public.invites
  for select to authenticated using (private.is_group_admin(group_id));
create policy invites_insert_admin on public.invites
  for insert to authenticated with check (private.is_group_admin(group_id) and uses = 0);
create policy invites_update_admin on public.invites
  for update to authenticated
  using (private.is_group_admin(group_id)) with check (private.is_group_admin(group_id));
create policy invites_delete_admin on public.invites
  for delete to authenticated using (private.is_group_admin(group_id));

-- pending_commitments: the admin reads them to sign add_members; inserts via
-- submit_commitment(), deletes by the indexer.
create policy pending_commitments_select_admin on public.pending_commitments
  for select to authenticated using (private.is_group_admin(group_id));

-- polls: members read non-draft polls; the admin also sees drafts.
-- Writes only by submit-admin-tx / indexer. Closed polls are public via public_poll_audit.
create policy polls_select_member on public.polls
  for select to authenticated
  using (
    private.is_group_member(group_id)
    and (status <> 'draft' or private.is_group_admin(group_id))
  );

-- poll_results: members, and only once the tally may be shown.
create policy poll_results_select_member on public.poll_results
  for select to authenticated using (private.can_read_poll_results(poll_id));

-- chain_events, indexer_cursor, pending_txs, webauthn_challenges, integrity_alerts:
-- no policies on purpose (service role only).

-- push_subscriptions: self / self
create policy push_subscriptions_select_self on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_insert_self on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_update_self on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete_self on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Table privileges. Supabase's default privileges grant everything to anon and
-- authenticated and leave filtering to RLS; narrow that so a missing policy is
-- not the only thing standing between a client and a table.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

grant select, insert on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.passkey_credentials to authenticated;
grant select on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant select, delete on public.invites to authenticated;
grant insert (group_id, token_hash, max_uses, expires_at) on public.invites to authenticated;
grant update (max_uses, expires_at) on public.invites to authenticated;
grant select on public.pending_commitments to authenticated;
grant select on public.polls to authenticated;
grant select on public.poll_results to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant update (keys) on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- What the join screen (L2) shows before the user commits to joining.
-- Returns no row for an unknown token.
create function public.invite_preview(token text)
returns table (group_id uuid, group_name text, member_count int, invite_state text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name,
    g.member_count,
    case
      when g.status <> 'active' then 'group_not_ready'
      when i.expires_at is not null and i.expires_at <= now() then 'expired'
      when i.uses >= i.max_uses then 'used_up'
      else 'ok'
    end
  from public.invites i
  join public.groups g on g.id = i.group_id
  where i.token_hash = encode(pg_catalog.sha256(convert_to(invite_preview.token, 'UTF8')), 'hex');
$$;

-- Join a group with an invite token. Records only "this user joined": the
-- member's commitment goes separately through submit_commitment(), unlinked.
-- Idempotent for a user who is already an active member (does not use up the invite).
create function public.redeem_invite(token text, display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(redeem_invite.display_name, ''));
  v_invite public.invites;
  v_group public.groups;
  v_existing public.member_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  select * into v_invite
  from public.invites i
  where i.token_hash = encode(pg_catalog.sha256(convert_to(coalesce(redeem_invite.token, ''), 'UTF8')), 'hex')
  for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  select * into v_group from public.groups g where g.id = v_invite.group_id;
  if v_group.status <> 'active' then
    raise exception 'group_not_ready' using errcode = '55000';
  end if;

  select m.status into v_existing
  from public.group_members m
  where m.group_id = v_group.id and m.user_id = v_uid;
  if v_existing = 'active' then
    return v_group.id;
  elsif v_existing = 'removed' then
    -- The admin removed this person (deactivate_member); only the admin deleting
    -- the removed row lets them back in.
    raise exception 'membership_removed' using errcode = '42501';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = '22023';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_used_up' using errcode = '22023';
  end if;

  insert into public.group_members (group_id, user_id, display_name)
  values (v_group.id, v_uid, v_name);

  update public.invites set uses = uses + 1 where id = v_invite.id;

  return v_group.id;
end;
$$;

-- Queue the caller's commitment for the admin to add on-chain.
-- Writes nothing that names the caller: no user column, no timestamp, and no
-- update to the caller's group_members row in the same transaction.
-- The spam bound is per group (pending queue can't outgrow the roster), not per
-- user, precisely so we never have to record who submitted.
create function public.submit_commitment(group_id uuid, commitment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- BN254 scalar field order: commitments are field elements.
  c_field_order constant numeric := 21888242871839275222246405745257275088548364400416034343698204186575808495617;
  v_active int;
  v_pending int;
begin
  if not exists (
    select 1 from public.group_members m
    where m.group_id = submit_commitment.group_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if submit_commitment.commitment !~ '^[0-9]{1,78}$'
     or submit_commitment.commitment::numeric = 0
     or submit_commitment.commitment::numeric >= c_field_order then
    raise exception 'invalid_commitment' using errcode = '22023';
  end if;

  select count(*) into v_active
  from public.group_members m
  where m.group_id = submit_commitment.group_id and m.status = 'active';
  select count(*) into v_pending
  from public.pending_commitments pc
  where pc.group_id = submit_commitment.group_id;
  if v_pending >= v_active then
    raise exception 'too_many_pending' using errcode = '54000';
  end if;

  insert into public.pending_commitments (group_id, commitment)
  values (submit_commitment.group_id, submit_commitment.commitment)
  on conflict do nothing;
end;
$$;

-- The admin's "Remove" (D5). Off-chain only: the member stops seeing the group
-- and its polls (RLS requires status = 'active'), gets no more push, cannot
-- queue a commitment and cannot rejoin through an invite. Nothing is sent
-- on-chain: remove_member needs the member's commitment, which nobody but the
-- member knows, so their leaf stays in the tree and member_count (the on-chain
-- anonymity set) does not change. A member-initiated leave or re-keying the
-- group is the later fix (contracts/INTERFACE.md §11). Idempotent.
create function public.deactivate_member(group_id uuid, user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_group_admin(deactivate_member.group_id) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.groups g
    where g.id = deactivate_member.group_id and g.admin_user_id = deactivate_member.user_id
  ) then
    raise exception 'cannot_remove_admin' using errcode = '42501';
  end if;

  update public.group_members m
  set status = 'removed'
  where m.group_id = deactivate_member.group_id
    and m.user_id = deactivate_member.user_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated directly, so revoking from PUBLIC alone is not enough.
revoke all on function public.invite_preview(text) from public, anon, authenticated;
revoke all on function public.redeem_invite(text, text) from public, anon, authenticated;
revoke all on function public.submit_commitment(uuid, text) from public, anon, authenticated;
revoke all on function public.deactivate_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.redeem_invite(text, text) to authenticated;
grant execute on function public.submit_commitment(uuid, text) to authenticated;
grant execute on function public.deactivate_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Indexer RPCs (service role only). Everything derived is recomputed from
-- chain_events rather than incremented, so re-running is always safe.
-- ---------------------------------------------------------------------------

-- member_count (= the contract's Group.members, the on-chain anonymity set) and
-- latest root for a group, from its member events.
-- Also clears queued commitments that have now landed in the tree.
create function public.lihim_recompute_group(p_chain_group_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
  v_root text;
begin
  select
    coalesce(sum(case e.type
      when 'member_added' then 1
      when 'members_added' then jsonb_array_length(e.payload -> 'commitments')
      when 'member_removed' then -1
      else 0 end), 0)
  into v_count
  from public.chain_events e
  where e.topic_id = p_chain_group_id
    and e.type in ('member_added', 'members_added', 'member_updated', 'member_removed');

  select e.payload ->> 'root' into v_root
  from public.chain_events e
  where e.topic_id = p_chain_group_id
    and e.type in ('member_added', 'members_added', 'member_updated', 'member_removed')
  order by e.event_id desc
  limit 1;

  update public.groups g
  set member_count = greatest(v_count, 0)::int,
      chain_root = coalesce(v_root, g.chain_root)
  where g.chain_group_id = p_chain_group_id;

  delete from public.pending_commitments pc
  using public.groups g
  where pc.group_id = g.id
    and g.chain_group_id = p_chain_group_id
    and exists (
      select 1 from public.chain_events e
      where e.topic_id = p_chain_group_id
        and (
          (e.type = 'member_added' and e.payload ->> 'commitment' = pc.commitment)
          or (e.type = 'members_added' and (e.payload -> 'commitments') ? pc.commitment)
          or (e.type = 'member_updated' and e.payload ->> 'new' = pc.commitment)
        )
    );

  return jsonb_build_object('member_count', greatest(v_count, 0), 'root', v_root);
end;
$$;

-- Frozen root/size, status, voters_count and the tally cache for one poll.
create function public.lihim_recompute_poll(p_chain_poll_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.polls;
  v_created jsonb;
  v_opened_at timestamptz;
  v_closed boolean;
  v_voters int;
  v_lo int;
  v_hi int;
begin
  select * into v_poll from public.polls p where p.chain_poll_id = p_chain_poll_id for update;
  if not found then
    return null;
  end if;

  select e.payload, e.ledger_closed_at into v_created, v_opened_at
  from public.chain_events e
  where e.type = 'poll_created' and e.topic_id = p_chain_poll_id
  order by e.event_id
  limit 1;

  select exists (
    select 1 from public.chain_events e
    where e.type = 'poll_closed' and e.topic_id = p_chain_poll_id
  ) into v_closed;

  -- The contract rejects duplicate nullifiers; counting distinct ones anyway
  -- keeps the cache honest even if the mirror ever double-ingests.
  select count(distinct e.payload ->> 'nullifier') into v_voters
  from public.chain_events e
  where e.type = 'voted' and e.topic_id = p_chain_poll_id;

  if v_poll.kind = 'rating' then
    v_lo := 1; v_hi := 5;
  else
    v_lo := 0; v_hi := jsonb_array_length(v_poll.options) - 1;
  end if;

  insert into public.poll_results as r (poll_id, option_index, count, updated_at)
  select v_poll.id, o.idx, coalesce(t.n, 0)::int, now()
  from (
    select generate_series(v_lo, v_hi) as idx
    union
    select (e.payload ->> 'choice')::int
    from public.chain_events e
    where e.type = 'voted' and e.topic_id = p_chain_poll_id
      and (e.payload ->> 'choice')::int between 0 and 255
  ) o
  left join (
    select first_votes.choice, count(*) as n
    from (
      select distinct on (e.payload ->> 'nullifier') (e.payload ->> 'choice')::int as choice
      from public.chain_events e
      where e.type = 'voted' and e.topic_id = p_chain_poll_id
      order by e.payload ->> 'nullifier', e.event_id
    ) first_votes
    group by first_votes.choice
  ) t on t.choice = o.idx
  on conflict (poll_id, option_index) do update
    set count = excluded.count, updated_at = excluded.updated_at
    where r.count is distinct from excluded.count;

  update public.polls p
  set frozen_root = coalesce(v_created ->> 'frozen_root', p.frozen_root),
      frozen_size = coalesce((v_created ->> 'frozen_size')::int, p.frozen_size),
      opens_at = case when v_created is null then p.opens_at
                      else coalesce(p.opens_at, v_opened_at, now()) end,
      voters_count = v_voters,
      status = case
        when v_closed or p.closes_at <= now() then 'closed'::public.poll_status
        when v_created is not null then 'open'::public.poll_status
        else p.status
      end
  where p.id = v_poll.id;

  return jsonb_build_object('voters_count', v_voters, 'closed', v_closed);
end;
$$;

-- The contract stops accepting answers at closes_at; mirror that without
-- waiting for someone to call close() on-chain (the keeper does that daily).
create function public.lihim_close_expired_polls()
returns int
language sql
security definer
set search_path = ''
as $$
  with closed as (
    update public.polls p
    set status = 'closed'
    where p.status = 'open' and p.closes_at <= now()
    returning 1
  )
  select count(*)::int from closed;
$$;

revoke all on function public.lihim_recompute_group(bigint) from public, anon, authenticated;
revoke all on function public.lihim_recompute_poll(bigint) from public, anon, authenticated;
revoke all on function public.lihim_close_expired_polls() from public, anon, authenticated;
grant execute on function public.lihim_recompute_group(bigint) to service_role;
grant execute on function public.lihim_recompute_poll(bigint) to service_role;
grant execute on function public.lihim_close_expired_polls() to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: live turnout (polls.voters_count) and, when allowed, live tallies.
-- postgres_changes respects RLS, so hidden tallies are not broadcast.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table public.polls, public.poll_results;
