import 'server-only';

import { createAdminClient } from '../supabase/admin';
import { calculateOrderTotals } from './pricing';
import { MORE_POSTERS } from './more-posters';

// The visual catalogue identifies supplied artwork by 1–60. Keep that identifier server
// side and resolve it to the authoritative Supabase product before a checkout.
const PRODUCT_CATALOG = Object.freeze([
  ['fight-club', 2800],
  ['project-hail-mary', 2800],
  ['slow-down-youre-doing-fine', 2800],
  ['it-is-what-it-is', 2800],
  ['lemans-zebrawin', 2800],
  ['ferrari-f1', 2800],
  ['koi-and-vinyl', 2800],
  ['big-hero-6', 2800],
  ['inception', 2800],
  ['flynn-rider-wanted', 2800],
].map(([slug, priceCents], index) => ({ id: index + 1, slug, priceCents })).concat(
  MORE_POSTERS.map(({ id, slug, priceCents }) => ({ id, slug, priceCents })),
));

const catalogById = new Map(PRODUCT_CATALOG.map((product) => [product.id, product]));
export const POSTER_SIZES = Object.freeze(['8 × 12 in', '16 × 24 in', '24 × 36 in']);
export const DEFAULT_POSTER_SIZE = POSTER_SIZES[1];

export function quoteCartItems(items) {
  let subtotalCents = 0;

  for (const item of items) {
    const product = catalogById.get(item.productId);
    if (!product) return null;
    subtotalCents += product.priceCents * item.quantity;
  }

  return { currency: 'USD', ...calculateOrderTotals(subtotalCents) };
}

export async function resolveCheckoutProducts(items, { dodoEnvironment, fulfillmentMode = 'disabled' } = {}) {
  const requested = items.map((item) => ({
    ...item,
    posterSize: item.posterSize || DEFAULT_POSTER_SIZE,
    catalog: catalogById.get(item.productId),
  }));
  if (requested.some(({ catalog, posterSize }) => !catalog || !POSTER_SIZES.includes(posterSize))) return null;

  const admin = createAdminClient();
  const slugs = requested.map(({ catalog }) => catalog.slug);
  const { data, error } = await admin
    .from('products')
    .select('id, slug, name, price_cents, currency, active, dodo_product_id')
    .in('slug', slugs)
    .eq('active', true);

  if (error || !data || data.length !== new Set(slugs).size) return null;

  const productsBySlug = new Map(data.map((product) => [product.slug, product]));
  const productIds = [...new Set(data.map((product) => product.id))];
  let dodoMappings = [];
  if (dodoEnvironment) {
    const { data, error } = await admin
      .from('product_dodo_mappings')
      .select('product_id, dodo_product_id')
      .eq('dodo_environment', dodoEnvironment)
      .eq('active', true)
      .in('product_id', productIds);
    if (error) throw new Error('Dodo payment mappings could not be loaded.');
    dodoMappings = data || [];
  }
  const dodoProductById = new Map(dodoMappings.map((mapping) => [mapping.product_id, mapping.dodo_product_id]));
  // PrintKK mappings are only required once fulfillment is enabled. Keeping
  // this lookup optional lets catalog and checkout availability work while
  // PrintKK setup is still in progress (the variants table may not exist yet).
  let variants = [];
  if (fulfillmentMode === 'live') {
    const { data, error } = await admin
      .from('product_printkk_variants')
      .select('product_id, poster_size, printkk_design_specification_code')
      .in('product_id', productIds)
      .in('poster_size', [...new Set(requested.map((item) => item.posterSize))])
      .eq('active', true);

    if (error) return null;
    variants = data || [];
  }

  const variantByKey = new Map(variants.map((variant) => [
    `${variant.product_id}:${variant.poster_size}`,
    variant,
  ]));
  const products = requested.map(({ quantity, posterSize, catalog }) => {
    const product = productsBySlug.get(catalog.slug);
    const variant = variantByKey.get(`${product?.id}:${posterSize}`);
    return {
      ...product,
      dodo_product_id: dodoProductById.get(product?.id) ?? null,
      quantity,
      poster_size: posterSize,
      printkk_design_specification_code: variant?.printkk_design_specification_code ?? null,
    };
  });

  if (products.some((product) => !product.id || product.currency !== 'USD')) return null;

  const subtotalCents = products.reduce((total, product) => total + product.price_cents * product.quantity, 0);
  const totals = calculateOrderTotals(subtotalCents);

  return {
    products,
    quote: {
      currency: 'USD',
      ...totals,
    },
  };
}
