-- A separately audited, one-time supplier-wallet test is intentionally kept
-- distinct from customer checkout and payment records.
alter table public.orders
  add column if not exists order_source text not null default 'storefront';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_order_source_check'
  ) then
    alter table public.orders
      add constraint orders_order_source_check
      check (order_source in ('storefront', 'manual_printkk_test'));
  end if;
end $$;

-- This is a single deliberate supplier-wallet test, not a repeatable public
-- checkout bypass. A separate migration is required before another can be made.
create unique index if not exists orders_one_manual_printkk_test_idx
  on public.orders (order_source)
  where order_source = 'manual_printkk_test';
