-- Payment-provider mappings must be environment-specific: test SKUs must never
-- be selected when the app is configured for live payments.
create table public.product_dodo_mappings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  dodo_environment text not null check (dodo_environment in ('test_mode', 'live_mode')),
  dodo_product_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, dodo_environment),
  unique (dodo_environment, dodo_product_id)
);

-- One sandbox-only mapping lets the store owner exercise checkout immediately.
-- It intentionally points at Dodo's pre-existing test SKU, not a live product.
insert into public.product_dodo_mappings (product_id, dodo_environment, dodo_product_id)
select id, 'test_mode', 'pdt_0NoVFtiQLEIJGcKh1sV8U'
from public.products
where slug = 'fight-club' and active = true
on conflict do nothing;

alter table public.orders
  add column if not exists fulfillment_status text not null default 'awaiting_payment',
  add column if not exists fulfillment_mode text not null default 'disabled',
  add column if not exists printkk_order_id text unique,
  add column if not exists printkk_order_status text,
  add column if not exists printkk_shipments jsonb not null default '[]'::jsonb,
  add column if not exists printkk_submitted_at timestamptz,
  add column if not exists printkk_status_checked_at timestamptz,
  add column if not exists fulfillment_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_fulfillment_status_check') then
    alter table public.orders add constraint orders_fulfillment_status_check check (fulfillment_status in (
      'awaiting_payment', 'queued', 'processing', 'supplier_payment_pending',
      'submitted', 'in_production', 'partially_shipped', 'shipped', 'delivered',
      'cancelled', 'failed', 'needs_configuration', 'needs_review'
    ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_fulfillment_mode_check') then
    alter table public.orders add constraint orders_fulfillment_mode_check
      check (fulfillment_mode in ('disabled', 'dry_run', 'live'));
  end if;
end $$;

update public.orders
set fulfillment_status = case
  when status in ('paid', 'fulfilled') and fulfillment_status = 'awaiting_payment' then 'needs_configuration'
  when status in ('cancelled', 'refunded') then 'cancelled'
  else fulfillment_status
end;

alter table public.order_items
  add column if not exists poster_size text not null default '16 × 24 in',
  add column if not exists printkk_design_specification_code text,
  add column if not exists dodo_product_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_poster_size_check') then
    alter table public.order_items add constraint order_items_poster_size_check check (poster_size in (
      '8 × 12 in', '16 × 24 in', '24 × 36 in'
    ));
  end if;
end $$;

create table if not exists public.product_printkk_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  poster_size text not null check (poster_size in ('8 × 12 in', '16 × 24 in', '24 × 36 in')),
  finish text not null default 'Matte',
  printkk_product_code text not null,
  printkk_design_code text not null,
  printkk_design_specification_code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, poster_size, finish)
);

create table if not exists public.fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  provider text not null default 'printkk' check (provider = 'printkk'),
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'completed', 'needs_configuration', 'needs_review', 'failed'
  )),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_printkk_variants_product_idx
  on public.product_printkk_variants (product_id, poster_size) where active;
create index if not exists fulfillment_jobs_queue_idx
  on public.fulfillment_jobs (available_at, created_at) where status = 'queued';
create index if not exists orders_printkk_poll_idx
  on public.orders (printkk_status_checked_at) where printkk_order_id is not null;

drop trigger if exists product_printkk_variants_set_updated_at on public.product_printkk_variants;
create trigger product_printkk_variants_set_updated_at before update on public.product_printkk_variants
  for each row execute function public.set_updated_at();
drop trigger if exists fulfillment_jobs_set_updated_at on public.fulfillment_jobs;
create trigger fulfillment_jobs_set_updated_at before update on public.fulfillment_jobs
  for each row execute function public.set_updated_at();
drop trigger if exists product_dodo_mappings_set_updated_at on public.product_dodo_mappings;
create trigger product_dodo_mappings_set_updated_at before update on public.product_dodo_mappings
  for each row execute function public.set_updated_at();

alter table public.product_dodo_mappings enable row level security;
alter table public.product_printkk_variants enable row level security;
alter table public.fulfillment_jobs enable row level security;
revoke all on public.product_dodo_mappings, public.product_printkk_variants, public.fulfillment_jobs from anon, authenticated;
grant all on public.product_dodo_mappings, public.product_printkk_variants, public.fulfillment_jobs to service_role;
