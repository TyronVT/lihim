-- Public "verify this poll" data for L9.
--
-- Why a definer-rights view rather than security_invoker or an RPC:
--   * The readers are anonymous, and anon has no RLS access to polls, groups or
--     chain_events. A security_invoker view would therefore return nothing.
--   * The row filter (closed polls with a chain id) and the column list live in
--     the view definition itself, so no client-supplied filter can widen what is
--     visible; anon gets SELECT on the view and nothing on the base tables.
--   * A view stays filterable through PostgREST (?poll_id=eq.…) and cacheable,
--     where a definer function would need one RPC per access pattern.
-- security_barrier stops user-supplied predicates from being pushed below the
-- status filter and leaking rows of open polls through side channels.
--
-- Columns are limited to what the public record already contains (root, member
-- count at open, nullifier + choice per answer) plus the poll text whose hash
-- was committed on-chain (meta_hash). No names, no user ids, no member list.

create view public.public_poll_audit
with (security_invoker = false, security_barrier = true)
as
select
  p.id                     as poll_id,
  p.chain_poll_id,
  g.chain_group_id,
  g.name                   as group_name,
  g.member_count           as group_member_count,
  p.title,
  p.kind,
  p.options,
  p.meta_hash,
  p.opens_at,
  p.closes_at,
  p.frozen_root,
  p.frozen_size            as members_at_open,
  coalesce(v.answers, 0)   as answers,
  coalesce(v.votes, '[]'::jsonb)  as votes,         -- [{nullifier, choice, ledger, tx_hash}] in chain order
  coalesce(v.recount, '{}'::jsonb) as recount,      -- {"<option_index>": count} from the public record
  coalesce(c.cached, '{}'::jsonb)  as cached_tally, -- what L7 shows (poll_results)
  coalesce(v.recount, '{}'::jsonb) = coalesce(c.cached, '{}'::jsonb) as tally_matches
from public.polls p
join public.groups g on g.id = p.group_id
left join lateral (
  select
    count(*)::int as answers,
    jsonb_agg(
      jsonb_build_object(
        'nullifier', fv.nullifier,
        'choice', fv.choice,
        'ledger', fv.ledger,
        'tx_hash', fv.tx_hash
      ) order by fv.event_id
    ) as votes,
    (
      select jsonb_object_agg(t.choice::text, t.n)
      from (
        select x.choice, count(*) as n
        from (
          select distinct on (e2.payload ->> 'nullifier') (e2.payload ->> 'choice')::int as choice
          from public.chain_events e2
          where e2.type = 'voted' and e2.topic_id = p.chain_poll_id
          order by e2.payload ->> 'nullifier', e2.event_id
        ) x
        group by x.choice
      ) t
    ) as recount
  from (
    select distinct on (e.payload ->> 'nullifier')
      e.payload ->> 'nullifier' as nullifier,
      (e.payload ->> 'choice')::int as choice,
      e.ledger,
      e.tx_hash,
      e.event_id
    from public.chain_events e
    where e.type = 'voted' and e.topic_id = p.chain_poll_id
    order by e.payload ->> 'nullifier', e.event_id
  ) fv
) v on true
left join lateral (
  -- Zero-count rows are left out so the cache compares equal to the recount.
  select jsonb_object_agg(r.option_index::text, r.count) as cached
  from public.poll_results r
  where r.poll_id = p.id and r.count > 0
) c on true
where p.status = 'closed'
  and p.chain_poll_id is not null;

revoke all on public.public_poll_audit from public, anon, authenticated;
grant select on public.public_poll_audit to anon, authenticated, service_role;
