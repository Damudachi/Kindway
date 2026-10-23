# Kindway roadmap

Phases 1–5 are done: product and design, the local-first prototype, Supabase accounts and sync, real AI reflections and reviews, and AI continuity, follow-ups, Compass and Tomorrow Bridge. The 2026-10-23 phone test of the post-Phase 5 fixes passed. This page plans what comes next. Each phase has a clear finish line, and a phase isn't done until every item is marked pass, fixed, or deliberately deferred.

Hardening comes before new native features, so widgets and notifications don't land on top of unverified sign-in, sync and deletion. The development build moves up to Phase 6 because Expo Go can't load custom native code and can't open `kindway://` links.

| Phase | Scope | Done when |
| --- | --- | --- |
| **6: Stabilise and verify** (current) | Email-link landing page (`web/auth-link`); clearer reflection screen; backlog retest on a phone; move phone testing from Expo Go to an EAS development build (`eas build --profile development`, Android first) | Every backlog item below is marked pass, fixed or deferred; the phone runs the development build; a confirmation link opens the app directly |
| **7: Beta hardening** | Close the per-user AI-output provenance limitation; security and privacy review; live Groq evaluation (needs approval: it uses provider quota); offline recovery; accessibility (large text, TalkBack, reduced motion); check Groq retention, quota and consent wording | A review document with no open high-severity findings; evaluation tables in `docs/ai-evaluation.md` filled in; accessibility checklist passed |
| **8: Native capabilities** | In order of risk: reminders (expo-notifications, opt-in, quiet hours), then voice transcription, then an Android home-screen widget. Voice and widget each start with a feasibility spike | Each feature works on the development build and has its own phone test, or is dropped after its spike with the reason written down |
| **9: Closed beta, then release** | Preview and production EAS builds, internal testing track, privacy policy and store listing, support and incident process, retention and deletion policy | Testers use it for at least 2 weeks with no data-loss or privacy bugs; the release checklist is complete |

## Phase 6 backlog

Status: open unless marked.

- [ ] Email link opens the landing page, then the app (Expo Go and development build)
- [ ] Reflection screen: grouped actions, folded "About this reflection", Entry options
- [ ] Cross-device saved reflection retrieval and deletion reconciliation
- [ ] Cross-device saved review retrieval, stale deletion, source navigation and failure states
- [ ] Real insights and review on the hosted functions
- [ ] Real follow-up with its own consent; offline or unavailable shows a failure with no stand-in reply
- [ ] Consent v2 renewal and follow-up consent against the deployed functions
- [ ] Tomorrow Bridge: edit and save, cancel saves nothing, duplicate tap saves once, an existing step is never silently overwritten
- [ ] Account switch and sign-out: no leaked state, and no late AI reply attaches to the wrong user
- [ ] Delete AI outputs and account deletion on the hosted project
- [ ] Large text, screen reader, reduced motion, small screen, keyboard open
- [ ] Follow-up payload never contains Compass text (needs approval: live provider call)
- [ ] Live Groq evaluation of `reflection-p3` and the follow-up scenarios (needs approval; can move to Phase 7)
- [ ] EAS development build installed on the test phone
