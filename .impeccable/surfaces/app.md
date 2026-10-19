---
version: 1
slug: "app"
primary_target: "app"
related_targets: ["src"]
---

# Kindway app — surface brief

Scope: the whole Android app shell (Expo Router `app/`), all 21 blueprint screens and shared states. Mode: Operate.

Audience/job: young adults reflecting privately in the evening; write freely, optionally get a gentle AI reflection, look back, keep one optional step for tomorrow.

Constraints: UX foundation only; AI, sync, export, deletion, voice, widget are demo / not connected and say so. Fictional sample data only. Material 3 structure (navigation bar, top app bar, system Back, snackbars, dialogs), 48dp targets, sp type, TalkBack labels, reduced motion.

Memorable moment: tonight's open blaze at the end of your trail gets painted when you save an entry.

Unresolved: dark scheme (deferred until it can be done cohesively); native widget spike; region for support resources.

## Direction contract

THESIS: Every entry is a blaze on the user's own trail; the app marks the way, never the pace. Refuses the category default of a card list with a FAB and mood charts.

OWN-WORLD: Stone-grey map-paper ground #F1EFEA, raised #F8F7F3, charcoal ink #25272B, slate trail #4D6474, sand hairline #CFC8BB, lichen #7E8A70 for "next step". Literata for the user's words and headlines, Roboto for UI. One 1dp sand rule for all dividers, no shadowed cards. Blazes: 6x16 painted rectangles, exactly two sizes. Pencil before ink: AI-proposed content in graphite italic until confirmed.

STORY: The user arrives, sees one invitation and one Write action, writes without requirements, optionally asks for a reflection, and sees their entry join the trail.

FIRST VIEWPORT: Home: top app bar wordmark + settings; overline date; Literata 32sp question; 16sp lede; full-width 56dp charcoal Write button; Speak and Prompt secondary chips; "Your trail" with tonight's open dashed blaze, optional Tomorrow Bridge lichen blaze, last entry with a pencil-grey tentative thread; Material navigation bar: Today, Journal, Patterns, Compass.

FORM: Trail Blazes, candidate 3 of 7 on the ordered list; seed:48e5cde101d72542. Signature interaction: saving an entry paints the open blaze (fill grows bottom to top, 240ms; instant under reduced motion) and the trail line extends. Motion grammar: Material fade-through between tabs, shared-axis forward/back in flows, composer chrome recedes while typing.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
