/**
 * @jest-environment node
 *
 * CORS for the Edge Functions, so the web app can call them from a browser. The Android app
 * sends no Origin header and must see exactly what it saw before.
 */
import { allowedOrigin, withCors } from '../../supabase/functions/_shared/cors';

const LIST = 'https://kindway.pages.dev, http://localhost:8081';
const WILD = 'https://*.kindway.pages.dev';

describe('allowedOrigin', () => {
  it('accepts an origin on the list, ignoring spaces around items', () => {
    expect(allowedOrigin('https://kindway.pages.dev', LIST)).toBe('https://kindway.pages.dev');
    expect(allowedOrigin('http://localhost:8081', LIST)).toBe('http://localhost:8081');
  });

  it('matches a wildcard against exactly one subdomain label', () => {
    expect(allowedOrigin('https://abc123.kindway.pages.dev', WILD)).toBe('https://abc123.kindway.pages.dev');
    expect(allowedOrigin('https://kindway.pages.dev', WILD)).toBeNull();
    expect(allowedOrigin('https://a.b.kindway.pages.dev', WILD)).toBeNull();
    expect(allowedOrigin('https://evil.com', WILD)).toBeNull();
    expect(allowedOrigin('https://abc.kindway.pages.dev.evil.com', WILD)).toBeNull();
    expect(allowedOrigin('http://abc.kindway.pages.dev', WILD)).toBeNull();
  });

  it('allows nothing without an origin or without a list', () => {
    expect(allowedOrigin(null, LIST)).toBeNull();
    expect(allowedOrigin('https://kindway.pages.dev', undefined)).toBeNull();
    expect(allowedOrigin('https://kindway.pages.dev', '')).toBeNull();
  });
});

describe('withCors', () => {
  const env = (name: string) => (name === 'ALLOWED_ORIGINS' ? LIST : undefined);
  const inner = jest.fn(async (_req: Request) =>
    new Response(JSON.stringify({ error: 'not_signed_in' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }),
  );
  const serve = withCors(inner, env);
  beforeEach(() => inner.mockClear());

  it('answers a preflight from an allowed origin without running the function', async () => {
    const res = await serve(new Request('https://x.supabase.co/functions/v1/f', { method: 'OPTIONS', headers: { Origin: 'https://kindway.pages.dev' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://kindway.pages.dev');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('authorization, x-client-info, apikey, content-type');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(inner).not.toHaveBeenCalled();
  });

  it('refuses a preflight from any other origin', async () => {
    const res = await serve(new Request('https://x.supabase.co/functions/v1/f', { method: 'OPTIONS', headers: { Origin: 'https://evil.com' } }));
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(inner).not.toHaveBeenCalled();
  });

  it('adds CORS headers to an allowed origin’s responses, errors included, keeping the rest', async () => {
    const res = await serve(new Request('https://x.supabase.co/functions/v1/f', { method: 'POST', headers: { Origin: 'http://localhost:8081' } }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'not_signed_in' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  it('leaves requests without an Origin (the Android app) untouched', async () => {
    const res = await serve(new Request('https://x.supabase.co/functions/v1/f', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toBeNull();
    expect(inner).toHaveBeenCalledTimes(1);
  });
});
