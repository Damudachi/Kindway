# Phase 7: beta hardening — design

Status: draft for the owner's approval (2026-10-28).

## Intent

Two people will use Kindway every day: the owner on Android (Samsung A37) and a friend on iPhone through the web app (https://kindway.pages.dev). Both are in the Philippines. Before the friend starts, Kindway has to be something they can each rely on without worry:
- their writing stays private and is described honestly
- entries don't get lost
- in a bad moment, the app points to real help that exists where they live
- it works for someone using a screen reader, large text or reduced motion

Phase 7 covers Android and the web app together.

## Goals

1. **Real help in the Philippines.** Extra support lists verified Philippine crisis and emergency contacts, tappable to call or text, instead of the "Not available yet" placeholder.
2. **Honest privacy wording for Zero Data Retention.** The owner turned on ZDR in Groq's Data Controls on 2026-10-28. The disclosure says what is now true, and both users agree to the new wording once.
3. **AI labels that can't be faked.** Only Kindway's server can write AI reflections, reviews and follow-up replies, so "Written by AI" and the stored provider and model are trustworthy. This closes the known limitation in `docs/supabase-setup.md` §6b.
4. **Durable web storage.** The web journal moves from `localStorage` (about 5 MB in Safari) to IndexedDB, and asks the browser to keep it (`navigator.storage.persist()`). The existing journals of the two users move without any risk of loss.
5. **A written security and privacy review.** `docs/security-review.md`, sized for a two-person beta, with no high-severity finding left open.
6. **Accessibility checked on both platforms:** screen reader, reduced motion, small screens, and large text or zoom on the web.
7. **Offline recovery checked:** long offline periods, the app closed mid-sync, and sign-in expiring while offline. Each recovers with nothing lost.
8. **The 6B review's minor issues fixed** (listed under Scope).

## Non-goals

- A public launch, store listing or wider beta (Phase 9).
- Clinical review of the support copy. Kindway stays clearly "a journal and reflection aid, not a therapy service".
- Web reminders and voice (Phase 8).
- Rerunning the live AI evaluation. It ran in full in Phase 6. Rerun it only if a prompt changes.
- A paid Groq plan. The free plan's limits are ample for two people.

## Anti-goals (failure even if it "works")

- A storage move that loses or duplicates entries on either live phone.
- A crisis number that is wrong, out of date, or for the wrong country.
- Privacy wording that claims more than is true. ZDR is "turned on by the owner", not "verified by a third party".
- Android or the web being broken by the server change (consent or provenance) before the app update reaches them.
- Accessibility fixes that change the look for everyone else.

## Constraints found (2026-10-28)

1. **Support screen** (`src/app/support.tsx`): it says to add no numbers until verified. Verification means checking each number against an official source (the organisation's own site or a government page), recording the source and the date checked in the code next to each number, and re-checking before Phase 9.
2. **Consent versions** (`src/data/ai-disclosure.ts`, `src/services/ai/consent.ts`, server `AI_CONSENT_TERMS`): a wording change means bumping `disclosureVersion` in both places, and a Jest test keeps them equal. An app on the old version gets `consent_required` from a server on the new one. So the server and both apps have to change together:
   - the web app updates on push
   - Android 1.2.1 gets the change by over-the-air update (`eas update`, runtime version = app version)
   - the owner's phone is still on 1.2.0 and must install 1.2.1 first
3. **AI writes** (`supabase/functions/_shared/ai-store.ts`): every read and write currently goes through the caller's token. The output tables grant `insert` to `authenticated`, and `ai_begin_request` and `ai_finish_request` can be executed by `authenticated` (`20261020170000_ai_outputs.sql`, `20261021120000_ai_follow_ups.sql`). Users must keep:
   - reading and deleting their own AI rows
   - `delete_ai_outputs()`
   - "Clear this conversation"
4. **Storage** (`src/storage/persistence.ts`): every journal goes through `jsonStorage(key)`, which wraps AsyncStorage (`localStorage` on the web).
   - The Supabase session (`services/supabase/client.ts`) and the widget snapshot also use AsyncStorage. They are tiny and can stay.
   - Keys: `kindway:state:v1`, `kindway:state:v1:user:<id>`, `kindway:sync-base:v1:<id>`, `kindway:device:v1`, `kindway:web:v1`, `kindway:appearance:v1`.
5. **Accessibility today:** 26 files set accessibility labels or reduced motion, and `Text` caps font scaling per variant. Large text (1.3×) was checked on 16 Android screens in Phase 6; the screen reader, reduced motion and small screens weren't.
6. **Verification environment:** the Android emulator (TalkBack via adb) and headless Chrome via `playwright-core` from the scratchpad. There's no real iPhone here, so iPhone VoiceOver, Safari text size and the PWA install stay with the owner and friend.

## Approaches considered

| Area | Options | Decision |
|---|---|---|
| Web storage | A: move to IndexedDB now. B: keep `localStorage`, ask for persistence, keep the "Couldn't save" warning | **A**, chosen by the owner for scalability. Made safe by copying rather than moving (below) |
| AI provenance | A: server functions write AI rows with the service key, and users lose insert rights. B: sign each output and verify the signature when displayed | **A**: the only sensible way. B adds machinery for no extra safety, since rows can only be read by their owner anyway |
| Crisis contacts | A: a fixed Philippine list in the app. B: a list per region, chosen by locale | **A** for now (both users are in the Philippines). Keep it as data (one module), so Phase 9 can add regions |

## What gets built

1. **Extra support for the Philippines.**
   - The Support screen's options list verified contacts, each with a name, what it's for, its hours, and buttons that open the phone dialler or SMS (`tel:`/`sms:`).
   - It starts with 911 (national emergency) and the NCMH Crisis Hotline (1553 and its mobile numbers), plus any further services the verification confirms.
   - The data lives in one module, with the source URL and the date checked recorded for each entry.
   - The emergency instruction at the top names 911.
   - The placeholder comment and the "Not available yet" notice go. The copy stays clear that Kindway can't send help.
2. **ZDR wording.**
   - Rewrite the retention lines in `ai-disclosure.ts`: Groq doesn't keep inference content, and with Zero Data Retention turned on, it doesn't log it for reliability or abuse checks either.
   - Keep the wording to what the owner turned on and Groq's docs say (link and date in the doc comment).
   - Bump `disclosureVersion` in both places and redeploy the functions.
   - Ship the app change to the web (push) and to Android 1.2.1 (`eas update`), in that order, in one sitting.
3. **Provenance.** It goes live in three steps, so no step breaks the step before or after it:
   1. Migration 1 *adds* server-only versions of the ledger functions, which take the user id explicitly. The old ones and all grants stay, so the live functions keep working.
   2. Deploy the functions, which now write through the server key.
   3. Migration 2 revokes `insert` on `ai_reflections`, `ai_insights`, `ai_insight_sources` and `ai_follow_ups`, and execute on the old `ai_begin_request` and `ai_finish_request`, from `authenticated`.

   The apps only read and delete AI rows (checked), so neither 1.2.0, 1.2.1 nor the web app is affected.
   - The functions keep reading as the caller (RLS still decides what exists). They write ledger and output rows through a service-key client, using only the user id from the verified token.
   - Covered by tests:
     - `ai-server.test.ts` (fake store)
     - the local-stack integration suites (a signed-in user's direct insert and RPC call are refused; deletes still work)
     - a rerun of the hosted smoke test after deploying
   - Then delete the "known limitation" paragraphs from `docs/supabase-setup.md` and the README.
4. **IndexedDB on the web.**
   - `jsonStorage` gets a web backend: a small IndexedDB key-value store written in the project, no new dependency.
   - Native keeps AsyncStorage.
   - The move happens per key, on first load:
     1. Read the IndexedDB value. If it's absent, read `localStorage`.
     2. Write the value to IndexedDB, then read it back and compare.
     3. Only then remove the `localStorage` copy.
   - If IndexedDB is unavailable or the comparison fails, keep using `localStorage` as today. Nothing is removed.
   - Call `navigator.storage.persist()` once, ignoring the result.
   - The "Couldn't save on this device" warning stays as the backstop.
   - Tests cover:
     - the move
     - the comparison failing
     - IndexedDB being missing
     - a second run doing nothing
5. **Security and privacy review** (`docs/security-review.md`).
   - **Covers:**
     - what's stored where (device, cloud, Groq)
     - keys and secrets (the bundle scan)
     - RLS and grants, including Supabase's own security advisors (`npx supabase db advisors --linked`)
     - Edge Function inputs, CORS, auth
     - email links and PKCE
     - the web app (no secrets, the service worker caches only the app's own files)
     - logging
     - dependencies (`npm audit`, ranked)
     - account deletion
     - backups
   - **Each finding gets** a severity and a fix, or a stated reason to accept it.
   - **Security headers for Pages:** a `public/_headers` file with Content-Security-Policy, `Referrer-Policy`, `X-Content-Type-Options` and frame protection, checked so they don't break the app, Supabase or fonts.
6. **Accessibility pass.**
   - **Android TalkBack:** on the emulator across the main flows: onboarding, write and save, reflection, Talk it through, Settings, Support. Check every control is labelled, the reading order makes sense, and dialogs are reachable.
   - **Web:** the accessibility tree in Chrome for the same flows, and 200% browser zoom at phone width.
   - **Reduced motion:** on both, nothing essential depends on animation.
   - **Small screens:** 320 px wide on the web, 360 dp on Android.
   - **Output:** a checklist with results in `docs/accessibility.md`. Fixes are limited to what fails.
7. **Offline recovery.** A checklist, run with tests where possible and the emulator or headless browser otherwise:
   - 24 hours offline with edits to *different* entries on two devices of one account
   - the app closed during upload
   - sign-in expiring while offline (sync says to sign in again; edits are kept)
   - a reflection requested offline (it fails clearly, with no stand-in reply)
8. **6B review minors.**
   - Confirm screen: check "already signed in" before the Home Screen message.
   - Treat a PKCE verifier mismatch on the web like a missing verifier.
   - On the web, say up front that a reset link opens in Safari.
   - `clientsClaim: true` for the first install only (keep no `skipWaiting`; update `web-shell.test.ts`).
   - A single listener in `restart()`.
   - Fix the broken code fence in `supabase-setup.md`.

## Who deploys what

- **The owner** commits and pushes. A push publishes the web app.
- **The builder** pushes database migrations to the hosted project, deploys the server functions, sets function secrets, and publishes the Android over-the-air update with `eas update` (approved as part of this design).
- **Consent wording change,** in one sitting:
  1. The owner installs 1.2.1 and pushes the commit.
  2. Once Pages has built it, the builder deploys the server functions and runs `eas update`.
  3. For the few minutes between the web build and the server deploy, a new consent can be refused. With two users, that's accepted.

## Decided by the owner

- The beta is two people in the Philippines.
- Zero Data Retention is on in Groq (2026-10-28).
- Web storage moves to IndexedDB now (chosen for scalability).
- Groq stays on the free plan.

## Left to the builder (my calls, flagged for review)

- **Crisis list size:** verified numbers only, at least 911 and the NCMH line. Others (for example Hopeline PH, In Touch) are added only if an official source confirms them on the day.
- **Ordering the consent bump:** server, web and Android OTA are deployed together, in one sitting. The owner installs 1.2.1 first, so their phone can take the update.
- **Persistent storage:** `navigator.storage.persist()` is requested silently, with no prompt UI.
- **Review document sizing:** written for two known users. Rate-limit and abuse hardening beyond today's is noted, not built.
- **Session and widget storage:** stay on AsyncStorage on the web (small, and not journal content).
- **The same entry edited on two devices of one account while offline:** today the device that syncs last wins, and the other edit is lost. Phase 7 records this as a known limitation in the security review; it doesn't build conflict copies. Each beta user has their own account on their own phone, so it would only happen if one person wrote on two devices offline.
- **Provenance in three steps** (above), so deploy timing can't break anything.
