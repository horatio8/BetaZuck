// POST /api/sign — records a signup for one of the campaigns.
//
// Payload routing via `form` field:
//   form: 'petition' (default) → βetaZuck petition
//                                (tag: betazuck-signer, mirrors to Supabase)
//   form: 'senate'             → Hayden McDougall U.S. Senate landing at /senate
//                                (tag: senate-signer, does NOT mirror to Supabase)
//
// Sync to Campaign Nucleus:
//   - If NUCLEUS_API_TOKEN is set, calls POST /v1/profiles/match (auth'd CRM
//     upsert with proper identity matching, tags, custom fields).
//   - Else falls back to the per-form public form receiver URL.
//   See api/_nucleus.js for the dispatch logic.
//
// For βetaZuck only: mirrors the row to Supabase (best-effort) so the
// public live counter at /api/count reflects reality.
//
// Required env vars:
//   PUBLIC_SITE_URL          — public origin (used as Origin/Referer for
//                              the form receiver fallback; whitelisted on
//                              Nucleus)
//
// One of these must be set (per form):
//   NUCLEUS_API_TOKEN        — Bearer for api.campaignnucleus.com (used
//                              across all forms if provided)
//   NUCLEUS_FORM_URL         — βetaZuck petition receiver
//   NUCLEUS_FORM_URL_SENATE  — Senate signup receiver

import {
  json, badRequest, methodNotAllowed, getOptionalEnv,
  clientIp, sha256Hex,
} from './_lib.js';
import { syncProfileToNucleus } from './_nucleus.js';

export const config = { runtime: 'edge' };

// Per-form config: which Nucleus form URL to hit, which tag to apply to
// the Nucleus profile, whether to mirror the row into the βetaZuck
// signature table (only the βetaZuck petition should count toward that
// counter — other campaigns living at other routes stay separate).
const FORM_CONFIG = {
  petition: {
    urlEnv: 'NUCLEUS_FORM_URL',
    source: 'betazuck-landing',
    tag: 'betazuck-signer',
    mirrorToSupabase: true,
  },
  senate: {
    urlEnv: 'NUCLEUS_FORM_URL_SENATE',
    source: 'senate-landing',
    tag: 'senate-signer',
    mirrorToSupabase: false,
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

  const firstName = String(payload.first_name || payload.first || '').trim();
  const lastName  = String(payload.last_name || payload.last || '').trim();
  const email     = String(payload.email || '').trim();
  const phone     = String(payload.phone || '').trim();
  const zip       = String(payload.zip || '').trim();
  const source    = String(payload.source || cfg.source).trim();

  if (!firstName) return badRequest('First name is required');
  if (!/^\S+@\S+\.\S+$/.test(email)) return badRequest('Valid email is required');

  const origin = getOptionalEnv('PUBLIC_SITE_URL') || new URL(req.url).origin;
  const formReceiverUrl = getOptionalEnv(cfg.urlEnv);

  // Sync to Nucleus. Throws if both API and form receiver paths fail.
  try {
    await syncProfileToNucleus(
      {
        first_name: firstName,
        last_name: lastName || undefined,
        email,
        phone: phone || undefined,
        zip: zip || undefined,
        tags: [cfg.tag],
        metadata: { source },
      },
      {
        url: formReceiverUrl || undefined,
        source,
        originUrl: origin,
      },
    );
  } catch (err) {
    console.error('nucleus sync failed:', formKey, err.message);
    if (err.message.includes('403') || err.message.toLowerCase().includes('origin')) {
      return json(
        {
          ok: false,
          error: 'Nucleus rejected the submission origin. The site domain must be whitelisted on the Nucleus form.',
        },
        { status: 502 },
      );
    }
    if (err.message.includes('not configured')) {
      return json(
        {
          ok: false,
          error: `Server not configured: set ${cfg.urlEnv} or NUCLEUS_API_TOKEN.`,
        },
        { status: 503 },
      );
    }
    return json({ ok: false, error: 'Could not reach Nucleus' }, { status: 502 });
  }

  // Best-effort mirror to Supabase for the public counter — only for the
  // βetaZuck petition. Other campaigns don't share that counter.
  if (cfg.mirrorToSupabase) {
    await mirrorToSupabase({ req, firstName, lastName, email, phone, zip });
  }

  return json({ ok: true, form: formKey });
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
