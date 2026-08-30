// =====================================================================
// api/launch-status.mjs  ·  osci-pro
//
// How many of the first thousand are left, read from the one place that
// knows: Stripe's redemption count on the launch promotion code.
//
// Cached at the edge for sixty seconds. The page shows a number that moves,
// and a number that is a minute old is honest enough for that job.
// =====================================================================

import Stripe from 'stripe';

const LIST_PRICE_PENCE = 1999;
const LAUNCH_PRICE_PENCE = 499;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const promoEnvId = process.env.STRIPE_PROMOTION_CODE;

  // No promotion code configured means the launch window is not running.
  // That is a real answer, not a failure.
  if (!stripeKey || !promoEnvId) {
    if (!stripeKey) console.error('[launch-status] Missing environment configuration: STRIPE_SECRET_KEY');
    return res.status(200).json({
      launchOpen: false,
      pricePence: LIST_PRICE_PENCE,
      remaining: null,
      total: null,
    });
  }

  const stripe = new Stripe(stripeKey);

  try {
    const promo = await stripe.promotionCodes.retrieve(promoEnvId);
    const cap = typeof promo.max_redemptions === 'number' ? promo.max_redemptions : null;
    const used = promo.times_redeemed || 0;
    const remaining = cap === null ? null : Math.max(0, cap - used);
    const launchOpen = Boolean(promo.active) && (cap === null || used < cap);

    return res.status(200).json({
      launchOpen,
      pricePence: launchOpen ? LAUNCH_PRICE_PENCE : LIST_PRICE_PENCE,
      remaining,
      total: cap,
    });
  } catch (e) {
    // A lookup that failed must not read as a sold-out launch, and must not
    // read as an open one either. Say what is known: the list price stands.
    console.error('[launch-status] Promotion code lookup failed:', e?.message || e);
    return res.status(200).json({
      launchOpen: false,
      pricePence: LIST_PRICE_PENCE,
      remaining: null,
      total: null,
      degraded: true,
    });
  }
}
