// Shared Nucleus integration.
//
// Two paths, picked at runtime per call:
//   1. Authenticated API (POST /v1/profiles/match)  — preferred
//      Requires NUCLEUS_API_TOKEN to be set, plus profile.last_name
//      (the API requires first_name + last_name + email).
//   2. Public form receiver (POST <NUCLEUS_FORM_URL>) — fallback
//      Works without auth; only requires email + first_name.
//
// If the API call throws, we log and fall through to the form receiver
// so we never lose a signup over a transient API blip. Callers decide
// whether a total failure is fatal (sign.js returns 502; the Stripe
// webhook swallows it because Stripe retries).

const API_BASE = 'https://api.campaignnucleus.com/v1';

/**
 * Sync a profile to Nucleus.
 * @param {object} profile
 *   first_name, last_name?, email, phone?, zip?, state?, address?,
 *   tags? (array of strings), custom1..custom10?, metadata?
 * @param {object} formReceiverFallback - { url, source, originUrl }
 * @returns {Promise<{via: 'api'|'form_receiver'}>} on success
 * @throws if both paths fail (or both are unavailable).
 */
export async function syncProfileToNucleus(profile, formReceiverFallback) {
  const token = process.env.NUCLEUS_API_TOKEN;

  // Path 1: authenticated profiles/match. Requires last_name per spec.
  if (token && profile.first_name && profile.last_name && profile.email) {
    try {
      await postToNucleusApi('/profiles/match', profile, token);
      return { via: 'api' };
    } catch (err) {
      console.error('nucleus API /profiles/match failed:', err.message);
      // Fall through to form receiver.
    }
  }

  // Path 2: form receiver.
  if (formReceiverFallback?.url) {
    await postToFormReceiver(profile, formReceiverFallback);
    return { via: 'form_receiver' };
  }

  throw new Error('Nucleus not configured (no NUCLEUS_API_TOKEN and no form receiver)');
}

async function postToNucleusApi(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${path}: ${res.status} ${text.slice(0, 500)}`);
  }
  return res.json().catch(() => ({}));
}

async function postToFormReceiver(profile, opts) {
  const body = new URLSearchParams();
  body.set('first_name', profile.first_name);
  if (profile.last_name) body.set('last_name', profile.last_name);
  body.set('email', profile.email);
  if (profile.phone) body.set('phone', profile.phone);
  if (profile.zip) body.set('zip', profile.zip);
  body.set('opt_in', '1');
  if (opts.source) body.set('source', opts.source);
  // Pass through any custom fields the caller wants the receiver to see.
  for (let i = 1; i <= 10; i++) {
    const k = `custom${i}`;
    if (profile[k]) body.set(k, profile[k]);
  }
  if (profile.amount_usd) body.set('amount_usd', String(profile.amount_usd));

  const origin = opts.originUrl || '';
  const res = await fetch(opts.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json, text/plain, */*',
      origin,
      referer: origin + '/',
      'user-agent': 'βetaZuck-landing/1.0 (+' + origin + ')',
    },
    body: body.toString(),
    redirect: 'manual',
  });

  // Receiver returns 302 → thank-you on success; treat 2xx and 3xx as ok.
  if (res.status >= 400) {
    const text = await res.text().catch(() => '');
    throw new Error(`form receiver: ${res.status} ${text.slice(0, 500)}`);
  }
}
