create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subscription jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id)
);

alter table public.push_subscriptions enable row level security;

-- Drop existing policies if re-running the script
drop policy if exists push_subscriptions_owner_select on public.push_subscriptions;
drop policy if exists push_subscriptions_owner_insert on public.push_subscriptions;
drop policy if exists push_subscriptions_owner_update on public.push_subscriptions;
drop policy if exists push_subscriptions_owner_delete on public.push_subscriptions;

-- Recreate the policies cleanly
create policy push_subscriptions_owner_select on public.push_subscriptions
    for select using (auth.uid() = user_id);

create policy push_subscriptions_owner_insert on public.push_subscriptions
    for insert with check (auth.uid() = user_id);

create policy push_subscriptions_owner_update on public.push_subscriptions
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy push_subscriptions_owner_delete on public.push_subscriptions
    for delete using (auth.uid() = user_id);

create or replace function public.handle_push_subscriptions_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Drop and recreate the trigger safely
drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;

create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.handle_push_subscriptions_updated_at();