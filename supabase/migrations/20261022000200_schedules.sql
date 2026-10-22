-- Background jobs: indexer (every minute), keeper (daily), closing-soon
-- reminders, and the "new poll" push trigger.
--
-- Edge Functions are invoked through pg_net with a shared secret header
-- (x-lihim-cron) instead of the service-role key, so Vault never holds a key
-- that can bypass RLS. Set the two Vault secrets once per project:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'lihim_project_url');
--   select vault.create_secret('<long random string>', 'lihim_cron_secret');
--
-- and the same value as the Edge Function secret CRON_SECRET:
--
--   supabase secrets set CRON_SECRET='<long random string>'
--
-- For local dev use 'http://host.docker.internal:54321' as the project URL
-- (Postgres runs in Docker and must reach the edge runtime on the host network).
-- Until both secrets exist, invoke_edge_function() logs a warning and does nothing.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;

create function private.invoke_edge_function(p_function text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select ds.decrypted_secret into v_url
  from vault.decrypted_secrets ds where ds.name = 'lihim_project_url';
  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds where ds.name = 'lihim_cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'lihim: vault secrets lihim_project_url / lihim_cron_secret not set; skipping %', p_function;
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_function,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-lihim-cron', v_secret),
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
exception
  -- A failed push or indexer kick must never roll back the write that triggered it.
  when others then
    raise warning 'lihim: invoke_edge_function(%) failed: %', p_function, sqlerrm;
    return null;
end;
$$;

revoke all on function private.invoke_edge_function(text, jsonb) from public;

-- "New poll in <group>" goes out when a poll becomes open (create_poll
-- confirmed), to every member of the group equally.
create function private.notify_poll_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    perform private.invoke_edge_function(
      'notify',
      jsonb_build_object('type', 'poll_opened', 'poll_id', new.id)
    );
  end if;
  return null;
end;
$$;

revoke all on function private.notify_poll_opened() from public;

create trigger polls_notify_opened
  after insert or update of status on public.polls
  for each row execute function private.notify_poll_opened();

-- cron.schedule() with an existing job name replaces it, so re-running is safe.
select cron.schedule(
  'lihim-indexer',
  '* * * * *',
  $$ select private.invoke_edge_function('indexer') $$
);

select cron.schedule(
  'lihim-keeper',
  '17 3 * * *',
  $$ select private.invoke_edge_function('keeper') $$
);

-- notify picks polls closing within 2 hours that have not had their reminder yet.
select cron.schedule(
  'lihim-closing-reminders',
  '*/10 * * * *',
  $$ select private.invoke_edge_function('notify', '{"type":"closing_soon"}'::jsonb) $$
);

select cron.schedule(
  'lihim-webauthn-challenge-cleanup',
  '41 * * * *',
  $$ delete from public.webauthn_challenges where expires_at < now() - interval '1 hour' $$
);
