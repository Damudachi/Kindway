// Renders the Kindway mark (dusk K monogram) to every shipping raster via headless Chrome.
// Run: node assets/brand/export-icons.mjs   (set CHROME to override the browser path)
import { copyFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, '..', 'images');
const work = mkdtempSync(join(tmpdir(), 'kindway-icons-'));
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// The mark on a 108dp adaptive-icon canvas: blaze stem, trail bending past it, lantern ahead.
const mark = ({ stem, trail, lantern }) => `
<path d="M66 34 C 60 43 53 49 49 54 C 54 59 61 67 68 77" fill="none" stroke="${trail}" stroke-width="6.5" stroke-linecap="round"/>
<rect x="38" y="31" width="11" height="46" rx="1.4" fill="${stem}"/>
<circle cx="67" cy="33" r="5.5" fill="${lantern}"/>`;
const dusk = mark({ stem: '#ECE8E1', trail: '#9DB4C4', lantern: '#E5AB66' });
const paper = mark({ stem: '#25272B', trail: '#4D6474', lantern: '#AD721C' });
const mono = mark({ stem: '#FFFFFF', trail: '#FFFFFF', lantern: '#FFFFFF' });
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
  'splash-icon.png': [512, svg('28 26 56 56', paper)],
  'splash-icon-dark.png': [512, svg('28 26 56 56', dusk)],
  'favicon.png': [48, svg('18 18 72 72', ground + dusk)],
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
  // Chrome can't always write outside the temp dir (e.g. an elevated D: drive), so copy from there.
  copyFileSync(join(work, name), join(out, name));
}
// Chrome may still hold its profile lock for a moment; leftover temp files are harmless.
try { rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
console.log('rendered', Object.keys(assets).length, 'assets to', out);
