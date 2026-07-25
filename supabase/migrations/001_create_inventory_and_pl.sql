-- Migration: create products, restock_logs, and sales_logs tables

create table if not exists public.products (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    current_stock integer not null default 0 check (current_stock >= 0),
    cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
    selling_price numeric(12, 2) not null default 0 check (selling_price >= 0),
    created_at timestamptz not null default now()
);

create table if not exists public.restock_logs (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    product_id bigint not null references public.products(id) on delete restrict,
    quantity integer not null check (quantity > 0),
    cost_per_unit numeric(12, 2) not null check (cost_per_unit >= 0),
    timestamp timestamptz not null default now()
);

create table if not exists public.sales_logs (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    product_id bigint not null references public.products(id) on delete restrict,
    quantity_sold integer not null check (quantity_sold <> 0),
    selling_price_at_time_of_sale numeric(12, 2) not null,
    cost_price_at_time_of_sale numeric(12, 2) not null,
    total_revenue numeric(12, 2) not null,
    timestamp timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.restock_logs enable row level security;
alter table public.sales_logs enable row level security;

create policy if not exists products_owner_select on public.products
    for select using (auth.uid() = user_id);
create policy if not exists products_owner_insert on public.products
    for insert with check (auth.uid() = user_id);
create policy if not exists products_owner_update on public.products
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists products_owner_delete on public.products
    for delete using (auth.uid() = user_id);

create policy if not exists restock_logs_owner_select on public.restock_logs
    for select using (auth.uid() = user_id);
create policy if not exists restock_logs_owner_insert on public.restock_logs
    for insert with check (auth.uid() = user_id);
create policy if not exists restock_logs_owner_update on public.restock_logs
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists restock_logs_owner_delete on public.restock_logs
    for delete using (auth.uid() = user_id);

create policy if not exists sales_logs_owner_select on public.sales_logs
    for select using (auth.uid() = user_id);
create policy if not exists sales_logs_owner_insert on public.sales_logs
    for insert with check (auth.uid() = user_id);
create policy if not exists sales_logs_owner_update on public.sales_logs
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists sales_logs_owner_delete on public.sales_logs
    for delete using (auth.uid() = user_id);

create index if not exists idx_restock_logs_product_id on public.restock_logs(product_id);
create index if not exists idx_sales_logs_product_id on public.sales_logs(product_id);
create index if not exists idx_sales_logs_timestamp on public.sales_logs(timestamp);
