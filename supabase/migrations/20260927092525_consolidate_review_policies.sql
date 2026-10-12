drop policy "Anyone can read published reviews" on public.reviews;
drop policy "Customers can read their own reviews" on public.reviews;

create policy "Visitors can read published reviews and customers their own"
  on public.reviews for select
  using (status = 'published' or (select auth.uid()) = user_id);
