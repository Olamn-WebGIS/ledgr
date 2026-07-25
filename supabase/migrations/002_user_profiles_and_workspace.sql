create table if not exists public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    email text,
    business_name text,
    currency text default 'USD',
    language text default 'en',
    date_format text default 'MM/DD/YYYY',
    number_format text default 'commas',
    activity_tracking boolean default true,
    notification_preferences jsonb default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.workspace_snapshots (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    profile jsonb not null default '{}'::jsonb,
    expenses jsonb not null default '[]'::jsonb,
    inventory_meta jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id)
);

alter table public.user_profiles enable row level security;
alter table public.workspace_snapshots enable row level security;

create policy if not exists user_profiles_owner_select on public.user_profiles
    for select using (auth.uid() = id);
create policy if not exists user_profiles_owner_insert on public.user_profiles
    for insert with check (auth.uid() = id);
create policy if not exists user_profiles_owner_update on public.user_profiles
    for update using (auth.uid() = id) with check (auth.uid() = id);
create policy if not exists user_profiles_owner_delete on public.user_profiles
    for delete using (auth.uid() = id);

create policy if not exists workspace_snapshots_owner_select on public.workspace_snapshots
    for select using (auth.uid() = user_id);
create policy if not exists workspace_snapshots_owner_insert on public.workspace_snapshots
    for insert with check (auth.uid() = user_id);
create policy if not exists workspace_snapshots_owner_update on public.workspace_snapshots
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists workspace_snapshots_owner_delete on public.workspace_snapshots
    for delete using (auth.uid() = user_id);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger if not exists trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.handle_updated_at();

create trigger if not exists trg_workspace_snapshots_updated_at
before update on public.workspace_snapshots
for each row execute function public.handle_updated_at();
