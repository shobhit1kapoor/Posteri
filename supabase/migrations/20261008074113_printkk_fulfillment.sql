-- Print-on-demand fulfillment through PrintKK. Provider credentials remain
-- server-side; customer-facing roles cannot inspect fulfillment payloads.

alter table public.orders
  add column fulfillment_status text not null default 'awaiting_payment',
  add column printkk_order_id text unique,
  add column printkk_order_status text,
  add column printkk_shipments jsonb not null default '[]'::jsonb,
  add column printkk_submitted_at timestamptz,
  add column printkk_status_checked_at timestamptz,
  add column fulfillment_error text;

alter table public.orders
  add constraint orders_fulfillment_status_check check (fulfillment_status in (
    'awaiting_payment', 'queued', 'processing', 'supplier_payment_pending',
    'submitted', 'in_production', 'partially_shipped', 'shipped', 'delivered',
    'cancelled', 'failed', 'needs_configuration', 'needs_review'
  ));

update public.orders
set fulfillment_status = case
  when status in ('paid', 'fulfilled') then 'needs_configuration'
  when status in ('cancelled', 'refunded') then 'cancelled'
  else 'awaiting_payment'
end;

alter table public.order_items
  add column poster_size text not null default '16 × 24 in',
  add column printkk_design_specification_code text;

alter table public.order_items
  add constraint order_items_poster_size_check check (poster_size in (
    '8 × 12 in', '16 × 24 in', '24 × 36 in'
  ));

-- A mapping is created once per artwork/size/finish during catalog setup. The
-- order item snapshots the specification code so later catalog edits cannot
-- alter an already-paid order.
create table public.product_printkk_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  poster_size text not null check (poster_size in ('8 × 12 in', '16 × 24 in', '24 × 36 in')),
  finish text not null default 'Matte',
  printkk_product_code text not null,
  printkk_design_code text not null,
  printkk_design_specification_code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, poster_size, finish),
  unique (printkk_design_specification_code)
);

create table public.fulfillment_jobs (
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

create index product_printkk_variants_product_idx
  on public.product_printkk_variants (product_id, poster_size) where active;
create index fulfillment_jobs_queue_idx
  on public.fulfillment_jobs (available_at, created_at) where status = 'queued';
create index orders_printkk_poll_idx
  on public.orders (printkk_status_checked_at) where printkk_order_id is not null;

create trigger product_printkk_variants_set_updated_at before update on public.product_printkk_variants
  for each row execute function public.set_updated_at();
create trigger fulfillment_jobs_set_updated_at before update on public.fulfillment_jobs
  for each row execute function public.set_updated_at();

alter table public.product_printkk_variants enable row level security;
alter table public.fulfillment_jobs enable row level security;

revoke all on public.product_printkk_variants, public.fulfillment_jobs from anon, authenticated;
grant all on public.product_printkk_variants, public.fulfillment_jobs to service_role;
