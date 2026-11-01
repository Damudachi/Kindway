# Phase 7B: everyday basics — design

Status: draft for the owner's approval (2026-10-30).

## Intent

The 1.2.1 update works on Android and the iPhone web app. The owner's concern is that Kindway doesn't yet *behave* like a normal app: features people expect from any app with an account, and from any journal app, are missing. Beta testers will notice what's missing before they notice what's good.

Phase 7B adds those basics before Phase 8 (web reminders and voice). The owner asked for a full audit and agreed to the resulting list (2026-10-30), minus "sign out of all devices".

## Goals

**Sign-in and passwords**
1. **Show/hide password** on every password field: sign in, sign up, new password after a reset link, and change password.
2. **Change password** in Settings while signed in, asking for the current password first.
3. **Resend confirmation email** on the "Check your email" screen after sign-up.

**Account**
4. **Change email address** in Settings while signed in.

**Privacy and security (Android app)**
5. **App lock:** fingerprint, face or the phone's own PIN to open Kindway. While it's on, Kindway is blank in the recent-apps screen.
6. **Export my journal** as a Markdown text file, through the share sheet (Android) or a share/download (web).

**Settings basics**
7. **About:** app version and update, privacy policy, terms of use.
8. **Contact us / report a problem:** opens an email with the app version filled in.

**Everyday behaviour**
9. **Pull down to refresh** on Journal and Today syncs right away (signed in with cloud sync on).
10. **Undo after deleting an entry.**
11. **Change an entry's date**, for writing about an earlier day.
12. **Remove demo leftovers** that real users see.

## Non-goals

- Sign out of all devices (the owner left it out).
- A separate Kindway PIN, passkeys, two-factor sign-in, or Google/Apple sign-in.
- App lock on the iPhone web app. A browser can't use fingerprint or face unlock this way, so the option isn't shown there.
- PDF export, importing a journal, or exporting AI conversations.
- Open-source licence screens, "rate this app", in-app chat support.
- Custom email sending (SMTP). That stays in Phase 9 (see Constraints).

## Anti-goals

Failure even if it technically works:
- Any change that can lose or duplicate an entry, or let one account's journal show in another.
- An app lock that can lock someone out of their own journal with no way back.
- An export or support email that sends journal text anywhere the person didn't choose.
- Hiding Kindway in recent apps while app lock is off. Blocking screenshots is a cost, so it only comes with the lock.

## Constraints

- **Expo SDK 58.** Fetch the versioned docs (`https://docs.expo.dev/versions/v58.0.0/`) before using any Expo API. Install with `npx expo install`.
- **New native modules need a new build.** `expo-local-authentication`, `expo-screen-capture`, `expo-sharing` and possibly `expo-file-system` add native code. `runtimeVersion` is `appVersion`, so this phase bumps `version` to **1.3.0**. A 1.2.1 build must never receive JavaScript that imports these modules. Load them lazily and guard them, as `expo-notifications` already is, so the web build and Expo Go don't crash.
- **Email sending is rate limited.** The hosted project uses Supabase's built-in email, which allows very few emails per hour (`email_sent = 2` in `supabase/config.toml`; check the hosted value). Resend, change email (which sends two emails at once with secure email change on) and password reset all share that limit. Every one of them must handle `over_email_send_rate_limit` with the existing friendly message. The resend button also gets a 60-second cooldown.
- **Secure email change is on** (`double_confirm_changes = true`). The new address takes effect only after the person opens the links sent to *both* addresses. Keep this setting.
- The local journal is scoped by user **id**, not email (`state/session.tsx`), so changing the email doesn't move or split anyone's journal.
- Web: strict Content Security Policy (`public/_headers`), no inline scripts. Any new static page must follow it.
- The owner commits and pushes. Leave all changes uncommitted.

## Approaches (chosen 2026-10-30)

The owner accepted the recommendation in each case.

| Area | Chosen | Considered | Why |
| --- | --- | --- | --- |
| App lock | The phone's own fingerprint/face unlock with the phone's PIN as fallback (`expo-local-authentication`), plus `expo-screen-capture` while it's on | A separate Kindway PIN with optional fingerprint | Nothing new to remember, and no "forgot my PIN" lockout |
| Export | A Markdown file through the share sheet; download or share on the web | Plain-text share with no file (long journals get cut off); PDF (heavier, harder to reuse) | A real file that goes anywhere: Drive, email, Files |
| Change password | Check the current password by signing in with it quietly, then `updateUser({ password })` | Supabase's "secure password change" email code | Works with the current server settings, and adds no email (see the rate limit) |
| Undo delete | Hide the entry for the snackbar's 6 seconds, then really delete it | Delete right away and restore on Undo | No sync or server changes. Deleting also removes the reflection and conversation on the server, so a restore would be fragile |
| Change email | `updateUser({ email }, { emailRedirectTo })` with secure email change kept on | Turning secure change off | Confirming the old address protects the account |

## How each part works

### 1. Show/hide password

- `Field` (`src/components/controls.tsx`) gets an eye button inside the field whenever `secureTextEntry` is passed. The button toggles the text between hidden and visible.
- The button is labelled "Show password" / "Hide password" for screen readers, has a 48dp touch target, and doesn't take focus away from the field.
- Each field starts hidden. On the web, toggling must keep password managers working (the `autoComplete` values stay).
- Applies to `account.tsx`, `reset-password.tsx` and the new change-password screen.

### 2. Change password

- New route `src/app/settings/password.tsx`, reached from Settings → Account ("Change password"), shown only when signed in.
- Fields: "Current password" and "New password" (at least 8 characters). Both have show/hide.
- On save: `auth.signIn(user.email, current)`. If that fails with `invalid_credentials`, the message is "That isn't your current password." If it succeeds, `auth.updatePassword(next)`. `same_password` already has a message.
- On success: go back to Settings, and show a snackbar saying "Password changed."
- A "Forgot your current password?" link opens `/account?mode=forgot`.
- Signing in again here must not restart or disturb sync. It's the same user, but check this in `session.test.tsx`.

### 3. Resend confirmation email

- New `AuthService.resendConfirmation(email)`, using `client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo('auth/confirm') } })`.
- On the "Check your email" screen after sign-up: a "Send the email again" text button. It's disabled for 60 seconds after each send, with the countdown in the label, and gives the result as a snackbar or notice.

### 4. Change email

- New route `src/app/settings/email.tsx`, reached from Settings → Account ("Change email").
- Field: "New email address", checked with the existing pattern.
- Calls a new `AuthService.changeEmail(email)` → `updateUser({ email }, { emailRedirectTo: redirectTo('auth/confirm') })`.
- After sending, the screen explains: "We sent a link to both your current and new address. Open both, then your new email is used to sign in."
- `auth/confirm.tsx` must handle an email-change link. When the first of the two links is opened, Supabase answers with no session and a message to confirm the other link. Both steps need honest wording. **Verify on the hosted project with a throwaway account** before relying on it, because the exact callback form (code or token hash) has to be observed.
- Settings shows the new email once Supabase reports `USER_UPDATED` (the session already listens for this).

### 5. App lock (Android app only)

- **Setting:** in Settings → Your journal, a switch "App lock" with the detail "Use your fingerprint, face or phone PIN to open Kindway". It's hidden on the web.
- **Turning it on:**
  - First checks `hasHardwareAsync` / `getEnrolledLevelAsync`. If the phone has no screen lock, explain: "Set up a screen lock in your phone's settings first."
  - Then asks the person to authenticate once, so it's proven to work before it's saved.
  - Turning it off also asks to authenticate.
- **When it locks:** when the app starts, and when it comes back to the foreground after at least 1 minute away. *(Builder's call; see Decisions.)* Switching to another app for a few seconds, for example to copy a link, doesn't lock.
- **Lock screen:**
  - A full-screen overlay mounted in the root layout above the navigator, in the current theme, showing the Kindway mark and an "Unlock" button. It prompts automatically when shown.
  - While the setting is still loading at launch, the overlay shows. Journal content must never flash before unlock.
  - Deep links (email links, widget, reminders) still go to their screen underneath and show after unlock.
- **Fallback:** the phone's own PIN, pattern or password is always allowed (`disableDeviceFallback: false`), so the person can't be locked out. If the phone later has no screen lock at all, Kindway turns its lock off and says so once. Removing the phone's lock requires unlocking the phone, so this isn't a bypass.
- **Recent apps:** while the lock is on, `preventScreenCaptureAsync` keeps Kindway blank in recent apps. As a side effect, Android also blocks screenshots. The setting's detail says so: "Kindway also stays hidden in recent apps and screenshots."
- **Storage:** the setting is per device and isn't synced. It's stored outside the per-journal scoped storage, because the lock must cover the local-only journal and every account alike, like the appearance setting.
- **Reminders and the widget** don't change. They never show entries.

### 6. Export my journal

- In Privacy & data → Export (replacing "Not available yet"): "Export my journal" button, with a note on what's included. Disabled when the journal is empty.
- **File:** `kindway-journal-YYYY-MM-DD.md`, oldest entry first. Each entry has:
  - date and time
  - title
  - feelings and compass areas
  - the entry text
  - "One good thing" if it has one
- AI reflections and conversations aren't included *(builder's call; see Decisions)*, and neither are sample entries.
- **Android:** write the file to the cache directory, then `Sharing.shareAsync` with `text/markdown`.
- **Web:** `navigator.share({ files })` where the browser supports it (iPhone Safari does), otherwise download it as a file. Check this under the site's CSP.
- The export happens only on the device. Nothing is uploaded.

### 7. About

New "About" section at the bottom of Settings:
- **Version:** e.g. "Version 1.3.0 · update 1a2b3c4". The app version comes from `expo-constants`. The update's short id comes from `expo-updates`, or "built in" if there is none, and nothing on the web.
- **"Privacy policy"** and **"Terms of use":** rows that open `https://kindway.pages.dev/privacy.html` and `/terms.html`, in the in-app browser (`expo-web-browser`) on Android and in a new tab on the web.
- The two pages are static HTML files in `public/`, styled to match, with no scripts. Their content is drafted from what the app actually does (`settings/privacy.tsx`, `docs/security-review.md`) and needs the owner's approval. Phase 9's store listing will reuse these URLs.
- The operator is named "Kindway", with the contact aldrichgavriels@gmail.com. The pages:
  - are dated
  - say they're for a beta
  - cover what's stored where (device, Supabase, Groq with Zero Data Retention), why, for how long, and who can access it
  - cover export, deletion and withdrawing consent
  - cover the Philippine Data Privacy Act rights (access, correction, deletion, objection)
  - give the contact address
  - for the terms: not a therapy or crisis service (pointing to Extra support), an as-is beta, and the person owns their writing
- They're plain-language drafts, not legal advice. Have them reviewed before a public store release.

### 8. Contact us / report a problem

- A Settings row "Contact us" with the detail "Questions, problems or ideas".
- It opens `mailto:aldrichgavriels@gmail.com` (the owner's address for now; keep it in one constant so it's easy to change) with the subject "Kindway feedback". The body has a few blank lines, then the app version, update id, platform and OS version.
- No journal text, email address or user id is added. If no email app is installed, show the address so the person can copy it.

### 9. Pull down to refresh

- `Screen` gets an optional `onRefresh`. Journal and Today pass it only when the journal is cloud-synced.
- Refreshing runs a sync. Check that `sync.retry()` also *pulls* from the cloud when the status is `synced`; if it only pushes, add a `syncNow()`.
- The spinner stops when the sync settles, or after 10 seconds at most. Offline gives the existing offline message.
- Local-only journals have nothing to refresh, so they get no refresh. The web has no pull-to-refresh in react-native-web, so sync there stays automatic, as now.

### 10. Undo after deleting an entry

- After confirming the delete, the entry disappears from every list, the person goes back, and a snackbar says "Entry deleted" with **Undo**, for 6 seconds.
- During those 6 seconds the entry is only hidden. A small pending-deletions holder above the screens filters it out of `useEntries` and anything else that lists entries. After 6 seconds, `deleteEntry` is dispatched as it is today.
- The timer belongs to the deletion, not the snackbar, so a newer snackbar doesn't cancel it.
- If the app is killed during those 6 seconds, the entry stays. Keeping the entry is the safe way to fail.
- Undo puts it back where it was.

### 11. Change an entry's date

- On the entry page, the date line becomes tappable ("Wednesday, 29 October · Change"). In the composer, a small "Today" line above the text does the same, saved in the draft as `date`.
- Both open a dialog with a day stepper: ‹ previous day | the day | next day ›, plus quick chips for "Today" and "Yesterday". There's no new date-picker dependency, and it works on Android and the web.
- Future days can't be chosen. The time of day stays as it was.
- Saving updates `entry.date`, which already syncs as `written_at`. Lists re-sort by date.

### 12. Remove demo leftovers

- **Journal:** remove the simulated half-second loading skeleton. Remove the "Sample entries… only in this demo session" notice too: sample entries are never saved into the journal, so it can't show.
- **Privacy & data:** replace "This is a pre-release app. Nothing here is a production privacy or security guarantee." with "Kindway is in beta." and a link to the privacy policy.
- Keep notices that are true and needed: the fictional sample insights, "accounts aren't set up in this build", the simulated-previews consent, and the developer-only "Preview states".
- Check every other `tone="demo"` notice and list any change in the plan.

## Settings layout after this phase

```
AI                 AI processing · AI & memory
Your journal       Privacy & data · Gentle reminders* · Home-screen widget* · App lock* · Extra support
Appearance         System | Light | Night
Account            Signed in as …  · Change email · Change password · cloud sync status · Sign out · Delete account
Start over         Reset everything on this device
About              Version · Privacy policy · Terms of use · Contact us
(* Android app only)
```

## Testing

- Every behaviour above gets Jest + React Native Testing Library tests alongside the existing suites (`screens.test.tsx`, `session.test.tsx`, `a11y.test.tsx`, new files where it reads better). Native modules are mocked at their boundary.
- The named-control accessibility test covers the new screens and the eye button.
- **Hosted checks** with throwaway accounts made via SQL and deleted afterwards:
  - change password (wrong current password refused, new one works, old one refused)
  - resend confirmation
  - the full two-link email change
  - mind the email rate limit
- `npx expo lint`, `npx tsc --noEmit`, `npx jest` and `npm run build:web` all pass.
- Web: the CSP smoke test still shows zero violations, and the export works there.
- **Owner on the A37 with build 1.3.0:**
  - app lock on/off
  - the lock after 1 minute away
  - blank in recent apps
  - unlock with the PIN fallback
  - export to Drive
  - pull to refresh
  - change the date and undo a delete
- **Friend's iPhone:** export, change password and the policy links in the web app.

## Release

1. Bump `version` to 1.3.0 (new runtime). Build an EAS preview APK for the owner's phone.
2. Publish the web app (Cloudflare Pages auto-deploys on the owner's push), including `privacy.html` and `terms.html`.
3. No database migration or Edge Function change is expected.

## Decisions

Made by the owner:
- All twelve items above are in; sign out of all devices is out (2026-10-30).
- The approaches in the table above (2026-10-30).
- Contact address: aldrichgavriels@gmail.com, for now (2026-10-30).
- The builder drafts the privacy policy and terms of use (2026-10-30).

Builder's call on the owner's answer: the policy names the operator as "Kindway", not a person.

Builder's calls, which the owner can change:
- App lock waits 1 minute away before locking again, with no setting for it.
- Export includes the person's own words and tags, not AI reflections or conversations.
- No "confirm password" field: show/hide replaces it.
- The date change uses a day stepper with Today/Yesterday chips instead of a calendar picker.
- No pull-to-refresh on the web or for local-only journals.
- The change-password and change-email screens live under `settings/`.

## Left to the builder

- Exact copy, within the app's existing voice. Run new copy past the `design:ux-copy` skill.
- Icons for the new rows (MaterialCommunityIcons, as elsewhere).
- Where the pending-deletions holder and the app-lock preference live in the code, following existing patterns (`state/`, `storage/`).
- How the lock overlay animates. Honour reduced motion.
