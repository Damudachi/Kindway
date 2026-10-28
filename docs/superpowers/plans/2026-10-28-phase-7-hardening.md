# Phase 7 beta hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kindway safe to rely on daily for two users in the Philippines (Android 1.2.1 and the iPhone web app): unforgeable AI labels, verified crisis contacts, Zero Data Retention wording, durable web storage, a security and privacy review, an accessibility pass, offline checks, and the 6B review's minors.

**Architecture:** AI rows become server-written. New `ai_server_*` ledger functions take an explicit user id and can only be executed by `service_role`. The Edge Functions read as the caller and write through a server-key client. Users lose insert rights in a later migration, so no deploy order breaks anything. Web journal storage gets an IndexedDB key-value backend behind the existing `jsonStorage`, with a copy-then-verify move from `localStorage`. Everything else is data, copy, documents and checks.

**Tech Stack:** Expo SDK 58, react-native-web, Supabase (Postgres, RLS, pgTAP, Edge Functions on Deno), Cloudflare Pages, EAS Update.

**Spec:** `docs/superpowers/specs/2026-10-28-phase-7-hardening-design.md` (approved 2026-10-28)

## Global Constraints

- **Commits:** none. The owner commits and pushes (memory `kindway-no-commits`), so plan steps have no commit step. Tell the owner what to push and when.
- **Done means:** `npx expo lint`, `npx tsc --noEmit`, `npx jest` and `npm run build:web` all pass, plus `npx supabase test db` (local stack) for database changes.
- **Packages:** add with `npx expo install` only. No new runtime dependency is planned.
- **Hosted project:** `paceaswvraqjwzoyftsr`. The builder runs `npx supabase db push`, `npx supabase functions deploy …`, `npx supabase secrets set …` and `npx eas-cli@latest update`. The owner does `git push`.
- **Never print or commit secrets.** The server key comes only from the default function secrets (`SUPABASE_SECRET_KEYS` / `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`), as in `delete-account`.
- **Throwaway hosted accounts** are created by SQL into the session scratchpad, used, then deleted through `delete-account`, as in Phase 6B.
- **Crisis contacts:** only those confirmed on an official source on the day. Each records `source` (URL) and `checked` (`YYYY-MM-DD`).
- **Copy style:** ’ “ ” …, sentence case, no exclamation marks, and nothing claims more than is true. ZDR is "turned on in Kindway’s Groq account", not "verified".
- **Every web check goes through `onWeb()`** (`src/services/platform.ts`).
- **Heavy jobs one at a time** (memory `kindway-windows-env`): Docker, the emulator and the full Jest run are never run together. Check free space on C: before Docker or the emulator.

## Review Focus

1. **The server key missing from the hosted secrets.** A request should get `503 not_configured`, not `500` or `401`. Pinned in Task 2.
2. **A request begun by the old functions and finished by the new ones** during the deploy window. `ai_server_finish_request` must close a pending row created through the old `ai_begin_request`. Pinned in Task 1.
3. **IndexedDB unavailable or throwing** (Safari private browsing, storage blocked). The app keeps using `localStorage`, and nothing is removed or lost. Pinned in Task 6.
4. **The move running twice, or in two tabs at once.** The second run is a no-op, and the journal is never emptied. Pinned in Task 6.
5. **Someone who agreed to the old disclosure, after the bump.** They should see the "agree again" path, not a silent AI failure. Pinned in Task 5.

---

### Task 1: Server-only ledger functions (provenance step 1 of 3)

**Files:**
- Create: `supabase/migrations/20261029100000_ai_server_ledger.sql`
- Test: `supabase/tests/database/ai_server_ledger.test.sql`

**Interfaces:**
- Produces:
  - `public.ai_server_begin_request(p_user uuid, p_kind text, p_key uuid, p_cooldown_seconds integer, p_daily_limit integer) returns jsonb`
  - `public.ai_server_finish_request(p_user uuid, p_request_id uuid, p_status text, p_error_code text default null) returns void`
  - Both are `security definer`, `set search_path = ''`, and execute is revoked from `public, anon, authenticated` and granted to `service_role` only.
  - Same behaviour, results and error codes as the current `ai_begin_request` / `ai_finish_request` (latest definition, in `20261021120000_ai_follow_ups.sql`), with `uid` taken from `p_user`. A null `p_user` raises `22023`.
  - The existing `ai_begin_request(…)` and `ai_finish_request(…)` become thin wrappers that call these with `auth.uid()`, keeping their own `42501` check for a missing caller. That keeps one copy of the logic. Existing grants are unchanged.

- [ ] **Step 1: Write the failing pgTAP test** `ai_server_ledger.test.sql`, in the style of `ai_ledger_security.test.sql`:
  - **As `service_role`:**
    - `ai_server_begin_request(<A>, 'reflection', k, 0, 50)` returns `outcome = 'started'`, and the row's `user_id` is A.
    - The same key again returns `duplicate`.
    - `ai_server_finish_request(<A>, id, 'succeeded')` closes it.
    - Finishing with `<B>` raises (not the owner).
    - `p_user` null → `22023`.
    - Invalid limits → `22023`.
    - `'follow_up'` is accepted as a kind.
  - **Review Focus 2:** as `authenticated` (A), start a request with the old `ai_begin_request`, then as `service_role`, `ai_server_finish_request(<A>, that id, 'failed')` closes it.
  - **As `authenticated`:** calling `ai_server_begin_request` raises `42501`, as does `ai_server_finish_request`.
- [ ] **Step 2: Run it.** Start Docker (`D:\Docker\Docker Desktop.exe`), then `npx supabase start -x studio,storage-api,imgproxy,logflare,vector,realtime,postgres-meta`, then `npx supabase test db`. Expected: the new file FAILs (function does not exist), and the existing files pass.
- [ ] **Step 3: Write the migration.** Move the bodies into the `ai_server_*` functions and redefine the old two as wrappers, as in Interfaces.
- [ ] **Step 4: Run** `npx supabase db reset` (applies all migrations locally), then `npx supabase test db`. Expected: all files PASS, including the unchanged old ones.

### Task 2: Functions write through the server key (provenance step 2 of 3)

**Files:**
- Create: `supabase/functions/_shared/server-key.ts`, holding `serverKey(env)`, moved from `delete-account/index.ts` (`adminKey`)
- Modify:
  - `supabase/functions/delete-account/index.ts` (use `serverKey`)
  - `supabase/functions/_shared/ai-store.ts`
  - `supabase/functions/_shared/ai-runtime.ts`
  - `supabase/functions/_shared/ai-config.ts`
- Test: `src/__tests__/ai-server.test.ts`

**Interfaces:**
- Consumes: Task 1's `ai_server_*` functions.
- Produces:
  - `serverKey(env: (name: string) => string | undefined): string | undefined`, with the same lookup order as `adminKey` today.
  - `supabaseAiStore(caller: Client, server: Client, userId: string): AiStore`. The `AiStore` interface is unchanged.
    - Reads and `consentActive` use `caller`.
    - `beginRequest` and `finishRequest` call `ai_server_begin_request` / `ai_server_finish_request` on `server`, with `p_user: userId`.
    - `saveReflection`, `saveInsight` (and its sources insert and cleanup delete) and `saveFollowUp` use `server` and set `user_id: userId` on every row.
  - `ConfigProblem` gains `'server_key_missing'`, and `loadAiConfig` returns it when `serverKey(env)` is undefined.
  - `runtimeDeps.authenticate` builds both clients. `server` is `createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } })`. The user id comes only from `auth.getUser(token)`.

- [ ] **Step 1: Write the failing tests** in `ai-server.test.ts`:
  - **`loadAiConfig` with no server key:** given an env with every AI setting but none of the three key names, `expect(loadAiConfig(env)).toEqual({ ok: false, problem: 'server_key_missing' })`.
  - **`serveAi` → 503:** with that env, `serveAi` returns `503 { error: 'not_configured' }` and logs `config_problem: 'server_key_missing'` (Review Focus 1).
  - **`supabaseAiStore` routes writes to the server client:** with two recording fake clients:
    - `beginRequest` calls `server.rpc('ai_server_begin_request', { p_user: 'u1', p_kind, p_key, p_cooldown_seconds, p_daily_limit })`, and `caller.rpc` isn't called for it.
    - `saveReflection(row)` inserts into `server.from('ai_reflections')` with `user_id: 'u1'` merged.
    - `entries([...])` reads from `caller`.
  - Existing `loadAiConfig` tests gain a server key in their env so they keep passing.
- [ ] **Step 2: Run** `npx jest src/__tests__/ai-server.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as specified in Interfaces. Update the header comment of `ai-store.ts`: reads run as the caller, and writes use the server key with the verified user id.
- [ ] **Step 4: Run** `npx jest src/__tests__/ai-server.test.ts src/__tests__/cors.test.ts`. Expected: PASS.
- [ ] **Step 5: Run** `npx supabase functions serve` locally against the local stack, then `npx jest src/__tests__/ai-outputs.integration.test.ts src/__tests__/ai-functions.integration.test.ts` with the local `KINDWAY_TEST_*` variables (`docs/supabase-setup.md` §6). Expected: PASS.
- [ ] **Step 6: Deploy to hosted.**
  1. `npx supabase db push`, which applies Task 1 only.
  2. `npx supabase functions deploy generate-reflection generate-insights generate-follow-up delete-account`.
  3. Create two throwaway accounts and run the hosted smoke test (`docs/supabase-setup.md`, "Hosted smoke test"). Expected: 8/8. Keep the accounts for Task 3.

### Task 3: Users can no longer write AI rows (provenance step 3 of 3)

**Files:**
- Create: `supabase/migrations/20261029110000_ai_outputs_server_only.sql`
- Modify:
  - `supabase/tests/database/ai_outputs.test.sql`
  - `supabase/tests/database/ai_ledger_security.test.sql`
  - `supabase/tests/database/ai_follow_ups.test.sql`
  - `src/__tests__/hosted.smoke.test.ts`
  - `docs/supabase-setup.md` §6b
  - `README.md`

**Interfaces:**
- Consumes: Task 1's functions and Task 2's deployed functions.
- Produces:
  - `insert` is revoked on `ai_reflections`, `ai_insights`, `ai_insight_sources` and `ai_follow_ups` from `authenticated`, and their "…: create" insert policies are dropped.
  - `ai_begin_request` and `ai_finish_request` are dropped.
  - `select` and `delete` grants and policies, and `delete_ai_outputs()`, are unchanged.

- [ ] **Step 1: Change the pgTAP tests first.**
  - Setup that inserted AI rows or began requests as `authenticated` now does it as `service_role`, through `ai_server_*` and explicit `user_id`.
  - Limit and validation cases move to `ai_server_begin_request`.
  - Add, as `authenticated`:
    - `throws_ok` insert into each of the four tables, `42501`
    - `throws_ok` `select public.ai_begin_request(...)` (function does not exist, `42883`)
    - `lives_ok` delete of own reflection
    - `lives_ok` `delete_ai_outputs()`
    - B can't see A's rows (existing)
- [ ] **Step 2: Run** `npx supabase test db`. Expected: the new `throws_ok` insert assertions FAIL (inserts still allowed).
- [ ] **Step 3: Write the migration** as in Interfaces.
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db`. Expected: all PASS. Then `npx jest src/__tests__/ai-outputs.integration.test.ts src/__tests__/ai-functions.integration.test.ts` against the local stack. Expected: PASS.
- [ ] **Step 5: Hosted smoke test.** Add one test to `hosted.smoke.test.ts`: signed in as A, `from('ai_reflections').insert({...})` returns an error, and `rpc('ai_begin_request', …)` returns an error.
- [ ] **Step 6: Deploy and check.** `npx supabase db push`, then rerun the hosted smoke test. Expected: 9/9. Delete the throwaway accounts through `delete-account`, and check sign-in is refused and 0 rows are left.
- [ ] **Step 7: Docs.** Delete the "Known limitation: stored provider and model are not proof of provenance" paragraph in `docs/supabase-setup.md` and the README bullet. Describe instead: AI rows are written only by the functions, with the server key and the verified user id.

### Task 4: Philippine support contacts

**Files:**
- Create: `src/data/support-contacts.ts`
- Modify: `src/app/support.tsx`
- Test: `src/__tests__/support.test.tsx` (new)

**Interfaces:**
- Produces:
  - `type SupportContact = { name: string; purpose: string; hours: string; calls: { label: string; number: string }[]; texts?: { label: string; number: string }[]; source: string; checked: string }`
  - `export const EMERGENCY_NUMBER = '911'`
  - `export const SUPPORT_CONTACTS: SupportContact[]`

- [ ] **Step 1: Verify the contacts.**
  - Check each candidate against an official source with WebSearch/WebFetch:
    - **911:** a government source, e.g. the DILG or the official 911 site.
    - **NCMH Crisis Hotline:** 1553 and its mobile numbers, from ncmh.gov.ph or the DOH.
    - **Hopeline PH and In Touch Community Services:** their own sites.
  - Write each confirmed number, its hours, the source URL and today's date into `support-contacts.ts`. Leave out anything not confirmed, and record what was left out and why in a comment.
- [ ] **Step 2: Write the failing tests** in `support.test.tsx`:
  - `SUPPORT_CONTACTS.length >= 1`, and every entry has a `source` starting `https://` and a `checked` matching `/^\d{4}-\d{2}-\d{2}$/`.
  - Every `number` matches `/^\+?[0-9 ()-]{3,20}$/`.
  - Rendering `/support` and pressing "See support options" shows each contact's `name`.
  - Pressing the first call button calls `Linking.openURL('tel:' + number.replace(/[^0-9+]/g, ''))`.
  - The emergency block shows `Call 911 or go to the nearest emergency department.`
  - There's no text "Not available yet".
- [ ] **Step 3: Run** `npx jest src/__tests__/support.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Update `support.tsx`.**
  - Replace the placeholder header comment with a pointer to `support-contacts.ts`.
  - Emergency block body: "If you might act on thoughts of harming yourself or someone else, call 911 or go to the nearest emergency department."
  - The options list renders each contact (name, purpose, hours, one button per call or text line), with labels like `Call 1553` / `Text 0917…`.
  - The footer copy stays.
- [ ] **Step 5: Run** `npx jest src/__tests__/support.test.tsx src/__tests__/screens.test.tsx`. Expected: PASS.

### Task 5: Zero Data Retention wording and the consent bump

**Files:**
- Modify:
  - `src/data/ai-disclosure.ts` (`PROVIDER_COPY.retention`, header comment)
  - `src/services/ai/consent.ts` (`CURRENT_TERMS.disclosureVersion`)
  - `supabase/functions/_shared/ai-consent.ts` (`AI_CONSENT_TERMS.disclosureVersion`)
  - `docs/supabase-setup.md` §6a "Provider disclosure"
- Test: `src/__tests__/ai-consent.test.tsx`

**Interfaces:**
- Produces: `disclosureVersion: 'groq-zdr-2026-10-28'` in both places.

- [ ] **Step 1: Write the failing tests.**
  - `CURRENT_TERMS.disclosureVersion` and `AI_CONSENT_TERMS.disclosureVersion` both equal `'groq-zdr-2026-10-28'`.
  - `PROVIDER_COPY.retention` includes `'Zero Data Retention is turned on in Kindway’s Groq account, so Groq doesn’t log inputs or outputs for reliability or abuse checks either.'` and contains no string matching `/hasn’t confirmed/`.
  - **Review Focus 5:** a stored consent record with `disclosureVersion: 'groq-default-retention-2026-10-20'` is treated as outdated, and the Settings → AI processing screen offers to agree again (use the existing outdated-consent test pattern in `ai-consent.test.tsx`).
- [ ] **Step 2: Run** `npx jest src/__tests__/ai-consent.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `retention` becomes:
    1. "Groq says it doesn’t keep what is sent or generated."
    2. The ZDR line from Step 1.
    3. The existing usage-metadata line.
    4. The existing "ordinary inference service" line.
  - Header comment: ZDR turned on by the owner on 2026-10-28, facts from console.groq.com/docs/your-data checked 2026-10-28.
  - Bump both versions. Update the §6a paragraph.
- [ ] **Step 4: Run** `npx jest src/__tests__/ai-consent.test.tsx src/__tests__/ai-server.test.ts`. Expected: PASS. The server/app equality test passes too.
- [ ] **Step 5: Coordinated release.** Done in Task 11, Step 3, after the owner's single push. The steps (needs the owner, in one sitting):
  1. Confirm the owner's A37 runs 1.2.1.
  2. The owner pushes.
  3. Wait until `https://kindway.pages.dev` serves the new bundle (`curl` a JS file and grep `groq-zdr-2026-10-28`).
  4. `npx supabase functions deploy generate-reflection generate-insights generate-follow-up`.
  5. `npx eas-cli@latest update --channel preview --message "Zero Data Retention wording"`.

  Expected: a fresh consent made on the web is accepted by a real reflection request (throwaway account, headless browser).

### Task 6: IndexedDB storage on the web

**Files:**
- Create: `src/storage/web-kv.ts`
- Modify: `src/storage/persistence.ts` (`jsonStorage` picks a backend; `eraseScope` unchanged in behaviour)
- Test: `src/__tests__/web-storage.test.ts` (new)

**Interfaces:**
- Produces:
  - `type KeyValue = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }`
  - `asyncStorageKv: KeyValue`, wrapping AsyncStorage.
  - `indexedDbKv(): KeyValue | null`, from database `kindway` and store `kv`. Returns null when `globalThis.indexedDB` is missing. Any open or transaction error rejects.
  - `moveToIndexedDb(key: string, from: KeyValue, to: KeyValue): Promise<'moved' | 'already' | 'none' | 'failed'>`:
    1. If `to.get(key)` isn't null → `'already'`.
    2. Read `from`. If it's null → `'none'`.
    3. `to.set`, then `to.get`, then compare. If equal, `from.remove` → `'moved'`.
    4. Any throw or a mismatch → `'failed'`, and `from` is untouched.
  - `webBackend(): Promise<KeyValue>` resolves once per app run:
    - Off the web: `asyncStorageKv`.
    - On the web: tries `indexedDbKv()` with a test write. If that fails, `asyncStorageKv`.
    - On the web, calls `navigator.storage?.persist?.()` once, ignoring the result.
  - `jsonStorage(key)` keeps its signature and behaviour. On the web, `load()` first runs `moveToIndexedDb(key, asyncStorageKv, backend)` when the backend is IndexedDB; a `'failed'` keeps reading `asyncStorageKv` for that key this run. It then reads from the backend. `save` and `clear` use the same backend as `load`.

- [ ] **Step 1: Write the failing tests** in `web-storage.test.ts`, using in-memory `KeyValue` fakes:
  - `moveToIndexedDb` copies, verifies and removes the source → `'moved'`, `to` holds the value, and `from` is empty.
  - A second run → `'already'`, and `from` and `to` are unchanged. Review Focus 4: run two `moveToIndexedDb` calls concurrently on the same fakes; the final `to` holds the value, and no call returns a state where both are empty.
  - `to.set` throwing → `'failed'`, and `from` still holds the value (Review Focus 3).
  - Read-back mismatch (a fake `to.get` returns something else) → `'failed'`, and `from` is kept.
  - Nothing in `from` → `'none'`.
  - With `onWeb` mocked true and `indexedDbKv` returning null, `jsonStorage('kindway:state:v1')` saves and loads through AsyncStorage (Review Focus 3).
  - With `onWeb` mocked false, `jsonStorage` never calls `indexedDbKv`.
- [ ] **Step 2: Run** `npx jest src/__tests__/web-storage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces. The IndexedDB adapter is hand-written (`indexedDB.open('kindway', 1)`, `onupgradeneeded` creates `kv`, with promise wrappers on requests). Values are the JSON strings `jsonStorage` already produces.
- [ ] **Step 4: Run** `npx jest`. Expected: all PASS (existing storage users unchanged on native).
- [ ] **Step 5: Browser check** with `npm run build:web` and `npx expo serve --port 3000`, using playwright-core in the scratchpad:
  1. On a profile with an existing `localStorage` journal (made by the Phase 6B scripts, or seeded with `page.evaluate`), load `/today`. The entries are still shown.
  2. `indexedDB` database `kindway` / `kv` holds `kindway:state:v1`, and `localStorage` no longer does.
  3. Reload: same entries.
  4. Open a fresh profile in incognito-like mode (`launchPersistentContext` with IndexedDB blocked through `page.addInitScript(() => { delete window.indexedDB })`). The app works through `localStorage`.

### Task 7: The 6B review's minors

**Files:**
- Modify:
  - `src/app/auth/confirm.tsx`
  - `src/services/auth.ts` (`exchangeCode`)
  - `src/app/(onboarding)/account.tsx`
  - `workbox-config.js`
  - `src/state/web-update.ts`
  - `docs/supabase-setup.md`
- Test: `src/__tests__/web-app.test.tsx`, `src/__tests__/auth-redirect.test.ts`, `src/__tests__/web-shell.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - **Confirm screen:** on the web, with `user` signed in and `exchangeCode` → `pkce_verifier_missing`, it shows "You’re already signed in", not "Email confirmed".
  - **`exchangeCode`:** a Supabase error with code `flow_state_not_found` while on the web returns `reference: 'pkce_verifier_missing'`, with the same message as a missing verifier. Off the web, the reference stays as today.
  - **Account screen:** on the web in `forgot` mode, it shows `On iPhone, the reset link opens in Safari. If Safari says so, ask for the link again there; the new password then works here too.` Off the web it doesn't.
  - **`web-shell.test.ts`:** `config.clientsClaim === true` and `config.skipWaiting` is falsy. Update the existing "waits for the app to restart" test accordingly.
  - **`useUpdateReady`:** pressing Restart now twice registers one `controllerchange` listener, and one reload happens.
- [ ] **Step 2: Run** `npx jest src/__tests__/web-app.test.tsx src/__tests__/auth-redirect.test.ts src/__tests__/web-shell.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Branch order in `confirm.tsx`: `user` before the web verifier branch.
  - `exchangeCode` maps the mismatch on the web.
  - The account hint.
  - `clientsClaim: true`, with a comment explaining why (first install only; versions still wait).
  - `restart()` keeps one module-level `reloading` flag and adds the listener once.
  - Move the text after the closing code fence in `docs/supabase-setup.md` ("``` Before inviting anyone…") onto its own line.
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 8: Security headers on Pages

**Files:**
- Create: `public/_headers`, `public/register-sw.js` (the service worker registration, moved out of `index.html`)
- Modify: `public/index.html` (`<script src="/register-sw.js" defer></script>` instead of the inline script)
- Test: `src/__tests__/web-shell.test.ts`

**Interfaces:**
- Produces: `public/_headers` with `/*` carrying:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://paceaswvraqjwzoyftsr.supabase.co; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
  - `Permissions-Policy: camera=(), geolocation=(), microphone=()`

  Microphone is off until voice ships in Phase 8.

- [ ] **Step 1: Write the failing tests** in `web-shell.test.ts`:
  - `index.html` has no inline `<script>` body, and includes `src="/register-sw.js"`.
  - `register-sw.js` contains `navigator.serviceWorker.register('/sw.js')`.
  - `_headers` contains each header line above, verbatim.
- [ ] **Step 2: Run** `npx jest src/__tests__/web-shell.test.ts`. Expected: FAIL.
- [ ] **Step 3: Create the files**, as in Interfaces.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Browser check.**
  - `npm run build:web` and serve. In playwright, use `page.route('**/*', …)` to add the same CSP header to every local response.
  - Load `/welcome` → `/today`, sign in, and request a reflection with a throwaway account.
  - Expected: no `Refused to` console messages, icons and fonts load, and the reflection arrives.
  - After the owner pushes, `curl -sI https://kindway.pages.dev/` shows the headers.

### Task 9: Security and privacy review, and offline recovery

**Files:**
- Create: `docs/security-review.md`

- [ ] **Step 1: Collect the evidence.**
  - `npx supabase db advisors --linked` (security and performance).
  - `npm audit --omit=dev --json`, summarised by severity.
  - The dist secret scan: `grep -rE "sb_secret_[A-Za-z0-9_-]{10,}|gsk_" dist`.
  - `curl -sI` of the live site (Task 8 headers).
  - Grants: `npx supabase db query --linked` on `information_schema.role_table_grants` for `authenticated` on the AI tables. Expect select and delete only.
- [ ] **Step 2: Run the offline recovery checks** and record the result of each:
  - **24 h offline, different entries on two devices of one account:** existing `cloud.test.ts` / `session.test.tsx` merge cases. If no test covers different entries from two devices, add one in `cloud.test.ts` asserting both edits survive `mergeSnapshots`.
  - **App closed mid-upload:** a test where `upsert` rejects after the first batch, then a retry. Check whether `cloud.test.ts` has it; add it if not. Expected: no duplicates, everything is present after the retry.
  - **Sign-in expired while offline:** sync status `signed-out`, and edits kept (existing `session.test.tsx`, or add one).
  - **Reflection requested offline:** the existing `ai-remote.test.tsx` failure path.
  - **The same entry edited on two devices:** recorded as a known limitation (last sync wins).
- [ ] **Step 3: Write `docs/security-review.md`.**
  - **Scope:** two known users, 2026-10-28.
  - **Sections:** data map (device, Supabase, Groq, Cloudflare), keys and secrets, RLS and grants, Edge Functions (auth, CORS, input limits, logging), email links and PKCE, web app (bundle, service worker, headers, storage), deletion, backups, dependencies, offline recovery, known limitations.
  - **Each finding** gets an id (`SR-1`…), severity (High, Medium, Low), status (Fixed with the task or commit, or Accepted with the reason).
  - **Finish line:** no open High.
  - High findings found here are fixed in this task, each with a test before the fix.

### Task 10: Accessibility pass

**Files:**
- Create: `docs/accessibility.md`
- Modify: only the files whose checks fail (unknown in advance)
- Test: an existing screen test per fix, or `src/__tests__/a11y.test.tsx` (new) for label fixes

- [ ] **Step 1: Android TalkBack** on the emulator (`Medium_Phone_API_36.0`, `-gpu swiftshader_indirect`; preview build 1.2.1 installed).
  - `adb shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/.TalkBackService` if available. Otherwise use `uiautomator dump` and check every clickable node has non-empty `content-desc` or text.
  - **Flows:** onboarding, Today, write and save, reflection, Talk it through, Patterns, Compass, Settings, Support.
  - **Record:** unlabelled controls, wrong reading order, and dialogs that can't be reached.
- [ ] **Step 2: Web.** With playwright, for the same flows at 390×844:
  - `page.accessibility.snapshot()`: every `button`, `link`, `tab` and `textbox` has a name.
  - At 320×640: no horizontal scroll (`document.documentElement.scrollWidth <= 320`).
  - At 200% zoom (`deviceScaleFactor: 1`, viewport 195×422 CSS px): Today, Write and Settings stay usable with no cut-off text. Check with a screenshot.
- [ ] **Step 3: Reduced motion.**
  - Android: `adb shell settings put global animator_duration_scale 0`, plus the in-app reduced-motion behaviour (existing `useReducedMotion` uses).
  - Web: `reducedMotion: 'reduce'` in playwright.
  - Expected on both: every flow completes, and nothing needed is only shown by animation.
- [ ] **Step 4: Small screen on Android:** `adb shell wm size 720x1280` and `wm density 320` (≈360 dp). Today, Write and Settings have no clipped buttons. Restore with `wm size reset` / `wm density reset`.
- [ ] **Step 5: Fix each failure.** Write a test first where testable, e.g. `expect(screen.getByRole('button', { name: '<label>' }))` for a missing label, then fix. Run `npx jest`. Expected: PASS.
- [ ] **Step 6: Write `docs/accessibility.md`.** A checklist table (check, platform, result, fix or note), plus what's left for the owner: iPhone VoiceOver and Safari text size.

### Task 11: Close out

**Files:**
- Modify: `docs/roadmap.md` (Phase 7 checklist with results; move the Phase 6B IndexedDB line to done), `docs/web-app.md` (storage section), `README.md` (known-limits list)

- [ ] **Step 1: Run the full gate:** `npx expo lint`, `npx tsc --noEmit`, `npx jest` (full, alone on the machine), `npm run build:web`, `npx supabase test db`. Expected: all clean.
- [ ] **Step 2: Update the docs** as listed. Then tell the owner the exact `git` commands to push, and which tasks need the push to go live (4, 6, 7, 8 on the web).
- [ ] **Step 3: After the owner's push** (their A37 must be on 1.2.1 first), run Task 5, Step 5's coordinated release: wait for the Pages build, deploy the functions, run `eas update`. Then recheck the live site (headers, the storage move on the Phase 6B profile, the Support screen, a fresh consent and a reflection) and stop Docker (`npx supabase stop`).
