// GET /api/count — returns the live signature count from Supabase,
// plus a fixed baseline of off-platform signatures collected before
// this counter went live.
// Requires SUPABASE_URL + SUPABASE_ANON_KEY env vars.

import { createClient } from '@supabase/supabase-js';
import { json, methodNotAllowed } from './_lib.js';

export const config = { runtime: 'edge' };

// Off-platform signatures (rallies, prior petitions, social, etc.).
// New /api/sign signups tally on top of this.
const COUNT_BASELINE = 12924;

export default async function handler(req) {
  if (req.method !== 'GET') return methodNotAllowed('GET');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  // Graceful degradation: if Supabase isn't configured, still show the
  // baseline so the page doesn't read as 0.
  if (!url || !key) {
    return json({ count: COUNT_BASELINE, source: 'fallback' }, {
      headers: { 'cache-control': 'public, s-maxage=15' },
    });
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc('signatures_count');
    if (error) throw error;
    return json({ count: COUNT_BASELINE + (Number(data) || 0) }, {
      headers: { 'cache-control': 'public, s-maxage=15, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('count error:', err);
    return json({ count: COUNT_BASELINE, source: 'error' }, { status: 200 });
  }
}
