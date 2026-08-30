// =====================================================================
// api/create-checkout.mjs  ·  osci-pro
//
// Creates a one-off Stripe Checkout session for a stored assessment run.
//
// The caller sends a token, never a price. Which price they pay is decided
// here, from Stripe's own redemption count, because a counter we keep drifts
// from what actually got paid and then has to be reconciled by hand.
//
// £19.99 is the price. The launch coupon takes £15.00 off it, and Stripe
// stops applying that coupon at the thousandth redemption. No deploy, no
// midnight switch, no second number to trust.
// =====================================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const SITE_URL = process.env.SITE_URL || 'https://opensourcecharisma.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_PRO;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !stripeKey && 'STRIPE_SECRET_KEY',
    !priceId && 'STRIPE_PRICE_PRO',
    !supabaseUrl && 'SUPABASE_URL',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  if (missing.length) {
    console.error('[checkout] Missing environment configuration:', missing.join(', '));
    return res.status(500).json({ error: 'Checkout is not configured.', missing });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: 'Invalid JSON.' }); }
  }

  const token = body?.token;
  if (typeof token !== 'string' || token.length < 8 || token.length > 128) {
    return res.status(400).json({ error: 'Missing assessment token.' });
  }

  // Initialise inside the handler, per the Ignition build.
  const stripe = new Stripe(stripeKey);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'osci' },
  });

  try {
    // A token in a request body is a claim. Check it names a real run before
    // billing anyone against it.
    const { data: run, error: runError } = await admin
      .from('runs')
      .select('token, email')
      .eq('token', token)
      .maybeSingle();

    if (runError) {
      console.error('[checkout] Run lookup failed:', runError.message);
      return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
    }
    if (!run) {
      return res.status(404).json({ error: 'That assessment could not be found. Please run it again.' });
    }

    // ---- is the launch price still open ------------------------------
    // Stripe holds the count. We read it, we do not keep one.
    let promotionCodeId = null;
    const promoEnvId = process.env.STRIPE_PROMOTION_CODE;

    if (promoEnvId) {
      try {
        const promo = await stripe.promotionCodes.retrieve(promoEnvId);
        const cap = promo.max_redemptions;
        const exhausted = typeof cap === 'number' && promo.times_redeemed >= cap;
        if (promo.active && !exhausted) promotionCodeId = promo.id;
      } catch (e) {
        // A coupon we cannot read is a coupon we do not apply. The sale still
        // happens, at the full price, and the log names why.
        console.error('[checkout] Promotion code lookup failed:', e?.message || e);
      }
    }

    const params = {
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: run.email,
      client_reference_id: token,
      metadata: { run_token: token },
      // The refund handler sees a charge, never a session. Put the token
      // where the payment intent carries it too.
      payment_intent_data: { metadata: { run_token: token } },
      success_url: `${SITE_URL}/pro-report.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/assessment.html?checkout=cancelled`,
      // UK consumers keep a fourteen day cancellation right on digital
      // content unless they ask for immediate delivery and acknowledge
      // losing it. This is where they do that.
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: {
          message: 'I accept the terms and I ask for my report to be generated straight away. I understand that once it is generated I lose my fourteen day right to cancel.',
        },
      },
    };

    if (promotionCodeId) params.discounts = [{ promotion_code: promotionCodeId }];

    let session;
    let promoApplied = Boolean(promotionCodeId);

    try {
      session = await stripe.checkout.sessions.create(params);
    } catch (e) {
      // A coupon that ran out between the read and the write must not stop
      // the sale. Drop it and sell at the full price.
      //
      // Only for that. A malformed discounts parameter would otherwise look
      // exactly like an exhausted coupon: the page would keep advertising
      // £4.99 while Stripe charged £19.99, and the log would blame the
      // coupon. Anything that is not plainly a promotion code problem is
      // rethrown, so it fails loudly on the first checkout rather than
      // quietly on every one.
      const message = String(e?.message || '');
      const aboutTheCode = /promotion code|coupon/i.test(message);
      if (!promotionCodeId || !aboutTheCode) throw e;

      console.error('[checkout] Discount refused, retrying at full price:', e?.type || '', message);
      delete params.discounts;
      promoApplied = false;
      session = await stripe.checkout.sessions.create(params);
    }

    // Bookkeeping only. Entitlement comes from Stripe, so a failure here
    // costs an audit row and never a report the buyer paid for.
    const { error: orderError } = await admin.from('orders').insert({
      stripe_session_id: session.id,
      token,
      status: 'pending',
      promo_applied: promoApplied,
      email: run.email,
    });
    if (orderError) {
      console.error('[checkout] Could not record pending order:', orderError.message);
    }

    return res.status(200).json({ url: session.url, promoApplied });

  } catch (e) {
    console.error('[checkout] Stripe error', e?.type || '', e?.message || e);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}
