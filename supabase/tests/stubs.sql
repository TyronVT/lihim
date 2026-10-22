-- Minimal stand-ins for what a Supabase Postgres provides before our
-- migrations run: roles, default privileges, auth.users/auth.uid(), the
-- extensions schema, Vault, pg_net and pg_cron. Only for the PGlite harness.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Supabase's default privileges: everything in public is granted to the API
-- roles and RLS does the filtering. The migrations must narrow this.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- auth ------------------------------------------------------------------------
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  confirmation_token varchar(255),
  recovery_token varchar(255),
  email_change_token_new varchar(255),
  email_change varchar(255)
);

-- Same contract as Supabase: the JWT `sub` from request.jwt.claims.
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- vault -------------------------------------------------------------------------
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);

-- pg_net --------------------------------------------------------------------------
create schema net;
create table net._calls (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds int default 5000
) returns bigint
language sql
as $$
  insert into net._calls (url, body, headers) values (url, body, headers) returning id
$$;

-- pg_cron ---------------------------------------------------------------------------
create schema cron;
create table cron.job (jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql
as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
