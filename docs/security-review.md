# Security and privacy review

**Date:** 2026-10-29 (Phase 7).

**Scope:** Kindway for its two-person beta in the Philippines:
- the owner on Android (preview build 1.2.1)
- a friend on iPhone through the web app at https://kindway.pages.dev

It covers the app, the hosted Supabase project (`paceaswvraqjwzoyftsr`), the Edge Functions, GroqCloud and Cloudflare Pages. It's sized for two known people, not a public launch; Phase 9 repeats it before anyone else joins.

**Finish line:** no open High finding. **Result: none open.**

## Data map

| Where | What | Protection |
|---|---|---|
| **The phone** (Android app storage; on the web, IndexedDB, falling back to `localStorage`) | The journal, drafts, reminders, the session | The device's own protection. Not encrypted by Kindway (said in Privacy & data) |
| **Supabase** (Postgres, hosted) | With cloud backup on: entries, compass, small step, preferences, feedback, AI outputs, the AI request ledger, consents | RLS on every table; encrypted in transit and at rest by the provider; not end-to-end encrypted |
| **GroqCloud** (US) | One entry, or the entries chosen for a review, only when the user asks, with the matching consent | Zero Data Retention turned on by the owner on 2026-10-28; no Batch or fine-tuning |
| **Cloudflare Pages** | The app's own files | Static hosting; no user data |
| **Expo / EAS** | Builds and over-the-air updates | No user data |

## Findings

| Id | Severity | Finding | Status |
|---|---|---|---|
| SR-1 | Medium | A signed-in user could write their own AI rows, so "Written by AI", provider and model could be faked inside their own account. | **Fixed** (Phase 7, Tasks 1–3). Only the Edge Functions write AI rows, with the server key and the verified user id; users have SELECT and DELETE only (checked on hosted 2026-10-29). pgTAP tests and a hosted smoke test pin it. |
| SR-2 | Medium | The web app had no security headers. | **Fixed** (Task 8; live with the next push). `public/_headers` sets Content-Security-Policy (no inline scripts, no third-party origins except the Supabase project, no framing), Referrer-Policy, nosniff and Permissions-Policy. Checked in Chrome with the policy applied: no violations. |
| SR-3 | Low | Supabase advisor: leaked-password protection (HaveIBeenPwned) is off. | **Accepted.** Supabase offers it on the Pro plan and above only (supabase.com/docs/guides/auth/password-security); the project is on the free plan. Passwords need 8+ characters. Turn it on before Phase 9 if the project moves to Pro. |
| SR-4 | Low | `npm audit --omit=dev`: 3 high, 15 low, all in build tools. The highs are `node-forge` (via `@expo/cli` and `@expo/code-signing-certificates`) and `zod` (via `@expo/cli` and the ESLint plugin). | **Accepted.** None of them is in the app bundle; Kindway doesn't use EAS code signing. Update with the next Expo patch release (`npx expo install --fix`). |
| SR-5 | Low | Web storage: about 5 MB in Safari's `localStorage`, where a full store failed silently. | **Fixed** (Phase 6B: "Couldn’t save on this device" warning; Phase 7 Task 6: move to IndexedDB, copy-then-verify, persistent storage requested). |
| SR-6 | Low | The same entry edited on two devices of one account while offline: the last device to sync wins. | **Accepted.** Each beta user has their own account on one phone. Documented here and in the design. |
| SR-7 | Low | Journal storage on the device isn't encrypted by Kindway. Cloud data isn't end-to-end encrypted; the project's administrators could read it. | **Accepted.** Both are said plainly in Privacy & data. |
| SR-8 | Low | Extra support numbers: 911 was checked on a DILG page. NCMH's mobile numbers come from a search index's copy of ncmh.gov.ph, which blocks automated reads; DOH pages confirm 1553 and 24/7. | **Accepted, with an action:** before the friend starts, the owner calls one of the NCMH mobile numbers from a mobile phone to check it reaches the hotline. Mobile numbers are listed first and 1553 is marked as a landline number. Re-check all of them before Phase 9 (`src/data/support-contacts.ts`). |
| SR-9 | Low | Safety screening (a phrase check plus the model's flag) isn't clinically reviewed. | **Accepted.** Kindway says it's a journal, not a therapy or emergency service. Extra support now lists verified Philippine contacts. |
| SR-10 | Info | Zero Data Retention depends on a console setting nobody else verifies. | **Accepted.** The disclosure says the owner turned it on; if it's ever turned off, the wording and its version change (docs/supabase-setup.md §6a). |

## Checks

- **Keys and secrets.**
  - The web bundle has no secret or Groq key (`grep -rE "sb_secret_[A-Za-z0-9_-]{10,}|gsk_" dist`: nothing).
  - Only `.env.example` is tracked in git; `.env` and `supabase/functions/.env` are ignored and absent from history.
  - The server key exists only as a default Edge Function secret (`_shared/server-key.ts`).
- **RLS and grants:**
  - Every table has RLS; `anon` has no table privileges.
  - On the AI tables, `authenticated` has SELECT and DELETE (`ai_requests`: SELECT).
  - The ledger functions run only as `service_role`.
  - Supabase advisors: one security warning (SR-3), no performance warnings.
- **Edge Functions:**
  - Each verifies the token itself (and the platform checks JWTs first).
  - Bodies are capped at 8 KB and validated.
  - Consent is checked on the server.
  - Per-user cooldowns and daily caps.
  - CORS only for the site and its previews (`ALLOWED_ORIGINS`).
  - Logs carry metadata only, never content.
- **Email links:** PKCE; codes exchanged once; links return only to allow-listed addresses. In Safari, a link from the Home Screen app explains what to do instead of failing.
- **Web app:**
  - The service worker caches only the app's own files, never Supabase or function responses.
  - New versions wait for a restart.
  - No inline scripts.
- **Deletion:** account deletion through the `delete-account` function removes the user and everything they own (rechecked with throwaway accounts on 2026-10-29: sign-in refused, no rows left).
- **Backups:** the hosted project's daily backups are Supabase's default for the plan; Kindway adds none. Each phone keeps its own copy.

## Offline recovery

| Situation | Result | Evidence |
|---|---|---|
| A day offline on two phones of one account, different entries edited | Both edits survive the merge | `cloud.test.ts` |
| The app closed or the connection lost mid-upload | The retry finishes without duplicates | `cloud.test.ts` ("a retry after a partial upload…") |
| Sign-in expired while offline | Sync says to sign in again; the unsent change stays and uploads after | `session.test.tsx` |
| A reflection asked for offline | Shown as a failure; nothing simulated stands in | `ai-remote.test.tsx` |
| Reopening the web app with no signal | Today, the Journal and an entry's own address open; an entry written offline backs up later | Browser checks, Phases 6B and 7 |
| The same entry edited on two phones offline | The last sync wins (SR-6) | Known limitation |

## Before Phase 9

- Turn on leaked-password protection, if the plan allows (SR-3).
- Update Expo tooling (SR-4).
- Re-check every support number, and add the region a new tester is in (SR-8).
- Re-check Groq's Data Controls and the provider page (SR-10).
- Repeat this review.
