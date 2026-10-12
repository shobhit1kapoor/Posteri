-- Customer account features used by the storefront: automatic profiles,
-- persisted wishlists, saved addresses, product reviews, and order delivery
-- snapshots. Administrative moderation and checkout writes remain server-only.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function private.handle_new_user();

create table public.wishlist_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  line_1 text not null,
  line_2 text,
  city text not null,
  region text,
  postal_code text not null,
  country_code char(2) not null,
  phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index addresses_one_default_per_customer
  on public.addresses (user_id)
  where is_default;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create table public.order_shipping_addresses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  recipient_name text not null,
  line_1 text not null,
  line_2 text,
  city text not null,
  region text,
  postal_code text not null,
  country_code char(2) not null,
  phone text,
  created_at timestamptz not null default now()
);

create trigger addresses_set_updated_at before update on public.addresses
  for each row execute function public.set_updated_at();
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.wishlist_items enable row level security;
alter table public.addresses enable row level security;
alter table public.reviews enable row level security;
alter table public.order_shipping_addresses enable row level security;

create policy "Customers can read their own wishlist"
  on public.wishlist_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Customers can add to their own wishlist"
  on public.wishlist_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Customers can remove from their own wishlist"
  on public.wishlist_items for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Customers can manage their own addresses"
  on public.addresses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Customers can add their own addresses"
  on public.addresses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Customers can update their own addresses"
  on public.addresses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Customers can remove their own addresses"
  on public.addresses for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Anyone can read published reviews"
  on public.reviews for select
  using (status = 'published');
create policy "Customers can read their own reviews"
  on public.reviews for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Customers can submit their own reviews"
  on public.reviews for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Customers can read delivery addresses for their own orders"
  on public.order_shipping_addresses for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_shipping_addresses.order_id
        and orders.user_id = (select auth.uid())
    )
  );

grant select, insert, delete on public.wishlist_items to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
grant select, insert on public.reviews to anon, authenticated;
grant select on public.order_shipping_addresses to authenticated;
