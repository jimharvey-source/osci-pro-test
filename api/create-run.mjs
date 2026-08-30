// =====================================================================
// api/create-run.mjs  ·  osci-pro
//
// Stores a completed assessment and hands back a short token.
//
// The Pro scoring payload is about 3.7 KB. Stripe caps a metadata value at
// 500 characters, so the payload cannot travel through checkout the way the
// free tool's does. It is stored here, and only the token makes the journey.
//
// This endpoint is open by necessity: the buyer has not paid yet. It writes
// nothing a stranger could bill against, and the payload is size capped and
// shape checked before it lands.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const MAX_PAYLOAD_BYTES = 20000;

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
    console.error('[create-run] Missing environment configuration:', missing.join(', '));
    return res.status(500).json({ error: 'Not configured.', missing });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: 'Invalid JSON.' }); }
  }

  const { name, email, scoring } = body || {};

  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'A name is required.' });
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!scoring
      || typeof scoring.confidence !== 'number'
      || typeof scoring.socialSkills !== 'number'
      || !scoring.subscaleScores
      || !Array.isArray(scoring.priorityAreas)) {
    return res.status(400).json({ error: 'Scoring payload is missing or malformed.' });
  }

  const raw = JSON.stringify(scoring);
  if (raw.length > MAX_PAYLOAD_BYTES) {
    console.error('[create-run] Payload over cap:', raw.length);
    return res.status(413).json({ error: 'Scoring payload too large.' });
  }

  // Initialise inside the handler. Module-level init fails intermittently on
  // Vercel's serverless runtime and has broken deploys on these projects.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'osci' },
  });

  const token = crypto.randomBytes(16).toString('base64url');

  const { error } = await admin.from('runs').insert({
    token,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    scoring,
    scoring_version: typeof scoring.version === 'string' ? scoring.version : null,
  });

  if (error) {
    // A write that failed is never reported as a success. Without the row
    // there is no report to sell, so the sale must not start.
    console.error('[create-run] Insert failed:', error.message);
    return res.status(500).json({ error: 'Could not save your answers. Please try again.' });
  }

  return res.status(200).json({ token });
}
