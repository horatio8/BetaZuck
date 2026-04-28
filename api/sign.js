// POST /api/sign — proxies a petition signature to the Campaign Nucleus
// form receiver. Done server-side because the receiver does Origin-based
// access control (browser-direct POSTs return 403 host_not_allowed unless
// the page domain is whitelisted in Nucleus).
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   NUCLEUS_FORM_URL  — full receiver URL from Nucleus
//                       (e.g. https://teller.campaignnucleus.com/forms/receiver/<uuid>)
//   PUBLIC_SITE_URL   — public origin to send as the Origin/Referer header,
//                       must be whitelisted on the Nucleus form
//                       (e.g. https://betazuck.com)

import { json, badRequest, methodNotAllowed, serverError, getEnv, getOptionalEnv, clientIp, sha256Hex } from './_lib.js';

export const config = { runtime: 'edge' };

// Field mapping. Adjust the right-hand strings if Nucleus expects different names.
const NUCLEUS_FIELDS = {
  first_name:    'first_name',
  last_name:     'last_name',
  email:         'email',
  phone:         'phone',
  zip:           'zip',
  opt_in:        'opt_in',
  source:        'source',
};

export default async function handler(req) {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  let payload;
  try {
    payload = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const firstName = String(payload.first_name || payload.first || '').trim();
  const email     = String(payload.email || '').trim();
  const phone     = String(payload.phone || '').trim();
  const zip       = String(payload.zip || '').trim();
  const lastName  = String(payload.last_name || '').trim();
  const optIn     = payload.updates_opt_in !== false; // default true

  if (!firstName) return badRequest('First name is required');
  if (!/^\S+@\S+\.\S+$/.test(email)) return badRequest('Valid email is required');

  const nucleusUrl = getEnv('NUCLEUS_FORM_URL');
  const origin     = getOptionalEnv('PUBLIC_SITE_URL') || new URL(req.url).origin;

  // URL-encoded form body (most form receivers accept this).
  const body = new URLSearchParams();
  body.set(NUCLEUS_FIELDS.first_name, firstName);
  body.set(NUCLEUS_FIELDS.email, email);
  if (lastName) body.set(NUCLEUS_FIELDS.last_name, lastName);
  if (phone)    body.set(NUCLEUS_FIELDS.phone, phone);
  if (zip)      body.set(NUCLEUS_FIELDS.zip, zip);
  body.set(NUCLEUS_FIELDS.opt_in, optIn ? '1' : '0');
  body.set(NUCLEUS_FIELDS.source, 'betazuck-landing');

  let nucleusRes;
  try {
    nucleusRes = await fetch(nucleusUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'application/json, text/plain, */*',
        'origin': origin,
        'referer': origin + '/',
        'user-agent': 'βetaZuck-landing/1.0 (+' + origin + ')',
      },
      body: body.toString(),
      redirect: 'manual', // many form receivers respond with 302 → thank-you page
    });
  } catch (err) {
    console.error('nucleus fetch failed:', err);
    return serverError('Could not reach Nucleus');
  }

  // Treat 2xx and 3xx (redirect to thank-you) as success.
  if (nucleusRes.status >= 200 && nucleusRes.status < 400) {
    await mirrorToSupabase({ req, firstName, lastName, email, phone, zip });
    return json({ ok: true });
  }

  // Surface an actionable error for debugging.
  const text = await nucleusRes.text().catch(() => '');
  console.error('nucleus rejected:', nucleusRes.status, text.slice(0, 500));

  if (nucleusRes.status === 403) {
    return json(
      {
        ok: false,
        error: 'Nucleus rejected the submission origin. The site domain must be whitelisted on the Nucleus form.',
      },
      { status: 502 }
    );
  }
  return json({ ok: false, error: 'Nucleus rejected the submission', status: nucleusRes.status }, { status: 502 });
}

// Best-effort mirror of an accepted signature into Supabase so the public
// counter (api/count.js → signatures_count() RPC) reflects reality. Nucleus
// is the source of truth for the signer list; Supabase is just a counter.
// Failures are swallowed — the user already got a successful response.
async function mirrorToSupabase({ req, firstName, lastName, email, phone, zip }) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  try {
    const ip = clientIp(req);
    const ipHash = ip ? await sha256Hex(ip) : null;
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 500) || null;

    await fetch(`${url}/rest/v1/signatures`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName || null,
        email,
        phone: phone || null,
        zip: zip || null,
        ip_hash: ipHash,
        user_agent: userAgent,
      }),
    });
  } catch (err) {
    console.error('supabase mirror failed:', err);
  }
}
