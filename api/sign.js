// POST /api/sign — proxies a form submission to the Campaign Nucleus
// form receiver. Done server-side because the receiver does Origin-based
// access control (browser-direct POSTs return 403 host_not_allowed unless
// the page domain is whitelisted in Nucleus).
//
// Payload routing: `form` selects which Nucleus receiver URL to hit.
//   form: 'senate'   → NUCLEUS_FORM_URL_SENATE  (Hayden McDougall Senate signup)
//   form: undefined  → NUCLEUS_FORM_URL         (default: βetaZuck petition)
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   NUCLEUS_FORM_URL         — βetaZuck petition receiver
//   NUCLEUS_FORM_URL_SENATE  — Hayden McDougall Senate receiver (add this)
//   PUBLIC_SITE_URL          — public origin sent as Origin/Referer header;
//                              must be whitelisted on the Nucleus form

import { json, badRequest, methodNotAllowed, serverError, getOptionalEnv } from './_lib.js';

export const config = { runtime: 'edge' };

// Field mapping — same names for both forms so far. Split into
// FORM_FIELDS[form] if a form eventually needs different keys.
const NUCLEUS_FIELDS = {
  first_name: 'first_name',
  last_name:  'last_name',
  email:      'email',
  phone:      'phone',
  zip:        'zip',
  opt_in:     'opt_in',
  source:     'source',
};

const FORM_CONFIG = {
  petition: {
    envVar: 'NUCLEUS_FORM_URL',
    defaultSource: 'betazuck-landing',
  },
  senate: {
    envVar: 'NUCLEUS_FORM_URL_SENATE',
    defaultSource: 'senate-landing',
  },
};

export default async function handler(req) {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  let payload;
  try {
    payload = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const formKey = String(payload.form || 'petition').toLowerCase();
  const cfg = FORM_CONFIG[formKey];
  if (!cfg) return badRequest(`Unknown form "${formKey}"`);

  const nucleusUrl = getOptionalEnv(cfg.envVar);
  if (!nucleusUrl) {
    return json(
      { ok: false, error: `Server not configured: ${cfg.envVar} is not set.` },
      { status: 503 }
    );
  }

  const firstName = String(payload.first_name || payload.first || '').trim();
  const email     = String(payload.email || '').trim();
  const phone     = String(payload.phone || '').trim();
  const zip       = String(payload.zip || '').trim();
  const lastName  = String(payload.last_name || payload.last || '').trim();
  const source    = String(payload.source || cfg.defaultSource).trim();
  const optIn     = payload.updates_opt_in !== false; // default true

  if (!firstName) return badRequest('First name is required');
  if (!/^\S+@\S+\.\S+$/.test(email)) return badRequest('Valid email is required');

  const origin = getOptionalEnv('PUBLIC_SITE_URL') || new URL(req.url).origin;

  // URL-encoded form body (most form receivers accept this).
  const body = new URLSearchParams();
  body.set(NUCLEUS_FIELDS.first_name, firstName);
  body.set(NUCLEUS_FIELDS.email, email);
  if (lastName) body.set(NUCLEUS_FIELDS.last_name, lastName);
  if (phone)    body.set(NUCLEUS_FIELDS.phone, phone);
  if (zip)      body.set(NUCLEUS_FIELDS.zip, zip);
  body.set(NUCLEUS_FIELDS.opt_in, optIn ? '1' : '0');
  body.set(NUCLEUS_FIELDS.source, source);

  let nucleusRes;
  try {
    nucleusRes = await fetch(nucleusUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'application/json, text/plain, */*',
        'origin': origin,
        'referer': origin + '/',
        'user-agent': 'betazuck-landing/1.0 (+' + origin + ')',
      },
      body: body.toString(),
      redirect: 'manual', // many form receivers respond with 302 → thank-you page
    });
  } catch (err) {
    console.error('nucleus fetch failed:', formKey, err);
    return serverError('Could not reach Nucleus');
  }

  // Treat 2xx and 3xx (redirect to thank-you) as success.
  if (nucleusRes.status >= 200 && nucleusRes.status < 400) {
    return json({ ok: true, form: formKey });
  }

  // Surface an actionable error for debugging.
  const text = await nucleusRes.text().catch(() => '');
  console.error('nucleus rejected:', formKey, nucleusRes.status, text.slice(0, 500));

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
