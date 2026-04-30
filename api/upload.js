// POST /api/upload — admin uploads an image to Supabase Storage and
// returns its public URL. The body is the raw binary; filename and
// content-type come from headers.
//
// Headers:
//   Authorization: Bearer <ADMIN_PASSWORD>
//   X-File-Name:   <basename, e.g. hero.jpg>
//   Content-Type:  image/jpeg | image/png | image/webp
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ADMIN_PASSWORD

import { json, methodNotAllowed } from './_lib.js';

export const config = { runtime: 'edge' };

const BUCKET = 'site-assets';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CT = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers':
          'authorization, content-type, x-file-name',
      },
    });
  }
  if (req.method !== 'POST') return methodNotAllowed('POST');

  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    return json({ ok: false, error: 'CMS not configured (ADMIN_PASSWORD unset)' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer !== adminPw) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const ct = req.headers.get('content-type') || '';
  if (!ALLOWED_CT.has(ct.toLowerCase().split(';')[0].trim())) {
    return json({ ok: false, error: `Unsupported content-type: ${ct}` }, { status: 400 });
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return json({ ok: false, error: 'Empty body' }, { status: 400 });
  if (buf.byteLength > MAX_BYTES) {
    return json({ ok: false, error: `File too large (max ${MAX_BYTES} bytes)` }, { status: 413 });
  }

  const supaUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) {
    return json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  // Build a stable-ish filename: <slugified base>-<timestamp>.<ext>
  const ext = extFromCt(ct) || extFromName(req.headers.get('x-file-name')) || 'bin';
  const base = slugify((req.headers.get('x-file-name') || 'upload').replace(/\.[^.]+$/, '')) || 'upload';
  const path = `${base}-${Date.now()}.${ext}`;

  const uploadUrl = `${supaUrl}/storage/v1/object/${BUCKET}/${path}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'content-type': ct,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-upsert': 'true',
    },
    body: buf,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('storage upload failed:', res.status, text.slice(0, 500));
    return json({ ok: false, error: 'Upload failed', detail: text.slice(0, 200) }, { status: 502 });
  }

  const publicUrl = `${supaUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  return json({ ok: true, url: publicUrl, path });
}

function extFromCt(ct) {
  const m = ct.toLowerCase().split(';')[0].trim();
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  })[m] || null;
}

function extFromName(name) {
  if (!name) return null;
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? m[1].toLowerCase() : null;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
