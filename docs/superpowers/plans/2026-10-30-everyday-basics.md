# Phase 7B: Everyday basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the account, privacy and everyday features people expect from any app: show/hide password, change password and email, resend confirmation, app lock, export, About and Contact us, pull to refresh, undo delete, changing an entry's date, and removing demo leftovers.

**Architecture:**
- Each feature extends an existing seam:
  - the shared `Field`
  - the `AuthService` in `src/services/auth.ts`
  - `CloudSync`'s context
  - `DemoStoreProvider`
  - the `Screen` component
- New native modules (local authentication, screen capture, sharing, file system) are loaded lazily behind small services, the way `src/services/reminders.ts` loads `expo-notifications`, so the web build, Expo Go and tests never import them at module load.
- Static policy pages live in `public/`.

**Tech Stack:** Expo SDK 58, Expo Router, React Native 0.88, Supabase JS, Jest + React Native Testing Library (`expo-router/testing-library`).

**Spec:** `docs/superpowers/specs/2026-10-30-everyday-basics-design.md`

## Global Constraints

- Expo SDK 58. Before using any Expo API, read `https://docs.expo.dev/versions/v58.0.0/sdk/<module>/`. Install with `npx expo install <pkg>`, never `npm install`.
- `version` becomes **1.3.0** in `app.json`. `runtimeVersion` stays on the `appVersion` policy.
- Native modules load lazily (`require` inside a function, wrapped in try/catch) and are never imported at the top of a module that the web build or tests load.
- The contact address is `aldrichgavriels@gmail.com`, defined once as `SUPPORT_EMAIL` in `src/services/app-info.ts`.
- Policy URLs are `https://kindway.pages.dev/privacy.html` and `https://kindway.pages.dev/terms.html`.
- Web CSP (`public/_headers`) forbids inline and third-party scripts. The new pages have no `<script>` at all.
- Every email-sending call handles `over_email_send_rate_limit` through the existing `authMessage`.
- Copy follows the app's voice: plain, warm, no exclamation marks, curly apostrophes (’).
- **No commits.** The owner commits and pushes. Each "Leave uncommitted" step means stop at a clean working tree state and move on.
- Before calling any task done, run `npx expo lint` and `npx tsc --noEmit`, plus the task's tests.

## Review Focus

1. **App lock on cold start:** the journal must never render visibly before the lock preference has loaded. A slow AsyncStorage read must still show the lock overlay first. (Test in Task 11.)
2. **Undo window crossing an account switch or sign-out:** the journal remounts, and the pending deletion must neither delete from the other journal nor crash. The entry simply stays. (Test in Task 8.)
3. **Pull to refresh with unsent local changes:** a re-pull must merge, not overwrite. An entry written offline and not yet pushed survives a refresh. (Test in Task 10.)
4. **Changing an entry's date to an earlier day:** the time of day is kept, and the result is never in the future, even when the original time is later than the current time today. (Test in Task 9.)
5. **Change password with the wrong current password:** `updatePassword` must never be called, and the session must stay as it was. (Test in Task 4.)

---

### Task 1: Privacy policy and terms of use pages

**Files:**
- Create: `public/privacy.html`, `public/terms.html`, `public/legal.css`
- Test: `src/__tests__/web-shell.test.ts` (new `describe('policy pages')`)

**Interfaces:**
- Produces: the URLs `/privacy.html` and `/terms.html`, used by Task 6.

- [ ] **Step 1: Write the failing test** in `web-shell.test.ts`

```ts
describe('policy pages', () => {
  const page = (f: string) => readFileSync(join(root, 'public', f), 'utf8');
  it.each(['privacy.html', 'terms.html'])('%s is a complete page with no script and the contact address', (f) => {
    const html = page(f);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<meta name="viewport"');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('aldrichgavriels@gmail.com');
    expect(html).toContain('href="/legal.css"');
    expect(html).toMatch(/Last updated: \d{1,2} \w+ 2026/);
  });
  it('the privacy policy names what is stored, where, and the person’s rights', () => {
    const html = page('privacy.html');
    for (const s of ['Supabase', 'Groq', 'Zero Data Retention', 'Data Privacy Act', 'export', 'delete']) expect(html).toContain(s);
  });
  it('the terms say Kindway is not a therapy or crisis service', () => {
    expect(page('terms.html')).toMatch(/not a (therapy|crisis)/i);
  });
});
```

(Reuse the file's existing `root`, `readFileSync` and `join` imports.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/__tests__/web-shell.test.ts -t "policy pages"`. Expected: FAIL with ENOENT.

- [ ] **Step 3: Write the pages**

Use the outline in the spec §7. The privacy page's facts come only from:
- `src/app/settings/privacy.tsx`
- `src/app/settings/ai-consent.tsx`
- `docs/security-review.md`

Name the operator "Kindway". Say it's a beta, give the "Last updated" date as 30 October 2026, and include a short "Not legal advice; draft for the beta" line in an HTML comment only. Take the `legal.css` colours from the light palette in `src/theme/tokens.ts`, with a `prefers-color-scheme: dark` block using the night palette. Use the system font stack and a readable 40rem column.

- [ ] **Step 4: Run to verify it passes**

Run the same command. Expected: PASS. Then run `npm run build:web` and check that `dist/privacy.html`, `dist/terms.html` and `dist/legal.css` exist.

- [ ] **Step 5: Owner checkpoint.** Show the owner both pages' text (paste or open `dist/privacy.html`) and apply their edits before going on.

- [ ] **Step 6: Leave uncommitted.**

---

### Task 2: Show/hide password in `Field`

**Files:**
- Modify: `src/components/controls.tsx` (`Field`)
- Test: `src/__tests__/screens.test.tsx` (new `describe('password fields')`)

**Interfaces:**
- Produces: any `Field` given `secureTextEntry` renders a toggle button named "Show password" / "Hide password". No new props.

- [ ] **Step 1: Write the failing tests**
  - `'a password field starts hidden and toggles visible'`: render `Field` with `label="Password"` and `secureTextEntry`. Expect `getByLabelText('Password')` to have the prop `secureTextEntry: true`. Press `getByRole('button', { name: 'Show password' })`. Expect `secureTextEntry: false` and a button named 'Hide password'.
  - `'a plain field has no toggle'`: render `Field` with `label="Email address"`. Expect `queryByRole('button', { name: 'Show password' })` to be null.
  - Add the account screen to the existing named-control check in `a11y.test.tsx`, if it isn't already listed.

- [ ] **Step 2: Run to verify they fail.** Run: `npx jest -t "password fields"`. Expected: FAIL (no button).

- [ ] **Step 3: Implement**

`Field` keeps `const [shown, setShown] = useState(false)` when `rest.secureTextEntry` is truthy. It passes `secureTextEntry={rest.secureTextEntry && !shown}` and wraps the input in a row with an `IconButton` (`eye-outline` / `eye-off-outline`, `tint={color.inkMuted}`) absolutely positioned at the right. The input gets `paddingRight` so text never runs under it. The button needs `accessibilityState` reflecting `shown`.

- [ ] **Step 4: Run to verify they pass.** Run: `npx jest -t "password fields"` and `npx jest src/__tests__/a11y.test.tsx`. Expected: PASS.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 3: AuthService additions — resend, change email, email-change callbacks

**Files:**
- Modify: `src/services/auth.ts`
- Test: `src/__tests__/auth-redirect.test.ts`

**Interfaces:**
- Produces (added to `AuthService`):
  - `resendConfirmation(email: string): Promise<AuthResult>`
  - `changeEmail(email: string): Promise<AuthResult>`
  - `AuthCallback` gains `{ kind: 'message'; message: string }`, used for Supabase's "Confirmation link accepted. Please proceed to confirm link sent to the other email" redirect.

- [ ] **Step 1: Observe the real email-change links on the hosted project** (needed before writing the parser test)

  1. Create a throwaway account via SQL, as in memory note `kindway-phase5-hosted-checks.md`.
  2. In a scratch script in the scratchpad, using the service key from the environment (never printed), call `auth.admin.generateLink` twice: `type: 'email_change_current'` and `type: 'email_change_new'`, with `email`, `newEmail` and `options.redirectTo: 'https://kindway.pages.dev/auth/confirm'`. This sends no email, so the rate limit isn't touched.
  3. Fetch each `action_link` in order, with `redirect: 'manual'`, and record the `Location` header's query keys only, never their values. This is the real "first link" and "second link" redirect.
  4. If the PKCE flow can't be reproduced with admin links, fall back to a real `updateUser` from a signed-in scratch client and read `mcp__claude_ai_Supabase__query_logs` (service `auth`). Mind the email rate limit then: it sends 2 emails.
  5. Write the two URL shapes into the test as fixtures, with the code values replaced by `abc12345-…`. Delete the throwaway account.

- [ ] **Step 2: Write the failing tests**
  - `resendConfirmation` calls `client.auth.resend` with `{ type: 'signup', email, options: { emailRedirectTo: redirectTo('auth/confirm') } }` and maps an `over_email_send_rate_limit` error to `'Too many attempts for now. Wait a few minutes and try again.'`.
  - `changeEmail` calls `client.auth.updateUser({ email }, { emailRedirectTo: redirectTo('auth/confirm') })`. An `email_exists` error maps to the existing message.
  - `parseAuthCallback(<first-link fixture>)` returns `{ kind: 'message', message: expect.stringMatching(/other/) }`.
  - `parseAuthCallback(<second-link fixture>)` returns `{ kind: 'code', … }` (or whatever Step 1 observed).
  - Use a fake client in the form `{ auth: { resend: jest.fn(async () => ({ error: null })) } } as never`, as in `device-followup.test.tsx`.

- [ ] **Step 3: Run to verify they fail.** Run: `npx jest src/__tests__/auth-redirect.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** both methods in `supabaseAuth`, wrapped in try/catch → `thrown(e)` like `signIn`. In `parseAuthCallback`, return `{ kind: 'message', message: 'One link done. Now open the link we sent to your other email address.' }` when the URL or params carry a `message` key and no code or error.

- [ ] **Step 5: Run to verify they pass.** Same command. Expected: PASS.

- [ ] **Step 6: Leave uncommitted.**

---

### Task 4: Change password screen

**Files:**
- Create: `src/app/settings/password.tsx`
- Modify: `src/app/settings/index.tsx` (Account section: a `NavRow` "Change password", icon `form-textbox-password`, shown when `user` is set)
- Test: `src/__tests__/account-settings.test.tsx` (new)

**Interfaces:**
- Consumes: `AuthService.signIn`, `AuthService.updatePassword`, `useSession().user`, `useSnackbar()`.

- [ ] **Step 1: Write the failing tests** (render with a `SessionProvider` given a fake `auth` and `watchUser` that emits `{ id: 'u1', email: 'a@example.test' }`; see `session.test.tsx`'s `fakeAuth` for the shape)
  - `'wrong current password is refused and the password is not changed'`: `signIn` resolves `{ ok: false, message: "That email and password don't match. Check them and try again." }`. Fill Current password with `old` and New password with `newpassword1`, then press "Change password". Expect the text "That isn’t your current password." and `updatePassword` not called.
  - `'new password under 8 characters is refused before any request'`: expect "Use at least 8 characters." and `signIn` not called.
  - `'right current password changes it and returns to Settings'`: `signIn` and `updatePassword` both resolve ok. Expect `updatePassword` called with `'newpassword1'`, the snackbar text "Password changed.", and the route back at `/settings`.
  - `'forgot link opens the reset flow'`: press "Forgot your current password?" and expect the route `/account` with `mode=forgot`.

- [ ] **Step 2: Run to verify they fail.** Run: `npx jest src/__tests__/account-settings.test.tsx`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`ChangePassword` follows `reset-password.tsx`'s layout:
- `Screen top={{ back: true, title: 'Change password' }}`
- the save button in the footer, with `loading={busy}`
- two `Field`s with `secureTextEntry`, using `autoComplete="current-password"` and `"new-password"`

Map `invalid_credentials` from the sign-in to "That isn’t your current password." by checking `result.message === authMessage({ code: 'invalid_credentials' } as never)`. Show other failures as returned.

- [ ] **Step 4: Run to verify they pass.** Same command. Expected: PASS. Also run `npx jest src/__tests__/session.test.tsx` to confirm sign-in as the same user doesn't remount the journal.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 5: Resend confirmation and change email

**Files:**
- Modify: `src/app/(onboarding)/account.tsx` (the `sent === 'confirm'` view)
- Create: `src/app/settings/email.tsx`
- Modify: `src/app/settings/index.tsx` (Account: `NavRow` "Change email", icon `email-edit-outline`, detail = current email, shown when `user` is set)
- Modify: `src/app/auth/confirm.tsx` (handle `kind: 'message'`, and a code exchanged while already signed in as the same user)
- Test: `src/__tests__/account-settings.test.tsx`, `src/__tests__/smoke-fixes.test.tsx`

**Interfaces:**
- Consumes: `resendConfirmation`, `changeEmail` and `AuthCallback['kind'] === 'message'` from Task 3.

- [ ] **Step 1: Write the failing tests**
  - Resend (`device-followup.test.tsx` already opens the account screen with a fake auth; reuse its `openAccount`):
    - `'confirmation screen can resend, then waits 60 seconds'`: with `jest.useFakeTimers()`, press "Send the email again". Expect `resendConfirmation` called with the typed email, and the button disabled and labelled "Send again in 60s". Advance 60 s and expect it enabled again.
    - `'resend that hits the email limit says so'`: `resendConfirmation` resolves `{ ok: false, message: 'Too many attempts for now. Wait a few minutes and try again.' }`. Expect that text on screen.
  - Change email:
    - `'change email sends links and explains both addresses'`: type `new@example.test` and press "Send confirmation links". Expect `changeEmail('new@example.test')` and the text "We sent a link to both your current and new address".
    - `'invalid address is refused before any request'`.
  - Confirm screen:
    - `'first email-change link says to open the other one'`: open `/auth/confirm?message=Confirmation+link+accepted...` (the Task 3 fixture) and expect the title "One link done".

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
  - `account.tsx`: keep `resendAt` (a timestamp) and tick a 1-second interval only while counting down. Show the result with a `Notice` (warn on failure) or the snackbar "Sent again.".
  - `email.tsx`: same layout as Task 4. After success, replace the form with the explanation and a "Done" button (`router.back()`).
  - `confirm.tsx`: for `kind: 'message'`, show `StateView` with the title "One link done" and the message as the body, plus a "Continue" button (`router.replace('/')`).

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Hosted check**

With the two throwaway accounts:
1. Change the email through the web build (`npx expo start --web`, or the built `dist` served locally). Its confirmation emails go to unreadable test addresses, so:
2. Open both links, made with `auth.admin.generateLink` as in Task 3 Step 1, in that browser.
3. Confirm the new address signs in and the old one doesn't.
4. Delete both accounts via the `delete-account` flow or SQL afterwards.

Record the result for the roadmap (Task 13).

- [ ] **Step 6: Leave uncommitted.**

---

### Task 6: About and Contact us in Settings

**Files:**
- Create: `src/services/app-info.ts`
- Modify: `src/app/settings/index.tsx` (new last section "About")
- Test: `src/__tests__/app-info.test.ts` (new), `src/__tests__/screens.test.tsx`

**Interfaces:**
- Produces:
  - `SUPPORT_EMAIL = 'aldrichgavriels@gmail.com'`
  - `POLICY_URLS = { privacy: 'https://kindway.pages.dev/privacy.html', terms: 'https://kindway.pages.dev/terms.html' }`
  - `versionLabel(info: { version: string | null; updateId: string | null; web: boolean }): string`
  - `feedbackMailto(info: { version: string; updateId: string | null; platform: string; os: string }): string`
  - `openPolicy(kind: 'privacy' | 'terms'): Promise<void>`
  - `appInfo(): { version: string | null; updateId: string | null; web: boolean; platform: string; os: string }`, which reads `expo-constants` and `expo-updates` lazily and never throws.

- [ ] **Step 1: Write the failing tests**
  - `versionLabel({ version: '1.3.0', updateId: '1a2b3c4d-…', web: false })` returns `'Version 1.3.0 · update 1a2b3c4'` (first 7 hex characters).
  - With `updateId: null` it returns `'Version 1.3.0 · built in'`.
  - With `web: true` it returns `'Version 1.3.0'`.
  - `feedbackMailto(...)` starts with `mailto:aldrichgavriels@gmail.com?subject=Kindway%20feedback&body=`. The decoded body contains `App: 1.3.0` and `Platform: android 14`, and contains no `@` other than in the address.
  - Screens: Settings shows the rows "Privacy policy", "Terms of use" and "Contact us" and a text matching `/^Version /`.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
  - `openPolicy` uses `expo-web-browser`'s `openBrowserAsync` on native and `window.open(url, '_blank', 'noopener')` on the web.
  - "Contact us" calls `Linking.openURL(feedbackMailto(...))`. If that rejects, show a `Dialog` with the address as selectable text.
  - Read the `expo-updates` and `expo-constants` docs for SDK 58 first, for the exact field names of the update id and app version.

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Leave uncommitted.**

---

### Task 7: Export my journal

**Files:**
- Create: `src/services/export.ts`
- Modify: `src/app/settings/privacy.tsx` (the Export section)
- Modify: `app.json` / `package.json` via `npx expo install expo-sharing expo-file-system`. This is the first new native module, so bump `app.json` `version` to `1.3.0` here.
- Test: `src/__tests__/export.test.ts` (new), `src/__tests__/screens.test.tsx`

**Interfaces:**
- Produces:
  - `journalMarkdown(entries: Entry[], compass: CompassValue[], at: Date): string`, which is pure
  - `exportFileName(at: Date): string` → `kindway-journal-YYYY-MM-DD.md` (local date)
  - `shareJournal(markdown: string, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'>`

- [ ] **Step 1: Write the failing tests**
  - Two entries given newest first come out oldest first.
  - Each entry is `## <longDate> · <h:mm AM/PM>`, then `### <title>`, then a line `Feelings: a, b · Compass: Family` (omitted when both are empty), then the body, then `One good thing: …` when set.
  - A `sample: true` entry is left out.
  - Neither the reflection text nor the chat text appears, even when the entry has a reflection.
  - The header is `# Kindway journal`, then `Exported <longDate(at)> · <n> entries`.
  - `exportFileName(new Date(2026, 9, 30))` returns `'kindway-journal-2026-10-30.md'`.
  - Screen: Privacy & data shows the button "Export my journal", which is disabled with an empty journal and enabled with one entry.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

`shareJournal`:
- **Native:** lazy `require('expo-file-system')` (SDK 58 `File`/`Paths` API; read the versioned docs). Write to the cache directory, then `require('expo-sharing').shareAsync(uri, { mimeType: 'text/markdown', dialogTitle: 'Export your journal' })`.
- **Web:** build a `File([md], name, { type: 'text/markdown' })`. If `navigator.canShare?.({ files: [file] })` is true, use `navigator.share({ files: [file] })`, and treat an `AbortError` as `'cancelled'`. Otherwise download through an anchor with an object URL and `download`, then revoke the URL.
- On failure, the screen shows a warn `Notice` saying "Couldn’t export. Your journal is unchanged."

- [ ] **Step 4: Run to verify they pass.** Run `npm run build:web` too. Then check the web export under the CSP with the existing Playwright CSP smoke script (see `docs/web-app.md`). Expected: no CSP violations.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 8: Undo after deleting an entry

**Files:**
- Modify: `src/state/demo-store.tsx` (provider-level pending deletions, `useEntries` filter)
- Modify: `src/app/entry/[id]/index.tsx` (the delete `onConfirm`)
- Test: `src/__tests__/screens.test.tsx` (new `describe('deleting an entry')`)

**Interfaces:**
- Produces:
  - `UNDO_MS = 6000`
  - `useDeleteWithUndo(): (id: string) => () => void`. It hides the entry now, dispatches `deleteEntry` after `UNDO_MS`, and the returned function cancels and unhides.
  - `useEntries()` leaves out hidden ids.
  - `useIsHidden(id: string): boolean`

- [ ] **Step 1: Write the failing tests** (`jest.useFakeTimers()`)
  - `'deleted entry disappears at once and is gone for good after 6 seconds'`:
    1. Delete from the entry page.
    2. On the Journal, the entry is not shown.
    3. Advance 6000 ms: `state.entries` no longer has it (read via a probe component using `useStore`).
  - `'undo brings it back and nothing is deleted'`: press the snackbar's "Undo" within 6 s, advance 10 s, and expect the entry listed and still in `state.entries`.
  - `'a newer snackbar does not cancel the deletion'`: after deleting, trigger another snack, advance 6 s, and expect it deleted.
  - `'the journal remounting during the window keeps the entry'` (Review Focus 2): unmount the `DemoStoreProvider` before 6 s, advance 10 s, and expect no error and no `deleteEntry` dispatched (spy on the reducer, or check the storage snapshot still has the entry).

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
  - Store the hidden ids in a `useState<string[]>` and the timers in a `useRef<Map<string, Timeout>>`, both inside `DemoStoreProvider`, exposed through a second context.
  - Clear all timers on unmount **without** dispatching.
  - The entry page calls `const undo = deleteWithUndo(entry.id)`, then `router.back()`, then `snack({ message: <existing text>, action: { label: 'Undo', onPress: undo } })`.

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Leave uncommitted.**

---

### Task 9: Change an entry's date

**Files:**
- Modify: `src/data/dates.ts` (add `onDay`), `src/data/types.ts` (`Draft.date?: string`)
- Create: `src/components/date-dialog.tsx`
- Modify: `src/app/entry/[id]/index.tsx` (tappable date line), `src/components/composer.tsx` (date line above the text), `src/state/actions.ts` (`useSaveDraft` uses `draft.date`)
- Test: `src/__tests__/dates.test.ts` (new), `src/__tests__/screens.test.tsx`

**Interfaces:**
- Produces:
  - `onDay(iso: string, day: Date, at?: Date): string`. Returns `iso`'s time of day moved onto `day`. If that lands after `at` (default `now()`), it returns `at`'s ISO instead.
  - `<DateDialog visible value={iso} onCancel onSave={(iso) => …} />`, where `value` is the current date.

- [ ] **Step 1: Write the failing tests**
  - `onDay('2026-10-30T21:15:00', new Date(2026, 9, 28))` keeps 21:15 local on 28 October.
  - Review Focus 4: with `at = 2026-10-30T09:00` local, `onDay('2026-10-29T21:00', new Date(2026, 9, 30), at)` returns `at`, which is not in the future.
  - Dialog:
    - "Next day" is disabled on today.
    - Pressing "Previous day" twice shows the day two days before.
    - The "Today" and "Yesterday" chips jump there.
  - Entry page: tap "Change date" (the date line's accessible name is `"<longDate>. Change date"`), choose Yesterday, Save. Expect the date line to read yesterday's `longDate`, and the journal to re-sort.
  - Composer: a new draft shows "Today · Change". Choosing Yesterday and saving stores an entry whose `daysAgo` is 1.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
  - `DateDialog` uses the existing `Dialog` with `children`: a row of `IconButton chevron-left` / day label (`longDate`) / `IconButton chevron-right`, plus a `ChipRow` with the Today and Yesterday chips. It keeps the picked day in local state.
  - `useSaveDraft`: when creating, use `date: draft.date ? onDay(nowIso(), new Date(draft.date)) : nowIso()`. When editing, include `date` in the patch only if `draft.date` is set.
  - Make sure the edit flow on the entry page passes the current date into the draft (`date: entry.date`).

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Leave uncommitted.**

---

### Task 10: Pull down to refresh

**Files:**
- Modify: `src/state/cloud-sync.tsx` (add `refresh`)
- Modify: `src/components/screen.tsx` (`onRefresh` prop → `RefreshControl`)
- Modify: `src/app/(tabs)/journal.tsx`, `src/app/(tabs)/today.tsx`
- Test: `src/__tests__/cloud.test.ts` (or wherever `CloudSync` is tested now; search for `<CloudSync`), `src/__tests__/screens.test.tsx`

**Interfaces:**
- Produces:
  - `SyncInfo.refresh(): Promise<void>`. It pulls the cloud copy again (resets `pulled` and marks AI outputs stale), merges, pushes, and resolves when that pass ends.
  - `Screen` prop `onRefresh?: () => Promise<void>`, ignored on the web.

- [ ] **Step 1: Write the failing tests**
  - `'refresh pulls changes made on another device'`: the fake repo's `pull` returns a new entry on its second call. Call `refresh()` and expect the entry in the store.
  - `'refresh keeps an unsent local entry'` (Review Focus 3): save an entry locally while the fake repo's `push` is pending, then refresh. Expect both the local entry and the remote entries afterwards, with no duplicates.
  - Screens:
    - Journal with a `SyncContext` value that has `refresh` renders a `RefreshControl`, and `onRefresh` calls it.
    - With `useSync()` returning null (local-only), there is no `RefreshControl`.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
  - `refresh` sets `pulled.current = false`, `aiStale.current = !!aiOutputs` and `attempt.current = 0`, then awaits `sync()`.
  - `Screen` keeps a `refreshing` state and passes `<RefreshControl refreshing onRefresh tintColor={color.trail} colors={[color.trail]} progressBackgroundColor={color.raised} />` to the `ScrollView`. The spinner stops when the promise settles or after 10 s, whichever comes first.
  - Journal and Today pass `onRefresh={sync && !onWeb() ? sync.refresh : undefined}`.

- [ ] **Step 4: Run to verify they pass.** Run the whole sync suite, since this touches the merge path: `npx jest src/__tests__/cloud.test.ts src/__tests__/session.test.tsx src/__tests__/ai-continuity.test.tsx`.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 11: App lock (Android app)

**Files:**
- Run: `npx expo install expo-local-authentication expo-screen-capture`
- Modify: `app.json` (plugin `["expo-local-authentication", { "faceIDPermission": "Allow Kindway to use Face ID to unlock your journal." }]`)
- Create: `src/services/app-lock.ts` (lazy native wrapper), `src/state/app-lock.tsx` (provider, overlay, hook)
- Modify: `src/storage/persistence.ts` (`appLockStorage = jsonStorage('kindway:lock:v1')`)
- Modify: `src/app/_layout.tsx` (mount `<AppLock>` inside `ThemeProvider`, around `SessionProvider`, so it covers every journal)
- Modify: `src/app/settings/index.tsx` (a `SwitchRow` "App lock" in "Your journal", not on the web)
- Test: `src/__tests__/app-lock.test.tsx` (new)

**Interfaces:**
- Produces:
  - `LOCK_AFTER_MS = 60_000`
  - `lockSupport(): Promise<'ready' | 'no-screen-lock' | 'unavailable'>`
  - `authenticate(prompt: string): Promise<boolean>`
  - `hideFromRecents(on: boolean): Promise<void>`
  - `useAppLock(): { enabled: boolean; setEnabled(on: boolean): Promise<'ok' | 'no-screen-lock' | 'failed'> }`
  - `<AppLock storage? lockService? appState?>` with test seams.

- [ ] **Step 1: Write the failing tests** (fake `lockService` and `AppState` emitter; a `memoryStorage` with a delayed `load` for the cold-start case)
  - `'cold start shows the lock before the journal, even while the setting loads'` (Review Focus 1): give `load` a never-resolving promise. Expect "Unlock Kindway" on screen and the child text ("Journal content") not on screen.
  - `'with the lock off, the journal shows once the setting loads'`.
  - `'with the lock on, unlocking shows the journal'`: `authenticate` resolves true.
  - `'a failed unlock keeps it locked and offers Unlock again'`.
  - `'back after 1 minute away locks again; after 30 seconds it does not'`: emit `background`, advance the clock, emit `active`.
  - `'turning it on requires a successful unlock first; no screen lock explains why'`: `lockSupport` resolves `'no-screen-lock'`. Expect "Set up a screen lock in your phone’s settings first." and `enabled` still false.
  - `'turning it on hides Kindway from recent apps; off shows it again'`: `hideFromRecents` called with true, then false.
  - `'if the phone loses its screen lock, Kindway turns its lock off and says so'`.
  - Settings on the web has no "App lock" row (mock `onWeb`).

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
  - **Native wrapper** (`src/services/app-lock.ts`): `require` inside each function, inside try/catch. `'unavailable'` on the web or when `require` fails.
    - `lockSupport` uses `getEnrolledLevelAsync() === SecurityLevel.NONE` for `'no-screen-lock'`.
    - `authenticate` calls `authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancel', disableDeviceFallback: false })` and returns `.success`.
    - `hideFromRecents` uses `preventScreenCaptureAsync('app-lock')` / `allowScreenCaptureAsync('app-lock')`.
  - **Provider:**
    - Reads `appLockStorage` and shows the overlay until it knows `enabled`.
    - Starts locked when enabled, and auto-prompts once when the overlay appears.
    - Listens to `AppState`. It records the time on `background`, and on `active` locks when away ≥ `LOCK_AFTER_MS`.
    - On launch with the lock enabled, it calls `hideFromRecents(true)`.
  - **Overlay:** absolutely fills the screen above everything, using `color.paper`, `HeldLight`, a "Kindway is locked" headline and an "Unlock Kindway" `Button`. Fade it with Reanimated unless reduced motion is on.

- [ ] **Step 4: Run to verify they pass.** Then run `npx expo-doctor` and expect no new issues.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 12: Remove demo leftovers

**Files:**
- Modify: `src/app/(tabs)/journal.tsx`, `src/app/settings/privacy.tsx`
- Test: `src/__tests__/screens.test.tsx`

- [ ] **Step 1: Write the failing tests**
  - `'journal shows entries straight away, with no loading placeholder'`: render the Journal with one entry and expect it on the **first** `getByText` (no `findBy`, no wait). Expect `queryByLabelText('Loading entries')` to be null.
  - `'privacy says beta and links to the policy'`: expect "Kindway is in beta." and a button "Read the privacy policy". Expect `queryByText(/pre-release app/)` to be null.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**
  - Delete the Journal's `loading` state, its effect, the skeleton views and styles, and the `hasSample` notice.
  - In Privacy & data, replace the demo `Notice` with a plain `Text` and a tonal button calling `openPolicy('privacy')` (Task 6).
  - Leave the other `tone="demo"` notices; each is still true (spec §12).

- [ ] **Step 4: Run to verify they pass.** Then run the full suite once: `npx jest`. Some existing tests used `findByText(…, wait)` because of the fake load; they should still pass.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 13: Finish — full checks, roadmap, release notes for the owner

**Files:**
- Modify: `docs/roadmap.md`: add a "7B: Everyday basics" row to the phase table and a "Phase 7B checklist" section listing the 12 items, each marked with its test or check, plus the owner's phone checks as open items.

- [ ] **Step 1:** Run `npx expo lint`, `npx tsc --noEmit`, `npx jest` and `npm run build:web`. All must pass. Paste the summary lines into the hand-off.
- [ ] **Step 2:** Re-run the web CSP smoke test against `dist/`. Expect zero violations, with the policy pages loading.
- [ ] **Step 3:** Run a code review of the whole diff (the requesting-code-review skill) and fix the Critical and Important findings.
- [ ] **Step 4:** Update the roadmap as above. Owner phone checks to list as open:
  - **A37 on build 1.3.0:** app lock on and off, the lock after 1 minute away, blank in recent apps, unlock with the PIN fallback, export to Drive, pull to refresh, change the date, undo a delete
  - **iPhone web app:** export, change password, the policy links
- [ ] **Step 5:** Hand off to the owner with:
  - the build command: `npx eas-cli@latest build --profile preview --platform android` (new runtime 1.3.0; the 1.2.1 install won't get this as an update)
  - that the web app goes live on their push
  - the two policy pages to read once more
