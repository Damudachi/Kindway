---
name: Kindway
description: A private evening reflection journal; every entry is a blaze on the user's own trail.
colors:
  paper: "#F1EFEA"
  raised: "#F8F7F3"
  sunk: "#E8E5DE"
  ink: "#25272B"
  ink-muted: "#55575B"
  pencil: "#66686B"
  on-ink: "#F8F7F3"
  trail: "#4D6474"
  trail-container: "#D9E0E4"
  on-trail-container: "#22323D"
  sand: "#CFC8BB"
  outline: "#8A857B"
  lichen: "#6F7C61"
  lichen-ink: "#4E5A43"
  danger: "#9A3B2E"
  danger-container: "#F3E1DC"
  scrim: "rgba(37,39,43,0.42)"
  lantern: "#AD721C"
  lantern-ink: "#804D0C"
  lantern-container: "#F8E4CF"
  on-lantern-container: "#513716"
  bar: "#E5EDF1"
  bar-indicator: "#BCD3E2"
  primary: "#25272B"
  on-primary: "#F8F7F3"
  primary-accent: "#E5AB66"
typography:
  display:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: "40px"
    letterSpacing: "-0.4px"
  headline:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: "34px"
    letterSpacing: "-0.2px"
  title:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "28px"
  entry:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "28px"
  entry-title:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "24px"
  body:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  small:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  label-small:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.4px"
  pencil:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "28px"
  full: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  gutter: "20px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-text:
    textColor: "{colors.trail}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-disabled:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink-muted}"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.trail-container}"
    textColor: "{colors.on-trail-container}"
  field:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "56px"
  composer-page:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.entry}"
    rounded: "{rounded.md}"
    padding: "16px"
  notice-demo:
    backgroundColor: "{colors.lantern-container}"
    textColor: "{colors.on-lantern-container}"
    rounded: "{rounded.md}"
    padding: "16px"
  notice-info:
    backgroundColor: "{colors.trail-container}"
    textColor: "{colors.on-trail-container}"
    rounded: "{rounded.md}"
    padding: "16px"
  notice-warn:
    backgroundColor: "{colors.danger-container}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "16px"
  navigation-bar:
    backgroundColor: "{colors.bar}"
    textColor: "{colors.ink-muted}"
  navigation-bar-active:
    backgroundColor: "{colors.bar-indicator}"
    textColor: "{colors.ink}"
  top-app-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "64px"
  dialog:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  snackbar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.sm}"
    height: "48px"
  blaze-mark:
    backgroundColor: "{colors.trail}"
    width: "6px"
    height: "16px"
  blaze-small:
    backgroundColor: "{colors.trail}"
    width: "4px"
    height: "10px"
---

# Design System: Kindway

## Overview

**Creative North Star: "Trail Blazes"**

Kindway is a trail map on stone-grey paper. Each entry the user writes is a painted blaze on a single slate line, and the app marks the way, never the pace. Surfaces are flat paper separated by one sand hairline; nothing floats, nothing is shadowed, and the only saturated gesture is the slate trail itself. The category default for journals (a card list with a floating action button and mood charts) is refused.

The system runs on Android with Material 3 structure: small top app bar, native navigation bar, system Back, snackbars, basic dialogs, 48dp touch targets, and sp type that scales with the system font size. All dimensions below are dp and all type sizes sp; the frontmatter writes them as px for tool portability (1px = 1dp/sp). Two type voices carry meaning: Literata for the user's own words and for headlines, Roboto for the interface around them. A third state, pencil, marks anything Kindway proposes rather than the user has said.

Density is unhurried: a 20dp gutter, generous vertical rhythm, one primary action per screen. Motion is short and functional; the one signature moment is the open blaze being painted when an entry is saved.

### Motion grammar
All Reanimated 4, all instant under reduced motion, ease-out `cubic-bezier(0.23, 1, 0.32, 1)` unless noted.
- **Signature:** saving an entry paints its blaze (fill scales up from the bottom, 240ms, exponential ease-out) and the trail draws in again to reach it.
- **Trail draw-in:** the Today trail draws itself in (stroke dash, 600ms) once a day, and again on each save. Revisiting a tab never replays it.
- **Press:** buttons and chips scale to 0.97 in 120ms (a CSS transition), with the Android ripple kept.
- **Lists:** Journal stops and Patterns observations fade up 250ms, 40ms apart, on first render only; later additions appear plainly.
- **Reflection arrival:** its sections fade in one after another (300ms each, 140ms apart), like the writing appearing.
- **Tomorrow step done:** its blaze fills in lichen (same paint motion).
- **Haptic:** one light tap (expo-haptics, Light impact) as any blaze is painted, so a save or a finished step feels certain. Nothing else vibrates.
- **Held light:** the mark's light breathes (halo grows and fades over 2.4s, sine ease) in the Today wordmark and on Welcome, only while the screen is in view; still under reduced motion.
- **Theme switch:** the old paper dissolves into the new over 200ms.
- **Not animated:** tab switches (native navigation bar behaviour) and screen transitions (native stack defaults).

**Key Characteristics:**
- Stone-grey map paper, charcoal ink, one slate trail colour.
- Blazes are the signature mark, in exactly two sizes.
- Pencil before ink: proposed content is graphite italic until the user confirms it.
- One 1dp sand rule for every divider; no shadowed cards.
- Literata for the user's words and headlines, Roboto for UI.
- Light and night schemes with the same roles; Appearance follows the system unless the user picks one.

## Colors

A muted, low-chroma map palette: warm grey paper, charcoal ink, and a single slate blue that means "the trail". A warm lantern amber marks the few moments that invite the user in, and each feeling and compass area has its own muted hue. At night the same roles become "trail at dusk" (see Night scheme).

### Primary
- **Slate Trail** (trail): the trail line (2dp, at 45% opacity), painted blazes, the open blaze's dashed stroke, text buttons and inline links, cursor, checked controls, and switch tracks. It is the only chromatic accent in ordinary UI.
- **Pale Slate Wash** (trail-container): selected chips and segments, the navigation-bar active indicator, info notices, text selection, and the compass-value callout inside a reflection. Text on it uses **Deep Slate** (on-trail-container).

### Lantern (accent)
- **Lantern** (lantern): the warm accent, used sparingly: tonight's open blaze, the lantern icons on the Write and "Talk this through" buttons, and the primary button at night. 3.5:1 on paper, so marks only; **Lantern Ink** (lantern-ink) when it is text.
- **Lantern Wash** (lantern-container): demo notices, with **On Lantern Wash** text.

### Feeling and compass hues
One OKLCH family (same lightness and chroma, hues about 45° apart), defined per scheme in `tints` in `src/theme/tokens.ts`: a `mark` (blazes, bearing ticks; ≥3.9:1 on paper), a `container` and an `on` colour (selected chips; ≥8.9:1). A painted blaze takes its entry's first feeling; a selected feeling chip takes that feeling's wash; a compass area's bearing tick and "From your compass" card take the area's hue. Colour never carries meaning alone: the label always stays.

### Secondary
- **Lichen** (lichen): reserved for the optional "next step" blaze (Tomorrow Bridge) on the trail. **Lichen Ink** (lichen-ink) is the text-safe companion for lichen-related UI.

### Tertiary
- **Rust** (danger): destructive actions, field errors, and warning notices. **Rust Wash** (danger-container) backs warning notices.

### Neutral
- **Map Paper** (paper): the app background behind every screen, footer bars, and blaze interiors.
- **Raised Paper** (raised): fields, the composer page, dialogs, selected-able choice rows, and the switch thumb.
- **Sunk Paper** (sunk): skeleton loaders and disabled filled buttons (with a sand edge).
- **Trail Bar** (bar, bar-indicator): the navigation bar, tinted toward the trail, and its active pill.
- **Charcoal Ink** (ink): primary text, the primary button fill, and the snackbar.
- **Muted Ink** (ink-muted): secondary text, field labels, inactive navigation labels and icons, icon-button tint (7:1 on paper).
- **Graphite Pencil** (pencil): tentative and AI-proposed text, placeholders, and the tentative blaze stroke (4.9:1 on paper).
- **Sand** (sand): the hairline divider and decorative containment only (composer page border, choice rows, onboarding progress track). Never the sole boundary of an interactive control.
- **Field Outline** (outline): borders of interactive controls: secondary buttons, chips, fields, segmented buttons, radios, unchecked checkboxes (3.3:1 on paper).

### Named Rules
**The One Trail Rule.** Slate is the accent for ordinary interaction (links, selection, checked controls). Lantern is spent only on the invitations listed above; feeling and compass hues only on their own marks and chips. Lichen appears only on the next-step blaze and its related text; Rust only for destruction and error. The world is still paper and trail.

### Night scheme
"Trail at dusk": blue-graphite ground (paper #14181D, raised #1B2027, sunk #101318), warm off-white ink (#ECE8E1), a moonlit trail (#9DB4C4), and the lantern (#E5AB66) as the primary button with graphite text. Every role keeps its name; values live in `palettes.night` in `src/theme/tokens.ts` and every text pair meets AA. The user picks System, Light or Night in Settings → Appearance.

**The Outline-For-Touch Rule.** Anything the user can press or type into is bounded by outline (#8A857B) for 3:1 non-text contrast. Sand is for decoration and division, never for a control's edge.

## Typography

**Display Font:** Literata (with Georgia, serif)
**Body Font:** Roboto, the Android system face (UI text leaves fontFamily unset)

**Character:** Literata is a reading serif that makes the user's words feel set down in a book; Roboto keeps the surrounding interface quiet, native, and out of the way.

### Hierarchy
- **Display** (Literata 400, 32/40, -0.4 tracking): the one invitation question on Today. Font scaling capped at 1.5x so the action stays on screen.
- **Headline** (Literata 400, 26/34, -0.2 tracking): screen questions such as the composer prompt; 22/30 in empty states and 22/28 in dialog titles. Scaling capped at 1.6x.
- **Title** (Literata 500, 20/28): section headings ("Your trail", "Reflection") and the wordmark in the top app bar.
- **Entry** (Literata 400, 18/28): the user's own entry text, in the composer page and on the entry screen; also the reflection's acknowledging sentence.
- **Entry Title** (Literata 400, 17/24): entry titles on trail stops and journal rows.
- **Body** (Roboto 400, 16/24): interface prose; Muted Ink for ledes and secondary copy.
- **Small** (Roboto 400, 14/20, Muted Ink): helper text, dates under the lede, notice bodies, disclosures.
- **Label** (Roboto 500, 14/20): buttons (16sp on the primary button), chips, field labels, group labels, top-bar titles (16/24).
- **Label Small** (Roboto 500, 12/16, 0.4 tracking, Muted Ink, sentence case): metadata attached to a specific item, such as a trail stop's day, an entry's feeling and read time, a memory's source. Never a section kicker.
- **Pencil** (Literata Italic 400, 16/24, Graphite Pencil): AI-proposed interpretations, tentative pattern threads, and the reflection's closing question (18/28).

### Named Rules
**The Two Voices Rule.** Literata is reserved for the user's words and for headlines; every control, label, and system message is Roboto.

**The Pencil Before Ink Rule.** Anything Kindway proposes (interpretations, patterns, threads) is set in Literata Italic graphite until the user confirms it fits; on confirmation it becomes ordinary ink body text.

## Layout

A single column with a 20dp gutter on both sides; text buttons, chips, and trail content align to that gutter. The top app bar is 64dp with 4dp outer padding so 48dp icon buttons sit flush with their ripple. Spacing runs on a 4dp base (4, 8, 12, 16, 20, 24, 32, 48); sections are separated by 24dp vertical padding and a sand rule. Scrolling screens end with 48dp of bottom space plus the safe-area inset; screens with a pinned action place it in a footer on Map Paper, topped by a sand rule, that stays above the keyboard. Tab screens leave the bottom inset to the native navigation bar.

The trail is a fixed geometry: a 22dp marker column whose centre (11dp) coincides with the 2dp trail line, a 12dp gap, then the stop body; each stop is at least 64dp tall, and stops after the first are separated by a sand rule that starts at the body, not the line.

**The 48dp Floor Rule.** Every interactive element has a touch target of at least 48dp, even when its visible shape is smaller (chips are 36dp visible inside a 48dp target; the primary button is 56dp).

## Elevation & Depth

Kindway is flat. There are no shadows anywhere in the system: depth is conveyed by paper tone (Sunk below, Map Paper at rest, Raised for fields, sheets, and dialogs) and by the single sand hairline. The only overlay effect is the dialog scrim (Charcoal at 42%). Press feedback uses Android ripples tinted from ink, slate, or rust at 6-18% alpha, never lift.

**The Flat Paper Rule.** No shadowed cards, no elevation on buttons, no floating action button. If a surface needs separation, change its paper tone or draw the 1dp sand rule.

## Shapes

Softly rounded rectangles in four steps: 8dp for chips and the snackbar, 12dp for fields, notices, the composer page, and choice rows, 16dp for buttons and sheets, 28dp for dialogs. Segmented buttons and the switch are fully round. Borders are always 1dp (2dp for a field in error and for radios). Blazes are the exception: near-square rectangles with a 1dp corner (0.5 in SVG), because they are paint marks on a tree, not controls.

## Components

### Buttons
Quiet, confident, and full-width where they are the screen's main act.
- **Shape:** gently rounded (16dp).
- **Primary:** Charcoal fill (lantern at night) with On-Primary label (Roboto 500, 16sp), 56dp tall, 20dp horizontal padding; typically full-width with an optional trailing arrow pushed to the far edge.
- **Secondary:** transparent with a 1dp outline border and ink label, 48dp tall.
- **Text:** slate label with 12dp touch padding and a -12dp leading offset so the label aligns with the 20dp gutter while keeping its 48dp target.
- **Danger / Danger Text:** Rust fill with On-Ink label, or Rust label alone, for destructive confirmations only.
- **States:** pressed drops to 92% opacity with a ripple; disabled filled buttons turn Sunk with a sand edge and Muted Ink labels; a leading icon stays beside its label (the Write and Talk buttons carry it in lantern); loading swaps the label for a spinner.
- **Icon button:** 48dp square, 24dp Material Community icon in Muted Ink, borderless 24dp ripple.

### Chips
- **Style:** 36dp visible, 8dp radius, 1dp outline border, ink label (Roboto 500, 14sp), optional 18dp leading icon, inside a 48dp target. Rows wrap with 8dp column gaps.
- **State:** filter chips toggle and gain a check icon on Pale Slate Wash with Deep Slate text (border matches the fill); assist chips act immediately and never show selection. Disabled at 45% opacity.

### Cards / Containers
There are no cards. Grouping is done with `Section` (24dp vertical padding, Literata title, sand top rule) and with notices.
- **Notices:** 12dp radius, 16dp padding, 20dp leading icon. Each is a soft fill in its role colour with the icon in that role's ink, and no border: *Demo* (Lantern Wash, flask icon) marks anything simulated; *Info* (Pale Slate Wash, slate icon); *Warn* (Rust Wash with Rust text).
- **Choice rows:** Raised Paper, 12dp radius, sand border; selected turns to a slate border on Pale Slate Wash with a slate radio.

### Inputs / Fields
- **Style:** outlined, 56dp minimum height, Raised Paper fill, 1dp outline border, 12dp radius, 16dp horizontal padding, Roboto body text, persistent Muted Ink label above (never placeholder-only).
- **Placeholder / Cursor / Selection:** Graphite Pencil placeholder, slate cursor, Pale Slate Wash selection.
- **Error:** 2dp Rust border with a Rust helper line announced politely to TalkBack.
- **Composer page:** the free-writing surface is a Raised Paper page with a sand border (decorative, the page is a single large target), 12dp radius, 16dp padding, set in Entry type. While the user types, surrounding chrome recedes to 38% opacity over 360ms.

### Navigation
- **Navigation bar:** native Material navigation bar on Trail Bar with four always-labelled destinations (Today, Journal, Patterns, Compass). Inactive icons and labels in Muted Ink; the active destination gets a Bar Indicator pill, a Deep Slate icon, and an ink label.
- **Top app bar:** 64dp on Map Paper; back arrow in ink on the left; title in Roboto 500 16/24, or the Literata "Kindway" wordmark on Today; actions on the right.
- **Feedback:** snackbars are Charcoal with On-Ink text and a Pale Slate Wash action, 8dp radius, inset 16dp, fading in and out over 150ms. Dialogs are Raised Paper, 28dp radius, 24dp padding, with text-button actions aligned right.

### Blazes and the Trail (signature)
The blaze is the system's signature mark. It comes in exactly two sizes, 6x16 (mark) and 4x10 (small), so emphasis never inflates.
- **Painted:** solid, in the hue of the entry's first feeling (slate when it has none). When an entry is saved, the open blaze is painted: the fill grows from bottom to top over 240ms with an exponential ease-out, instant under reduced motion.
- **Open:** tonight's unwritten stop, drawn in SVG inside the same footprint as a 2dp lantern stroke dashed 3/2 on Map Paper.
- **Next:** the optional Tomorrow Bridge step, a solid 2dp lichen stroke.
- **Tentative:** a 2dp Graphite Pencil stroke.
- **Trail:** one 2dp slate path at 45% opacity threads every stop. It passes straight through each blaze and swings 6dp left and right between them, alternately, like a footpath between painted trees; stops are measured, so the path follows the real layout at any font size. Onboarding progress is drawn as a short 4dp stretch of the same trail on a sand track.

### Drawn elements
- **Section titles:** Literata title with an optional 20dp trail-coloured icon beside it (never a kicker above it). Sections that hold something Kindway proposes (reflection parts, tentative patterns) carry a short hand-drawn pencil underline in Graphite Pencil.
- **Empty-state drawings:** 160x96 line drawings in the trail's hand (2dp strokes, slate lines, sand ground, one lantern mark): a trailhead post (empty journal), a folded map (not enough to look across), a compass rose (empty compass), two speech outlines (an empty Talk). Decorative and hidden from TalkBack; the copy says everything.
- **Evening glow:** a soft lantern-coloured radial wash from the top-right corner of Today and Welcome, drawn behind the status bar, top bar and content (`Screen`'s `backdrop`), fixed while content scrolls. It grows warmer through the day (16% at its centre in the morning, 20% in the afternoon, 34% in the evening; 80% of that at night). Decorative; text contrast is judged against the paper.
- **Feelings on the trail:** under an entry's title on Today and Journal, up to three of its feelings, each beside an 8dp dot in its own hue; words in Muted Ink so colour never carries them alone.
- **Lamp light in drawings:** each empty-state drawing's lantern mark sits in a soft two-step glow, and the trailhead has an evening crescent in sand.
- **Week ribbon (Patterns):** the week as a stretch of trail: one line through the seven days, with a blaze in the first feeling's hue on days you wrote. Empty days are just trail, never a gap to fill.
- **Compass rose:** a seven-point rose, one point per area; chosen areas filled in their hue, the rest sand outlines, a lantern centre. Decorative; the list below names every area and repeats its hue on the bearing tick.

### App icon and mark
The Kindway mark is "Held light": an evening crescent cradling a small lantern-warm light, which also reads as a gentle smile. It is about being held, not fixed. Two shapes only, so it survives as a 24dp notification glyph and a monochrome themed icon. It ships in the night palette (crescent #ECE8E1, light #E5AB66 on #14181D) so it reads as evening on a home screen; the light splash uses the day colours (ink and lantern) on Map Paper. The crescent's weight sits low, so the mark is nudged up to look centred. The master is `assets/brand/kindway-mark.svg` on the 108dp adaptive canvas, with the mark inside the 66dp safe circle; every icon, splash, favicon, notification icon and widget-preview raster is generated by `node assets/brand/export-icons.mjs`. Edit the script, never the PNGs. (It replaced the K monogram on 2026-10-25.)

## Do's and Don'ts

### Do:
- **Do** use exactly the two blaze sizes (6x16 and 4x10) and draw non-painted blazes inside the same footprint.
- **Do** set AI-proposed or tentative content in Literata Italic Graphite Pencil until the user confirms it.
- **Do** divide content with the single 1dp sand rule and change paper tone for separation.
- **Do** border every interactive control in outline (#8A857B) to keep 3:1 non-text contrast.
- **Do** keep every touch target at 48dp or larger, and offset text buttons by -12dp so their labels align to the 20dp gutter.
- **Do** use Literata for the user's words and headlines and Roboto for all UI.
- **Do** label anything simulated in this milestone with the demo notice.
- **Do** make every animation instant under reduced motion.

### Don't:
- **Don't** use shadows, elevated cards, or a floating action button.
- **Don't** use sand as the only boundary of a pressable or editable control.
- **Don't** add kicker or eyebrow labels above headings; Label Small is for metadata attached to a specific item, never for introducing a section.
- **Don't** introduce a third blaze size or scale a blaze up for emphasis.
- **Don't** use lichen or rust outside the next-step blaze and destructive/error states.
- **Don't** hard-code a colour in a component; read the active palette through `useTheme()` / `makeStyles()` so both schemes stay whole.
