// =====================================================================
// api/redeem-cohort.mjs  ·  osci-pro
//
// Unlocks a stored assessment run with a programme code instead of a card.
//
// Programme participants get the report as part of what their organisation
// has paid for. This route takes the run token and the code they typed,
// takes one use off the code inside the database, writes a paid order at
// £0.00, and hands back the same receipt page a card buyer would get.
//
// Stripe is never involved and the launch coupon is never touched, so a
// cohort of thirty leaves the thousand discounted reports where they were.
//
// Nothing here trusts the caller. The token must name a real run. The code
// is checked and counted in one statement by osci.redeem_cohort_code(), and
// the reply for an unknown code is the same as for a used-up one.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SITE_URL = process.env.SITE_URL || 'https://opensourcecharisma.com';

// The same wording for every refusal. A guesser learns nothing.
const REFUSED = 'That code is not valid. Check it with whoever runs your programme.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !supabaseUrl && 'SUPABASE_URL',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  if (missing.length) {
    // Names only, never values.
    console.error('[cohort] Missing environment configuration:', missing.join(', '));
    return res.status(500).json({ error: 'Programme codes are not configured.', missing });
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

  const rawCode = typeof body?.code === 'string' ? body.code : '';
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, '');
  if (code.length < 4 || code.length > 32 || !/^[A-Z0-9_-]+$/.test(code)) {
    return res.status(400).json({ error: REFUSED });
  }

  // Initialise inside the handler, per the Ignition build.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'osci' },
  });

  try {
    // A token in a request body is a claim. Check it names a real run.
    const { data: run, error: runError } = await admin
      .from('runs')
      .select('token, email')
      .eq('token', token)
      .maybeSingle();

    if (runError) {
      console.error('[cohort] Run lookup failed:', runError.message);
      return res.status(500).json({ error: 'Could not unlock the report. Please try again.' });
    }
    if (!run) {
      return res.status(404).json({ error: 'That assessment could not be found. Please run it again.' });
    }

    // Already unlocked with a code? Send them back to the receipt they have,
    // and do not take a second use off the programme.
    const { data: existing, error: existingError } = await admin
      .from('orders')
      .select('stripe_session_id')
      .eq('token', token)
      .eq('status', 'paid')
      .not('cohort_code', 'is', null)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error('[cohort] Existing order lookup failed:', existingError.message);
    } else if (existing) {
      return res.status(200).json({
        url: `${SITE_URL}/pro-report.html?session_id=${encodeURIComponent(existing.stripe_session_id)}`,
      });
    }

    // ---- take one use, inside the database ----------------------------
    // One statement checks active, cap and expiry, and counts the use. Two
    // people pressing the button at once cannot both take the last place.
    const { data: redeemed, error: redeemError } = await admin
      .rpc('redeem_cohort_code', { p_code: code });

    if (redeemError) {
      console.error('[cohort] redeem_cohort_code failed:', redeemError.message);
      return res.status(500).json({ error: 'Could not unlock the report. Please try again.' });
    }

    const row = Array.isArray(redeemed) ? redeemed[0] : redeemed;
    if (!row || !row.label) {
      console.error('[cohort] Code refused:', code);
      return res.status(403).json({ error: REFUSED });
    }

    // ---- the order -----------------------------------------------------
    // Same table, same shape, same download cap as a card sale. The report
    // generator reads this row instead of asking Stripe.
    const orderId = 'coh_' + crypto.randomBytes(16).toString('base64url');
    const now = new Date().toISOString();

    const { error: orderError } = await admin.from('orders').insert({
      stripe_session_id: orderId,
      token,
      status: 'paid',
      amount_total: 0,
      currency: 'gbp',
      promo_applied: false,
      cohort_code: code,
      email: run.email,
      paid_at: now,
    });

    if (orderError) {
      // Without the row there is no entitlement, so the use goes back and
      // the participant is told to try again. Never a silent success.
      console.error('[cohort] Could not record cohort order:', orderError.message);
      const { error: releaseError } = await admin.rpc('release_cohort_code', { p_code: code });
      if (releaseError) console.error('[cohort] Could not release use:', releaseError.message);
      return res.status(500).json({ error: 'Could not unlock the report. Please try again.' });
    }

    console.log('[cohort] Redeemed', code, 'for run', token, 'order', orderId, '(' + row.label + ')');

    return res.status(200).json({
      url: `${SITE_URL}/pro-report.html?session_id=${encodeURIComponent(orderId)}`,
      label: row.label,
    });

  } catch (e) {
    console.error('[cohort] Unexpected error', e?.message || e);
    return res.status(500).json({ error: 'Could not unlock the report. Please try again.' });
  }
}
