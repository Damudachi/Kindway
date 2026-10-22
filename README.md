# Kindway

A compassionate reflection companion: a private journal that helps people process their day, notice patterns, and stay connected to their own long-term values. Android first (React Native + Expo SDK 58 + TypeScript, Expo Router).

**Status: pre-release prototype (Phase 5, verified locally only).** The journal works fully on the device without an account. Optional Supabase accounts (email/password) can keep a private cloud copy of entries, compass, the Tomorrow Bridge step, preferences and insight feedback, protected by Row Level Security, and can be deleted from the app. With an account, cloud backup and separately recorded, revocable consent, Kindway can ask real AI (GroqCloud, `openai/gpt-oss-120b`, through Supabase Edge Functions) for a reflection on one entry, or for an on-demand review of the entries a user picks for this week or the last 30 days. Without that, reflections stay clearly labelled simulated previews on the device. Follow-up replies about an entry can also come from real AI, under their own separate consent; otherwise they are simulated and labelled so. Stored AI reflections and the latest review per period are read back from the account, so they appear on the user's other signed-in devices; follow-up conversations stay on the device that had them. The hosted project still runs the Phase 4 reflection and review functions (consent version 1) and their migrations, which passed end-to-end tests there; the Phase 5 changes (the follow-up function `generate-follow-up` and its migration `20261021120000_ai_follow_ups`, the compass-context changes with reflection consent version 2, and the app's cross-device AI continuity and Tomorrow Bridge suggestions) are tested locally only and **not deployed yet**. The app itself has not yet been checked on a device against the hosted project. No notifications, voice transcription or native widget is connected. Not production-ready, not a therapist, and not crisis-ready.

AI details, limits and deployment: [`docs/supabase-setup.md`](docs/supabase-setup.md) sections 6a–6b. Evaluation cases and rubric: [`docs/ai-evaluation.md`](docs/ai-evaluation.md).

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
- `src/services/ai/` – `AiService` interface and its local mock (daily reflection, follow-up replies; pre-written text only), consent, and the client for the real AI functions (`remote.ts`).
- `src/services/insights/` – `InsightsService` interface with two local implementations: factual counts of the user's explicit tags and marks, and a fictional fixture for the sample demo.
- `src/state/` – reducer store, request builders that apply privacy settings (`ai-context.ts`), Tomorrow Bridge transitions, the session (`session.tsx`: local-only / signed in / cloud sync) and the sync engine (`cloud-sync.tsx`). `src/storage/` – the device-storage adapter (AsyncStorage), partitioned per journal.
- `src/services/supabase/`, `src/services/auth.ts`, `src/services/cloud/` – Supabase client and config checks, email/password auth, the cloud repository, row mapping/diff/merge, and the local-to-cloud migration.
- `supabase/` – migrations, pgTAP tests, the `delete-account` Edge Function.
- `src/data/` – types, option lists, fictional sample entries (demo only), the placeholder safety check.
- `src/theme/tokens.ts` – color, type, spacing, radius, motion tokens.

## How the simulated parts behave

These apply when real AI isn't on (no account, no cloud backup, or no consent for that feature).

- **Daily reflection preview:** pre-written text chosen by support style, the feeling tags the user added, and compass values they linked to the entry. The entry text is never interpreted. Labelled "Preview response · simulated".
- **Patterns & Insights:** for the user's entries, only counts of feeling tags, tag pairs, compass links, "one good thing" notes and "Come back to this" marks. A period needs at least **3** analysable entries before a review shows (`MIN_ENTRIES` in `src/services/insights/local-insights.ts`); that is a tunable product assumption, not a validated threshold.
- **Sample insights:** a separate, fictional demo (Patterns → Preview sample insights) with its own sample entries. It never mixes with the user's journal.

## Reviewing states

Settings → **Preview states** simulates reflection failure, rate limits, offline and an expired session, and opens the extra-support path. Sign-in errors now come from the real auth server. Settings → **Reset everything on this device** returns to a clean first launch.

## Not built yet (next milestones)

- Realtime sync and field-level conflict handling (sync is per record, last writer wins), data export.
- A manual check of the app on a device against the hosted project (`docs/phase-4-hosted-smoke-test.md`).
- Follow-up conversations on other devices: they're stored on the account but only shown on the device that had them.
- Verified AI provenance: a user can write their own rows into their AI output tables, so the stored provider/model labels aren't proof that an output came from the model (see `docs/supabase-setup.md`, section 6b).
- Reviewed safety flow with verified regional resources (the Extra support screen is a placeholder; the keyword check in `src/data/safety.ts` is not a classifier).
- Native Android widget spike, notifications (expo-notifications), voice capture and transcription, export.
- Dark scheme, designed as its own scheme rather than an inversion.
- App icon and splash artwork (still the Expo template images).
