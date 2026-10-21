# Phase 4 hosted smoke test

A manual check of the real app against the hosted Supabase project (`paceaswvraqjwzoyftsr`) with real Groq AI. **Not yet run.** Tick each item as you go; note anything that differs from "Expect".

Rules: one disposable account (for example a `+kindway-smoke` alias of an address you control), fictional entries only, never your personal account or diary. Each real reflection or review spends Groq quota, so about 3 reflections and 1 review is plenty.

## 0. Setup

- [ ] `.env` holds the hosted project URL and its `sb_publishable_` key (no secret keys). Start the app with `npx expo start --android` (Expo Go on the emulator or a device). Restart Metro after any `.env` change.
- [ ] The hosted project has no users before you start (Dashboard → Authentication → Users), so anything you see later is from this test.

## 1. Account and session

- [ ] Settings → Account → **Sign in or create an account** → sign up with the disposable address. Expect: the app says to check email; local-only use keeps working meanwhile.
- [ ] Confirm from the email. If the link doesn't open the app (Expo Go uses `exp://` links), the email is still confirmed: sign in by hand. Expect: signed in, the account screen shows the address.
- [ ] Kill and reopen the app. Expect: still signed in.
- [ ] **Sign out**, then sign in again. Expect: entries backed up before sign-out come back from the cloud.

## 2. Journal still works

- [ ] Write 4 fictional entries on different days if the composer allows it (for example "Fictional: long shift, skipped lunch"). Edit one, delete one. Expect: each change saves, and after an app restart (or in the Dashboard table editor, `entries`) the cloud copy matches.
- [ ] Sign out and write an entry. Expect: local-only mode saves it on the device without errors. Sign back in before continuing.

## 3. Consent is two separate choices

- [ ] Settings → **AI processing consent**. Expect: daily reflection and cross-entry insights are separate switches, each naming GroqCloud and the model `openai/gpt-oss-120b`, with the default-retention wording (not "zero retention").
- [ ] Turn on **only** daily reflection. Expect: reflections are offered; the AI review on Patterns says it needs insights consent.

## 4. Daily reflection (real AI)

- [ ] Open an entry → choose a support style → reflect. Expect: a reflection whose tone fits the chosen style, labelled as real AI with provider/model, never as a sample or mock.
- [ ] Ask again with a different style. Expect: the output follows the new style.
- [ ] Turn on airplane mode → request a reflection. Expect: an honest offline notice with **Try again**; no reflection appears by itself. A **Use a simulated preview instead** button may be offered; if you tap it, the result must be clearly labelled simulated.
- [ ] Tap reflect twice quickly. Expect: one result, or a "busy"/"wait" notice; never two charges for one tap.
- [ ] Request again within about 10 seconds of the last one. Expect: a rate-limit notice that says when to retry.

## 5. Revoking consent is enforced by the server

- [ ] Revoke daily reflection consent → request a reflection. Expect: refused with a consent notice and an **AI processing settings** button.
- [ ] To prove it isn't only the UI: with consent revoked, use the hosted Edge Function logs (Dashboard → Edge Functions → generate-reflection → Logs). Expect: the refused call logs `consent_required` with HTTP 403 and no token counts.

## 6. Selected-period review (real AI)

- [ ] Turn on cross-entry insights consent. Patterns → AI review. Expect: before submitting, it shows the period and exactly which entries/dates will be sent, and entries marked "keep out of analysis" are excluded.
- [ ] With fewer than 3 eligible entries, expect "Not enough entries", and no request is sent.
- [ ] Submit with 3 or more. Expect: a review labelled as real AI; each insight lists its source entries; tapping a source opens that exact entry.
- [ ] Revoke insights consent → submit again. Expect: refused server-side (log shows `consent_required`).

## 7. Deletion

- [ ] Delete one source entry of the review. Expect: that review disappears.
- [ ] Settings → **Delete AI outputs**. Expect: reflections and reviews gone; entries untouched.

## 8. Clean up

- [ ] Settings → Account → **Delete my account and cloud data** → confirm. Expect: signed out; the local-only journal stays on the device. Then **Reset everything on this device** to remove the fictional entries locally.
- [ ] Dashboard → Authentication → Users: the disposable account is gone. Table editor: `entries`, `ai_requests`, `ai_reflections`, `ai_insights` have no rows for it (deleting the account cascades).

## Groq console (manual; Claude Code has no dashboard access)

Don't change billing.

- [ ] **Models / Limits:** `openai/gpt-oss-120b` is available to the org; note its RPM, RPD, TPM and TPD. The server's own caps are 30 reflections/day and 5 reviews/day per user, with 10 s and 60 s cooldowns (`supabase/functions/_shared/ai-config.ts`). Check that the org's limits fit the expected number of users at those caps.
- [ ] **Data Controls:** note whether Zero Data Retention is on or off. The live disclosure (`groq-default-retention-2026-10-20`) assumes Groq's default retention. If ZDR is on, the disclosure is still accurate but more cautious than needed; changing the wording needs a new disclosure version.
- [ ] **Batch / fine-tuning / Files:** note whether they're enabled for the org. The code only calls `https://api.groq.com/openai/v1/chat/completions` (`supabase/functions/_shared/ai-provider.ts`); nothing uses Batch, Files or fine-tuning.
- [ ] Compare the consent screen wording with Groq's current data-retention documentation, and update the disclosure (new version) if they differ.
