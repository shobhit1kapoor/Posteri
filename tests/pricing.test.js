import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateOrderTotals,
  FREE_SHIPPING_THRESHOLD_CENTS,
  STANDARD_SHIPPING_CENTS,
} from '../lib/commerce/pricing.js';

test('adds standard shipping below the free-shipping threshold', () => {
  assert.deepEqual(calculateOrderTotals(2_800), {
    subtotalCents: 2_800,
    shippingCents: STANDARD_SHIPPING_CENTS,
    totalCents: 3_500,
  });
});

test('free shipping starts at the advertised threshold', () => {
  assert.deepEqual(calculateOrderTotals(FREE_SHIPPING_THRESHOLD_CENTS), {
    subtotalCents: FREE_SHIPPING_THRESHOLD_CENTS,
    shippingCents: 0,
    totalCents: FREE_SHIPPING_THRESHOLD_CENTS,
  });
});
