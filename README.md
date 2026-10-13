# POSTERI

POSTERI is a Next.js App Router storefront for poster editions. The existing
visual catalog stays in place while the project migrates to Supabase-backed
catalog, customer, cart, and order data.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The current storefront
works without credentials; Supabase-backed features activate only after the
public Supabase environment variables are added.

Without credentials, checkout uses a **local demo simulator**. It validates
the cart through `/api/checkout`, calculates its own total, and never charges
a card. The simulator is disabled in production, so an incomplete Dodo setup
cannot accidentally accept real orders.

## Required environment variables

| Variable | Where it is used | Visibility |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | canonical app/return URL | public |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase browser and server client | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase browser and server client | public |
| `SUPABASE_SERVICE_ROLE_KEY` | protected server-side administrative work | server only |
| `DODO_PAYMENTS_ENVIRONMENT` | `test_mode` or `live_mode` | server only |
| `DODO_PAYMENTS_API_KEY` | creating Dodo checkout sessions | server only |
| `DODO_PAYMENTS_WEBHOOK_KEY` | verifying Dodo webhook signatures | server only |
| `DODO_PAYMENTS_RETURN_URL` | destination after checkout | server only |
| `DODO_SHIPPING_PRODUCT_ID` | Dodo test SKU used for paid shipping | server only |
| `DODO_PAYMENTS_LIVE_SHIPPING_PRODUCT_ID` | Dodo live SKU used for paid shipping | server only |
| `DODO_CHECKOUT_ENABLED` | explicit `true` switch to enable Dodo checkout | server only |
| `PRINTKK_API_KEY` | PrintKK API authentication | server only |
| `PRINTKK_SECRET_KEY` | PrintKK request signing | server only |
| `PRINTKK_API_BASE_URL` | PrintKK API host (default: `https://api.printkk.com`) | server only |
| `PRINTKK_POSTER_PRODUCT_CODE` | PrintKK poster product template | server only |
| `PRINTKK_FULFILLMENT_MODE` | `disabled`, safe `dry_run`, or supplier-spending `live` | server only |
| `PRINTKK_SHIPPING_PRIORITY` | preferred supplier shipping order | server only |
| `CRON_SECRET` | authorizes the scheduled fulfillment worker | server only |

Never expose server-only variables through `NEXT_PUBLIC_` names or commit an
`.env.local` file.

## Supabase setup

1. Create a Supabase project and place its URL and publishable key in
   `.env.local`.
2. Link the local repository with the Supabase CLI.
3. Apply `supabase/migrations/202609270001_initial_ecommerce.sql` using
   `supabase db push`.
4. Create a private `posters` Storage bucket before moving product imagery from
   `public/` into Storage. Add image access policies in the same migration as
   the Storage rollout.
5. In Supabase Auth URL Configuration, add
   `http://localhost:3000/auth/callback` to Redirect URLs for local account
   confirmation. Add the production equivalent before launch.

The schema enables RLS on every public table. Products and product imagery are
readable only when `products.active` is true; orders and carts are scoped to
the authenticated customer.

## Payments rollout

1. Follow Dodo's written approval and product-classification instructions for
   POSTERI's physical poster sales. The owner reports receiving approval; do
   not classify shipped posters as digital products unless Dodo explicitly
   instructed that in writing.
2. Create one Dodo product for each published POSTERI poster and a shipping
   SKU in each environment. Store poster IDs in `product_dodo_mappings`, keyed
   by the exact `test_mode` or `live_mode` environment.
3. Create a Dodo webhook for `https://your-domain.com/api/webhooks/dodo`, add
   the returned signing key as `DODO_PAYMENTS_WEBHOOK_KEY`, and subscribe to
   `payment.succeeded`, `payment.cancelled`, and `refund.succeeded` events.
4. Set `COMMERCE_MODE=dodo` and `DODO_CHECKOUT_ENABLED=true` only after the
   Dodo products, shipping SKU, and webhook have all been verified in test
   mode.

`/api/checkout` reads product prices and environment-specific Dodo IDs from
Postgres, records a pending order before a session is created, and never accepts
prices from the browser. `/api/webhooks/dodo` validates Dodo signatures and
records webhook IDs idempotently before changing order state.

## PrintKK fulfillment rollout

PrintKK fulfillment is a separate stage after payment. `disabled` is the
default. A verified `payment.succeeded` webhook queues a job only if the order
captured `dry_run` or `live` fulfillment at checkout. The dry-run worker
validates order data without calling PrintKK. Live submission can debit the
PrintKK wallet when it pays an accepted supplier order.

Before enabling it:

1. Apply the PrintKK migration after the existing e-commerce and customer
   migrations. It adds fulfillment tracking, a private job queue, poster-size
   snapshots, and per-product PrintKK variant mappings.
2. Provision a PrintKK design/specification for every active poster and
   supported size, then populate `product_printkk_variants`. The storefront
   assets alone are not yet registered as PrintKK production designs.
3. Replace credentials with active API credentials and verify the signed
   read-only API check. Credentials that fail authentication must not be used
   to enable fulfillment.
4. Confirm each poster file meets the supplier's print-resolution requirement
   at its selected physical size, and set prices to cover product, packaging,
   shipping, payment, and refund costs.
5. Set a strong `CRON_SECRET`, deploy the scheduled worker, and verify a Dodo
   test payment with `PRINTKK_FULFILLMENT_MODE=dry_run`. Switch to `live` only
   after explicitly approving a real supplier-wallet debit and shipment.

The additive migration is
`supabase/migrations/20261012152104_commerce_provider_mappings_and_safe_fulfillment.sql`.
It creates environment-aware payment mappings and fulfillment tables; it does
not contact PrintKK or spend the supplier wallet.
`supabase/migrations/20261012152832_harden_server_only_commerce_tables.sql`
adds explicit deny policies for browser roles on the payment/fulfillment tables.

### One owner PrintKK wallet test

For a deliberate supplier-wallet test before customer payments are configured,
the app provides a separate, owner-only page at `/test-printkk`. It is not a
public checkout bypass: it requires an authenticated Supabase account whose
email exactly matches `PRINTKK_TEST_ADMIN_EMAIL`, an explicit confirmation
phrase, and can be submitted only once. The configured test is one copy of the
smallest currently mapped PrintKK print: **Le Mans · #ZEBRAWIN, 8 × 12 in,
matte**. It records $0 of customer revenue but PrintKK can charge the supplier
wallet and ship to the entered address.

To enable it temporarily in Production, set:

```bash
PRINTKK_MANUAL_TEST_ENABLED=true
PRINTKK_TEST_ADMIN_EMAIL=owner@example.com
```

Deploy, sign in as that exact owner account, and visit `/test-printkk`. Disable
`PRINTKK_MANUAL_TEST_ENABLED` and redeploy immediately after the test. The
audited migration is
`supabase/migrations/20261013171911_add_manual_printkk_test_order_source.sql`.

## Validation

```bash
npm run build
npm test
curl http://localhost:3000/api/health
```

The CI workflow runs the production build on every pull request and push to
`main`.
