# Kindway on the web (iPhone)

Kindway also runs as an installable web app (a PWA) for iPhones, because a native iOS build needs a paid Apple Developer account. The friend opens the site in Safari, adds it to the Home Screen, and from then on it opens full screen with its own icon. Design: `docs/superpowers/specs/2026-10-28-web-app-design.md`.

What's different on the web:
- No reminders yet (Phase 8 adds Web Push). Settings says so.
- No widget.
- Wording says "your browser" instead of "Android".
- Email links come back to the site, not to `kindway://`.

## Build

```bash
npm run build:web   # expo export -p web, then Workbox writes dist/sw.js
npx expo serve      # serve dist/ locally to try it
```

The build reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Both are public by design: data is protected by Row Level Security, not by the key. `EXPO_PUBLIC_AUTH_LINK_URL` is ignored on the web. Never put a secret key in Pages.

The pieces:
- `public/index.html`: the page, with the Home Screen tags and the service worker registration.
- `public/manifest.json`, `public/icons/`: the install name, colours and icons.
- `workbox-config.js`: what works offline. It precaches the app's own files only, never Supabase or function responses.
- `src/app/(tabs)/_layout.web.tsx`: the bottom tab bar. The native tabs' web fallback is a strip that covers each screen's header.
- Web-only checks go through `onWeb()` in `src/services/platform.ts`.

## Cloudflare Pages (one-time, by the owner)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `Damudachi/Kindway`.
2. Settings:
   - Production branch: `main`
   - Framework preset: None
   - Build command: `npm run build:web`
   - Build output directory: `dist`
3. Environment variables (Production and Preview):
   - `NODE_VERSION` = `22.20.0`
   - `EXPO_PUBLIC_SUPABASE_URL` = same value as in `.env`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = same value as in `.env`
4. Save and deploy. The site appears at `https://<site>.pages.dev`. Each other branch gets its own preview address, `https://<hash>.<site>.pages.dev`.

Every push to `main` publishes a new version. There's no `404.html`, so Pages serves `index.html` for every address, which is what the app's routing needs.

## Supabase (once the address is known)

- **Edge Functions:** browsers may call them only from the sites in the `ALLOWED_ORIGINS` secret (see "Calls from the web app" in `docs/supabase-setup.md`, section 6b):

  ```bash
  npx supabase secrets set "ALLOWED_ORIGINS=https://<site>.pages.dev,https://*.<site>.pages.dev,http://localhost:8081,http://localhost:3000"
  ```

- **Auth:** in Authentication → URL Configuration → Redirect URLs, add:
  - `https://<site>.pages.dev/**`
  - `https://*.<site>.pages.dev/**`
  - `http://localhost:8081/**`

  Without them, Supabase silently sends email links to its Site URL instead.

## Email links on iPhone

Links in Mail always open in Safari, never in the Home Screen app, and the two keep separate storage. With PKCE, a link can only be finished by the storage that asked for it. So:
- **Confirmation:** the email is confirmed either way. If the account was made in the Home Screen app, Safari says "Email confirmed — open Kindway from your Home Screen and sign in", and the person signs in there with their password.
- **Password reset:** a reset asked for in the Home Screen app can't be finished in Safari. Safari says so and offers a new link. Asked for from Safari, the link works there, and the new password then works in the app too.

## Updates

The service worker downloads a new version in the background. It doesn't take over a running app, because a page still on the old version loads parts of itself by their old names. The new version opens the next time Kindway starts. Until then, Today shows "A new version of Kindway is ready" with **Restart now**.

## Storage and backups

The journal lives in the browser's storage (`localStorage`). A Home Screen app keeps its storage, but a Safari tab can lose it after 7 days without a visit, and any browser can clear storage when space runs low. So, for a local-only journal, Today recommends an account with cloud backup, and asks again a week after "Not now". In a Safari tab, a one-time tip explains Add to Home Screen and says to do it before writing much, because the Home Screen app and the tab keep separate journals.

## Checks on an iPhone

1. In Safari, open the site, tap Share → Add to Home Screen, then open it from the icon. It should open full screen with Kindway's name and icon.
2. Create an account in the app, then open the confirmation email. Safari should say "Email confirmed". Sign in in the app.
3. Write an entry and get an AI reflection. Turn on cloud backup.
4. Turn on airplane mode, reopen Kindway, read an entry and write a new one. Turn signal back on: Settings → Account should say all changes are backed up.

Two things only the live site shows, for me to check once it exists:
- Pages redirects `/index.html` to `/`. The service worker must still install there: in desktop Chrome, DevTools → Application → Service workers should show `sw.js` activated.
- A preflight from the live address gets a 204 with its own `Access-Control-Allow-Origin` (the curl check in `docs/supabase-setup.md`, with `Origin: https://<site>.pages.dev`).

Never ship a deploy without `sw.js` (the build generates it into `dist/`). Pages would answer a missing `sw.js` with the app page, and phones would keep the old version. To retire the service worker, deploy a `sw.js` that unregisters itself.

When this device can't save (a full browser storage, about 5 MB in Safari), Today says "Couldn’t save on this device" and offers a backup. The journal is kept as one JSON string, plus a second copy for sync when signed in. Moving to IndexedDB is on Phase 7's list.
