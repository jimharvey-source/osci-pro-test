// =====================================================================
// api/stripe-webhook.mjs  ·  osci-pro
//
// Keeps osci.orders true to what Stripe says happened.
//
// This is a one-off payment, not a subscription, so the report endpoint
// verifies the session with Stripe directly and does not wait for this to
// land. That avoids the race where a buyer reaches the success page before
// the webhook does. What this handler owns is the record: what was paid,
// when, at which price, and whether it was later refunded.
// =====================================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Signature verification needs the exact bytes Stripe signed. Vercel parses
// the body by default, which destroys them.
export const config = { api: { bodyParser: false } };

// The event types this handler understands. Keep the Stripe event destination
// subscribed to exactly these three. Anything Stripe sends that is missing
// here is silently dropped, and anything listed here that Stripe does not
// send means the record quietly stops matching reality.
export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'charge.refunded',
];

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function paymentIntentIdFrom(obj) {
  const pi = obj?.payment_intent;
  return typeof pi === 'string' ? pi : (pi?.id || null);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !stripeKey && 'STRIPE_SECRET_KEY',
    !webhookSecret && 'STRIPE_WEBHOOK_SECRET',
    !supabaseUrl && 'SUPABASE_URL',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  if (missing.length) {
    console.error('[webhook] Missing environment configuration:', missing.join(', '));
    return res.status(500).end();
  }

  const stripe = new Stripe(stripeKey);

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], webhookSecret);
  } catch (e) {
    // A bad signature is not ours to retry. Refuse it.
    console.error('[webhook] Signature verification failed:', e.message);
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'osci' },
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        const token = session.metadata?.run_token || session.client_reference_id || null;

        if (!token) {
          // Retrying will not conjure a token. Log it loudly, accept the
          // event so Stripe stops, and fix it by hand.
          console.error('[webhook] UNRESOLVED session, no run_token:', session.id);
          break;
        }

        const paid = session.payment_status === 'paid';

        const row = {
          stripe_session_id: session.id,
          stripe_payment_intent_id: paymentIntentIdFrom(session),
          token,
          status: paid ? 'paid' : 'pending',
          amount_total: session.amount_total ?? null,
          currency: session.currency ?? null,
          email: session.customer_details?.email || session.customer_email || null,
          paid_at: paid ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await admin
          .from('orders')
          .upsert(row, { onConflict: 'stripe_session_id' });

        if (error) {
          // Throw so the handler returns 500 and Stripe retries. A write that
          // failed must not be reported as a success.
          throw new Error(`upsert failed for ${session.id}: ${error.message}`);
        }

        console.log('[webhook]', event.type, session.id, '->', row.status, row.amount_total, row.currency);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const piId = paymentIntentIdFrom(charge);

        if (!piId) {
          console.error('[webhook] Refund with no payment intent:', charge.id);
          break;
        }

        const { error, data } = await admin
          .from('orders')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', piId)
          .select('stripe_session_id');

        if (error) throw new Error(`refund update failed for ${piId}: ${error.message}`);

        if (!data || data.length === 0) {
          console.error('[webhook] Refund matched no order:', piId);
        } else {
          console.log('[webhook] charge.refunded', piId, '->', data[0].stripe_session_id);
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error('[webhook] Handler failed:', e.message);
    return res.status(500).json({ error: 'Handler failed.' });
  }

  return res.status(200).json({ received: true });
}
