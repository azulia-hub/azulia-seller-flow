-- Native Netlify Database migration. Applied by Netlify before publishing the deploy.
-- Tables are accessible only through the authenticated backend, not a public REST API.
create table if not exists public.azulia_users (
  id uuid primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.azulia_sessions (
  owner uuid not null references public.azulia_users(id) on delete cascade,
  access_hash text primary key,
  refresh_hash text not null unique,
  password_version text not null,
  access_expires_at bigint not null,
  refresh_expires_at bigint not null
);
create index if not exists azulia_sessions_expiry on public.azulia_sessions(refresh_expires_at);
create table if not exists public.azulia_auth_attempts (
  bucket text primary key,
  started_at bigint not null,
  attempts integer not null
);
create index if not exists azulia_auth_attempts_expiry on public.azulia_auth_attempts(started_at);
revoke all on public.azulia_users,public.azulia_sessions,public.azulia_auth_attempts from public;
alter table public.azulia_users enable row level security;
alter table public.azulia_sessions enable row level security;
alter table public.azulia_auth_attempts enable row level security;
create table if not exists public.azulia_accounts (
  owner uuid primary key references public.azulia_users(id) on delete cascade,
  version bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  credentials text,
  authorization_hash text,
  settings jsonb not null default '{"costs":[],"classificationRules":[],"missingCostPolicy":"BLOCK"}'::jsonb,
  settings_version bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.azulia_source (
  owner uuid not null references public.azulia_accounts(owner) on delete cascade,
  kind text not null check (kind in ('records','orders','catalog')),
  id text not null,
  value jsonb not null,
  primary key(owner,kind,id)
);
create table if not exists public.azulia_source_history (
  sequence bigint generated always as identity primary key,
  owner uuid not null references public.azulia_accounts(owner) on delete cascade,
  kind text not null, id text not null, value jsonb not null,
  observed_at timestamptz not null default now()
);
create index if not exists azulia_history_owner on public.azulia_source_history(owner,observed_at);
create table if not exists public.azulia_readings (
  owner uuid primary key references public.azulia_accounts(owner) on delete cascade,
  revision bigint not null, engine text not null, value jsonb not null
);
create table if not exists public.azulia_calculations (
  owner uuid primary key references public.azulia_accounts(owner) on delete cascade,
  key text not null, value jsonb not null
);
alter table public.azulia_calculations enable row level security;
revoke all on public.azulia_calculations from public;
alter table public.azulia_accounts enable row level security;
alter table public.azulia_source enable row level security;
alter table public.azulia_source_history enable row level security;
alter table public.azulia_readings enable row level security;
-- The Netlify database owner executes these functions after server authentication.
revoke all on public.azulia_accounts, public.azulia_source, public.azulia_source_history, public.azulia_readings from public;

-- One statement gives a coherent source snapshot, never pages from different revisions.
create or replace function public.azulia_snapshot(p_owner uuid) returns jsonb
language sql security invoker set search_path = public as $$
  select jsonb_build_object('version',a.version,'meta',a.metadata,
    'settings',a.settings,'settingsVersion',a.settings_version,
    'configured',a.credentials is not null,
    'records',coalesce((select jsonb_agg(value order by id) from azulia_source where owner=p_owner and kind='records'),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(value order by id) from azulia_source where owner=p_owner and kind='orders'),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(value order by id) from azulia_source where owner=p_owner and kind='catalog'),'[]'::jsonb))
  from azulia_accounts a where a.owner=p_owner;
$$;

-- Compare-and-swap + row lock: source pages, continuation and coverage commit together.
create or replace function public.azulia_commit(p_owner uuid, p_version bigint, p_metadata jsonb,
  p_writes jsonb default '[]'::jsonb) returns boolean
language plpgsql security invoker set search_path = public as $$
declare current_version bigint; item jsonb; old_value jsonb;
begin
  select version into current_version from azulia_accounts where owner=p_owner for update;
  if current_version is null or current_version <> p_version then return false; end if;
  for item in select * from jsonb_array_elements(p_writes) loop
    select value into old_value from azulia_source where owner=p_owner and kind=item->>'kind' and id=item->>'id';
    if old_value is distinct from item->'value' then
      if old_value is not null then
        insert into azulia_source_history(owner,kind,id,value) values(p_owner,item->>'kind',item->>'id',old_value);
      end if;
      insert into azulia_source(owner,kind,id,value) values(p_owner,item->>'kind',item->>'id',item->'value')
      on conflict(owner,kind,id) do update set value=excluded.value;
    end if;
  end loop;
  update azulia_accounts set metadata=p_metadata,version=version+1,updated_at=now() where owner=p_owner;
  return true;
end;
$$;
revoke all on function public.azulia_snapshot(uuid) from public;
revoke all on function public.azulia_commit(uuid,bigint,jsonb,jsonb) from public;

-- There is deliberately no automatic deletion or retention job.
create or replace function public.azulia_settings(p_owner uuid,p_version bigint,p_settings jsonb) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
  update azulia_accounts set settings=p_settings,settings_version=settings_version+1
  where owner=p_owner and settings_version=p_version;
  return found;
end;
$$;
revoke all on function public.azulia_settings(uuid,bigint,jsonb) from public;

create or replace function public.azulia_connect(p_owner uuid,p_identity text,p_credentials text) returns boolean
language plpgsql security invoker set search_path=public as $$
declare identity text;
begin
  select authorization_hash into identity from azulia_accounts where owner=p_owner for update;
  if identity is not null and identity <> p_identity then return false; end if;
  update azulia_accounts set credentials=p_credentials,authorization_hash=p_identity where owner=p_owner;
  return found;
end;
$$;
revoke all on function public.azulia_connect(uuid,text,text) from public;

-- Atomic persisted login throttle. Only fixed SQL in the server calls this function.
create or replace function public.azulia_auth_attempt(p_bucket text,p_now bigint,p_limit integer) returns boolean
language plpgsql security invoker set search_path=public as $$
declare count integer;
begin
  delete from azulia_auth_attempts where started_at < p_now-86400000;
  insert into azulia_auth_attempts(bucket,started_at,attempts) values(p_bucket,p_now,1)
  on conflict(bucket) do update set
    attempts=case when azulia_auth_attempts.started_at<=p_now-900000 then 1 else least(azulia_auth_attempts.attempts+1,100000) end,
    started_at=case when azulia_auth_attempts.started_at<=p_now-900000 then p_now else azulia_auth_attempts.started_at end
  returning attempts into count;
  return count<=p_limit;
end;
$$;
revoke all on function public.azulia_auth_attempt(text,bigint,integer) from public;
