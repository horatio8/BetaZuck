// Tiny shared helpers used by the edge functions.

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  });
}

export function badRequest(message) {
  return json({ ok: false, error: message }, { status: 400 });
}

export function serverError(message = 'Internal error') {
  return json({ ok: false, error: message }, { status: 500 });
}

export function methodNotAllowed(allow = 'POST') {
  return new Response('Method not allowed', {
    status: 405,
    headers: { allow },
  });
}

export function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function getOptionalEnv(name) {
  return process.env[name] || '';
}

// SHA-256 hex of a string (Edge runtime SubtleCrypto).
export async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || req.headers.get('x-real-ip') || '';
}

export function originOf(req) {
  const url = new URL(req.url);
  return process.env.PUBLIC_SITE_URL || `${url.protocol}//${url.host}`;
}
