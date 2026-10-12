import { timingSafeEqual } from 'node:crypto';

import { createAdminClient } from '../../../../lib/supabase/admin';
import { isPrintKKConfigured } from '../../../../lib/printkk/client';
import { getPrintKKFulfillmentMode } from '../../../../lib/printkk/mode';
import { refreshPrintKKStatuses, simulatePrintKKFulfillment, submitPrintKKFulfillment } from '../../../../lib/printkk/fulfillment';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!secret || !provided) return false;
  const expectedBytes = Buffer.from(secret);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export async function GET(request) {
  if (!isAuthorized(request)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  const mode = getPrintKKFulfillmentMode();
  if (mode === 'disabled') {
    return Response.json({ error: 'PrintKK fulfillment is disabled.' }, { status: 503 });
  }
  if (mode === 'live' && !isPrintKKConfigured()) return Response.json({ error: 'PrintKK credentials are missing.' }, { status: 503 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: jobs, error: queueError } = await admin
    .from('fulfillment_jobs')
    .select('id, order_id, attempts')
    .eq('provider', 'printkk')
    .eq('status', 'queued')
    .lte('available_at', now)
    .order('created_at', { ascending: true })
    .limit(5);

  if (queueError) return Response.json({ error: 'Unable to read the fulfillment queue.' }, { status: 500 });

  const dispatched = [];
  for (const job of jobs || []) {
    // Conditional update makes competing cron invocations claim a job only once.
    const { data: claimed, error: claimError } = await admin
      .from('fulfillment_jobs')
      .update({ status: 'processing', attempts: job.attempts + 1, locked_at: now, last_error: null })
      .eq('id', job.id)
      .eq('status', 'queued')
      .select('id, order_id')
      .maybeSingle();
    if (claimError || !claimed) continue;

    await admin.from('orders')
      .update({ fulfillment_status: 'processing', fulfillment_error: null })
      .eq('id', job.order_id)
      .eq('fulfillment_status', 'queued');
    const result = mode === 'dry_run'
      ? await simulatePrintKKFulfillment(admin, claimed)
      : await submitPrintKKFulfillment(admin, claimed);
    dispatched.push({ orderId: job.order_id, ...result });
  }

  let polled = [];
  if (mode === 'live') {
    try {
      polled = await refreshPrintKKStatuses(admin);
    } catch {
      // Submission outcomes are retained even if a separate status poll fails.
    }
  }

  return Response.json({ processed: dispatched.length, dispatched, polled });
}
