// Renders the Kindway mark (Held light) to every shipping raster via headless Chrome.
// Run: node assets/brand/export-icons.mjs   (set CHROME to override the browser path)
import { copyFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, '..', 'images');
const work = mkdtempSync(join(tmpdir(), 'kindway-icons-'));
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// The mark on a 108dp adaptive-icon canvas: an evening crescent holding a small warm light
// (it also reads as a gentle smile). Drawn on a 100-unit grid, centred and scaled to sit
// inside the 66dp safe circle. `id` keeps each file's mask unique.
const mark = ({ stem, lantern }, id = 'held') => `
<defs><mask id="${id}"><rect width="100" height="100" fill="#fff"/><circle cx="50" cy="38" r="27" fill="#000"/></mask></defs>
<g transform="translate(54 49) scale(0.92) translate(-50 -50)">
<circle cx="50" cy="50" r="31" fill="${stem}" mask="url(#${id})"/>
<circle cx="50" cy="56" r="8" fill="${lantern}"/></g>`;
const dusk = mark({ stem: '#ECE8E1', lantern: '#E5AB66' });
const paper = mark({ stem: '#25272B', lantern: '#AD721C' });
const mono = mark({ stem: '#FFFFFF', lantern: '#FFFFFF' });
const ground = '<rect x="-20" y="-20" width="148" height="148" fill="#14181D"/>';

const svg = (viewBox, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

const assets = {
  // Android adaptive icon layers (full 108dp canvas; launchers crop to the central 72dp).
  'android-icon-foreground.png': [512, svg('0 0 108 108', dusk)],
  'android-icon-background.png': [512, svg('0 0 108 108', ground)],
  'android-icon-monochrome.png': [432, svg('0 0 108 108', mono)],
  // Square store / legacy icon: the launcher's visible area.
  'icon.png': [1024, svg('18 18 72 72', ground + dusk)],
  // Splash marks on transparent ground, one per scheme.
  'splash-icon.png': [512, svg('24 24 60 60', paper)],
  'splash-icon-dark.png': [512, svg('24 24 60 60', dusk)],
  'favicon.png': [48, svg('18 18 72 72', ground + dusk)],
  // Android status-bar icon: white on transparent; the system tints it.
  'notification-icon.png': [96, svg('21 21 66 66', mono)],
  // Shown in the launcher's widget picker: the widget as it looks at night with today's prompt.
  'widget-preview.png': [560, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 140">
<rect width="280" height="140" rx="24" fill="#1B2027"/>
<circle cx="25" cy="27" r="5" fill="#E5AB66"/>
<text x="38" y="31" font-family="Roboto, sans-serif" font-size="13" fill="#B4B0A9">Kindway</text>
<text x="20" y="66" font-family="Georgia, serif" font-size="15" fill="#ECE8E1">What are you carrying into tonight?</text>
<rect x="20" y="88" width="132" height="36" rx="18" fill="#E5AB66"/>
<text x="36" y="111" font-family="Roboto, sans-serif" font-size="14" font-weight="500" fill="#14181D">Write a thought</text></svg>`],
};

writeFileSync(join(dir, 'kindway-mark.svg'), svg('0 0 108 108', ground + dusk));
for (const [name, [size, body]] of Object.entries(assets)) {
  const html = join(work, name + '.html');
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px">${body.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body></html>`);
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--user-data-dir=${join(work, 'profile')}`,
    `--window-size=${size},${size}`, `--screenshot=${join(work, name)}`, 'file:///' + html.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  // The Chrome launcher can return before the screenshot is on disk; wait for it to settle.
  const shot = join(work, name);
  for (let i = 0, last = -1; i < 100; i++) {
    const size = existsSync(shot) ? statSync(shot).size : -1;
    if (size > 0 && size === last) break;
    last = size;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  // Chrome can't always write outside the temp dir (e.g. an elevated D: drive), so copy from there.
  copyFileSync(join(work, name), join(out, name));
}
// Chrome may still hold its profile lock for a moment; leftover temp files are harmless.
try { rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
console.log('rendered', Object.keys(assets).length, 'assets to', out);
