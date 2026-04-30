// GET  /api/content — returns the current CMS content tree (public, cached).
// PUT  /api/content — replaces the entire content tree (admin only).
//
// Auth for PUT: Authorization: Bearer <ADMIN_PASSWORD>
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY            (used by GET via the get_site_content RPC)
//   SUPABASE_SERVICE_ROLE_KEY    (used by PUT, bypasses RLS)
//   ADMIN_PASSWORD               (compared against the bearer token)

import { json, badRequest, methodNotAllowed, getOptionalEnv } from './_lib.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'GET')  return getContent();
  if (req.method === 'PUT')  return putContent(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  return methodNotAllowed('GET, PUT');
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
  };
}

async function getContent() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;

  // No DB → return empty object so the page falls back to its defaults.
  if (!url || !anon) {
    return json({}, {
      headers: { 'cache-control': 'public, s-maxage=15', ...corsHeaders() },
    });
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_site_content`, {
      method: 'POST',
      headers: {
        apikey: anon,
        authorization: `Bearer ${anon}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('content rpc failed:', res.status, text.slice(0, 300));
      return json({}, { headers: { ...corsHeaders() } });
    }
    const data = await res.json();
    return json(data || {}, {
      headers: {
        'cache-control': 'public, s-maxage=30, stale-while-revalidate=120',
        ...corsHeaders(),
      },
    });
  } catch (err) {
    console.error('content rpc exception:', err);
    return json({}, { headers: { ...corsHeaders() } });
  }
}

async function putContent(req) {
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    return json({ ok: false, error: 'CMS not configured (ADMIN_PASSWORD unset)' }, {
      status: 500, headers: corsHeaders(),
    });
  }
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!constantTimeEqual(bearer, adminPw)) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return badRequest('Body must be a JSON object');
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return json({ ok: false, error: 'Supabase not configured' }, {
      status: 500, headers: corsHeaders(),
    });
  }

  try {
    // Upsert the singleton 'content' row.
    const res = await fetch(`${url}/rest/v1/site_content?on_conflict=key`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify({
        key: 'content',
        value: payload,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('content upsert failed:', res.status, text.slice(0, 500));
      return json({ ok: false, error: 'Save failed' }, { status: 502, headers: corsHeaders() });
    }
    return json({ ok: true }, { headers: corsHeaders() });
  } catch (err) {
    console.error('content upsert exception:', err);
    return json({ ok: false, error: 'Save failed' }, { status: 502, headers: corsHeaders() });
  }
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
