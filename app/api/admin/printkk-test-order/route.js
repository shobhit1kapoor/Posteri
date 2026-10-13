import { z } from 'zod';

import { submitPrintKKFulfillment } from '../../../../lib/printkk/fulfillment';
import { isPrintKKConfigured } from '../../../../lib/printkk/client';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient as createSupabaseServerClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TEST_PRODUCT_SLUG = 'lemans-zebrawin';
const TEST_POSTER_SIZE = '8 × 12 in';
const CONFIRMATION = 'ORDER WITH MY PRINTKK WALLET';

const requestSchema = z.object({
  email: z.string().email(),
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
  confirmation: z.literal(CONFIRMATION),
});

function isManualTestEnabled() {
  return process.env.PRINTKK_MANUAL_TEST_ENABLED === 'true';
}

async function getAuthorisedOwner() {
  const adminEmail = process.env.PRINTKK_TEST_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) return { error: 'Owner test access is not configured.', status: 503 };

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { error: 'Sign in with the owner account first.', status: 401 };
  if (user.email.trim().toLowerCase() !== adminEmail) {
    return { error: 'This account is not authorised to submit the PrintKK owner test.', status: 403 };
  }

  return { user };
}

async function markIncompleteTest(admin, orderId, message) {
  if (!orderId) return;
  await admin.from('orders').update({
    status: 'cancelled',
    fulfillment_status: 'failed',
    fulfillment_error: message,
  }).eq('id', orderId);
}

export async function POST(request) {
  if (!isManualTestEnabled()) {
    return Response.json({ error: 'The PrintKK owner test is currently disabled.' }, { status: 404 });
  }
  if (!isPrintKKConfigured()) {
    return Response.json({ error: 'PrintKK credentials are not configured.' }, { status: 503 });
  }

  const owner = await getAuthorisedOwner();
  if ('error' in owner) return Response.json({ error: owner.error }, { status: owner.status });

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Complete every delivery field and enter the confirmation phrase exactly.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { count, error: testCountError } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('order_source', 'manual_printkk_test');
  if (testCountError) return Response.json({ error: 'Unable to check the owner test status.' }, { status: 500 });
  if (count) {
    return Response.json({ error: 'The one-time PrintKK owner test has already been created. Review it in PrintKK before enabling another test.' }, { status: 409 });
  }

  const { data: product, error: productError } = await admin
    .from('products')
    .select('id, name')
    .eq('slug', TEST_PRODUCT_SLUG)
    .eq('active', true)
    .maybeSingle();
  if (productError || !product) {
    return Response.json({ error: 'The configured test artwork is unavailable.' }, { status: 503 });
  }

  const { data: variant, error: variantError } = await admin
    .from('product_printkk_variants')
    .select('printkk_design_specification_code')
    .eq('product_id', product.id)
    .eq('poster_size', TEST_POSTER_SIZE)
    .eq('active', true)
    .maybeSingle();
  if (variantError || !variant?.printkk_design_specification_code) {
    return Response.json({ error: 'The smallest PrintKK test size has not been configured.' }, { status: 503 });
  }

  let orderId = null;
  try {
    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        user_id: owner.user.id,
        email: parsed.data.email,
        status: 'paid',
        fulfillment_mode: 'live',
        fulfillment_status: 'processing',
        order_source: 'manual_printkk_test',
        currency: 'USD',
        subtotal_cents: 0,
        shipping_cents: 0,
        total_cents: 0,
      })
      .select('id')
      .single();
    if (orderError || !order) {
      if (orderError?.code === '23505') {
        return Response.json({ error: 'The one-time PrintKK owner test has already been created.' }, { status: 409 });
      }
      throw new Error('Could not create the manual test order.');
    }
    orderId = order.id;

    const { error: itemError } = await admin.from('order_items').insert({
      order_id: order.id,
      product_id: product.id,
      name: product.name,
      unit_price_cents: 0,
      quantity: 1,
      poster_size: TEST_POSTER_SIZE,
      printkk_design_specification_code: variant.printkk_design_specification_code,
    });
    if (itemError) throw new Error('Could not save the test poster.');

    const address = parsed.data.shippingAddress;
    const { error: addressError } = await admin.from('order_shipping_addresses').insert({
      order_id: order.id,
      recipient_name: address.recipientName,
      line_1: address.line1,
      line_2: address.line2 || null,
      city: address.city,
      region: address.region,
      postal_code: address.postalCode,
      country_code: address.countryCode,
      phone: address.phone || null,
    });
    if (addressError) throw new Error('Could not save the test delivery address.');

    const { data: job, error: jobError } = await admin.from('fulfillment_jobs').insert({
      order_id: order.id,
      status: 'processing',
      attempts: 1,
      locked_at: new Date().toISOString(),
    }).select('id, order_id').single();
    if (jobError || !job) throw new Error('Could not queue the PrintKK test.');

    const fulfillment = await submitPrintKKFulfillment(admin, job);
    if (fulfillment.status !== 'submitted') {
      return Response.json({
        error: fulfillment.message || 'PrintKK did not confirm the order. Review the test order before trying again.',
        orderId: order.id,
        status: fulfillment.status,
      }, { status: 502 });
    }

    return Response.json({
      orderId: order.id,
      printKKOrderId: fulfillment.printKKOrderId,
      status: 'submitted',
      message: 'PrintKK accepted the test order and charged the supplier wallet.',
    }, { status: 201 });
  } catch (error) {
    await markIncompleteTest(admin, orderId, 'The PrintKK owner test could not be prepared.');
    return Response.json({ error: 'The owner test could not be prepared. No PrintKK supplier order was submitted.' }, { status: 500 });
  }
}
