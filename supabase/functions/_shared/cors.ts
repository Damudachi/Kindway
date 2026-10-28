// CORS for the Edge Functions, so the web app can call them from a browser. Which sites may call
// them comes from the ALLOWED_ORIGINS secret: comma-separated exact origins
// (`http://localhost:8081`), or one leading wildcard label (`https://*.kindway.pages.dev`) for
// preview addresses. Requests without an Origin header (the Android app) pass through untouched.
// CORS isn't access control: every function still verifies the caller's token itself.

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The origin itself when `allowList` permits it, otherwise null. */
export function allowedOrigin(origin: string | null, allowList: string | undefined): string | null {
  if (!origin || !allowList) return null;
  for (const item of allowList.split(',').map((s) => s.trim()).filter(Boolean)) {
    const wild = /^(https?:\/\/)\*\.(.+)$/.exec(item);
    if (wild ? new RegExp(`^${escape(wild[1])}[a-z0-9-]+\\.${escape(wild[2])}$`, 'i').test(origin) : origin === item) return origin;
  }
  return null;
}

/** Wraps a function's handler: answers preflights and adds CORS headers for allowed origins. */
export function withCors(handler: (req: Request) => Promise<Response>, env: (name: string) => string | undefined) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    const allowed = allowedOrigin(origin, env('ALLOWED_ORIGINS'));
    if (req.method === 'OPTIONS' && origin) {
      if (!allowed) return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowed,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': ALLOW_HEADERS,
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }
    const res = await handler(req);
    if (!origin) return res;
    const headers = new Headers(res.headers);
    headers.set('Vary', 'Origin');
    if (allowed) headers.set('Access-Control-Allow-Origin', allowed);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
