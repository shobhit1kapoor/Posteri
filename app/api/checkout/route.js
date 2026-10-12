import DodoPayments from 'dodopayments';
import { z } from 'zod';

import { DEFAULT_POSTER_SIZE, POSTER_SIZES, quoteCartItems, resolveCheckoutProducts } from '../../../lib/commerce/catalog';
import { getDodoCheckoutConfig, getDodoShippingProductId, isDodoCheckoutEnabled } from '../../../lib/dodo/config';
import { getPrintKKFulfillmentMode } from '../../../lib/printkk/mode';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient as createSupabaseServerClient } from '../../../lib/supabase/server';

const checkoutRequest = z.object({
  email: z.string().email(),
  items: z.array(z.object({
    productId: z.number().int().min(1).max(60),
    quantity: z.number().int().min(1).max(20),
    posterSize: z.enum([...POSTER_SIZES]).default(DEFAULT_POSTER_SIZE),
  })).min(1).max(20),
  shippingAddress: z.object({
    recipientName: z.string().trim().min(2).max(120),
    line1: z.string().trim().min(3).max(180),
    line2: z.string().trim().max(180).default(''),
    city: z.string().trim().min(2).max(100),
    region: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(2).max(24),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    phone: z.string().trim().max(40).default(''),
  }),
});

function getCancelUrl(request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${origin}/?checkout=cancelled`;
}

async function startDodoCheckout({ request, email, items, shippingAddress }) {
  const config = getDodoCheckoutConfig();
  if (!config) {
    return Response.json({ error: 'Dodo Payments is not fully configured.' }, { status: 503 });
  }

  const fulfillmentMode = getPrintKKFulfillmentMode();
  if (config.environment === 'live_mode' && fulfillmentMode !== 'live') {
    return Response.json({ error: 'Live checkout requires live PrintKK fulfillment to be fully configured.' }, { status: 503 });
  }
  if (fulfillmentMode === 'live' && (!process.env.PRINTKK_API_KEY || !process.env.PRINTKK_SECRET_KEY)) {
    return Response.json({ error: 'Print fulfillment is not fully configured.' }, { status: 503 });
  }

  let resolved;
  try {
    resolved = await resolveCheckoutProducts(items, {
      dodoEnvironment: config.environment,
      fulfillmentMode,
    });
  } catch {
    return Response.json({ error: 'Checkout mappings are unavailable. Please try again later.' }, { status: 503 });
  }
  if (!resolved) {
    return Response.json({ error: 'One or more posters are unavailable.' }, { status: 400 });
  }

  if (resolved.products.some((product) => !product.dodo_product_id)) {
    return Response.json({ error: 'Checkout is being prepared. Product payment mappings are not ready yet.' }, { status: 503 });
  }

  if (fulfillmentMode === 'live'
    && resolved.products.some((product) => !product.printkk_design_specification_code)) {
    return Response.json({ error: 'One or more poster sizes are not ready for print fulfillment.' }, { status: 503 });
  }

  const shippingProductId = getDodoShippingProductId(config.environment);
  if (resolved.quote.shippingCents > 0 && !shippingProductId) {
    return Response.json({ error: 'Checkout is being prepared. Shipping payment mapping is not ready yet.' }, { status: 503 });
  }

  const admin = createAdminClient();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      email,
      user_id: user?.id ?? null,
      status: 'pending',
      fulfillment_mode: fulfillmentMode,
      currency: resolved.quote.currency,
      subtotal_cents: resolved.quote.subtotalCents,
      shipping_cents: resolved.quote.shippingCents,
      total_cents: resolved.quote.totalCents,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    return Response.json({ error: 'Unable to create your order.' }, { status: 500 });
  }

  const { error: itemError } = await admin.from('order_items').insert(
    resolved.products.map((product) => ({
      order_id: order.id,
      product_id: product.id,
      name: product.name,
      unit_price_cents: product.price_cents,
      quantity: product.quantity,
      poster_size: product.poster_size,
      printkk_design_specification_code: product.printkk_design_specification_code,
      dodo_product_id: product.dodo_product_id,
    })),
  );
  if (itemError) {
    await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    return Response.json({ error: 'Unable to prepare your order items.' }, { status: 500 });
  }

  const { error: addressError } = await admin.from('order_shipping_addresses').insert({
    order_id: order.id,
    recipient_name: shippingAddress.recipientName,
    line_1: shippingAddress.line1,
    line_2: shippingAddress.line2 || null,
    city: shippingAddress.city,
    region: shippingAddress.region,
    postal_code: shippingAddress.postalCode,
    country_code: shippingAddress.countryCode,
    phone: shippingAddress.phone || null,
  });
  if (addressError) {
    await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    console.error('Checkout shipping address could not be saved', { orderId: order.id, code: addressError.code });
    return Response.json({ error: 'Unable to save your delivery details.' }, { status: 500 });
  }

  const returnUrl = new URL(config.returnUrl);
  returnUrl.searchParams.set('order_id', order.id);
  const productCart = resolved.products.map((product) => ({ product_id: product.dodo_product_id, quantity: product.quantity }));
  if (resolved.quote.shippingCents > 0) productCart.push({ product_id: shippingProductId, quantity: 1 });

  try {
    const dodo = new DodoPayments({ bearerToken: config.apiKey, environment: config.environment });
    const session = await dodo.checkoutSessions.create({
      product_cart: productCart,
      customer: { email },
      return_url: returnUrl.toString(),
      cancel_url: getCancelUrl(request),
      metadata: { posteri_order_id: order.id },
      customization: { theme: 'system', show_order_details: true },
    });
    if (!session.checkout_url) throw new Error('Dodo did not return a checkout URL.');

    const { error: updateError } = await admin
      .from('orders')
      .update({ dodo_checkout_session_id: session.session_id })
      .eq('id', order.id);
    if (updateError) throw updateError;

    return Response.json({ mode: 'dodo', orderId: order.id, checkoutUrl: session.checkout_url }, { status: 201 });
  } catch (error) {
    await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    console.error('Dodo checkout session creation failed', { orderId: order.id, message: error instanceof Error ? error.message : 'Unknown error' });
    return Response.json({ error: 'Payment checkout could not be started. Please try again.' }, { status: 502 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const parsed = checkoutRequest.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: 'Enter a valid email and at least one poster.' }, { status: 400 });
  }

  if (isDodoCheckoutEnabled()) {
    return startDodoCheckout({ request, ...parsed.data });
  }

  const quote = quoteCartItems(parsed.data.items);
  if (!quote) {
    return Response.json({ error: 'Your bag contains an unavailable poster.' }, { status: 400 });
  }

  const commerceMode = process.env.COMMERCE_MODE ?? 'demo';
  if (process.env.NODE_ENV === 'production' || commerceMode !== 'demo') {
    return Response.json({
      error: 'Checkout is unavailable until Dodo Payments is configured.',
    }, { status: 503 });
  }

  const reference = `demo_${crypto.randomUUID()}`;
  return Response.json({
    mode: 'demo',
    reference,
    quote,
    checkoutUrl: `/checkout/success?demo=1&reference=${encodeURIComponent(reference)}`,
  }, { status: 201 });
}
