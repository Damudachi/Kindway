# Kindway

A compassionate reflection companion: a private journal that helps people process their day, notice patterns, and stay connected to their own long-term values. Android first (React Native + Expo SDK 58 + TypeScript, Expo Router).

**Status: pre-release prototype (Phase 3).** The journal works fully on the device without an account. Optional Supabase accounts (email/password) can keep a private cloud copy of entries, compass, the Tomorrow Bridge step, preferences and insight feedback, protected by Row Level Security, and can be deleted from the app. Reflections and follow-up replies are still simulated on the device and never uploaded. No AI provider, notifications, voice transcription or native widget is connected. Not production-ready.

Backend setup, sync behavior and security notes: [`docs/supabase-setup.md`](docs/supabase-setup.md).

Planning sources: `reflection_companion_product_blueprint.md`, `reflection_companion_wireframe.html`, `PRODUCT.md`.

## Commands

```bash
npm install
npx expo start --android   # Expo Go on an emulator or device
npm run typecheck          # tsc --noEmit
npm run lint               # expo lint
npm test                   # jest (jest-expo)
npx supabase start         # local Supabase (Docker) with supabase/migrations applied
npx supabase test db       # pgTAP two-user RLS tests
```

Copy `.env.example` to `.env` for a Supabase project; without it the app runs local-only.

## Structure

- `src/app/` – routes. `(onboarding)/` screens 1–7, `(tabs)/` Today, Journal, Patterns, Compass; stack screens for write, entry detail, follow-up chat, Tomorrow Bridge, sample insights demo (`sample/`), voice, widget, settings, extra support.
- `src/components/` – primitives (Button, Chip, Field, Screen/TopBar, Trail/Blaze, Dialog, Snackbar, Notice) plus Composer, ReflectionView and InsightReviewView.
- `src/services/ai/` – `AiService` interface and its local mock (daily reflection, follow-up replies). Pre-written text only.
- `src/services/insights/` – `InsightsService` interface with two local implementations: factual counts of the user's explicit tags and marks, and a fictional fixture for the sample demo.
- `src/state/` – reducer store, request builders that apply privacy settings (`ai-context.ts`), Tomorrow Bridge transitions, the session (`session.tsx`: local-only / signed in / cloud sync) and the sync engine (`cloud-sync.tsx`). `src/storage/` – the device-storage adapter (AsyncStorage), partitioned per journal.
- `src/services/supabase/`, `src/services/auth.ts`, `src/services/cloud/` – Supabase client and config checks, email/password auth, the cloud repository, row mapping/diff/merge, and the local-to-cloud migration.
- `supabase/` – migrations, pgTAP tests, the `delete-account` Edge Function.
- `src/data/` – types, option lists, fictional sample entries (demo only), the placeholder safety check.
- `src/theme/tokens.ts` – color, type, spacing, radius, motion tokens.

## How the simulated parts behave

- **Daily reflection preview:** pre-written text chosen by support style, the feeling tags the user added, and compass values they linked to the entry. The entry text is never interpreted. Labelled "Preview response · simulated".
- **Patterns & Insights:** for the user's entries, only counts of feeling tags, tag pairs, compass links, "one good thing" notes and "Come back to this" marks. A period needs at least **3** analysable entries before a review shows (`MIN_ENTRIES` in `src/services/insights/local-insights.ts`); that is a tunable product assumption, not a validated threshold.
- **Sample insights:** a separate, fictional demo (Patterns → Preview sample insights) with its own sample entries. It never mixes with the user's journal.

## Reviewing states

Settings → **Preview states** simulates reflection failure, rate limits, offline and an expired session, and opens the extra-support path. Sign-in errors now come from the real auth server. Settings → **Reset everything on this device** returns to a clean first launch.

## Not built yet (next milestones)

- Realtime sync and field-level conflict handling (sync is per record, last writer wins), data export.
- AI Edge Function and provider adapter behind the existing `AiService` / `InsightsService` interfaces; disclosures updated to the chosen provider.
- Reviewed safety flow with verified regional resources (the Extra support screen is a placeholder; the keyword check in `src/data/safety.ts` is not a classifier).
- Native Android widget spike, notifications (expo-notifications), voice capture and transcription, export.
- Dark scheme, designed as its own scheme rather than an inversion.
- App icon and splash artwork (still the Expo template images).
