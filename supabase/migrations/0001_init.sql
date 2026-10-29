-- Event Me AI — initial schema
create extension if not exists vector;

-- Invite codes (invite-only access). Only the service role reads/writes these.
create table public.invites (
  code text primary key,
  email text,                       -- optional: lock invite to one address
  created_by uuid references auth.users (id),
  used_by uuid references auth.users (id),
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  home_city text,
  home_country text default 'US',
  radius_miles int default 50,
  digest_enabled boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = user_id);
create policy "own profile update" on public.profiles for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- Users may edit their own preferences but never is_admin.
revoke update on public.profiles from authenticated;
grant update (display_name, home_city, home_country, radius_miles, digest_enabled) on public.profiles to authenticated;

-- One row per interest statement; structured is the interest agent's parsed output.
create table public.interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  raw_text text not null,
  structured jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.interests enable row level security;
create policy "own interests" on public.interests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Concerts are shared across users (tracked once, fanned out to followers).
create table public.events (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- 'ticketmaster' | 'seatgeek' | ...
  source_id text not null,
  name text not null,
  artists text[] not null default '{}',
  venue text,
  city text,
  country text,
  starts_at timestamptz,
  url text,
  image_url text,
  status text not null default 'scheduled', -- scheduled | postponed | cancelled | past
  last_tracked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);
alter table public.events enable row level security;
create policy "events readable by signed-in users" on public.events for select to authenticated using (true);

create table public.follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table public.follows enable row level security;
create policy "own follows" on public.follows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null,          -- news | social | lineup | tickets | logistics | change | setlist
  importance int not null default 1 check (importance between 1 and 3), -- 3 = alert-worthy
  title text not null,
  summary text not null,
  source_name text,
  url text,
  published_at timestamptz,
  embedding vector(1024),      -- reserved for semantic dedupe (phase 2)
  created_at timestamptz not null default now(),
  unique (event_id, url)
);
alter table public.updates enable row level security;
create policy "updates for followed events" on public.updates for select to authenticated
  using (exists (select 1 from public.follows f where f.event_id = updates.event_id and f.user_id = auth.uid()));
create index updates_event_created_idx on public.updates (event_id, created_at desc);

create table public.digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body_markdown text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.digests enable row level security;
create policy "own digests" on public.digests for select using (auth.uid() = user_id);

-- Create a profile row for each new auth user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
