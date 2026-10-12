# ADR 0001: Next.js App Router with Supabase and Dodo Payments

## Status

Accepted — 2026-09-27

## Context

POSTERI started as a Vite visual prototype. The production storefront needs
server-only payment credentials, authenticated customer data, durable orders,
webhooks, SEO-friendly pages, and a deployable application boundary.

## Decision

Use Next.js App Router as the application framework. Keep the current React
storefront as a client component while the catalog is still static, then move
catalog, cart, wishlist, and order data into Supabase through server routes and
server components.

Use Supabase Auth and Postgres. RLS protects every publicly exposed table; the
Supabase service-role key is only available in server code.

Use Dodo Payments Checkout Sessions for payments. A server route will create
orders from server-validated product data, then create the Dodo checkout. A
signature-verified webhook will transition an order from `pending` to `paid`.
The browser must never set a price, an order status, or call Dodo directly.

## Consequences

- The current visual storefront remains functional during the migration.
- Database schema is applied only after a Supabase project is linked.
- Payment routes remain deliberately unexposed until Dodo product IDs and the
  verified webhook flow are configured; this avoids accepting unaudited orders.
- A later creator marketplace needs additional seller, listing, payout, and
  moderation tables; it is intentionally separate from this customer checkout
  foundation.
