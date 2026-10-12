import DodoPayments from 'dodopayments';

import { getDodoWebhookConfig } from '../../../../lib/dodo/config';
import { createAdminClient } from '../../../../lib/supabase/admin';

const STATUS_BY_EVENT = {
  'payment.succeeded': 'paid',
  'payment.cancelled': 'cancelled',
  'refund.succeeded': 'refunded',
};

function getOrderId(event) {
  const metadata = event?.data?.metadata;
  return typeof metadata?.posteri_order_id === 'string' ? metadata.posteri_order_id : null;
}

export async function POST(request) {
  const config = getDodoWebhookConfig();
  if (!config) {
    return Response.json({ error: 'Webhook verification is not configured.' }, { status: 503 });
  }

  const eventId = request.headers.get('webhook-id');
  const signature = request.headers.get('webhook-signature');
  const timestamp = request.headers.get('webhook-timestamp');
  if (!eventId || !signature || !timestamp) {
    return Response.json({ error: 'Missing Dodo webhook signature headers.' }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    const dodo = new DodoPayments({
      bearerToken: config.apiKey,
      environment: config.environment,
      webhookKey: config.webhookKey,
    });
    event = dodo.webhooks.unwrap(rawBody, {
      headers: {
        'webhook-id': eventId,
        'webhook-signature': signature,
        'webhook-timestamp': timestamp,
      },
    });
  } catch {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from('payment_events')
    .select('id')
    .eq('provider_event_id', eventId)
    .maybeSingle();
  if (existingError) return Response.json({ error: 'Unable to check payment event status.' }, { status: 500 });

  let orderId = getOrderId(event);
  const checkoutSessionId = typeof event?.data?.checkout_session_id === 'string'
    ? event.data.checkout_session_id
    : null;

  if (!orderId && checkoutSessionId) {
    const { data: order } = await admin
      .from('orders')
      .select('id')
      .eq('dodo_checkout_session_id', checkoutSessionId)
      .maybeSingle();
    orderId = order?.id ?? null;
  }

  let duplicate = Boolean(existing);
  if (!existing) {
    const { error: eventError } = await admin.from('payment_events').insert({
      provider_event_id: eventId,
      event_type: event.type,
      order_id: orderId,
      payload: event,
    });
    if (eventError?.code === '23505') duplicate = true;
    else if (eventError) return Response.json({ error: 'Unable to record payment event.' }, { status: 500 });
  }

  const status = STATUS_BY_EVENT[event.type];
  if (orderId && status) {
    const paymentId = typeof event?.data?.payment_id === 'string' ? event.data.payment_id : null;
    const { data: currentOrder, error: currentOrderError } = await admin
      .from('orders')
      .select('id, status, fulfillment_status, fulfillment_mode, printkk_order_id')
      .eq('id', orderId)
      .maybeSingle();
    if (currentOrderError || !currentOrder) {
      return Response.json({ error: 'Unable to find the order for this payment.' }, { status: 500 });
    }

    const orderUpdate = {
      status: status === 'paid' && currentOrder.status === 'fulfilled' ? 'fulfilled' : status,
      ...(paymentId ? { dodo_payment_id: paymentId } : {}),
      ...(status === 'paid' && currentOrder.fulfillment_status === 'awaiting_payment'
        ? currentOrder.fulfillment_mode === 'disabled'
          ? {
            fulfillment_status: 'needs_configuration',
            fulfillment_error: 'PrintKK fulfillment was disabled when this order was placed.',
          }
          : { fulfillment_status: 'queued', fulfillment_error: null }
        : {}),
    };
    const { error: orderError } = await admin
      .from('orders')
      .update(orderUpdate)
      .eq('id', orderId);
    if (orderError) return Response.json({ error: 'Unable to update order status.' }, { status: 500 });

    if (status === 'paid'
      && currentOrder.fulfillment_mode !== 'disabled'
      && !currentOrder.printkk_order_id) {
      const { error: jobError } = await admin.from('fulfillment_jobs').insert({ order_id: orderId });
      if (jobError?.code !== '23505' && jobError) {
        return Response.json({ error: 'Payment was confirmed, but fulfillment could not be queued.' }, { status: 500 });
      }
    }
  }

  return Response.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
}
