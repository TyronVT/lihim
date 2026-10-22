-- The frozen member set a voter's proof must match: every leaf of the group's
-- LeanIMT at the moment the poll was created, in leaf order, with removed
-- leaves as '0'. The browser rebuilds the tree from it to prove membership
-- (apps/web: repo.getFrozenCommitments → @lihim/sdk proveVote).
--
-- Commitments are already public on-chain (member events); this only replays
-- the mirrored events that members cannot read directly (chain_events is
-- service-role only). It returns no user ids and nothing about who holds which
-- leaf, and only to members of the poll's group.
--
-- Returns null while the poll is a draft or its poll_created event has not
-- been indexed yet; the client should retry later.

create function public.poll_frozen_commitments(poll_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_poll public.polls;
  v_chain_group_id bigint;
  v_created_event text;
  v_leaves text[] := '{}';
  e record;
  v_i int;
  v_idx int;
begin
  select * into v_poll from public.polls p where p.id = poll_frozen_commitments.poll_id;
  if not found or not private.is_group_member(v_poll.group_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;
  if v_poll.chain_poll_id is null then
    return null;
  end if;

  select g.chain_group_id into v_chain_group_id from public.groups g where g.id = v_poll.group_id;

  select ce.event_id into v_created_event
  from public.chain_events ce
  where ce.type = 'poll_created' and ce.topic_id = v_poll.chain_poll_id
  order by ce.event_id
  limit 1;
  if v_created_event is null then
    return null;
  end if;

  for e in
    select ce.type, ce.payload
    from public.chain_events ce
    where ce.topic_id = v_chain_group_id
      and ce.type in ('member_added', 'members_added', 'member_updated', 'member_removed')
      and ce.event_id < v_created_event
    order by ce.event_id
  loop
    if e.type = 'members_added' then
      v_idx := (e.payload ->> 'start_index')::int;
      for v_i in 0 .. jsonb_array_length(e.payload -> 'commitments') - 1 loop
        v_leaves[v_idx + v_i + 1] := e.payload -> 'commitments' ->> v_i;
      end loop;
    else
      v_idx := (e.payload ->> 'index')::int;
      v_leaves[v_idx + 1] := case e.type
        when 'member_added' then e.payload ->> 'commitment'
        when 'member_updated' then e.payload ->> 'new'
        else '0'
      end;
    end if;
  end loop;

  -- A gap would mean a missed event; fail loudly rather than prove against the wrong tree.
  if array_position(v_leaves, null) is not null then
    raise exception 'frozen_set_incomplete' using errcode = 'XX000';
  end if;
  return v_leaves;
end;
$$;

revoke all on function public.poll_frozen_commitments(uuid) from public, anon, authenticated;
grant execute on function public.poll_frozen_commitments(uuid) to authenticated;
