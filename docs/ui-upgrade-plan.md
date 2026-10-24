# Kindway UI upgrade: "Trail Blazes, brighter and alive"

A self-contained plan for a fresh session. Run it top to bottom; each step ends with something you can see.

## Context
- **Where the project stands:** Phases 1–5 are done. Phase 6 (stabilise and verify) is the current phase (`docs/roadmap.md`). The AI council and the Talk-through consent pop-up are committed (`613b2e3`). The QA fixes from 2026-10-24 (advisor retry, `council_failed` log, provider status fix, sycophancy eval cases) may still be **uncommitted**, so check `git status` first.
- **The problem:** the owner finds the UI boring:
  - too grey;
  - static;
  - no dark mode, which matters because this is an evening app;
  - too few visual elements: screens read like text documents.
- **Decision:** a **bolder, same identity** upgrade. Keep the "Trail Blazes" idea (every entry is a blaze on your own trail), every screen, all copy and all behaviour. Add colour, a night theme, visual elements and motion.
- **Timing decision:** do the UI upgrade **first**, then **deploy everything** (hosted Edge Functions plus a standalone preview APK with over-the-air updates), then the owner tests the deployed app for about a month (the Phase 6 backlog retest). The Groq upgrade comes after that month.
- **Out of scope:** new features, layout rewrites of flows, copy changes (ask before changing any copy), and AI and server code.

## Ground rules (read before any edit)
1. Run `"C:/Users/ADMIN/.claude/plugins/cache/impeccable/impeccable/4.6.0/skills/impeccable/scripts/impeccable" context` once from `D:\Kindway`. Then read `DESIGN.md` in full, `PRODUCT.md`, `.impeccable/surfaces/app.md`, and the skill's `reference/craft-floor.md`. The mode is **Operate**, with Material 3 structure on Android.
2. Use the impeccable skill's commands for each step, as named below (`colorize`, `bolder`, `animate`, `delight`, `critique`, `audit`, `polish`). Follow each one's reference file.
3. Expo SDK 58 (per `AGENTS.md`): check the versioned docs before touching any Expo API. Add packages only with `npx expo install`. Prefer what's already installed: `react-native-reanimated` 4.7.1, `react-native-svg` 15.16.0, `@expo/vector-icons`. Add no new dependencies unless a step says so.
4. Machine limits (memory notes):
   - Don't run the emulator, Docker and the full Jest suite at the same time; C: fills up from pagefile growth.
   - Check `(Get-PSDrive C).Free` before heavy runs.
   - Prefer `uiautomator` text dumps over screenshots, and keep screenshots small.
5. Every step ends with `npx tsc --noEmit`, `npx expo lint`, and the Jest suites for the touched screens. Run the full suite only at the end, on an idle machine.

## Step 1: Theme foundation and night mode (the biggest structural change)
**Why first:** colours are currently static. `src/theme/tokens.ts` exports `color`, and 44 files bake it into module-level `StyleSheet.create`, so a theme switch can't reach them.
- Turn `color` into two **semantic palettes**, `light` and `night`, with the same role names (paper, raised, sunk, ink, inkMuted, pencil, trail, trailContainer, sand, outline, lichen, danger, scrim, plus the new roles from step 2).
- **Night palette direction:** "trail at dusk".
  - Deep blue-graphite ground (around `#14181D`), raised surfaces (around `#1B2027`), warm off-white ink (around `#ECE8E1`).
  - The slate trail lightens to a moonlit blue (around `#9DB4C4`). Lichen and the warm accent stay readable.
  - Every pair must meet WCAG AA in both themes.
- Add `src/theme/theme.tsx`: a `ThemeProvider` plus `useTheme()` returning `{ scheme, color }`. It follows `useColorScheme()` unless overridden.
  - Store the override (System / Light / Night) in device settings, using the existing device-settings storage pattern in `src/state/session.tsx` / `src/storage`.
  - Set `app.json` `userInterfaceStyle` to `"automatic"`.
- Migrate components with a **`makeStyles((c) => StyleSheet.create({...}))` + `useStyles()`** helper, memoised per scheme. Go shared components first (`src/components/*`: button, chip, notice, screen, feedback, text, controls, composer), then screens under `src/app/**`.
  - Status bar, navigation bar and `TopBar` follow the scheme.
- Settings: add an "Appearance: System / Light / Night" row (`src/app/settings/…`, following the existing settings screens).
- **Checks:**
  - Every screen in both schemes on the emulator.
  - A Jest test that `useTheme` switches palettes and the override persists.
  - Existing tests stay green.

## Step 2: Colour (`/impeccable colorize`)
- **Warm accent "lantern"** (amber, around `#C98A3B` light / `#E0A75E` night). Use it sparingly: tonight's open blaze, the Write button's icon, the "Talk this through" action, and saved/done moments.
- **Feeling colours:** give each feeling tag (`src/data/sample.ts` feelings list) a muted hue from a fixed, accessible palette in both themes. Use them in:
  - feeling chips (selected state);
  - the small blaze beside each journal entry, coloured by its first feeling;
  - the Patterns week ribbon.

  Colour never carries meaning alone; the label always stays.
- **Compass areas:** each area gets a hue from the same family, used on the Compass screen and the "From your compass" card.
- Lichen stays the colour for "next step" (Tomorrow Bridge).
- Surfaces:
  - Navigation bar and the active tab pill take the trail tint.
  - The primary button stays ink in light and turns lantern-on-graphite at night.
  - Notices get a 3dp left rule in their role colour instead of a flat grey box.
- Update `DESIGN.md` frontmatter colours and the Named Rules as you go. Colour stays rare: the world is still paper and trail.

## Step 3: Visual elements (`/impeccable bolder`, then `delight`)
- **Home "Your trail":** draw it as an **SVG trail** (`react-native-svg`). A gently winding line with painted blazes for recent entries, coloured by feeling. Tonight shows a dashed open blaze, and tomorrow's step a lichen blaze. Tapping a blaze opens the entry. Keep the existing TalkBack labels and list semantics underneath, and lay it out to work with large text.
- **Section headers:** a small icon plus overline pairing (MaterialCommunityIcons) on Home, Journal, Patterns, Compass and Reflection, for visual anchors instead of text-only headings.
- **Empty states** (no entries, no patterns yet, empty Compass, an empty Talk conversation): a small line-drawn SVG scene in the trail style (a trailhead post, a folded map, a compass rose), plus the existing copy.
- **Journal list:** a feeling-coloured blaze rail on the left. Date groups get a short sand rule and a weekday chip.
- **Patterns:** the week strip becomes a ribbon of feeling-coloured blazes per day, and observation cards get the role colour rule.
- **Compass:** areas shown as a compass rose (SVG). Each area is a labelled spoke in its hue, with the existing list kept for TalkBack and editing.
- **Reflection screen:** the AI "pencil" sections get a subtle hand-drawn underline motif, and "From your compass" its area hue.
- Keep DESIGN.md's rules: no shadowed cards, one sand hairline for dividers, blazes in exactly two sizes. Anything that breaks a rule has to be written down in DESIGN.md as a deliberate change.

## Step 4: Motion (`/impeccable animate`)
All with Reanimated 4. Everything is instant under reduced motion (`useReducedMotion`, as already used in `src/components/composer.tsx`). Durations come from `motion` in tokens.
- **Signature:** saving an entry paints the open blaze (fill grows bottom to top in 240ms) and the SVG trail extends to it.
- The Home trail draws in once per day on first open (stroke-dashoffset, about 600ms).
- Lists (Journal, Patterns): a short staggered fade-up on first render only, not on every re-render.
- Tab switches use Material fade-through; flow screens use shared-axis forward and back (`expo-router` stack animation options).
- Press feedback: a 0.97 scale on chips and buttons, with the ripple kept.
- Reflection arrival: sections fade in one after another, like writing appearing.
- Tomorrow step marked done: the lichen blaze fills, with a light haptic (only if `expo-haptics` is already installed; otherwise skip it and note it).
- Theme switch: a 200ms cross-fade.

## Step 5: Review, accessibility, documentation
- `/impeccable critique` on Home, Journal, Entry/Reflection, Talk, Patterns, Compass and Settings, in **both themes**. Fix the material findings.
- `/impeccable audit` using the native reference:
  - contrast AA in both themes;
  - 48dp targets;
  - large text (font scale 1.3 and 2.0), TalkBack labels on the new SVGs;
  - reduced motion, small screen, keyboard open.
- `/impeccable polish`.
- Update `DESIGN.md` (new colour roles, night palette, elements, motion grammar). Update the `.impeccable/surfaces/app.md` direction contract to drop "dark scheme deferred". Refresh `.impeccable/review/` screenshots in both themes.
- Also fix the small issue QA found: the disabled "Allow and send" in the consent dialog looks the same as "Cancel". Give disabled text buttons a clearly muted colour (`src/components/button.tsx`).

## Step 6: Deploy everything the owner will test (before the month starts)
The owner tests the **deployed** app: hosted Supabase, plus a standalone Android app installed on the A34. No laptop, no Metro and no local stack. Each command marked **(approval)** needs the owner's go-ahead in that session, because it changes hosted services or uses quota.

1. **Commit** everything: the 2026-10-24 QA fixes, if still uncommitted, and the UI steps.
2. **Server (hosted project `paceaswvraqjwzoyftsr`)**
   - **Migrations:** none are new since `20261021120000_ai_follow_ups.sql`, which was applied in Phase 5. Confirm with `npx supabase migration list --linked`.
   - **Secrets:** confirm `GROQ_API_KEY` is set (`npx supabase secrets list --linked`; names only, never print values).
   - **(approval)** Deploy the council and prompt changes:
     ```
     npx supabase functions deploy generate-reflection --linked
     npx supabase functions deploy generate-insights --linked
     npx supabase functions deploy generate-follow-up --linked
     ```
   - **Smoke test** with the signed-in test account on the phone: an AI reflection, a review and a follow-up each succeed.
   - In the function logs, check that `council_notes` is 3 and `council_failed` is 0.
3. **Auth for a standalone app**
   - **(approval)** In the Supabase dashboard, add `kindway://**` to the redirect allow-list. The standalone app uses the `kindway` scheme, not `exp://`.
   - Keep the landing page (`web/auth-link`) as Site URL, so a confirmation email opens the app directly.
4. **EAS setup** (first time):
   - Log in: `npx eas-cli@latest login` (the owner).
   - **(approval)** Run `npx eas-cli@latest init`. It writes `extra.eas.projectId` to `app.json`.
   - **Add `expo-updates`** with `npx expo install expo-updates`. This is a deliberate new dependency: it lets JS fixes reach the phone during the month with `eas update`, without reinstalling.
   - Create `eas.json` with two profiles:
     - `preview`: `android.buildType: "apk"`, `distribution: "internal"`, `channel: "preview"`. This is the app the owner lives with.
     - `development`: `developmentClient: true`, for debugging later.
   - **Hosted env values:** set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_AUTH_LINK_URL` as EAS environment variables for `preview`. The publishable key is public by design. Don't rely on the local `.env`.
5. **(approval)** Build: `npx eas-cli@latest build --profile preview --platform android`. Install the APK on the A34 from the build link.
6. **Phone smoke test** before the month starts:
   - Sign up or sign in through the email link; it opens the app.
   - Turn on cloud backup.
   - Write an entry, get an AI reflection, and use Talk (the consent pop-up, then a real reply).
   - Get a review, and use night mode.
7. **During the month**
   - JS-only fixes ship with **(approval)** `npx eas-cli@latest update --channel preview`.
   - Native changes need a new preview build.
   - Server changes need the functions redeployed.

## Step 7: The owner's month of testing (Phase 6 backlog)
- The owner tests against the **Phase 6 backlog** in `docs/roadmap.md`. Update it first:
  - Replace "EAS development build" with "preview build installed".
  - Add: night mode on every screen.
  - Add: fast typing straight after opening the app keeps every character. One unconfirmed "F"-only entry was seen on a struggling emulator on 2026-10-24.
  - Add: the council and real AI replies on the deployed functions.
- Expect "paused for a little while" when two or more AI requests land in the same minute. Groq's 8,000 tokens/min limit is known, and a council request uses about 3–3.6k tokens.
- After the month, upgrade the Groq plan and move on to Phase 7.

## Verification (each step)
- `npx tsc --noEmit`, `npx expo lint`, and the Jest suites for the touched screens. The full `npx jest` runs once at the end (about 12 min, idle machine).
- Emulator (`/d/Android/Sdk/emulator/emulator -avd Medium_Phone_API_36.0 -gpu swiftshader_indirect`, Metro with `--lan`, `adb reverse tcp:8081 tcp:8081`): visit each changed screen in light and night, read it with `uiautomator dump`, and take a few small screenshots per step.
- Commit after each step with the attribution line, so any step can be reverted alone.

## Critical files
- `src/theme/tokens.ts` → palettes. New: `src/theme/theme.tsx` (provider, `useTheme`, `makeStyles`).
- `src/components/*` (button, chip, notice, screen/TopBar, feedback, text, controls, composer). New: `src/components/trail.tsx` (SVG trail), `src/components/illustrations.tsx`.
- Screens: `src/app/(tabs)/*`, `src/app/entry/[id]/*`, `src/app/settings/*`, `src/app/write.tsx`.
- `app.json` (`userInterfaceStyle`, `extra.eas.projectId`, `updates`), new `eas.json`, `DESIGN.md`, `.impeccable/surfaces/app.md`, `docs/roadmap.md`.
- Deploy: `supabase/functions/generate-{reflection,insights,follow-up}`. No new migrations.
