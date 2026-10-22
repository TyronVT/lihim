-- Lifecycle actions from the UI/UX spec (lihim-UIUX-SPEC.md → P3, P5, P6):
--
--   poll_open_states(group_id)   P6: tell "Opening…" from "Didn't open" for draft polls
--   discard_draft_poll(poll_id)  P6: "Discard" a poll whose create transaction failed
--   leave_group(group_id)        P3: a member leaves (off-chain, same limitation as D5)
--   update_display_name(name)    P5: L10 "Your name", also on every roster the user is on
--
-- Revoking an invite link (P3) needs nothing new: the admin already may update
-- invites.expires_at, and an expired link is refused by invite_preview/redeem_invite.

-- ---------------------------------------------------------------------------
-- P6: draft polls are polls whose create_poll transaction is in flight or failed.
-- pending_txs is service-role only (it carries tx hashes and error text), so this
-- returns just one word per draft, and only to the group's admin.
-- ---------------------------------------------------------------------------

-- A tx still "pending"/"submitted" after this long is treated as failed, so a
-- crashed relay never leaves the admin stuck on "Opening…". Kept above
-- submit-admin-tx's IN_FLIGHT_MS (2 min), so a retry is never refused as busy.
create function private.draft_stale_after()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '10 minutes' $$;

create function public.poll_open_states(group_id uuid)
returns table (poll_id uuid, open_state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_group_admin(poll_open_states.group_id) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    case
      when t.status in ('pending', 'submitted') and t.created_at > now() - private.draft_stale_after() then 'pending'
      when t.status = 'confirmed' then 'pending' -- confirmed but not promoted yet: the indexer will open it
      else 'failed' -- failed, stale, or the tx row was never written
    end
  from public.polls p
  left join lateral (
    select pt.status, pt.created_at
    from public.pending_txs pt
    where pt.poll_id = p.id and pt.kind = 'create_poll'
    order by pt.created_at desc
    limit 1
  ) t on true
  where p.group_id = poll_open_states.group_id
    and p.status = 'draft';
end;
$$;

-- Only a draft that is not opening may go. Members never saw it (RLS hides
-- drafts from them), so deleting it removes nothing anyone relied on.
create function public.discard_draft_poll(poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.polls;
begin
  select * into v_poll from public.polls p where p.id = discard_draft_poll.poll_id;
  if not found or not private.is_group_member(v_poll.group_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;
  if not private.is_group_admin(v_poll.group_id) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  if v_poll.status <> 'draft' then
    raise exception 'poll_not_draft' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.pending_txs pt
    where pt.poll_id = v_poll.id
      and pt.kind = 'create_poll'
      and (
        pt.status = 'confirmed'
        or (pt.status in ('pending', 'submitted') and pt.created_at > now() - private.draft_stale_after())
      )
  ) then
    raise exception 'poll_opening' using errcode = '55000';
  end if;

  delete from public.polls p where p.id = v_poll.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- P3: leave a group. Same on-chain limitation as deactivate_member (D5): the
-- member's leaf stays in the tree (only they know their commitment), so the
-- anonymity set (member_count) does not shrink and answers already given stay
-- counted. Off-chain the row is deleted rather than marked 'removed', so a new
-- invite link lets them back in (redeem_invite refuses 'removed' rows). The
-- admin can't leave: handing the group over is deferred (P3).
-- ---------------------------------------------------------------------------

create function public.leave_group(group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if private.is_group_admin(leave_group.group_id) then
    raise exception 'admin_cannot_leave' using errcode = '42501';
  end if;

  delete from public.group_members m
  where m.group_id = leave_group.group_id
    and m.user_id = (select auth.uid())
    and m.status = 'active';
  if not found then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- P5: the display name is asked once at sign-up and editable in Settings. The
-- roster copy in group_members (what admins see) follows it; members have no
-- update grant on group_members, hence the function.
-- ---------------------------------------------------------------------------

create function public.update_display_name(display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(update_display_name.display_name, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  update public.profiles set display_name = v_name where id = (select auth.uid());
  update public.group_members set display_name = v_name where user_id = (select auth.uid());
end;
$$;

revoke all on function private.draft_stale_after() from public;
grant execute on function private.draft_stale_after() to authenticated, service_role;

revoke all on function public.poll_open_states(uuid) from public, anon, authenticated;
revoke all on function public.discard_draft_poll(uuid) from public, anon, authenticated;
revoke all on function public.leave_group(uuid) from public, anon, authenticated;
revoke all on function public.update_display_name(text) from public, anon, authenticated;
grant execute on function public.poll_open_states(uuid) to authenticated;
grant execute on function public.discard_draft_poll(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.update_display_name(text) to authenticated;
