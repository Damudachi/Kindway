// Runs after `expo export -p web`, before Workbox (see `npm run build:web`).
//
// Expo exports fonts and images that come from packages under dist/assets/node_modules, and
// Cloudflare Pages never uploads folders named node_modules. On the live site those requests got
// the app page instead, so the icon font and Literata were missing. This moves them to
// dist/assets/vendor and points the exported files at the new place. Running it twice is harmless.
const fs = require('fs');
const path = require('path');

const FROM = '/assets/node_modules/';
const TO = '/assets/vendor/';

/** Text files under `dir` that can reference an asset path. */
function textFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return textFiles(full);
    return /\.(js|html|css|json)$/.test(e.name) ? [full] : [];
  });
}

/** Moves dist/assets/node_modules to dist/assets/vendor and rewrites references; returns how many files were rewritten. */
function moveVendorAssets(dist) {
  const from = path.join(dist, 'assets', 'node_modules');
  if (!fs.existsSync(from)) return 0;
  fs.cpSync(from, path.join(dist, 'assets', 'vendor'), { recursive: true });
  fs.rmSync(from, { recursive: true });
  let rewritten = 0;
  for (const file of textFiles(dist)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(FROM)) continue;
    fs.writeFileSync(file, text.split(FROM).join(TO));
    rewritten++;
  }
  return rewritten;
}

module.exports = { moveVendorAssets };

if (require.main === module) {
  const count = moveVendorAssets(path.join(__dirname, '..', 'dist'));
  console.log(`web-postexport: moved package assets to dist/assets/vendor, rewrote ${count} file(s)`);
}
