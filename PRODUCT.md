# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Stack

React Native + Expo + TypeScript (from the design-pass prompt and blueprint). Android first; iOS kept compatible but not verified in early milestones. Supabase Auth/Postgres/RLS and an Edge Function AI boundary are the planned backend, not wired in the UX foundation milestone.

## Users

Young adults (18–30): students and early-career people working through comparison, direction, and self-doubt. They reflect privately, typically in the evening, on their phone.

## Product Purpose

Kindway is a compassionate reflection companion: a private journal that helps people process their day, recognize patterns, and stay connected to their own long-term values, without judgment, pressure, or pretending to be a therapist. Success is a user who writes freely, feels heard, sometimes sees a situation more clearly, and leaves the app to live their life.

## Positioning

Free writing first, with an AI that validates feelings without automatically endorsing conclusions, offers gentle honest challenge on the user's terms (Just listen / Help me understand / Be honest with me / Help me move forward, plus "Challenge me gently"), and references the user's own Long Game Compass only when relevant. No guilt mechanics.

## Operating Context

- Evening reflection: widget/notification or Home → write → optional tags/prompt/gratitude/voice → optional AI reflection → save, correct, follow up, or close.
- Weekly review of tentative patterns with dated evidence and accept/partly/reject controls.
- Tomorrow Bridge: one optional small next step, checked in the next day without shame.
- Privacy controls: context scope, memory review/deletion, export, account deletion.

## Capabilities and Constraints

- 21-screen inventory and routine states defined in `reflection_companion_product_blueprint.md`; flow reference in `reflection_companion_wireframe.html`.
- Supabase (Auth, Postgres with RLS, Edge Functions) holds accounts, optional cloud backup and AI consent. Unbuilt capabilities (export, voice transcription) must be labelled demo / not connected.
- The Android home-screen widget and evening reminders (local notifications) are real; they need a development or preview build, not Expo Go.
- Real AI runs on GroqCloud (`openai/gpt-oss-120b`) through the Edge Functions, only with an account, cloud backup and the matching consent; disclosures name the provider (`src/data/ai-disclosure.ts`). Without them, reflections are simulated on the device and say so.
- Extra support screen is a placeholder until resources are verified; no invented emergency numbers.
- Not in scope ever: public social feed, competitive or guilt-based streaks, AI diagnosis/personality typing, manipulative dependency patterns, broad productivity suite.

## Brand Commitments

- Name: **Kindway** (the planning assets' "still, here." and "Reflection Companion" are outdated).
- Voice: warm, plain, unhurried; invites rather than assesses; no motivational clichés; AI interpretations stated tentatively.

## Evidence on Hand

Planning assets only. No users, testimonials, metrics, or verified support resources exist; sample data must be clearly fictional.

## Product Principles

1. Free writing first; every prompt, mood, and template is optional.
2. The user is the authority on their own life; values, goals, and insights are editable and rejectable.
3. Privacy is part of the experience: say plainly what is stored, what is sent to AI, and what is deleted.
4. AI is a reflection aid, not a therapist; no diagnosis, no claims of being someone's only support.
5. No guilt mechanics, and still useful when AI is unavailable.

## Accessibility & Inclusion

WCAG 2.1 AA contrast, TalkBack labels, font scaling (large text), reduced motion, 48dp touch targets, small-screen and keyboard-open layouts. English, global audience.
