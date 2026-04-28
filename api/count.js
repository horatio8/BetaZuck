// GET /api/count — returns the live signature count from Supabase.
// Requires SUPABASE_URL + SUPABASE_ANON_KEY env vars.

import { createClient } from '@supabase/supabase-js';
import { json, methodNotAllowed } from './_lib.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') return methodNotAllowed('GET');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  // Graceful degradation: if Supabase isn't configured, return 0 instead
  // of a 500 — keeps the page functional during partial setup.
  if (!url || !key) {
    return json({ count: 0, source: 'fallback' }, {
      headers: { 'cache-control': 'public, s-maxage=15' },
    });
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc('signatures_count');
    if (error) throw error;
    return json({ count: Number(data) || 0 }, {
      headers: { 'cache-control': 'public, s-maxage=15, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('count error:', err);
    return json({ count: 0, source: 'error' }, { status: 200 });
  }
}
