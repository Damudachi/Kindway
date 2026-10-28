# Supabase setup

Kindway works fully without Supabase: the journal stays on the device in local-only mode. Supabase adds optional accounts, a private cloud copy of the journal, and account deletion. This page covers setting it up, testing it, and what it does and doesn't protect.

Never put real keys, tokens or passwords in this file, in Git, or in any `EXPO_PUBLIC_*` variable other than the two below.

## 1. Project and keys

1. In the [Supabase Dashboard](https://supabase.com/dashboard), create a project (or pick the existing **Kindway** project). Choose the region closest to your users. Kindway's project is in `ap-southeast-1` (Singapore).
2. Open **Project Settings → API Keys** and copy:
   - the **Project URL** (`https://<project-ref>.supabase.co`)
   - the **publishable key** (`sb_publishable_…`)
3. Do **not** copy the secret key (`sb_secret_…`) or the legacy `service_role` key into the app. They bypass Row Level Security. The app refuses to start its Supabase client if it's given one.

## 2. Local `.env`

```bash
cp .env.example .env
```

Fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`.env` is ignored by Git. Restart `npx expo start` after changing it: Expo inlines these values at bundle time. If either value is missing or malformed, the app runs in local-only mode and the account screen says accounts aren't available.

The publishable key is safe to ship only because every table enforces Row Level Security (section 4).

## 3. Auth settings (Dashboard)

**Authentication → Sign In / Providers → Email**

- Email provider: **enabled**, password sign-in on.
- **Confirm email: on** (the default). The app handles this: after sign-up it says to check email, and local-only use continues meanwhile.
- Minimum password length: **8** (the app also checks this).

**Authentication → URL Configuration**

- **Site URL:** the email-link landing page, `https://damudachi.github.io/kindway-links/`. The app always asks for an explicit redirect, so the Site URL is only used when Supabase rejects that redirect (and by any email template that uses `{{ .SiteURL }}`). A `kindway://` fallback leaves Expo Go and computers on a blank page; the landing page instead says the email is confirmed and to sign in in the app. Never set it to an Expo Go (`exp://`) address.
- **Redirect URLs** (exact entries for release, globs only for development):
  - The email-link landing page with `/**`, e.g. `https://damudachi.github.io/kindway-links/**` (see "Email-link landing page" below). Once `EXPO_PUBLIC_AUTH_LINK_URL` is set, this is the only entry the app's links need; the others stay as a fallback.
  - `kindway:///auth/confirm` and `kindway:///reset-password`: development and release builds.
  - `exp://**` and `exps://**`: **development only**, for Expo Go on a LAN (`exp://`) or through `npx expo start --tunnel` (`exps://`). Remove both before a public release.
    These globs don't reliably match: on the local stack (2026-10-23) `exp://127.0.0.1:8081/--/auth/confirm` was accepted but `exp://192.168.1.99:8081/--/auth/confirm`, a phone's LAN address, was rejected and replaced with the Site URL. With `EXPO_PUBLIC_AUTH_LINK_URL` set, the Expo Go address travels inside the landing page's `?to=`, so only the page's `https://…/**` entry has to match (it does, query included).

**Authentication → Emails → Templates:** the repository has no custom templates (`supabase/config.toml` leaves them commented out), so the hosted project should use Supabase's defaults, whose link is `{{ .ConfirmationURL }}`. Its `redirect_to` is the app's requested redirect when that's allow-listed, otherwise the Site URL. If someone edited the hosted *Confirm signup* or *Reset password* template, check that it still uses `{{ .ConfirmationURL }}` (or `{{ .RedirectTo }}`), not a hand-written `{{ .SiteURL }}` link, which would ignore the app's redirect every time.

The app chooses the redirect in `redirectTo()` (`src/services/auth.ts`), by where it runs. A development server's address only ever appears in Expo Go links, which only Expo Go can open:

| Flow | Expo Go (development) | Development or release build | Route |
| --- | --- | --- | --- |
| Email confirmation | `exp://<lan-ip>:8081/--/auth/confirm` (`exps://<tunnel-host>/--/auth/confirm` with `--tunnel`) | `kindway:///auth/confirm` | `src/app/auth/confirm.tsx` |
| Password reset | `exp://<lan-ip>:8081/--/reset-password` (`exps://…` with `--tunnel`) | `kindway:///reset-password` | `src/app/reset-password.tsx` |

The web app sends links back to its own site, `https://<site>/auth/confirm` and `https://<site>/reset-password`, and never uses the landing page below. Allow-list `https://<site>/**` and `https://*.<site>/**` (see `docs/web-app.md`, which also explains what iPhone users see when Mail opens a link in Safari).

In development, the redirect the app sent is printed in the Metro log (`[auth] confirmation links return to …`) and shown on the "Check your email" screen. Only that address is logged, never a token, code or session.

Auth uses the PKCE flow: links arrive as `…?code=…`, and the app exchanges the code on the same device that requested it. A link opened on another device can't finish signing in there. For a confirmation link the email is still confirmed, so the person can just sign in. For a reset link they request a new one from the device they'll use. An expired or already-used link comes back with `error_code` (for example `otp_expired`) in the URL fragment and the query; both routes read the full URL and say what went wrong instead of showing an empty screen.

**Email-link landing page.** A browser that can't open the app (Expo Go with a `kindway://` link, or any link opened on a computer) shows a blank page, though the email is confirmed. `web/auth-link/` is a small static page that fixes that: with `EXPO_PUBLIC_AUTH_LINK_URL` set in `.env`, `redirectTo()` sends links to `<page>?to=<app address>`. Supabase keeps `to` and adds `code=` (or `error_code` for an expired or used link). The page then:

- on a phone, shows "Email confirmed" and an **Open Kindway** button that hands the code to the `to` address (and tries once by itself);
- on a computer, says the email is confirmed and to sign in on the phone (the PKCE code only works in the app that asked for it);
- for an expired or used link, says so and to sign in or ask for a new link.

It forwards the code only to `kindway://`, `exp://` or `exps://` addresses ending in `/auth/confirm` or `/reset-password`, removes it from the address bar, and loads nothing external. To host it, put `index.html` and `link.js` in a **public** repository (the app's repository is private) and turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). Then allow-list `<page URL>**` in Supabase and set `EXPO_PUBLIC_AUTH_LINK_URL=<page URL>` in `.env`. The local stack allow-lists `http://127.0.0.1:8090/**` for testing it with `python -m http.server 8090` in `web/auth-link`.

**If a confirmation email links to the wrong place (blank page after tapping it):**

- Expo Go on SDK 58 reports `Constants.executionEnvironment` as `"bare"`, like a build (seen on an emulator, 2026-10-23), so code that checks for `storeClient` sends `kindway:///…` from Expo Go, which Expo Go can't open: a blank page. `redirectTo()` uses `isRunningInExpoGo()` and builds the `exp://` address from the dev server instead; keep it that way.
- An email whose `redirect_to` is the Site URL means Supabase rejected the address the app asked for. The grey line on the app's "Check your email" screen shows that address: if it doesn't start with the landing page, restart Metro with `npx expo start -c` so it reads `EXPO_PUBLIC_AUTH_LINK_URL` from `.env`; if it does, check the page's `/**` entry under Redirect URLs.
- Compare the email's `redirect_to` with the address on the app's "Check your email" screen (or the Metro log) from the same sign-up. If they match, the email is fresh and Supabase accepted it. If the app showed `exp://…` or `exps://…` but the email says `kindway:///auth/confirm`, Supabase rejected the Expo Go address and used the Site URL: add the matching `exp://**` / `exps://**` entry. If the screen shows `kindway:///…`, the app isn't running in Expo Go.
- A `kindway://` link can't open Expo Go, which only answers to `exp://` and `exps://`. The browser then has nowhere to go and shows a blank page. Use a development build (`npx expo run:android` or `eas build --profile development`) to test `kindway://` links.
- An Expo Go link points at the computer running Metro, so it only works while `npx expo start` is running (same network, or the same tunnel), and only on the phone that signed up (the PKCE code verifier is stored there). If the address changes, request a new email.
- Emails already sent keep the redirect they were sent with. After changing any setting, sign up again with a new address to test.
- Opening the link again after it worked shows "You're already signed in"; it doesn't sign anyone else in.

**Email sending:** Supabase's built-in email service is heavily rate-limited (a few emails per hour) and meant for testing. Before real users, set up custom SMTP under **Authentication → Emails → SMTP Settings**.

## 4. Database schema and RLS

The schema is in checked-in migrations under `supabase/migrations/`:

- `20261020055800_cloud_journal.sql`: tables `profiles`, `compass_values`, `entries`, `entry_compass_links`, `tomorrow_actions`, `insight_feedback`; triggers; RLS policies; grants.
- `20261020140000_ai_consent.sql`: table `ai_consents`, its guard trigger, the functions `grant_ai_consent`, `revoke_ai_consent` and `ai_consent_active`; RLS policies; grants. See section 6a.
- `20261020170000_ai_outputs.sql`: tables `ai_requests` (request ledger), `ai_reflections`, `ai_insights`, `ai_insight_sources`; the functions `ai_begin_request`, `ai_finish_request`, `delete_ai_outputs`; a trigger that deletes AI reviews when a source entry is deleted; RLS policies; grants. See section 6b.

Key rules:

- Every table has RLS enabled. Each has separate SELECT/INSERT/UPDATE/DELETE policies for the `authenticated` role, all `auth.uid() = user_id`, and `WITH CHECK` on writes, so nobody can create rows for another account or hand a row to one.
- `anon` (signed-out) has no table privileges at all.
- Rows keep the app's local ids, keyed as `(user_id, id)`. Every foreign key includes `user_id`, so a row can only reference rows of the same account, even with a guessed id.
- Deleting an entry cascades to its compass links. A Tomorrow step that came from it keeps existing and only loses the link (`ON DELETE SET NULL (source_entry_id)`), the same as on the device.
- Deleting the auth user cascades to all of that user's rows.
- A trigger caps the compass at three areas per account. Feedback on fictional `sample:` insights is rejected.
- Three narrow `SECURITY DEFINER` functions exist, all with `search_path = ''` and all limited to the caller's own rows (or, for the trigger, the deleted entry's own account): `ai_begin_request` and `ai_finish_request` (so users can't edit the request ledger directly and reset their limits), and `delete_ai_insights_for_entry` (so the cascade also works during account deletion). Everything else runs as the caller.

Deliberately **not** stored in the cloud: simulated reflections, simulated follow-up replies, saved memory, reminders (device-specific), drafts, and sample-insight feedback. Real AI reflections and reviews **are** stored (section 6b); the entry text sent, the prompts and raw model output are not.

### Apply locally (recommended first)

Requires Docker Desktop running.

```bash
npx supabase start          # local stack; applies supabase/migrations
npx supabase test db        # pgTAP: two-user RLS and constraint tests
npx supabase db reset       # re-apply migrations from scratch (local only)
npx supabase stop
```

### Apply to the remote project

> ⚠️ Applying migrations to the hosted project changes the real database. Review `supabase db diff` / the SQL first and don't run destructive SQL against a project with real users.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push        # applies migrations not yet on the remote
```

Check **Database → Advisors** (security and performance) afterwards.

## 5. Account deletion (Edge Function)

`supabase/functions/delete-account/index.ts` deletes the calling user's account. It works out who that is only from the verified access token, never from the request body, then deletes the auth user, and the database cascades to all their rows.

- `verify_jwt = true` in `supabase/config.toml`, and the function verifies the token with Auth again.
- It uses the admin key from Supabase's **default** Edge Function secrets (`SUPABASE_SECRET_KEYS`, falling back to the legacy `SUPABASE_SERVICE_ROLE_KEY`). Nothing needs to be added by hand, and no admin key exists in the app.

Deploy:

```bash
npx supabase functions deploy delete-account
```

In the app: Settings → Account → **Delete my account and cloud data** asks for confirmation. If the function isn't deployed or can't be reached, the app says nothing was deleted. After a successful deletion it clears that account's session and its cache on the device. The local-only journal stays.

Test deletion with a disposable account, never the project owner's or a real user's.

## 6. Running the two-user tests

**Database (pgTAP)**, against the local stack:

```bash
npx supabase test db
```

**Client, with two real users** (`src/__tests__/cloud-repo.integration.test.ts`, and `src/__tests__/ai-consent.integration.test.ts` for consent). It creates two throwaway users with the admin API, signs each in with the publishable key, and checks that each can read and change only its own rows, that spoofed ownership and cross-account links fail, and that `delete-account` deletes only the caller. It's skipped unless these are set:

```bash
# Values from `npx supabase status -o env` (API_URL, PUBLISHABLE_KEY, SECRET_KEY).
KINDWAY_TEST_SUPABASE_URL=http://127.0.0.1:54321 \
KINDWAY_TEST_PUBLISHABLE_KEY=... \
KINDWAY_TEST_SECRET_KEY=... \
npx jest src/__tests__/cloud-repo.integration.test.ts
```

Point it only at the local stack or a disposable project. It creates and deletes accounts.

## 6a. AI processing consent (Phase 4A)

Consent is recorded on the account and checked by the AI Edge Functions (section 6b) on every request. The "reflection previews" switch is separate and only controls the simulated on-device previews.

**Scopes.** Three independent choices, granted and withdrawn separately in Settings → AI → **AI processing** (`src/app/settings/ai-consent.tsx`). Each can also be allowed where it's used: in onboarding's "What Kindway's AI can do" step, on Patterns for reviews, and in Talk for follow-ups (`src/components/ai-consent-dialog.tsx`):

- `entry_reflection`: a reflection on one entry the user asks about.
- `cross_entry_analysis`: an on-demand review across entries in a period the user picks.
- `follow_up`: AI replies in the follow-up conversation about one entry (Phase 5C). Separate from `entry_reflection`.

Consent needs an account; local-only users can't grant it, so nothing can be sent for them.

**What's recorded** (`public.ai_consents`, one row per grant): user, scope, consent wording version, disclosure version, provider, model named in the disclosure, `accepted_at` (set by the server), `revoked_at`.

- At most one active grant per user and scope (partial unique index).
- A trigger makes rows append-only: `accepted_at` is always the server's time, rows can't be inserted already withdrawn, the agreed terms can't be edited, and the only allowed update is withdrawal, which can't be undone. Granting again (for example after a version change) withdraws the old row and adds a new one (`grant_ai_consent`, one transaction).
- RLS: each user can read, create and withdraw only their own rows. There's no delete policy, so the history is kept while the account exists. Deleting the account cascades to it. `anon` has no access.
- The functions are `SECURITY INVOKER`, so RLS applies to them too.

**Server-side enforcement.** `public.ai_consent_active(scope, consent_version, disclosure_version, provider)` is true only if the caller (from their JWT) has an active grant matching the terms the server requires. `supabase/functions/_shared/ai-consent.ts` wraps it as `hasActiveConsent(client, scope)` and holds the required terms (`AI_CONSENT_TERMS`). Every AI Edge Function must call it with a client carrying the caller's own token, for every request. It fails closed on any error. A withdrawal or a version bump therefore blocks requests on the server, not only in the app.

**Versions.** The app's copy lives in `src/data/ai-disclosure.ts` and its terms in `src/services/ai/consent.ts` (`CURRENT_TERMS`). A Jest test checks that they equal the server's `AI_CONSENT_TERMS`. Any change to the wording, the provider, or the retention posture means bumping the matching version in both places, which asks everyone to agree again.

Version history: `entry_reflection` went to **2** in Phase 5D1, when its disclosure started naming exactly what compass context is sent (linked values marked "AI may use this": name and note, first 400 characters). A version-1 grant is "outdated" and refused until the user agrees again. **Deploy the server and the app together:** an app expecting version 2 against a server still requiring version 1 (or the reverse) makes every reflection request fail closed with `consent_required`.

**Provider disclosure.** It describes GroqCloud's *default* retention posture, as stated in Groq's docs on 2026-10-20: no retention of inference content by default; logging of inputs and outputs for up to 30 days for reliability or abuse investigations; usage metadata without content; retained data stored in the US. Zero Data Retention has **not** been verified in Kindway's Groq console. If you enable it there, first verify it in Groq's **Data Controls**, then rewrite the retention lines in `src/data/ai-disclosure.ts` and bump `disclosureVersion` in both files. Don't edit the wording without bumping the version.

**Withdrawing** blocks new requests on the server immediately. It doesn't delete outputs already written; the AI processing screen has a separate **Delete AI outputs** action (section 6b).

## 6b. Real AI reflections, reviews and follow-ups (Phase 4B/4C, 5C)

Three authenticated Edge Functions, all run with the **caller's** JWT (never the service-role key), so RLS decides what they can read and write:

| Function | Request body | Needs consent | Reads |
|---|---|---|---|
| `generate-reflection` | `entry_id`, `style`, `idempotency_key` | `entry_reflection` (consent version 2 since Phase 5D1) | That one entry; the profile's challenge settings; for compass values linked to that entry with `ai_may_reference` ("AI may use this"), the name and the first 400 characters of the note, only when "What reflections can see" isn't "this entry only". Never other entries or unlinked values. Reviews get linked value names only (no notes) when "Count my compass links" is on; follow-ups get no compass data. |
| `generate-insights` | `period` (`week`/`month`), `entry_ids` (shown to the user first), `idempotency_key` | `cross_entry_analysis` | Exactly those entries, re-checked: all must exist, be in the period and not be kept out of analysis, or it refuses (`selection_changed`). Compass links only if "Count my compass links" is on. |
| `generate-follow-up` | `entry_id`, `message` (≤ 1500 chars), `style`, `idempotency_key`, optional `context_ids` (stored exchanges, ≤ 6) and `reflection_id` | `follow_up` | That one entry; the AI reflection named (must belong to that entry); the named earlier exchanges of that entry's conversation (any that are missing, another user's, or another entry's refuse with `context_not_found`), of which only the last `AI_FOLLOW_UP_MAX_TURNS` are sent; the profile's challenge settings. Never other entries, reviews or compass values. |

No request carries entry text or a user id; the server reads both itself (a follow-up carries only the user's new message). Code: `supabase/functions/_shared/` (`reflection.ts`, `insights.ts`, `follow-up.ts`, `ai-http.ts` pipeline, `ai-store.ts` data access, `ai-provider.ts` adapter, `ai-config.ts` settings, `safety.ts`), entry points in `generate-reflection/`, `generate-insights/` and `generate-follow-up/`.

**Order of checks** (each refusal happens before any provider call): method → valid token (Auth `getUser`) → JSON content type and size (8 KB) → body shape (unknown keys rejected) → configuration → consent → entry exists for this user (another user's id looks like a missing one: `entry_not_found`) → length/count caps → safety screen → request ledger (duplicate, one at a time, cooldown, daily cap) → provider.

**Provider.** GroqCloud, model `openai/gpt-oss-120b`, ordinary chat-completions endpoint only (no tools, web search, Batch, Files or fine-tuning), strict JSON-schema output, `reasoning_effort: low`, reasoning excluded from the reply. Model availability was checked in Groq's docs on 2026-10-20 (listed as production). The app only knows the `AiService`/review contracts; another provider means a new adapter in `ai-provider.ts` plus a new disclosure version.

**Council (against sycophancy).** Before each reflection, review or follow-up reply, `council.ts` sends the same request three times in parallel as different "advisors" (Feelings first, Fair witness, Grounded friend). Each writes short notes (≤ 700 chars, 500 output tokens), and the answer is then written by the same model with those notes and a self-check against taking the user's side or flattering them. If an advisor fails, its notes are dropped; if all fail, the answer is written alone. If any advisor flags a safety concern, the request goes to the support route. The provider, model and data sent are unchanged, so consent versions were not bumped, but Groq now receives each request's content **four times** under the same retention terms. Logs record `council_notes` (a count). Cost: about 4× the input tokens and one extra round trip. Introduced with prompt versions `reflection-p4`, `insights-p2`, `follow-up-p2`; current versions are `reflection-p6`, `insights-p3` and `follow-up-p4` (2026-10-28: advisors stay in scope, and a review's input leaves out empty optional fields).

**Settings** (Edge Function secrets; invalid values make AI fail closed with `not_configured`):

| Variable | Default | Range |
|---|---|---|
| `GROQ_API_KEY` | (required) | |
| `AI_PROVIDER` | `groq` | only `groq` |
| `AI_MODEL` | `openai/gpt-oss-120b` | must equal the model in the consent disclosure; otherwise refused (`model_not_disclosed`) |
| `AI_TIMEOUT_MS` | 20000 | 2000–60000 |
| `AI_REFLECTION_MAX_TOKENS` / `AI_INSIGHTS_MAX_TOKENS` | 1200 / 2500 | 300–4000 / 500–6000 |
| `AI_MAX_ENTRY_CHARS` | 8000 | 500–20000 |
| `AI_INSIGHTS_MAX_ENTRIES` / `AI_INSIGHTS_MAX_CHARS` | 20 / 12000 | 3–60 / 1000–40000 |
| `AI_REFLECTION_COOLDOWN_SECONDS` / `AI_REFLECTION_DAILY_LIMIT` | 10 / 30 | per user |
| `AI_INSIGHTS_COOLDOWN_SECONDS` / `AI_INSIGHTS_DAILY_LIMIT` | 60 / 5 | per user |
| `AI_FOLLOW_UP_MAX_TOKENS` | 700 | 200–2000 |
| `AI_FOLLOW_UP_MAX_CHARS` / `AI_FOLLOW_UP_MAX_TURNS` | 1500 / 3 | 100–2000 / 0–6 |
| `AI_FOLLOW_UP_COOLDOWN_SECONDS` / `AI_FOLLOW_UP_DAILY_LIMIT` | 5 / 60 | per user |

The app mirrors the review caps in `src/components/ai-review-panel.tsx` (`AI_REVIEW_LIMITS`) only to explain them before sending; change both together. The three-entry minimum for reviews is a product heuristic, not a validated threshold. Groq's own limits are per organization and apply on top (Developer-plan table for this model on 2026-10-20: 30 requests/min, 1,000/day, 8,000 tokens/min, 200,000 tokens/day; check **console.groq.com/settings/limits** for your account). A provider 429 is reported to the user as "paused for a little while". With the council, one request uses about 4× the tokens, so a long entry or a full review can reach the 8,000 tokens/min limit by itself.

**Limits and duplicates** (`ai_requests`, no content): `ai_begin_request` serializes each user's requests with an advisory lock, returns the earlier result for a repeated idempotency key, allows one request in progress per user (stale ones are released after two minutes), and applies the cooldown and the rolling 24-hour cap per kind. Failed requests count too. Users can read their ledger but not change it.

**Validation.** Replies are parsed against the schema and Kindway's rules; one retry if a reply is malformed, then `invalid_response`. "Just listen" can't carry reframing or advice; a compass connection survives only for a value that was actually sent. Review points must cite entries by neutral labels (`E1`…); labels that weren't sent are dropped and counted (`dropped_refs` in the log), points left without a source are dropped, and nothing left means "not enough evidence". Labels are also removed from the prose.

**Safety.** Layered, and **not** clinically reviewed: the app's existing phrase check before a request, a broader server phrase screen before the provider (no call is made if it matches), and the model's `safety_concern` flag. Any of them routes to Extra support instead of showing model text, and nothing is stored. Extra support still has no verified regional resources, so Kindway is not crisis-ready.

**What's stored.** `ai_reflections`: entry id, style, validated output, provider, model, prompt and schema versions, the entry's `updated_at` at the time, request id. `ai_insights`: period, accepted window, entry count, validated output, provider, model, versions; `ai_insight_sources`: every entry that was sent. `ai_follow_ups`: one row per completed exchange (entry id, style, the user's message, validated reply, provider, model, versions, request id); later turns read their context from here rather than trusting the app's copy. Not stored: the request to the provider, the system prompt, the entry text sent, raw model output. Reflections and reviews can't be edited after they're written.

**Known limitation: stored provider and model are not proof of provenance.** The insert policies only require a row to belong to the caller and to one of the caller's own pending requests, and `ai_begin_request` / `ai_finish_request` are callable by any signed-in user. So a user can open a request themselves, insert any `output`, `provider` and `model` into their own `ai_reflections`, `ai_insights` or `ai_follow_ups`, and finish it, without the Edge Function or the provider being involved (it uses up their own rate limit). RLS keeps this inside their own account: it can't create, read or change another user's rows. But the "Written by AI" label and the stored provider/model metadata are only what was written to the row, not a verified record that the output came from the provider, and must not be relied on for anything outside the user's own view of their journal.

**Deletion.** Deleting an entry deletes its AI reflections (FK cascade) and every AI review that used it (trigger). **Delete AI outputs** (`delete_ai_outputs()`) deletes all of the caller's reflections, reviews and follow-up conversations (both sides); entries stay. Deleting an entry also deletes its follow-up conversation; **Clear this conversation** deletes that entry's exchanges from the account. Removing one AI reflection in the app also deletes it from the account. Deleting the account deletes everything, including the ledger. AI reflections are also cached in the device's journal storage. Since Phase 5A every signed-in device with cloud backup reads the account's newest reflection per entry with each pull (`aiOutputs.reflections` in `src/state/cloud-sync.tsx`), so a reflection deleted on one device disappears from the others on their next pull; the Patterns screen reads the newest stored review per period from the account (Phase 5B).

**Logs.** One JSON line per request with `fn`, `outcome`, `http_status`, `ms`, and when known `request_id`, token counts, `attempts`, `dropped_refs`, `config_problem`. Never request bodies, entry text, prompts, model output, headers or keys. Provider error messages are discarded unread.

**When the app offers real AI.** Only with an account, cloud backup on this device, and the matching consent active. Before a request it waits until the account holds the entry's exact current text (`ensureSynced` in `src/state/cloud-sync.tsx`), because the server reads it from there. Real-AI failures are shown as failures with their own copy; a simulated preview is offered only as a clearly labelled, separate choice. Follow-up replies are real only with `follow_up` consent; without it they stay simulated, and every reply bubble says which it is. Follow-up conversations are kept in the device's journal storage and are not synced to other devices.

### Run locally

```bash
# supabase/functions/.env (gitignored) holds GROQ_API_KEY=... for local runs only.
npx supabase start
npx supabase functions serve --env-file supabase/functions/.env
```

`src/__tests__/ai-functions.integration.test.ts` runs against it with two throwaway users and fictional entries (same `KINDWAY_TEST_*` variables as section 6). Tests that call Groq for real also need `KINDWAY_TEST_LIVE_AI=1`; without it, only the checks that refuse before any provider call run. `src/__tests__/ai-server.test.ts` tests the function logic with a fake provider and spends no tokens.

### Deploy (needs the owner's go-ahead)

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push                                   # 20261020140000_ai_consent, 20261020170000_ai_outputs, 20261021120000_ai_follow_ups
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy generate-reflection generate-insights generate-follow-up
```

**Calls from the web app (CORS).** Browsers ask permission (`OPTIONS`) before calling a function from a website. All four functions answer through `_shared/cors.ts`, for the sites listed in the `ALLOWED_ORIGINS` secret: comma-separated exact origins, or one wildcard label for preview addresses.

```bash
npx supabase secrets set "ALLOWED_ORIGINS=https://<site>.pages.dev,https://*.<site>.pages.dev,http://localhost:8081,http://localhost:3000"
```

Sites not on the list get a 403 to their preflight. Requests without an `Origin` (the Android app) are unaffected. The platform's JWT check lets preflights through, so `verify_jwt` stays on (checked 2026-10-28).

Then verify, with a disposable account and fictional entries, that a reflection and a review work in a build pointed at the project, and check **Database → Advisors**.

### Hosted smoke test

`src/__tests__/hosted.smoke.test.ts` checks what's actually deployed, with no secret key. It covers:
- two-account isolation
- a second device reading the journal
- forged tokens and missing or outdated consent
- a real reflection, follow-up and review
- review removal when a source entry is deleted
- "Delete AI outputs"
- that each stored reply's `prompt_version` matches this repository's code

It needs two existing throwaway accounts (never real users), and it clears their journals first. Create them confirmed with SQL on `auth.users` and `auth.identities`, because signing up sends an email. Delete them afterwards with the `delete-account` function, which also checks account deletion. Each run makes three live AI requests, spaced out for Groq's per-minute limit.

```bash
KINDWAY_HOSTED_SMOKE=1 KINDWAY_HOSTED_URL=<project URL> KINDWAY_HOSTED_PUBLISHABLE_KEY=<publishable key> \
KINDWAY_HOSTED_A_EMAIL=... KINDWAY_HOSTED_A_PASSWORD=... KINDWAY_HOSTED_B_EMAIL=... KINDWAY_HOSTED_B_PASSWORD=... \
npx jest src/__tests__/hosted.smoke.test.ts
``` Before inviting anyone, verify Groq's limits and Data Controls (ZDR, Batch, fine-tuning) in the console and keep the disclosure accurate (section 6a).

## 7. How sync works

Three explicit states, shown in Settings → Account:

- **Local-only:** no account. Entries are only on this device.
- **Signed in, sync off:** an account exists, but the journal shown is still the local-only one and isn't backed up. Signing in never uploads anything by itself.
- **Cloud sync on:** the device shows that account's own journal, stored under its own key on the device, and keeps it in step with the cloud.

Turning sync on (the **Cloud backup** screen, `src/app/sync.tsx`):

1. Reads what the account already has and shows counts for this device, the account, and what will be added.
2. Nothing is uploaded until the person taps **Upload … and sync**.
3. Merging never overwrites or deletes either side. An entry whose id already exists in the account with different text is added as a copy. A merged compass over three areas blocks the upload with an explanation. The account keeps its own preferences and small step.
4. Writes are idempotent upserts by id, so a retry after a partial failure can't duplicate anything. After uploading, the app reads the account back and checks every record before calling it done.
5. The local-only journal is kept. Afterwards the person chooses to keep it on the device or remove it.

While sync is on, screens keep writing to the local store as before. `src/state/cloud-sync.tsx` compares the journal with the last state known to be in the cloud, sends only the changes, and retries with backoff. It also pulls on launch and whenever the app returns to the foreground. Per record, a change made on this device since the last sync wins. Otherwise the cloud version applies, including deletions made on another device. There's no realtime subscription, and simultaneous edits to the same record on two devices are last-writer-wins.

Signing out hides the account's on-device cache, including changes not yet backed up, until the same account signs in again. Another account signing in on the same device never sees it.

## 8. What is and isn't encrypted

- **On the device:** the journal and the auth session are stored in AsyncStorage. **Kindway doesn't encrypt them**; protection is whatever Android's app sandbox and device encryption provide. Anyone who can unlock and inspect the device could read them.
- **In transit:** HTTPS to Supabase.
- **In the cloud:** stored in Supabase Postgres, which is encrypted at rest by the provider. **Not end-to-end encrypted:** project administrators can technically read the data. RLS stops other *users*, not the project's operators.

## 9. Troubleshooting

- **Account screen says accounts aren't set up:** `.env` is missing, has a typo, or Metro wasn't restarted. Values must be the HTTPS project URL and an `sb_publishable_` key.
- **"Confirm your email first":** open the link from the email, or turn confirmation off for local testing only.
- **Email link opens a browser error / doesn't open the app:** the redirect URL isn't in the allow-list (section 3), or the link was opened on another device.
- **"Too many attempts":** auth rate limits. With the built-in email service this happens fast; set up SMTP.
- **Sync says changes aren't backed up yet:** offline or the server was unreachable. Changes are kept on the device and retried. Settings → Account → **Try again now**.
- **"Your session ended":** sign in again. Pending changes stay on the device.
- **RLS errors (42501) in logs:** a request had no session or tried to write another account's `user_id`. Never fix this by disabling RLS or loosening a policy to `true`.
- **Delete account says it isn't set up:** deploy the `delete-account` function (section 5).
