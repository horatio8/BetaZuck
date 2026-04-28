// POST /api/sign — records a petition signature.
//
// Sync to Campaign Nucleus:
//   - If NUCLEUS_API_TOKEN is set, calls POST /v1/profiles/match (auth'd CRM
//     upsert with proper identity matching, tags, custom fields).
//   - Else falls back to the public form receiver (NUCLEUS_FORM_URL).
//   See api/_nucleus.js for the dispatch logic.
//
// Then mirrors the row to Supabase (best-effort) so the public live
// counter at /api/count reflects reality.
//
// Required env vars:
//   PUBLIC_SITE_URL   — public origin (used as Origin/Referer for the
//                       form receiver fallback; whitelisted on Nucleus)
//
// One of these must be set:
//   NUCLEUS_API_TOKEN — Bearer for api.campaignnucleus.com (preferred), or
//   NUCLEUS_FORM_URL  — public form receiver URL

import {
  json, badRequest, methodNotAllowed, getOptionalEnv,
  clientIp, sha256Hex,
} from './_lib.js';
import { syncProfileToNucleus } from './_nucleus.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  let payload;
  try {
    payload = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const firstName = String(payload.first_name || payload.first || '').trim();
  const lastName  = String(payload.last_name || '').trim();
  const email     = String(payload.email || '').trim();
  const phone     = String(payload.phone || '').trim();
  const zip       = String(payload.zip || '').trim();

  if (!firstName) return badRequest('First name is required');
  if (!/^\S+@\S+\.\S+$/.test(email)) return badRequest('Valid email is required');

  const origin = getOptionalEnv('PUBLIC_SITE_URL') || new URL(req.url).origin;

  // Sync to Nucleus. Throws if both API and form receiver paths fail.
  try {
    await syncProfileToNucleus(
      {
        first_name: firstName,
        last_name: lastName || undefined,
        email,
        phone: phone || undefined,
        zip: zip || undefined,
        tags: ['betazuck-signer'],
        metadata: { source: 'betazuck-landing' },
      },
      {
        url: getOptionalEnv('NUCLEUS_FORM_URL') || undefined,
        source: 'betazuck-landing',
        originUrl: origin,
      },
    );
  } catch (err) {
    console.error('nucleus sync failed:', err.message);
    if (err.message.includes('403') || err.message.toLowerCase().includes('origin')) {
      return json(
        {
          ok: false,
          error: 'Nucleus rejected the submission origin. The site domain must be whitelisted on the Nucleus form.',
        },
        { status: 502 },
      );
    }
    return json({ ok: false, error: 'Could not reach Nucleus' }, { status: 502 });
  }

  // Best-effort mirror to Supabase for the public counter.
  await mirrorToSupabase({ req, firstName, lastName, email, phone, zip });

  return json({ ok: true });
}

// Best-effort mirror of an accepted signature into Supabase so the public
// counter (api/count.js → signatures_count() RPC) reflects reality.
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
