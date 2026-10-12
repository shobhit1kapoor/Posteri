-- These tables are managed only by trusted server code using service_role.
-- Restrictive deny policies keep browser roles blocked even if a permissive
-- policy is accidentally added later.
create policy "Deny browser access to payment events"
  on public.payment_events as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy "Deny browser access to Dodo mappings"
  on public.product_dodo_mappings as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy "Deny browser access to PrintKK mappings"
  on public.product_printkk_variants as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy "Deny browser access to fulfillment jobs"
  on public.fulfillment_jobs as restrictive for all to anon, authenticated
  using (false) with check (false);

create index if not exists order_items_product_id_idx
  on public.order_items (product_id);
create index if not exists payment_events_order_id_idx
  on public.payment_events (order_id);
