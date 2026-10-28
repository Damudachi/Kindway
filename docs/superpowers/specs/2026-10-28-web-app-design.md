# Phase 6B: Kindway for iPhone on the web — design

Status: draft for the owner's approval (2026-10-28).

## Intent

The owner's friend has an iPhone and should use Kindway every day. A native iOS build needs a paid Apple Developer account, which the owner doesn't have. So Kindway also ships as an installable web app (a PWA): the friend opens a link in Safari, adds it to the Home Screen, and from then on it launches full-screen with its own icon, like an app. It's a proper daily-use version, not a demo. The friend starts only once all phases are done; their feedback then drives an improve-and-patch round.

## Goals

- Installs from Safari's Share → Add to Home Screen, with Kindway's name, icon and colours, and launches full-screen without Safari's bars.
- Signing in with email and password, cloud backup and sync work, so entries survive Safari clearing site data and can move between devices.
- AI reflections, Talk it through and AI reviews work, with the same consent rules as Android.
- Opens with no signal: the app itself is cached, and entries already on the phone are readable and writable; sync catches up later.
- Published automatically from GitHub to Cloudflare Pages on a stable free address; each branch gets its own preview address.
- Honest on the web: nothing says "Android", the widget is hidden, and reminders say they're coming rather than pretending.

## Non-goals

- Reminders on the web. Phase 8 adds them with Web Push sent by Supabase on a schedule.
- A native iOS build, voice journaling, or the widget on the web.
- A custom domain (possible later; free on Cloudflare apart from the domain itself).
- Desktop polish beyond "it works in a browser window".

## Anti-goals (failure even if it "works")

- Losing a journal: a local-only web journal that Safari wipes, with no warning.
- A service worker that traps people on an old version after a fix ships.
- Any secret in the web bundle (only the publishable key and URLs are allowed, as on Android).
- Email links that leave someone stuck on a blank or broken page.

## Constraints found in the code (2026-10-28)

1. **The web build already compiles.** `npx expo export -p web` builds every route with `web.output: "single"`.
2. **Storage.** The journal and the Supabase session use AsyncStorage, which is `localStorage` on the web.
   - Safari may clear a website's storage after 7 days without a visit. A Home Screen web app is treated as its own app and isn't subject to that, but it's still one device's storage.
   - Cloud backup is the real safety net, so the web app has to push it harder than Android does.
3. **The AI and delete-account functions have no CORS handling.** `serveAi` answers anything but POST with 405. Browsers send an `OPTIONS` preflight before calling them, so every AI request and account deletion from the web would fail. They need CORS headers and an `OPTIONS` answer, then a redeploy.
   - Origins allowed: the Pages production and preview addresses, and localhost for development.
4. **Email links, and how iOS opens them.**
   - Auth uses PKCE: the code in a link can only be exchanged by the browser storage that asked for it.
   - On iOS, links from Mail open in Safari, never in the Home Screen app, and the two have separate storage.
   - So a confirmation link confirms the email in Safari, and the person then signs in with their password in the installed app.
   - A password-reset link completes in Safari, and the new password is then used in the app.
   - The web build's links must come back to the website (`https://<site>/auth/confirm`, `/reset-password`), not to `kindway://`.
   - Those addresses must be allow-listed in Supabase Auth.
5. **Platform-specific code.**
   - **Notifications:** `expo-notifications` is loaded lazily; on the web nothing should be scheduled, and the Reminders screens and offers must not appear.
   - **Widget:** `widgetLib()` already returns null off Android. The Settings row and the `/widget` route need hiding on the web.
6. **Copy.** These say "Android" today: reminder-offer, settings/reminders, settings/privacy and voice. On the web and iOS they need neutral wording.
7. **Hosting.** Cloudflare Pages, connected to GitHub (`Damudachi/Kindway`); the owner pushes.
   - Build command: export, then generate the service worker.
   - Output folder: `dist`.
   - `EXPO_PUBLIC_*` values are set in the Pages project; they're public by design.
   - With no `404.html`, Pages serves `index.html` for unknown paths, which is what a single-page app needs.

## Approaches considered

| | Trade-off | Decision |
|---|---|---|
| **A. Cloudflare Pages via GitHub** | Free, no request cap, free custom domain later, preview address per branch, auto-publish on push | **Chosen** by the owner for scalability |
| B. EAS Hosting | Same Expo account; free tier capped at 100k requests/month, custom domain paid | Rejected: caps out around ~100 daily users |
| C. GitHub Pages | Needs a second public repo and a 404 workaround for routes | Rejected |

Offline support: **Workbox-generated service worker** (Expo's documented PWA path), precaching the exported app shell, fonts and icons. It updates in the background and moves to the new version on the next launch, so nobody gets stuck on an old version; when an update is waiting, it says so.

## What gets built

1. **Install.**
   - A web app manifest: name, short name, standalone display, Kindway colours, 192/512 icons and a maskable icon.
   - Apple touch icon and iOS meta tags (`apple-mobile-web-app-capable`, status-bar style, `viewport-fit=cover`) in a customised `public/index.html`.
   - Icons generated from the existing brand assets.
2. **"Add to Home Screen" guidance on iPhone.** In Safari only (not once installed), shown once, a short card explains Share → Add to Home Screen and why it matters: storage that lasts, and full-screen.
3. **Offline.** The service worker as above, registered from `index.html`, generated in the build script (`build:web`).
4. **CORS on the four Edge Functions.**
   - Answer `OPTIONS` and add CORS headers for the allowed origins; the allowed list comes from a function secret.
   - Covered by unit tests in `ai-server.test.ts`, then redeployed, with the hosted smoke test rerun.
5. **Auth on the web.**
   - The web build gets its redirect target from `window.location.origin`.
   - `/auth/confirm` and `/reset-password` keep their screens. When a code can't be exchanged (another browser or the installed app), they say what to do: "Email confirmed — open Kindway from your Home Screen and sign in."
   - The Supabase Auth allow-list gets the site addresses.
6. **Platform gating.**
   - Reminders: hidden on the web, with one line in Settings saying they're coming.
   - The Settings widget row and `/widget` route: hidden.
   - The voice screen keeps its demo state, with neutral copy.
   - The scheduler and widget sync do nothing on the web.
7. **Neutral copy** wherever "Android" appears, chosen by platform. "Android settings" stays on Android, and the web says "your browser's settings" or leaves it out.
8. **Data safety on the web.** On the web, Today shows a gentle, dismissible card for a local-only journal recommending an account with cloud backup. Unlike Android's single offer, it comes back after 7 days if still local-only, because Safari storage is less durable.
9. **Hosting setup.**
   - The owner creates the Pages project in the Cloudflare dashboard, and I provide the exact settings: framework none, build command `npm run build:web`, output `dist`, Node version, environment variables.
   - The owner pushes; the main branch is production.
   - A short `docs/web-app.md` covers it.
10. **Verification.**
    - Jest for the platform gating and copy.
    - `expo export -p web` in CI style.
    - A local run (`npx serve dist`) checked in a browser at phone width.
    - Then on the live Pages address: install on an iPhone (the friend's, or the owner checking with someone else's), sign in, write, reflect with AI, and go offline and reopen.

## Decided by the owner

- Web first, without reminders; reminders in Phase 8.
- Cloudflare Pages via GitHub; the owner pushes commits.
- The web app goes before Phase 7, so hardening covers Android and the web together.
- The friend starts only when all phases are done.

## Left to the builder (my calls, flagged for review)

- The allowed-origins list lives in a function secret (`ALLOWED_ORIGINS`), so preview addresses can be added without code changes.
- The Safari install card shows once per browser, and only on iOS Safari outside standalone mode.
- The service worker never caches Supabase or function responses, only the app's own files.
- Version bump: the web app shows the same version as Android (1.2.x), read from `app.json`.

## Builder check (done in-house)

Read as the person building it, the open questions were:
- Where do web email links land? Answered in item 5.
- What happens to `kindway://` links on the web? They're never generated there.
- Does the existing `web/auth-link` landing page still matter? Yes, for Android. The web build doesn't use it: `EXPO_PUBLIC_AUTH_LINK_URL` is ignored when running on the web.
- Can the hosted functions be called from preview addresses? Yes, through `ALLOWED_ORIGINS`.

Nothing was left that only the owner can answer.
