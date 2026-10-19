# Kindway

A compassionate reflection companion: a private journal that helps people process their day, notice patterns, and stay connected to their own long-term values. Android first (React Native + Expo SDK 58 + TypeScript, Expo Router).

**Status: functional front-end prototype (Phase 2).** Entries, preferences, reflections, insight feedback and the Tomorrow Bridge step are saved locally on the device and survive restarts. No AI provider, backend, account, sync, notifications, voice transcription or native widget is connected; screens say so where it matters. Not production-ready.

Planning sources: `reflection_companion_product_blueprint.md`, `reflection_companion_wireframe.html`, `PRODUCT.md`.

## Commands

```bash
npm install
npx expo start --android   # Expo Go on an emulator or device
npm run typecheck          # tsc --noEmit
npm run lint               # expo lint
npm test                   # jest (jest-expo)
```

## Structure

- `src/app/` – routes. `(onboarding)/` screens 1–7, `(tabs)/` Today, Journal, Patterns, Compass; stack screens for write, entry detail, follow-up chat, Tomorrow Bridge, sample insights demo (`sample/`), voice, widget, settings, extra support.
- `src/components/` – primitives (Button, Chip, Field, Screen/TopBar, Trail/Blaze, Dialog, Snackbar, Notice) plus Composer, ReflectionView and InsightReviewView.
- `src/services/ai/` – `AiService` interface and its local mock (daily reflection, follow-up replies). Pre-written text only.
- `src/services/insights/` – `InsightsService` interface with two local implementations: factual counts of the user's explicit tags and marks, and a fictional fixture for the sample demo.
- `src/state/` – reducer store, request builders that apply privacy settings (`ai-context.ts`), Tomorrow Bridge transitions. `src/storage/` – the device-storage adapter (AsyncStorage).
- `src/data/` – types, option lists, fictional sample entries (demo only), the placeholder safety check.
- `src/theme/tokens.ts` – color, type, spacing, radius, motion tokens.

## How the simulated parts behave

- **Daily reflection preview:** pre-written text chosen by support style, the feeling tags the user added, and compass values they linked to the entry. The entry text is never interpreted. Labelled "Preview response · simulated".
- **Patterns & Insights:** for the user's entries, only counts of feeling tags, tag pairs, compass links, "one good thing" notes and "Come back to this" marks. A period needs at least **3** analysable entries before a review shows (`MIN_ENTRIES` in `src/services/insights/local-insights.ts`); that is a tunable product assumption, not a validated threshold.
- **Sample insights:** a separate, fictional demo (Patterns → Preview sample insights) with its own sample entries. It never mixes with the user's journal.

## Reviewing states

Settings → **Preview states** simulates reflection failure, rate limits, offline, sign-in errors and an expired session, and opens the extra-support path. Settings → **Reset everything on this device** returns to a clean first launch.

## Not built yet (next milestones)

- Supabase Auth, schema, RLS (tested with separate users), server persistence and sync.
- AI Edge Function and provider adapter behind the existing `AiService` / `InsightsService` interfaces; disclosures updated to the chosen provider.
- Reviewed safety flow with verified regional resources (the Extra support screen is a placeholder; the keyword check in `src/data/safety.ts` is not a classifier).
- Native Android widget spike, notifications (expo-notifications), voice capture and transcription, export.
- Dark scheme, designed as its own scheme rather than an inversion.
- App icon and splash artwork (still the Expo template images).
