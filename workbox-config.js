// The web app's service worker, generated after `expo export -p web` by `npm run build:web`.
// It precaches only Kindway's own exported files, never Supabase or function responses. A new
// version waits until the app restarts (no skipWaiting), because a page still running the old
// version loads its route chunks by their old names; the app offers to restart sooner.
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{js,html,css,ttf,otf,png,ico,json,svg,webmanifest}'],
  // Expo exports package fonts under dist/assets/node_modules, which Workbox skips by default.
  // The icon font and the three Literata styles in use are needed offline; the other weights,
  // referenced by the font package but never loaded, are left out.
  globIgnores: ['**/literata/{200,300,600,700,800,900}*/**', '**/literata/500Medium_Italic/**'],
  swDest: 'dist/sw.js',
  navigateFallback: '/index.html',
  // Take charge of the page on the very first install, so the installed app works offline from its
  // first session. Later versions still wait for a restart: clientsClaim only matters when a worker
  // activates, and without skipWaiting that happens when no page is open (or after Restart now).
  clientsClaim: true,
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
};
