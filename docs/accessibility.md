# Accessibility checklist

**Date:** 2026-10-29 (Phase 7). Covers Android and the web app (iPhone).

**How it was checked:**
- **Web:** the built web app in Chrome at phone sizes, with the accessibility tree read on 14 screens.
- **Both platforms:** a Jest test, `src/__tests__/a11y.test.tsx`, reads what a screen reader gets on the same screens: every control has a name and every text field has a label.
- **Earlier:** large text on Android was checked in Phase 6, and colour contrast is tested in `theme.test.tsx`.

| Check | Platform | Result | Fix or note |
|---|---|---|---|
| Every button, switch, tab, link, checkbox and radio has a name | Web (accessibility tree, 14 screens) | **Fixed.** AI & memory had 4 unnamed switches: the row is the switch, but on the web the toggle inside also showed as a nameless switch and an extra keyboard stop | The inner toggle is hidden from assistive tech and keyboard focus (`SwitchRow`, `controls.tsx`) |
| Every control has a name; every text field has a label | Android / iOS semantics (Jest, 14 screens) | Pass | `a11y.test.tsx` now guards it |
| Nothing scrolls sideways at 320 px wide | Web | Pass on all 14 screens | |
| 200% zoom on a small phone (a 195 px-wide viewport) | Web | **Fixed.** The tab bar was 4 px too wide, and "Patterns" and "Compass" overlapped | Tab items shrink; labels stay on one line and end in "…" at that size (`(tabs)/_layout.web.tsx`) |
| Reduced motion | Web | Pass: all 14 screens and onboarding work with "reduce motion" on | Animations already follow `useReducedMotion` |
| Large text (1.3×) | Android | Pass (Phase 6, 16 screens, night mode) | |
| Text colour contrast (WCAG AA) | Both | Pass | `theme.test.tsx` checks every text colour in both schemes |
| Screen reader read-through (TalkBack) | Android | **Owner's check** | On the A37: Settings → Accessibility → TalkBack, then swipe through Today, Write, a reflection and Settings. Every control should be read with a sensible name, in order |
| VoiceOver read-through and Safari text size | iPhone | **Owner's check** | On the friend's iPhone, in the Home Screen app: VoiceOver through the same screens; Settings → Display & Brightness → Text Size, then reopen Kindway |
| Small Android screen (about 360 dp) | Android | Not checked on a device | The web check at 320 px uses the same layouts; worth a look on a small phone before Phase 9 |

**Why the emulator wasn't used:** Android was checked through the Jest accessibility tree instead. The machine was short on memory: a full test run had already been stopped once, and the emulator is the heaviest tool here.
