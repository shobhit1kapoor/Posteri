export const FREE_SHIPPING_THRESHOLD_CENTS = 7_500;
export const STANDARD_SHIPPING_CENTS = 700;

export function calculateOrderTotals(subtotalCents) {
  const shippingCents = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
    ? 0
    : STANDARD_SHIPPING_CENTS;

  return {
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
  };
}
