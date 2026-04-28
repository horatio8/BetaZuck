// POST /api/stripe-webhook — handles Stripe webhook events.
//
// Configure in Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL:    https://<your-domain>/api/stripe-webhook
//   Events: checkout.session.completed
// Then copy the "Signing secret" (whsec_...) into Vercel env as
// STRIPE_WEBHOOK_SECRET.
//
// On a successful checkout this:
//   1. Records the donation in Supabase (idempotent on session id).
//   2. Posts the donor to Campaign Nucleus via api/_nucleus.js, which
//      prefers POST /v1/profiles/match (auth'd CRM upsert with tags +
//      donation amount in custom1) when NUCLEUS_API_TOKEN is set, and
//      falls back to NUCLEUS_DONOR_FORM_URL or NUCLEUS_FORM_URL.
//
// Both side effects are best-effort — failures are logged but the webhook
// still returns 200 so Stripe doesn't retry on transient issues.

import { json, methodNotAllowed, getEnv, getOptionalEnv } from './_lib.js';
import { syncProfileToNucleus } from './_nucleus.js';

export const config = { runtime: 'edge' };

const SIGNATURE_TOLERANCE_SEC = 300;

export default async function handler(req) {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';
  const secret = getEnv('STRIPE_WEBHOOK_SECRET');

  const valid = await verifyStripeSignature(rawBody, sigHeader, secret);
  if (!valid) {
    return new Response('invalid signature', { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    if (session) {
      // Run both side effects but don't let either failure surface to Stripe.
      await Promise.allSettled([
        recordDonation(session),
        sendDonorToNucleus(session, req),
      ]);
    }
  }

  return json({ received: true });
}

// ── HMAC signature verification (Stripe v1 scheme) ────────────────
async function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find((p) => p[0] === 't')?.[1];
  const v1Sigs = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || v1Sigs.length === 0) return false;

  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_SEC) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return v1Sigs.some((v) => constantTimeEqual(expected, v));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Side effects ──────────────────────────────────────────────────
async function recordDonation(session) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  try {
    const res = await fetch(`${url}/rest/v1/donations?on_conflict=stripe_session_id`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        // donations.stripe_session_id is UNIQUE; merge-duplicates makes
        // a Stripe retry an idempotent no-op.
        prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify({
        stripe_session_id: session.id,
        amount_cents: session.amount_total || 0,
        currency: session.currency || 'usd',
        monthly:
          session.mode === 'subscription' || session.metadata?.monthly === '1',
        email: session.customer_details?.email || session.customer_email || null,
        status: 'completed',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('supabase donation insert failed:', res.status, text.slice(0, 300));
    }
  } catch (err) {
    console.error('donation record exception:', err);
  }
}

async function sendDonorToNucleus(session, req) {
  const cd = session.customer_details || {};
  const email = cd.email || session.customer_email || '';
  if (!email) return;

  const fullName = (cd.name || '').trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  if (!firstName) return; // Nucleus requires first_name.
  const lastName = rest.join(' ');

  const origin =
    getOptionalEnv('PUBLIC_SITE_URL') || new URL(req.url).origin.replace(/\/$/, '');
  const isMonthly =
    session.mode === 'subscription' || session.metadata?.monthly === '1';
  const amountUsd =
    typeof session.amount_total === 'number' ? session.amount_total / 100 : null;

  const tags = ['betazuck-donor'];
  if (isMonthly) tags.push('betazuck-monthly-donor');

  // custom1: most recent donation amount (USD), readable in Nucleus profile.
  // custom2: most recent donation date (ISO yyyy-mm-dd).
  const profile = {
    first_name: firstName,
    last_name: lastName || undefined,
    email,
    phone: cd.phone || undefined,
    zip: cd.address?.postal_code || undefined,
    state: cd.address?.state || undefined,
    address: cd.address?.line1 || undefined,
    city: cd.address?.city || undefined,
    country: cd.address?.country || undefined,
    tags,
    custom1: amountUsd != null ? `last_donation_usd:${amountUsd}` : undefined,
    custom2: `last_donation_at:${new Date().toISOString().slice(0, 10)}`,
    metadata: {
      source: isMonthly ? 'betazuck-monthly-donor' : 'betazuck-donor',
      stripe_session_id: session.id,
    },
    // Carried into the form receiver fallback's body as `amount_usd`.
    amount_usd: amountUsd,
  };

  const formReceiverFallback = {
    url:
      getOptionalEnv('NUCLEUS_DONOR_FORM_URL') ||
      getOptionalEnv('NUCLEUS_FORM_URL') ||
      undefined,
    source: isMonthly ? 'betazuck-monthly-donor' : 'betazuck-donor',
    originUrl: origin,
  };

  try {
    await syncProfileToNucleus(profile, formReceiverFallback);
  } catch (err) {
    console.error('nucleus donor sync failed:', err.message);
  }
}
