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

- **Site URL:** `kindway://`
- **Redirect URLs:**
  - `kindway://**`: development and release builds (the app's scheme from `app.json`).
  - `exp://**`: **development only**, for Expo Go, whose links look like `exp://192.168.1.20:8081/--/reset-password`. Remove it before a public release.

The app asks Supabase to send email links back to:

| Flow | Redirect (from `src/services/auth.ts`) | Route |
| --- | --- | --- |
| Email confirmation | `Linking.createURL('/auth/confirm')` → `kindway://auth/confirm` | `src/app/auth/confirm.tsx` |
| Password reset | `Linking.createURL('/reset-password')` → `kindway://reset-password` | `src/app/reset-password.tsx` |

Auth uses the PKCE flow: links arrive as `…?code=…`, and the app exchanges the code on the same device that requested it. A link opened on another device can't finish signing in there. For a confirmation link the email is still confirmed, so the person can just sign in. For a reset link they request a new one from the device they'll use.

**Email sending:** Supabase's built-in email service is heavily rate-limited (a few emails per hour) and meant for testing. Before real users, set up custom SMTP under **Authentication → Emails → SMTP Settings**.

## 4. Database schema and RLS

The schema is in checked-in migrations under `supabase/migrations/`:

- `20261020055800_cloud_journal.sql`: tables `profiles`, `compass_values`, `entries`, `entry_compass_links`, `tomorrow_actions`, `insight_feedback`; triggers; RLS policies; grants.

Key rules:

- Every table has RLS enabled. Each has separate SELECT/INSERT/UPDATE/DELETE policies for the `authenticated` role, all `auth.uid() = user_id`, and `WITH CHECK` on writes, so nobody can create rows for another account or hand a row to one.
- `anon` (signed-out) has no table privileges at all.
- Rows keep the app's local ids, keyed as `(user_id, id)`. Every foreign key includes `user_id`, so a row can only reference rows of the same account, even with a guessed id.
- Deleting an entry cascades to its compass links. A Tomorrow step that came from it keeps existing and only loses the link (`ON DELETE SET NULL (source_entry_id)`), the same as on the device.
- Deleting the auth user cascades to all of that user's rows.
- A trigger caps the compass at three areas per account. Feedback on fictional `sample:` insights is rejected.
- No `SECURITY DEFINER` functions are used.

Deliberately **not** stored in the cloud: simulated reflections, simulated follow-up replies, saved memory, reminders (device-specific), drafts, and sample-insight feedback.

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

**Client, with two real users** (`src/__tests__/cloud-repo.integration.test.ts`). It creates two throwaway users with the admin API, signs each in with the publishable key, and checks that each can read and change only its own rows, that spoofed ownership and cross-account links fail, and that `delete-account` deletes only the caller. It's skipped unless these are set:

```bash
# Values from `npx supabase status -o env` (API_URL, PUBLISHABLE_KEY, SECRET_KEY).
KINDWAY_TEST_SUPABASE_URL=http://127.0.0.1:54321 \
KINDWAY_TEST_PUBLISHABLE_KEY=... \
KINDWAY_TEST_SECRET_KEY=... \
npx jest src/__tests__/cloud-repo.integration.test.ts
```

Point it only at the local stack or a disposable project. It creates and deletes accounts.

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
