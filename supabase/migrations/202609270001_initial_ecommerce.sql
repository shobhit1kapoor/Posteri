-- POSTERI's first production schema.
-- Apply with `supabase db push` after linking the project, or paste into the
-- Supabase SQL editor once for a hosted project. Every public table has RLS.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  department text not null,
  category text not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  dodo_product_id text unique,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  kind text not null default 'poster' check (kind in ('poster', 'room_mockup')),
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (product_id, kind, position)
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index carts_one_open_cart_per_user
  on public.carts (user_id);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null check (quantity between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  dodo_checkout_session_id text unique,
  dodo_payment_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents + shipping_cents)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity between 1 and 20),
  created_at timestamptz not null default now()
);

-- An append-only record of verified provider webhooks. This provides idempotency
-- and leaves the raw payload available for support and reconciliation work.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  order_id uuid references public.orders (id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index product_images_product_id_idx on public.product_images (product_id);
create index cart_items_cart_id_idx on public.cart_items (cart_id);
create index orders_user_id_idx on public.orders (user_id);
create index order_items_order_id_idx on public.order_items (order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger carts_set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();
create trigger cart_items_set_updated_at before update on public.cart_items
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_events enable row level security;

-- Storefront data is public only once a product is explicitly published.
create policy "Anyone can view active products"
  on public.products for select
  using (active = true);

create policy "Anyone can view images for active products"
  on public.product_images for select
  using (
    exists (
      select 1 from public.products
      where products.id = product_images.product_id and products.active = true
    )
  );

create policy "Customers can read their profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Customers can read their own cart"
  on public.carts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Customers can create their own cart"
  on public.carts for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Customers can update their own cart"
  on public.carts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Customers can delete their own cart"
  on public.carts for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Customers can read items in their own cart"
  on public.cart_items for select to authenticated
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id and carts.user_id = (select auth.uid())
    )
  );

create policy "Customers can add items to their own cart"
  on public.cart_items for insert to authenticated
  with check (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id and carts.user_id = (select auth.uid())
    )
  );

create policy "Customers can update items in their own cart"
  on public.cart_items for update to authenticated
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id and carts.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id and carts.user_id = (select auth.uid())
    )
  );

create policy "Customers can delete items in their own cart"
  on public.cart_items for delete to authenticated
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id and carts.user_id = (select auth.uid())
    )
  );

create policy "Customers can read their own orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Customers can read items from their own orders"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id and orders.user_id = (select auth.uid())
    )
  );

-- The browser role receives read access only. Inventory, orders, and payment
-- events are written by server routes after their input/webhook is verified.
grant select on public.products, public.product_images to anon, authenticated;
grant select, insert, update, delete on public.carts, public.cart_items to authenticated;
grant select on public.profiles, public.orders, public.order_items to authenticated;
