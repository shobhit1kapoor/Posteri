const MODES = new Set(['disabled', 'dry_run', 'live']);

export function getPrintKKFulfillmentMode(env = process.env) {
  const mode = env.PRINTKK_FULFILLMENT_MODE || 'disabled';
  if (!MODES.has(mode)) {
    throw new Error('PRINTKK_FULFILLMENT_MODE must be disabled, dry_run, or live.');
  }
  return mode;
}
