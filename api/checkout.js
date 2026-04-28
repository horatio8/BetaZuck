// POST /api/checkout — creates a Stripe Checkout Session and returns its URL.
// Frontend redirects the browser to that URL; Stripe hosts the card form.
//
// Required env vars:
//   STRIPE_SECRET_KEY  — sk_test_... in dev, sk_live_... in prod
//   PUBLIC_SITE_URL    — used to build success_url / cancel_url

import { json, badRequest, methodNotAllowed, serverError, getOptionalEnv } from './_lib.js';

export const config = { runtime: 'edge' };

const MIN_USD = 1;
const MAX_USD = 10000;

export default async function handler(req) {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  let payload;
  try {
    payload = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const amountUsd = Number(payload.amount);
  const monthly = payload.monthly === true;

  if (!Number.isFinite(amountUsd) || amountUsd < MIN_USD || amountUsd > MAX_USD) {
    return badRequest(`Amount must be between $${MIN_USD} and $${MAX_USD}`);
  }
  const unitAmount = Math.round(amountUsd * 100);

  // STRIPE_TEST_KEY takes precedence so test mode is sticky during
  // testing even if STRIPE_SECRET_KEY (live) is also set. Unset the
  // test key to flip back to live.
  const secret = process.env.STRIPE_TEST_KEY || process.env.STRIPE_SECRET_KEY;
  if (!secret) return serverError('Stripe is not configured (STRIPE_SECRET_KEY)');
  const origin = (getOptionalEnv('PUBLIC_SITE_URL') || new URL(req.url).origin).replace(/\/$/, '');

  // Build URL-encoded params for Stripe REST (deep keys with [n][k] notation).
  const params = new URLSearchParams();
  params.set('mode', monthly ? 'subscription' : 'payment');
  params.set('success_url', `${origin}/thanks`);
  params.set('cancel_url', `${origin}/#donate`);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set(
    'line_items[0][price_data][product_data][name]',
    monthly ? 'βetaZuck Monthly Support' : 'βetaZuck Donation'
  );
  params.set('line_items[0][price_data][unit_amount]', String(unitAmount));
  if (monthly) {
    params.set('line_items[0][price_data][recurring][interval]', 'month');
  }
  params.set('billing_address_collection', 'auto');
  params.set('allow_promotion_codes', 'false');
  params.set('metadata[campaign]', 'betazuck-landing');
  params.set('metadata[monthly]', monthly ? '1' : '0');

  let res;
  try {
    res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (err) {
    console.error('stripe fetch failed:', err);
    return serverError('Could not reach Stripe');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    console.error('stripe error:', res.status, data);
    return json(
      { ok: false, error: data?.error?.message || 'Stripe rejected the checkout request' },
      { status: 502 }
    );
  }
  return json({ ok: true, url: data.url });
}
