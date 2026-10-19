# Reflection Companion — Product Blueprint & Wireframe Spec

**Status:** UX planning artifact v0.1  
**Working title:** still, here. (temporary; validate naming before launch)  
**Product promise:** A compassionate reflection companion that helps people process their day, notice patterns, and stay connected to their longer-term values—without judgment, pressure, or pretending to be a therapist.

## 1. Product principles

1. **Free writing first.** Templates are optional prompts, not forms users must complete.
2. **Validate feelings without automatically endorsing conclusions.** Compassion and honest challenge can coexist.
3. **The user remains the authority on their own life.** Values and goals are user-defined and editable.
4. **Build for life outside the app.** Reflection can lead to action, rest, a conversation, or choosing to leave something unresolved.
5. **Privacy is part of the experience.** The app must explain when journal text is stored, sent to AI, retained, or deleted.
6. **AI is a reflection aid, not a therapist.** No diagnosis, medical claims, emotional manipulation, or claims that the app is a user's only support.
7. **No guilt mechanics.** No streak loss, shame notifications, or scoring how well someone lived.
8. **Helpful even when AI is unavailable.** Users can save entries, and the interface should preserve drafts and clearly support retry/fallback.

## 2. Core journeys

### First-run onboarding

Welcome → choose default support style → choose optional Long Game Compass values → create/sign in to account → review data/AI processing and consent → write first free-form entry → view first AI reflection → arrive at Home. Request notification permission only after the user has experienced value; it can also be skipped.

### Normal evening reflection

Widget/notification or app Home → write freely → optionally tag a feeling, choose a prompt, add gratitude, or use voice → choose whether to receive AI reflection → AI acknowledges, explores a balanced perspective, optionally uses relevant prior context/Compass, and offers a next step or a choice to stop → save response / correct AI / follow up / close app.

### Weekly reflection

Patterns screen → view a small number of proposed recurring themes with examples and dates → accept, partly accept, reject, or hide each insight → open source entries → adjust AI context and insight preferences.

### Tomorrow Bridge

After a reflection, optionally save one small next step → next day, ask whether it helped → allow completion, modification, postponement, or dismissal without guilt.

### Privacy control

Settings → review AI and memory controls → choose context scope → inspect/delete saved memory → export entries → delete selected entry or account → clearly explain retention and deletion behavior.

### High-risk content

Use a reviewed, conservative safety flow that encourages appropriate human support and vetted, region-appropriate resources. The AI must not imply it can monitor the user or provide emergency response. Do not release crisis contact details until verified.

## 3. Screen inventory

The interactive wireframe file (`reflection_companion_wireframe.html`) contains these screens:

### Onboarding

1. **Welcome** — product promise, one primary CTA, no premature feature overload.
2. **Support style** — Just listen; Help me understand; Be honest with me; Help me move forward. Adjustable later and per entry.
3. **Personal Compass setup** — choose up to three value areas; custom goal is optional; allow skip.
4. **Account creation/sign-in** — use Supabase Auth; explain account value; no unnecessary profile questions.
5. **Privacy and AI consent** — distinguish database storage from external AI processing; consent before first AI request; offer journal-only mode if implemented.
6. **First journal entry** — free writing plus optional prompts; no required mood rating or minimum length.
7. **First AI reflection** — show the product's empathy + gentle challenge + Long Game behavior.

### Daily experience

8. **Today/Home** — single clear writing CTA, gentle prompt, recent entry, optional next-step reminder.
9. **Journal composer** — free writing, optional feelings, optional gratitude, optional thought prompts, draft save, voice route, save without AI.
10. **Entry detail** — original entry, mood/tags, AI response, edit, regenerate, feedback, export/delete.
11. **Journal history** — timeline, search, optional tag filters, open original entries.
12. **Entry-linked AI conversation** — follow-up questions, response-style controls, clear context boundaries.
13. **Tomorrow Bridge** — optional small next step, next-day check-in, edit or dismiss.

### Insights and personalization

14. **Long Game Compass** — editable values and goals; clear user ownership; optional AI use per goal.
15. **Patterns and weekly review** — tentative themes with evidence/date references, user feedback, no diagnosis.
16. **Voice journaling** — microphone permission, recording, editable transcript, save/cancel, failure states.
17. **Home-screen widget** — discreet prompt and quick-entry shortcut; no private entry text by default.

### Trust and settings

18. **AI and memory controls** — support style, challenge intensity, current-entry-only vs relevant past entries, saved memory review/correction/deletion.
19. **Privacy and data** — processing disclosure, export, delete entry, delete memory, delete account, sign out.
20. **Gentle reminders** — opt-in timing, selected days, quiet hours, preview, pause/disable.
21. **Extra support** — carefully reviewed high-risk response and verified support options; not a substitute for professional or emergency care.

The final implementation also needs routine states for loading, no entries yet, offline, failed AI request, rate limits, sign-in errors, expired sessions, permission denied, empty search, delete confirmation, and accessibility labels. These are states, not necessarily standalone screens.

## 4. AI reflection response contract

The system should consistently respond to the *specific entry* and the user's chosen mode. A default response shape can include:

1. **Acknowledge:** Reflect the emotion or difficulty without overclaiming understanding.
2. **Clarify:** Distinguish user-reported facts from conclusions or assumptions; ask rather than presume when context is missing.
3. **Perspective:** Offer one balanced reframe when helpful. Do not challenge every negative emotion or dismiss real harm.
4. **Long Game link:** Reference a user-defined value/goal only when relevant, with a cited entry/goal and uncertainty where appropriate.
5. **Choice:** Offer an optional question, small next step, rest, or stop point. Never force an action plan.

Support styles:
- **Just listen:** Emphasize acknowledgment; avoid unsolicited advice and heavy analysis.
- **Help me understand:** Explore feelings, needs, and alternative explanations.
- **Be honest with me:** Respectfully examine assumptions and contradictions; never be harsh or shaming.
- **Help me move forward:** Collaboratively explore options and an achievable next step.
- **Challenge me gently:** A user-controlled tone setting, not permission to shame or overrule the user.

The AI must not diagnose, prescribe, fabricate facts or memories, promise confidentiality beyond the real provider arrangement, use manipulative attachment language, or present its interpretations as truth. It must accept corrections. If using previous entries, reference relevant dates/examples and allow the user to choose current-entry-only context.

## 5. Product features: include in vision, sequence in delivery

All positively recommended features stay in the product plan. They should not all be implemented in one giant coding pass.

### Foundation — first usable release

- Core onboarding and account/auth flow.
- Free-form journal, optional prompts, tags/mood check-in, draft preservation.
- AI reflection modes and gentle-challenge setting.
- Supabase schema, authentication, Row Level Security (RLS), privacy disclosure/consent, per-entry history.
- Entry detail/history, AI provider abstraction, safe failure and rate-limit states.
- Long Game Compass basics.
- Memory/context controls, deletion/export foundations.
- Home screen and a discreet widget entry point, after platform feasibility is confirmed.

### Next release — continuity and insights

- Entry-linked follow-up chat.
- Tomorrow Bridge with optional next step and non-judgmental check-in.
- Weekly pattern summaries with dated supporting entries, corrections, dismissal, and opt-out.
- Optional gratitude prompts, richer mood history, and non-clinical trend visualization.
- Gentle reminders with quiet hours and opt-in permission timing.

### Later release — richer input and refinement

- Voice journaling and editable transcription.
- More flexible widget types and platform-specific polish.
- Expanded search, export formats, backup/deletion audit UX, accessibility and localization refinement.
- Further personalization only when it demonstrably improves usefulness and does not undermine privacy.

**Not recommended:** public social feed, competitive streaks, shame-based reminders, AI diagnosis/personality typing, manipulative dependency patterns, or a general productivity suite that distracts from reflection.

## 6. Suggested technical architecture

- **Mobile:** React Native + Expo + TypeScript.
- **Backend/data:** Supabase Auth + PostgreSQL + Row Level Security. Use migrations and test RLS with separate user accounts.
- **AI boundary:** Mobile app → authenticated Supabase Edge Function → provider adapter → AI provider. Never bundle provider API secrets in the app. Store provider selection/configuration server-side.
- **AI privacy:** send only required entry text plus a bounded amount of relevant context; make context scope visible and controllable. Minimize logs; never log raw entries by default. Review provider terms and retention before production.
- **Data model candidates:** profiles/preferences; journal_entries; entry_tags or mood check-ins; reflections; conversations/messages; compass_values/goals; memory_items; tomorrow_actions; notification_preferences; consent_records. Keep the exact schema aligned with access rules and retention needs.
- **Provider evaluation:** compare free-tier limits, allowed use, model availability, terms for sensitive text, response quality, latency, reliability, and fallback behavior. Free tiers can change; do not promise unlimited or production-grade reliability.
- **Widget:** test the target platform early. A React Native app does not automatically remove native widget implementation work, especially on Android.

## 7. Design direction

Aim for a thoughtful, editorial personal notebook: charcoal typography, warm neutral surfaces, restrained slate accents, generous writing space, quiet linework, and deliberate micro-interactions. Avoid generic neon gradients, overly clinical dashboards, excessive cards, streak counters, and motivational clichés. The interface should feel calm but not sterile; premium but not ornamental.

Use Impeccable in Claude Code to create/critique the design system and screen implementation after the user journeys are fixed. Ask Claude to propose tokens and ASCII layout sketches first, critique its own direction against the product principles, then implement a bounded set of screens and verify screenshots/states.

## 8. Acceptance checklist before calling the MVP complete

- First entry can be saved even if the AI provider is unavailable.
- No required mood rating, minimum writing length, or daily streak.
- Every screen has loading, error, empty, and permission states where relevant.
- Users cannot access each other's data; RLS is tested, not assumed.
- AI keys exist only on the server; the client cannot bypass authorization.
- AI disclosures match the actual provider and processing settings.
- Users can view, correct, and delete memory/entries, export data, and delete their account according to the real retention policy.
- AI does not claim to be a therapist or make diagnoses; challenge is compassionate and uncertainty is explicit.
- Pattern insights reference source entries and can be rejected/dismissed.
- Widget and notification content reveal no sensitive text by default.
- Test on physical Android device, with slow/offline connection, small screens, keyboard open, large text, screen reader labels, and reduced motion.
- Verify all primary flows with screenshots and tests; do not claim functionality that was not run and checked.

## 9. Recommended implementation sequence for Claude Code

1. Inspect repository, environment, existing skills, conventions, and build/test commands. Do not assume the repo is empty.
2. Create `docs/product-blueprint.md` and an implementation plan from this document; flag any conflicts before coding.
3. Use Impeccable to propose a concise design system and annotated screen layouts. Review the plan before implementation.
4. Build navigation and clickable/static screen shells with representative empty/loading/error states.
5. Implement auth + Supabase schema/RLS with tests; only then connect real user data.
6. Implement journaling and draft preservation.
7. Add AI Edge Function/provider adapter with synthetic data and automated prompt/behavior test cases.
8. Add memory controls, privacy/export/delete, and reviewed safety flow.
9. Add the first native widget spike early enough to surface platform limitations.
10. Implement later roadmap features as separate, testable milestones.
11. Summarize changed files, tests/builds actually run, screenshots reviewed, unresolved issues, and any required secrets/configuration (never ask the user to paste secrets into source files).
