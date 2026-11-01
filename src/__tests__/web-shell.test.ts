/**
 * @jest-environment node
 *
 * The installable web app's shell: the page, the manifest and the service worker's settings.
 * The worker must precache only Kindway's own files and never take over a running page by
 * itself, because a page on the old version still loads route chunks by their old names.
 */
// The app's TypeScript setup has no Node types; these are the two calls used here.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs') as { readFileSync(file: string, encoding: 'utf8'): string; existsSync(file: string): boolean };
const path = require('path') as { join(...parts: string[]): string };
/* eslint-enable @typescript-eslint/no-require-imports */
declare const __dirname: string;

const root = path.join(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('service worker settings', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require('../../workbox-config.js');

  it('precaches the exported app and nothing else', () => {
    expect(config.globDirectory).toBe('dist/');
    expect(config.swDest).toBe('dist/sw.js');
    expect(config.globPatterns).toEqual(['**/*.{js,html,css,ttf,otf,png,ico,json,svg,webmanifest}']);
    expect(config.runtimeCaching).toBeUndefined();
    expect(config.maximumFileSizeToCacheInBytes).toBeGreaterThanOrEqual(5 * 1024 * 1024);
  });

  // Expo exports fonts from packages under dist/assets/node_modules, which Workbox skips by default.
  it('precaches the fonts Kindway draws with, but not Literata weights it never loads', () => {
    expect(config.globIgnores).toBeDefined();
    expect(config.globIgnores.join()).not.toMatch(/node_modules\/\*\*/);
    for (const used of ['400Regular', '400Regular_Italic', '500Medium']) {
      expect(config.globIgnores.some((p: string) => p.includes(`literata/${used}/`))).toBe(false);
    }
    expect(config.globIgnores).toEqual(expect.arrayContaining(['**/literata/{200,300,600,700,800,900}*/**', '**/literata/500Medium_Italic/**']));
  });

  it('opens any address offline from the cached page', () => {
    expect(config.navigateFallback).toBe('/index.html');
  });

  it('waits for the app to restart before a new version takes over', () => {
    expect(config.skipWaiting).toBeFalsy();
  });

  it('takes charge of the page on the very first install, so it works offline from the start', () => {
    expect(config.clientsClaim).toBe(true);
  });
});

// Cloudflare Pages never uploads folders named node_modules, and Expo exports package fonts
// under dist/assets/node_modules, so on the live site they came back as the app page.
describe('package assets on Cloudflare Pages', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const nodeFs = require('fs') as {
    mkdtempSync(prefix: string): string;
    mkdirSync(dir: string, options: { recursive: true }): void;
    writeFileSync(file: string, data: string): void;
    readFileSync(file: string, encoding: 'utf8'): string;
    existsSync(file: string): boolean;
  };
  const os = require('os') as { tmpdir(): string };
  const { moveVendorAssets } = require('../../scripts/web-postexport.js') as { moveVendorAssets(dist: string): number };
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('moves them out of node_modules and points the bundle at the new place', () => {
    const dist = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'kindway-dist-'));
    nodeFs.mkdirSync(path.join(dist, 'assets/node_modules/pkg/fonts'), { recursive: true });
    nodeFs.writeFileSync(path.join(dist, 'assets/node_modules/pkg/fonts/Face.abc.ttf'), 'font');
    nodeFs.mkdirSync(path.join(dist, '_expo/static/js/web'), { recursive: true });
    const bundle = path.join(dist, '_expo/static/js/web/app.js');
    nodeFs.writeFileSync(bundle, 's.exports="/assets/node_modules/pkg/fonts/Face.abc.ttf";t="/assets/node_modules/pkg/x.png"');

    expect(moveVendorAssets(dist)).toBe(1);
    expect(nodeFs.existsSync(path.join(dist, 'assets/node_modules'))).toBe(false);
    expect(nodeFs.readFileSync(path.join(dist, 'assets/vendor/pkg/fonts/Face.abc.ttf'), 'utf8')).toBe('font');
    expect(nodeFs.readFileSync(bundle, 'utf8')).toBe('s.exports="/assets/vendor/pkg/fonts/Face.abc.ttf";t="/assets/vendor/pkg/x.png"');

    // Running it again changes nothing.
    expect(moveVendorAssets(dist)).toBe(0);
    expect(nodeFs.readFileSync(path.join(dist, 'assets/vendor/pkg/fonts/Face.abc.ttf'), 'utf8')).toBe('font');
  });

  it('runs between the export and the service worker', () => {
    const pkg = require('../../package.json') as { scripts: Record<string, string> };
    expect(pkg.scripts['build:web']).toBe('expo export -p web && node scripts/web-postexport.js && workbox generateSW workbox-config.js');
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(read('public/manifest.json'));

  it('installs as Kindway, full screen, in Kindway’s colours', () => {
    expect(manifest).toMatchObject({
      name: 'Kindway',
      short_name: 'Kindway',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#F1EFEA',
      theme_color: '#F1EFEA',
    });
  });

  it('has 192 and 512 icons and a maskable one, all present', () => {
    const icons: { src: string; sizes: string; purpose?: string }[] = manifest.icons;
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of icons) expect(fs.existsSync(path.join(root, 'public', icon.src))).toBe(true);
  });
});

describe('page', () => {
  const html = read('public/index.html');

  it.each([
    'rel="manifest" href="/manifest.json"',
    'rel="apple-touch-icon" href="/icons/apple-touch-icon.png"',
    'name="apple-mobile-web-app-capable" content="yes"',
    'name="mobile-web-app-capable" content="yes"',
    'name="apple-mobile-web-app-status-bar-style" content="default"',
    'name="apple-mobile-web-app-title" content="Kindway"',
    'viewport-fit=cover',
    'name="theme-color" content="#F1EFEA" media="(prefers-color-scheme: light)"',
    'name="theme-color" content="#14181D" media="(prefers-color-scheme: dark)"',
    '<script src="/register-sw.js" defer></script>',
  ])('has %s', (snippet) => {
    expect(html).toContain(snippet);
  });

  it('runs no inline script, so the Content-Security-Policy can forbid them', () => {
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
  });

  it('registers the service worker from its own file', () => {
    expect(read('public/register-sw.js')).toContain("navigator.serviceWorker.register('/sw.js')");
  });

  it('has the Home Screen icon', () => {
    expect(fs.existsSync(path.join(root, 'public/icons/apple-touch-icon.png'))).toBe(true);
  });
});

describe('security headers on Cloudflare Pages', () => {
  const headers = read('public/_headers');

  it.each([
    "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://paceaswvraqjwzoyftsr.supabase.co; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    'Referrer-Policy: strict-origin-when-cross-origin',
    'X-Content-Type-Options: nosniff',
    'Permissions-Policy: camera=(), geolocation=(), microphone=()',
  ])('sends %s', (line) => {
    expect(headers).toContain(line);
  });

  it('applies them to every path', () => {
    expect(headers.split(/\r?\n/)[0].trim()).toBe('/*');
  });
});

describe('policy pages', () => {
  const page = (f: string) => read(`public/${f}`);
  it.each(['privacy.html', 'terms.html'])('%s is a complete page with no script and the contact address', (f) => {
    const html = page(f);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<meta name="viewport"');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('aldrichgavriels@gmail.com');
    expect(html).toContain('href="/legal.css"');
    expect(html).toMatch(/Last updated: \d{1,2} \w+ 2026/);
  });
  it('the privacy policy names what is stored, where, and the person’s rights', () => {
    const html = page('privacy.html');
    for (const s of ['Supabase', 'Groq', 'Zero Data Retention', 'Data Privacy Act', 'export', 'delete']) expect(html).toContain(s);
  });
  it('the terms say Kindway is not a therapy or crisis service', () => {
    expect(page('terms.html')).toMatch(/not a (therapy|crisis)/i);
  });
});
