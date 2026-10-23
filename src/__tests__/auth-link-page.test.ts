/** The email-link landing page (web/auth-link): what it offers for each link Supabase sends there. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { decide } = require('../../web/auth-link/link.js') as {
  decide: (href: string, userAgent: string) => { kind: 'open' | 'error' | 'done'; purpose: 'confirm' | 'reset'; url?: string };
};

const PAGE = 'https://example.github.io/kindway-links/';
const PHONE = 'Mozilla/5.0 (Linux; Android 14; SM-A346E) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const link = (to: string, rest = 'code=abc-123') => `${PAGE}?to=${encodeURIComponent(to)}&${rest}`;

describe('email-link landing page', () => {
  it.each([
    ['a build', 'kindway:///auth/confirm'],
    ['Expo Go on the LAN', 'exp://192.168.1.20:8081/--/auth/confirm'],
    ['Expo Go through a tunnel', 'exps://abc-anonymous-8081.exp.direct/--/auth/confirm'],
  ])('on a phone, hands the code to %s', (_name, to) => {
    expect(decide(link(to), PHONE)).toEqual({ kind: 'open', purpose: 'confirm', url: `${to}?code=abc-123` });
  });

  it('password links open the reset screen', () => {
    expect(decide(link('kindway:///reset-password'), PHONE)).toEqual({ kind: 'open', purpose: 'reset', url: 'kindway:///reset-password?code=abc-123' });
  });

  it.each([
    'https://evil.example/auth/confirm',
    'javascript:alert(1)//auth/confirm',
    'intent://x/auth/confirm#Intent;end',
    'kindway:///settings',
    'kindway:///auth/confirm?next=https://evil.example',
    '',
  ])('never forwards the code to %j', (to) => {
    const result = decide(link(to), PHONE);
    expect(result.kind).toBe('done');
    expect(result.url).toBeUndefined();
  });

  it('on a computer, says the email is confirmed instead of trying to open the app', () => {
    expect(decide(link('kindway:///auth/confirm'), DESKTOP)).toEqual({ kind: 'done', purpose: 'confirm' });
  });

  it.each([
    ['in the query', 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['in the fragment', 'x=1#error=access_denied&error_code=otp_expired'],
  ])('an expired or used link reports it (%s), with no button', (_name, rest) => {
    expect(decide(link('kindway:///auth/confirm', rest), PHONE)).toEqual({ kind: 'error', purpose: 'confirm' });
  });
});
