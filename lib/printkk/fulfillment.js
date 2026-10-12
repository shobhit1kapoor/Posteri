import 'server-only';

import {
  createPrintKKOrder,
  getPrintKKOrder,
  getPrintKKShipments,
  payPrintKKOrder,
} from './client';

function providerErrorMessage(error) {
  if (Number.isInteger(error?.status)) return `PrintKK rejected the request (HTTP ${error.status}).`;
  return 'PrintKK request timed out or could not be confirmed; manual reconciliation is required.';
}

function getPriorityOrder() {
  const allowed = new Set(['economy', 'standard', 'express']);
  const configured = (process.env.PRINTKK_SHIPPING_PRIORITY || 'standard,economy,express')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length !== 3 || new Set(configured).size !== 3 || configured.some((value) => !allowed.has(value))) {
    throw new Error('PRINTKK_SHIPPING_PRIORITY must contain economy,standard,express exactly once.');
  }
  return configured;
}

async function markJob(admin, jobId, status, lastError = null) {
  return admin.from('fulfillment_jobs').update({ status, last_error: lastError }).eq('id', jobId);
}

async function markOrder(admin, orderId, values) {
  return admin.from('orders').update(values).eq('id', orderId);
}

export async function submitPrintKKFulfillment(admin, job) {
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, email, status, printkk_order_id')
    .eq('id', job.order_id)
    .maybeSingle();

  if (orderError || !order || order.status !== 'paid') {
    await markJob(admin, job.id, 'needs_review', 'Order was not found in paid state.');
    return { status: 'needs_review' };
  }

  if (order.printkk_order_id) {
    await markJob(admin, job.id, 'completed');
    return { status: 'completed', alreadySubmitted: true };
  }

  const [{ data: address }, { data: items, error: itemsError }] = await Promise.all([
    admin.from('order_shipping_addresses').select('*').eq('order_id', order.id).maybeSingle(),
    admin.from('order_items')
      .select('id, name, quantity, poster_size, printkk_design_specification_code')
      .eq('order_id', order.id),
  ]);

  const canFulfill = address
    && !itemsError
    && items?.length
    && items.every((item) => item.printkk_design_specification_code);
  if (!canFulfill) {
    const reason = itemsError
      ? 'Could not load order items for print fulfillment.'
      : 'Delivery details or PrintKK artwork/size mappings are missing.';
    await Promise.all([
      markOrder(admin, order.id, { fulfillment_status: 'needs_configuration', fulfillment_error: reason }),
      markJob(admin, job.id, 'needs_configuration', reason),
    ]);
    return { status: 'needs_configuration' };
  }

  let printKKOrderId = null;
  try {
    const created = await createPrintKKOrder({
      orderProducts: items.map((item) => ({
        designSpecificationCode: item.printkk_design_specification_code,
        quantity: item.quantity,
      })),
      shippingAddress: {
        addressLine1: address.line_1,
        addressLine2: address.line_2 || undefined,
        city: address.city,
        countryCode: address.country_code,
        email: order.email,
        fullName: address.recipient_name,
        phone: address.phone || undefined,
        region: address.region,
        zipCode: address.postal_code,
      },
      shippingType: getPriorityOrder(),
      remark: `POSTERI order ${order.id}`,
    });

    const rawId = created?.data;
    if (rawId === undefined || rawId === null || rawId === '') {
      throw new Error('PrintKK order response did not include an order ID.');
    }
    printKKOrderId = String(rawId);

    const { error: saveProviderOrderError } = await markOrder(admin, order.id, {
      printkk_order_id: printKKOrderId,
      printkk_order_status: 'pendingPayment',
      fulfillment_status: 'supplier_payment_pending',
      printkk_submitted_at: new Date().toISOString(),
      fulfillment_error: null,
    });
    if (saveProviderOrderError) throw new Error('Unable to save the PrintKK order ID.');

    await payPrintKKOrder(printKKOrderId);

    const { error: paidUpdateError } = await markOrder(admin, order.id, {
      printkk_order_status: 'waitingForFulfillment',
      fulfillment_status: 'submitted',
      fulfillment_error: null,
    });
    if (paidUpdateError) throw new Error('PrintKK accepted payment, but POSTERI could not update order status.');

    const { error: jobUpdateError } = await markJob(admin, job.id, 'completed');
    if (jobUpdateError) throw new Error('PrintKK accepted the order, but POSTERI could not complete the job record.');
    return { status: 'submitted', printKKOrderId };
  } catch (error) {
    const safeMessage = providerErrorMessage(error);
    await Promise.all([
      markOrder(admin, order.id, {
        fulfillment_status: 'needs_review',
        fulfillment_error: safeMessage,
        ...(printKKOrderId ? { printkk_order_id: printKKOrderId } : {}),
      }),
      markJob(admin, job.id, 'needs_review', safeMessage),
    ]);
    return { status: 'needs_review', message: safeMessage };
  }
}

// Exercises the queue and data validation without making a PrintKK API call or
// using the supplier wallet. A dry-run order is deliberately not presented as
// submitted to production.
export async function simulatePrintKKFulfillment(admin, job) {
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, status, fulfillment_mode')
    .eq('id', job.order_id)
    .maybeSingle();

  if (orderError || !order || order.status !== 'paid' || order.fulfillment_mode !== 'dry_run') {
    const reason = 'Dry-run order was not found in the expected paid state.';
    await Promise.all([
      markOrder(admin, job.order_id, { fulfillment_status: 'needs_review', fulfillment_error: reason }),
      markJob(admin, job.id, 'needs_review', reason),
    ]);
    return { status: 'needs_review' };
  }

  const [{ data: address }, { data: items, error: itemsError }] = await Promise.all([
    admin.from('order_shipping_addresses').select('id').eq('order_id', order.id).maybeSingle(),
    admin.from('order_items')
      .select('id, poster_size, printkk_design_specification_code')
      .eq('order_id', order.id),
  ]);

  const missingMappingCount = itemsError
    ? 0
    : (items || []).filter((item) => !item.printkk_design_specification_code).length;
  if (itemsError || !address || !items?.length || missingMappingCount > 0) {
    const reason = itemsError
      ? 'Could not load order items for the PrintKK dry run.'
      : !address || !items?.length
        ? 'Delivery details or order items are missing.'
        : `${missingMappingCount} poster size mapping(s) are not configured.`;
    await Promise.all([
      markOrder(admin, order.id, { fulfillment_status: 'needs_configuration', fulfillment_error: reason }),
      markJob(admin, job.id, 'needs_configuration', reason),
    ]);
    return { status: 'needs_configuration', missingMappingCount };
  }

  const dryRunNote = 'Dry run passed. No PrintKK order was created and no supplier payment was made.';
  const [{ error: orderUpdateError }, { error: jobUpdateError }] = await Promise.all([
    markOrder(admin, order.id, { fulfillment_status: 'needs_configuration', fulfillment_error: dryRunNote }),
    admin.from('fulfillment_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      last_error: dryRunNote,
    }).eq('id', job.id),
  ]);

  if (orderUpdateError || jobUpdateError) return { status: 'needs_review' };
  return { status: 'dry_run_passed', supplierOrderCreated: false, supplierPaid: false };
}

function mapPrintKKOrderStatus(status) {
  switch (status) {
    case 'pendingPayment': return 'supplier_payment_pending';
    case 'waitingForFulfillment': return 'submitted';
    case 'beingFulfilled': return 'in_production';
    case 'partiallyShipped': return 'partially_shipped';
    case 'shipped': return 'shipped';
    case 'completed': return 'delivered';
    case 'canceled':
    case 'closed': return 'cancelled';
    default: return null;
  }
}

export async function refreshPrintKKStatuses(admin) {
  const { data: orders, error } = await admin
    .from('orders')
    .select('id, printkk_order_id, fulfillment_status')
    .not('printkk_order_id', 'is', null)
    .in('fulfillment_status', ['submitted', 'in_production', 'partially_shipped', 'shipped'])
    .order('printkk_status_checked_at', { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) throw new Error('Unable to load PrintKK orders for status polling.');

  const results = [];
  for (const order of orders || []) {
    try {
      const [detail, shipmentResult] = await Promise.all([
        getPrintKKOrder(order.printkk_order_id),
        getPrintKKShipments(order.printkk_order_id),
      ]);
      const providerOrder = detail?.data;
      const status = mapPrintKKOrderStatus(providerOrder?.orderStatus);
      const shipments = (shipmentResult?.data || [])
        .find((entry) => String(entry.orderId) === String(order.printkk_order_id))?.shipments || [];
      const { error: updateError } = await admin.from('orders').update({
        ...(status ? { fulfillment_status: status } : {}),
        printkk_order_status: providerOrder?.orderStatus || null,
        printkk_shipments: shipments,
        printkk_status_checked_at: new Date().toISOString(),
        fulfillment_error: null,
        ...(status === 'delivered' ? { status: 'fulfilled' } : {}),
      }).eq('id', order.id);
      if (updateError) throw new Error('Could not save the supplier status.');
      results.push({ orderId: order.id, status: status || order.fulfillment_status });
    } catch {
      // Keep the last known status; a later poll can safely try again.
      results.push({ orderId: order.id, status: 'poll_failed' });
    }
  }
  return results;
}
