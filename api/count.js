import { createClient } from '@supabase/supabase-js';
import { json, getEnv, methodNotAllowed, serverError } from './_lib.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') return methodNotAllowed('GET');

  try {
    const supabase = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_ANON_KEY'),
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.rpc('signatures_count');
    if (error) throw error;

    const count = Number(data) || 0;
    return json(
      { count },
      {
        headers: {
          // CDN caches for 15s, serve stale for up to 60s while revalidating.
          'cache-control': 'public, s-maxage=15, stale-while-revalidate=60',
        },
      }
    );
  } catch (err) {
    console.error('count error:', err);
    return serverError('Could not load count');
  }
}
