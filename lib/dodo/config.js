import 'server-only';

const DODO_ENVIRONMENTS = new Set(['test_mode', 'live_mode']);

function getEnvironment() {
  const environment = process.env.DODO_PAYMENTS_ENVIRONMENT ?? 'test_mode';

  if (!DODO_ENVIRONMENTS.has(environment)) {
    throw new Error('DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode.');
  }

  return environment;
}

function getApiKey(environment) {
  return environment === 'live_mode'
    ? process.env.DODO_PAYMENTS_LIVE_API_KEY
    : process.env.DODO_PAYMENTS_API_KEY;
}

function getWebhookKey(environment) {
  return environment === 'live_mode'
    ? process.env.DODO_PAYMENTS_LIVE_WEBHOOK_KEY
    : process.env.DODO_PAYMENTS_WEBHOOK_KEY;
}

export function getDodoCheckoutConfig() {
  const environment = getEnvironment();
  const apiKey = getApiKey(environment);
  const returnUrl = process.env.DODO_PAYMENTS_RETURN_URL;

  if (!apiKey || !returnUrl) return null;

  return { apiKey, returnUrl, environment };
}

export function getDodoShippingProductId(environment = getEnvironment()) {
  return environment === 'live_mode'
    ? process.env.DODO_PAYMENTS_LIVE_SHIPPING_PRODUCT_ID
    : process.env.DODO_SHIPPING_PRODUCT_ID;
}

export function getDodoWebhookConfig() {
  const environment = getEnvironment();
  const apiKey = getApiKey(environment);
  const webhookKey = getWebhookKey(environment);

  if (!apiKey || !webhookKey) return null;

  return { apiKey, webhookKey, environment };
}

export function isDodoCheckoutEnabled() {
  return process.env.COMMERCE_MODE === 'dodo' && process.env.DODO_CHECKOUT_ENABLED === 'true';
}
