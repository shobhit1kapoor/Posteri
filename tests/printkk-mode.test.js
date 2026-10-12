import assert from 'node:assert/strict';
import test from 'node:test';

import { getPrintKKFulfillmentMode } from '../lib/printkk/mode.js';

test('PrintKK fulfillment is disabled unless an explicit mode is configured', () => {
  assert.equal(getPrintKKFulfillmentMode({}), 'disabled');
});

test('PrintKK dry run is available without enabling supplier spending', () => {
  assert.equal(getPrintKKFulfillmentMode({ PRINTKK_FULFILLMENT_MODE: 'dry_run' }), 'dry_run');
  assert.notEqual(getPrintKKFulfillmentMode({ PRINTKK_FULFILLMENT_MODE: 'dry_run' }), 'live');
});

test('unknown PrintKK modes fail closed', () => {
  assert.throws(
    () => getPrintKKFulfillmentMode({ PRINTKK_FULFILLMENT_MODE: 'true' }),
    /must be disabled, dry_run, or live/,
  );
});
