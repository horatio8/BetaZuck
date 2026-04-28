// Smoke tests that hit real /api/* endpoints. Skipped unless BASE_URL
// points at a deployed environment (Vercel preview or production).
//
// Usage:
//   BASE_URL=https://www.betazuck.com npx playwright test api-smoke
//
// These tests are read-only or use Stripe test mode. They never POST to
// /api/sign because that has side effects (Nucleus, Supabase). Use a
// dedicated test petition form in Nucleus if you want to wire that up.

import { test, expect } from '@playwright/test';

test.describe('API smoke (deployed only)', () => {
  test.skip(!process.env.BASE_URL, 'set BASE_URL to a deployed origin to run');

  test('GET /api/count returns a finite count >= baseline', async ({ request }) => {
    const res = await request.get('/api/count');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.count).toBe('number');
    expect(Number.isFinite(body.count)).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(12924);
  });

  test('POST /api/checkout with $0 returns a 400', async ({ request }) => {
    const res = await request.post('/api/checkout', {
      data: { amount: 0, monthly: false },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Amount/i);
  });

  test('POST /api/checkout with a valid test amount returns a Stripe URL', async ({ request }) => {
    test.skip(
      !process.env.RUN_STRIPE_SMOKE,
      'set RUN_STRIPE_SMOKE=1 to hit the real Stripe API (test mode keys must be configured)',
    );
    const res = await request.post('/api/checkout', {
      data: { amount: 5, monthly: false },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });

  test('GET /api/sign returns 405 (POST only)', async ({ request }) => {
    const res = await request.get('/api/sign');
    expect(res.status()).toBe(405);
  });

  test('POST /api/stripe-webhook with no signature returns 400', async ({ request }) => {
    const res = await request.post('/api/stripe-webhook', {
      data: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });
});
