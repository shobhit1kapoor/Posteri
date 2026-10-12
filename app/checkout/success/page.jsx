import Link from 'next/link';
import { createAdminClient } from '../../../lib/supabase/admin';

export const metadata = { title: 'Order received' };
export const dynamic = 'force-dynamic';

function getOrderMessage(order) {
  if (!order) {
    return {
      title: 'We’re confirming your payment.',
      detail: 'Your payment provider is sending us the final confirmation. Refresh this page shortly to see the latest order status.',
    };
  }

  if (order.status === 'cancelled') {
    return {
      title: 'Payment wasn’t completed.',
      detail: 'No print order has been sent to our fulfilment partner.',
    };
  }

  if (order.status === 'refunded') {
    return {
      title: 'Your payment was refunded.',
      detail: 'The refund has been recorded for this order.',
    };
  }

  if (order.status === 'paid' || order.status === 'fulfilled') {
    if (order.fulfillment_mode === 'dry_run') {
      return {
        title: 'Test payment confirmed.',
        detail: 'This was a dry run. No poster was sent to PrintKK and no supplier payment was made.',
      };
    }

    const detail = {
      queued: 'Payment confirmed. Your poster order is queued for production.',
      submitted: 'Payment confirmed. Your poster order has been sent to production.',
      in_production: 'Your poster is being produced.',
      partially_shipped: 'Part of your order is on its way.',
      shipped: 'Your poster order has shipped.',
      delivered: 'Your poster order has been delivered.',
      needs_configuration: 'Payment confirmed. We’re checking a production detail before sending your order to print.',
      needs_review: 'Payment confirmed. Our team is reviewing a production update for your order.',
    }[order.fulfillment_status] || 'Payment confirmed. Your order is being prepared.';

    return { title: 'Thanks for your order.', detail };
  }

  return {
    title: 'Your order is being prepared.',
    detail: 'We’re waiting for the payment provider to confirm the order.',
  };
}

export default async function CheckoutSuccessPage({ searchParams }) {
  const params = await searchParams;
  const orderId = typeof params?.order_id === 'string' ? params.order_id : '';
  let order = null;

  // The Dodo return URL carries our UUID order reference. Never expose contact,
  // address, or payment data on this customer-facing confirmation page.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('orders')
        .select('status, fulfillment_status, fulfillment_mode')
        .eq('id', orderId)
        .maybeSingle();
      order = data;
    } catch {
      // Keep the confirmation page useful if Supabase is temporarily unavailable.
    }
  }

  const message = getOrderMessage(order);

  return (
    <main className="confirmation">
      <p className="kicker">POSTERI · ORDER UPDATE</p>
      <h1>{message.title}</h1>
      <p>{message.detail}</p>
      <Link href="/">Continue shopping</Link>
    </main>
  );
}
