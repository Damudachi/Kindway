# Claude Code Prompt — Reflection Companion UI / UX Foundation

You are working on a mobile app concept currently called **still, here.** (temporary name). It is a compassionate reflection companion: a private journal that helps people process their day, recognize patterns, and stay connected to their chosen long-term values without judgment, pressure, or pretending to be a therapist.

## Read these planning assets first

- `reflection_companion_product_blueprint.md` — product principles, screen inventory, AI behavior, feature roadmap, technical direction, and acceptance checks.
- `reflection_companion_wireframe.html` — interactive low-fidelity navigation wireframe for the proposed 21 screens. It is a reference for screen content and flow, not a requirement to copy the browser/HTML layout literally.

If these files are not in the repository, ask for their location only after inspecting the current project and likely docs folders. Do not silently recreate their content from memory.

## First: inspect, plan, and report

1. Inspect the current repository, package manager, app structure, navigation, existing design tokens/components, Expo/React Native versions, platform targets, tests, and build/lint commands.
2. Inspect available Claude Code skills and use **Impeccable** for the UI design process if it is installed and applicable. Do not install or modify plugins/skills without approval.
3. Preserve useful existing conventions and functionality. Do not overwrite or restructure the repo wholesale just because a starter would be easier.
4. Before implementation, provide a concise plan and the design direction: screen hierarchy, navigation model, tokens (roughly 4–6 core colors plus semantic roles), typography roles, spacing/radius system, reusable primitives, accessibility choices, and an ASCII sketch of the main Home / Journal / AI Reflection flow.
5. Critique the proposed design against the product principles in the blueprint, then proceed with the first bounded milestone unless a real blocker exists. Do not ask questions already answered by the assets.

## Technical direction

- React Native + Expo + TypeScript, unless repository inspection reveals a concrete incompatibility.
- Use a navigation approach appropriate to the existing project (or Expo Router if starting fresh and compatible).
- This milestone is the **UX / presentation foundation only**. Do not wire a real AI provider or Supabase backend yet.
- No AI provider keys, database secrets, or fake “production-ready” claims.
- If a project is empty, establish a modest, maintainable structure rather than an elaborate architecture.

## Product and design requirements

Create a calm, distinctive, writing-first interface that feels like a thoughtful personal notebook. Use charcoal typography, warm neutral surfaces, restrained slate/blue-gray accents, generous writing space, intentional micro-interactions, legible type, and excellent empty states. Avoid generic neon gradients, a clinical dashboard look, excessive cards, motivational clichés, and streak/scoreboard UI.

Do not overdecorate. Product clarity, emotional safety, accessibility, and a coherent hierarchy matter more than visual effects. Support light and dark mode only if it can be done cohesively rather than as a rushed duplicate theme. Respect reduced motion and dynamic text where practical.

All positively recommended concepts in the blueprint must appear in the overall product plan and relevant screen designs, but **do not implement all backend capabilities in one pass**. Do not add features explicitly discouraged by the blueprint (public social feed, competitive/guilt-based streaks, AI diagnosis/personality typing, manipulative dependency patterns, or a broad productivity suite).

## Screens to design

Use the 21-screen inventory in the blueprint as the source of truth:

1. Welcome
2. Support style
3. Personal Compass setup
4. Account creation / sign in
5. Privacy and AI consent
6. First journal entry
7. First AI reflection
8. Today / Home
9. Journal composer
10. Entry detail
11. Journal history
12. Entry-linked AI conversation
13. Tomorrow Bridge
14. Long Game Compass
15. Patterns and weekly review
16. Voice journaling
17. Home-screen widget preview / configuration
18. AI and memory controls
19. Privacy and data
20. Gentle reminders
21. Extra support / high-risk content path

Also cover app-wide states: loading, empty, failed AI request, retry/rate-limited, offline, sign-in errors, expired session, keyboard open, permission denied, empty search, delete confirmation, and accessible focus/touch states. Not every state needs a unique route; use shared patterns/modals where appropriate.

## UX rules that must be visible in the UI

- Free writing is always the primary journaling path. Mood ratings, prompts, gratitude, and reflection questions are optional.
- The user can choose: Just listen, Help me understand, Be honest with me, or Help me move forward. Also include a “Challenge me gently” preference.
- The Long Game Compass is optional, editable, and owned by the user.
- Pattern insights are tentative, show dated evidence, and offer “That fits / Partly / Not really” or dismiss/correct controls. No diagnoses.
- Tomorrow Bridge actions are optional. Missed or changed actions never trigger shame.
- Voice transcripts must be editable before being saved or sent for AI analysis.
- The widget must not expose private journal text by default. Treat native widget work as a platform-specific spike; a React Native component is not a substitute for a real home-screen widget.
- AI and privacy disclosures must distinguish storage from third-party AI processing and match the chosen provider only when one is later selected.
- The safety screen is a placeholder until resources are verified for supported regions. Do not invent emergency numbers.

## Interaction scope for this milestone

Build navigable screen shells and realistic local-only interactions so reviewers can explore the UX:

- move through onboarding and skip optional steps;
- create/edit a sample journal draft without losing text when changing screens where feasible;
- toggle optional chips, choose a support style, and edit sample compass goals;
- inspect an example AI reflection and continue to a mocked entry-linked follow-up chat;
- review a sample timeline and weekly pattern insight;
- configure a sample Tomorrow Bridge step and reminder preference;
- open AI/memory and privacy control screens;
- show honest “demo / not connected” behavior for export, deletion, voice transcription, AI inference, widget delivery, and backend synchronization where those are not implemented.

Seed the UI only with clearly fictional sample data. Never imply mock data is a real account or that a simulated button has performed a backend operation.

## Implementation approach

1. Build the navigation shell and reusable design tokens/components.
2. Implement onboarding screens and first-entry-to-reflection journey first.
3. Implement Home, Journal, History, Compass, Patterns, Tomorrow Bridge, and settings screens using reusable patterns.
4. Represent remaining features (voice, native widget, safety flow) with honest, well-designed screens and clear technical TODOs instead of pretending native/provider work is complete.
5. Add basic component/screen tests where the repository supports them.
6. Run available lint, typecheck, tests, and platform build. Only report commands that were actually executed and results that were observed.
7. If screenshot/device tooling is available, inspect a batched set of the primary screens on a small Android viewport and fix major hierarchy, clipping, keyboard, and accessibility defects in one bounded pass. Avoid endless speculative polish.

## Deliverable and handoff

At completion, report:

- design decisions made and why;
- screens/states implemented and which are still presentation-only;
- files changed;
- commands actually run with results;
- visual verification performed (or unavailable);
- known bugs and follow-up milestones;
- any required manual setup, clearly separated from completed work.

Do not claim the app is production-ready. The goal is a high-quality, navigable UX foundation that is faithful to the product blueprint and ready for the next separately scoped implementation milestone.
