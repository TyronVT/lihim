-- Run the indexer as soon as an admin transaction is confirmed, instead of waiting for the
-- next minute of the lihim-indexer cron. Until the indexer has seen poll_created, a new poll
-- has no frozen_root and the vote screen says "not open yet"; members_added likewise only
-- shows up in member_count after an indexer run.
--
-- Fire-and-forget through the same pg_net helper the cron uses (x-lihim-cron secret), so it
-- never blocks or rolls back the status update. Overlapping runs are safe: the indexer upserts
-- events with ignoreDuplicates and recomputes groups/polls from chain_events.

create function private.index_on_admin_tx_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.invoke_edge_function('indexer');
  return null;
end;
$$;

revoke all on function private.index_on_admin_tx_confirmed() from public;

create trigger pending_txs_index_on_confirmed
  after update of status on public.pending_txs
  for each row
  when (new.status = 'confirmed' and old.status is distinct from 'confirmed')
  execute function private.index_on_admin_tx_confirmed();
