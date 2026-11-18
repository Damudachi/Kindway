# Wise friend: follow-up questions, the growing trail, topics, check-ins and kept words

Date: 2026-11-16. Status: grilled with the owner (34 decisions, all settled), awaiting spec review.
Assumptions not covered by the grill are marked **(default)**; change them in review.

## Goal

Kindway should feel like a wise friend you want to come back to when something happens:

1. **Phase A, follow-up questions.** The AI asks the user a few short questions to learn more,
   which pulls them into the follow-up chat.
2. **Phase B, the growing trail.** Each day written adds to the trail on Today, with a small
   moment after saving and surprise scenery at milestones. This gives people a reason to write
   daily, without guilt.
3. **Phase C, wise friend.** Topics the user keeps coming back to (with Resolve), check-ins on
   things they said were coming up, and a collection of words that helped.

Build order: A, then B, then C. Each phase ships on its own and leaves tsc, lint and jest green.

## Ground rules (from PRODUCT.md, DESIGN.md and the AI prompts; unchanged)

- No guilt mechanics. Nothing resets, nothing is lost, missed days look like ordinary trail.
- No competitive features or sharing. Private.
- The AI stays a "compassionate reflection aid". The prompts keep saying it is not a therapist,
  crisis service or friend. The *friend feeling* comes from what the app remembers and offers,
  never from the AI claiming friendship or memory.
- Comfort comes first for loss and grief. When `safety_concern` is set, no questions, no prompts,
  only the reviewed support route.
- Real AI only for anything written about the user's text. Simulated mode shows none of the new
  AI parts.
- Consent covers what is **sent** to the AI. Any new data sent means a consent version bump, in
  both `src/services/ai/consent.ts` and `supabase/functions/_shared/ai-consent.ts`, plus the
  disclosure copy (`src/data/ai-disclosure.ts`, `public/privacy.html`).

---

## Phase A: AI follow-up questions

### Behaviour
- A reflection ends with **2–3 short questions the AI asks the user**, to learn more about what
  they wrote ("What made Tuesday feel lighter?"). These are shown as tappable chips under a
  heading like "Kindway wonders…" **(default copy)**.
- They **replace** the single plain-text `reflection_question`. The first question still feeds
  the "Where you left off" card on Today (`src/state/come-back.ts`).
- The "Also in this entry" topic chips stay as they are.
- **Tapping a question** opens `/entry/[id]/talk` with that question posted as the AI's first
  message, and the keyboard ready. The user's answer goes to the follow-up endpoint as usual.
  Their answers stay in that entry's chat.
- **Each follow-up reply** ends with **2 more questions** the AI asks, shown as chips under the
  latest reply. Tapping one posts it as an AI message, and the keyboard opens. Only the latest
  reply's chips are tappable.
- **Context:** reflection questions draw on what the reflection already reads, which is the
  entry plus up to 5 earlier entries from 14 days when the scope isn't "this entry only".
  Follow-up questions draw on the entry and the conversation only.
  → **No consent change in Phase A.**
- **Comfort-first** (`comfort_only` or "Just listen"): the reflection stays comfort-first, but
  the questions may gently dig in ("What do you miss most about her?"). They are never
  analysing or reframing, and never advice.
- `safety_concern` → no questions. That route already replaces the reflection.
- Simulated reflections and simulated chat: no question chips. The simulated
  `question` field keeps working as today.

### Server (`supabase/functions/_shared/`)
- `reflection.ts`: replace `reflection_question` in the JSON schema with
  `follow_up_questions: string[]` (at most 3, each at most 120 characters). `parseReflection`
  drops over-long items, trims, de-duplicates and slices to 3, the same as `ideas`.
  - Keep emitting `reflection_question` as `follow_up_questions[0] ?? null` in the stored output,
    so old app builds (1.2.1 / 1.3.0) still show a question. **(default)**
  - Bump `REFLECTION_PROMPT_VERSION` to `reflection-p8`. Prompt rules: the questions are asked
    *by Kindway to the user*. They are open, short, one idea each, and specific to what was
    written (and to a same-subject earlier entry when one is relevant). No yes/no questions, no
    advice disguised as a question, and no "why" questions that blame. In comfort-first entries,
    they gently invite the user to say more about what matters.
- `follow-up.ts`: add `follow_up_questions: string[]` (at most 2, each at most 120 characters)
  to the schema and output. Bump `FOLLOW_UP_PROMPT_VERSION` to `follow-up-p6`.
  - The conversation can now begin with a Kindway question. The app sends the question it showed
    as a new optional body field, `asked: string` (at most 200 characters). The prompt includes
    it as `<asked>` before `<message>`, so the AI knows what the user is answering.
  - `asked` is untrusted text, fenced like everything else. The server accepts it only if it is
    one of the stored questions for that reflection or follow-up, checked by exact match against
    the given `reflection_id` output or the latest context turn's output. Otherwise it returns
    400 `invalid`.
- `reflectionText()` in follow-up.ts uses `follow_up_questions` when present.
- No schema or migration change: outputs are stored as JSON in `ai_reflections.output` and
  `ai_follow_ups.output`.

### App
- `src/data/types.ts`: `Reflection.followUpQuestions?: string[]` (AI only) and
  `ChatMessage.questions?: string[]` (AI replies). Add `ChatMessage.asked?: true` for a Kindway
  question posted from a chip, which is never sent to the server as a user message.
- `src/services/ai/remote.ts`: map the new fields, and send `asked` with the follow-up request.
- `reflection-view.tsx`: the question chips replace the plain question line (AI reflections
  only). A tap goes to `/entry/[id]/talk?ask=<index>`.
- `talk.tsx`: when `ask` is present, post the question as a `from: 'kindway', asked: true`
  message (unless the chat already ends with it), and focus the input. The chips under the
  latest AI reply do the same.
- `come-back.ts`: the thread prompt prefers `followUpQuestions[0]`, then `question`, then topics,
  then the title.
- Evals: extend `src/__tests__/ai-eval.live.test.ts` with question-quality cases: questions
  present, open, specific, gentle under comfort, and absent in safety. Add unit tests for parsing
  and the `asked` check in `ai-server.test.ts`, and UI tests for chips and talk prefill.

### Ship
Deploy `generate-reflection` and `generate-follow-up` (`npx supabase functions deploy`, with the
owner's OK). The app part ships with the next build or OTA.

---

## Phase B: The growing trail

### Docs first
- `PRODUCT.md`: add the rule *"Counts only go up with writing; nothing is ever lost, reset or
  shown in reminders, notifications or the widget. Missed days are just trail."* Refine "No guilt
  mechanics" so it allows a days-written count and milestone scenery.
- Welcome copy (`src/app/(onboarding)/welcome.tsx:42`): "No streaks, no scores, no pressure." →
  "No streaks to break, no pressure."
- `DESIGN.md`: document the lighting moment, milestone scenery and the count's placement. Keep
  "Nothing else vibrates": no new haptics.

### The count
- `daysWritten(entries)` is the number of distinct local calendar days that have at least one
  real entry, counted by `entry.date`. Sample entries and entries pending deletion
  (`useEntries()`) don't count.
- Back-dating counts on the entry date. Deleting a day's only entry lowers the count.
- Pure function in `src/state/trail-progress.ts` **(default name)**, with unit tests.

### Milestones
- Thresholds: **7, 30, 50, 100, 200, 365** days written.
- Unlocks are **permanent** once reached, even if the count later drops. Stored as
  `trailUnlocks: number[]` in app state, on the device and synced on the profile as
  `trail_unlocks int[]` via a new migration, so they survive reinstall. **(default: synced)**
- Each unlock adds scenery to the "Your trail" card and has its own warm line **(default copy,
  review)**:
  - 7: wildflowers, "A week of days on your way. Wildflowers are coming up along the trail."
  - 30: fireflies, "Thirty days on your way. The fireflies found your trail."
  - 50: a bench, "Fifty days. There's a bench here now, for resting."
  - 100: autumn colours, "A hundred days on your way. The trees have turned gold."
  - 200: stars, "Two hundred days. The sky over your trail is full of stars."
  - 365: sunrise, "A year of days on your way. Sunrise."
- Scenery is small SVG illustration layers drawn in the existing style
  (`src/components/illustrations.tsx`), with theme colours and dark mode supported. Pick through
  the design skills during the build.

### The lighting moment
- After **saving a new entry** (not an edit), a short overlay plays: the entry's blaze paints
  (the existing `Blaze paint` and its single light haptic), a soft glow, and one line:
  "**N days on your way.**" On reaching a milestone, it shows the milestone line and the new
  scenery fades in, using a richer animation but the same single haptic.
- It plays **while the reflection loads**: `write.tsx` navigates to `/entry/{id}` as now, and
  the entry screen shows the moment over the loading state. Without a reflection, it plays on
  Today, where the blaze already paints.
- Tap anywhere to skip. It lasts about 1.5 s normally and about 2.5 s for a milestone, and
  never holds back a reflection that is ready. **(default)**
- Reduced motion: no glow or scale, an instant fill, and the line shown briefly.
- The number appears **only** in this moment and quietly on the trail card ("23 days on your
  way"). It never appears in reminders, notifications or the widget.

---

## Phase C: Wise friend

### C1. Topics
**What it is.** A named, ongoing subject in the user's life ("Mum's health", "the job search"),
saved by the user and linked to entries.

- **Where:** the Journal tab gets a segmented control, "Entries | Topics | Kept" (Kept words is
  C3). Today shows an "Ongoing" card with up to 3 open topics when any exist. **(default)**
- **Saving a topic** (user's choice only):
  - "Save topic" on an "Also in this entry" chip, which saves it and links this entry.
  - "New topic" on the Topics page, a name only (at most 40 characters).
  - Accepting an AI suggestion on a reflection: "This keeps coming up: **the job search**. Save
    it as a topic?"
- **Linking entries:** a reflection may say "This sounds like **Job search**. Add it?" for a
  saved open topic, and one tap links it. Entries can also be linked or unlinked by hand from an
  entry's detail screen. **(default)**
- **Topic page:** name, a timeline of linked entries (newest first, tap to open), "Talk about
  this", Resolve, and Rename/Delete in a menu.
- **Talk about this:** a conversation about the topic that can read the topic's recent linked
  entries (up to 8 entries, each cut to 600 characters, from the last 90 days **(default)**).
  Same chat UI as the follow-up, plus the AI questions from Phase A.
- **Resolve:** moves the topic to a "Resolved" list (collapsed at the bottom of Topics), and
  shows a gentle moment, "Chapter closed.", with an optional one line, "What helped?" (at most
  200 characters). That line is saved to Kept words (C3). A resolved topic can be reopened.
- **Check-ins on quiet topics:** an open topic with no linked entry in 14 days gets a Today card
  that asks about it ("How is Mum's health these days?"). At most once per topic every 14 days.
  "Not now" hides it until that window passes, with no penalty. Tapping it opens a new entry with
  the question as its prompt and the topic pre-linked. The question text is app-written from the
  topic name, with no AI call. **(default)**
- Topics and links work in local-only mode too. Only the AI parts need an account and consent.
- The existing entry-level "revisit" flag ("Still open" in Patterns) stays as it is.
  **(default)**

### C2. Remembers and checks in
- A reflection may return **check-ins**: things the entry says are coming up, each as
  `{question, on}`, where `on` is a date. At most 2. `on` must fall from the entry date to 60
  days after it. Example: "my exam is Thursday" gives
  `{question: "How did the exam go?", on: "2026-11-19"}`.
- To resolve relative dates, the reflection prompt now includes the entry's date and weekday.
- On Today, from `on` through 3 days after **(default)**, a "Checking in" card shows the
  question. Tapping it opens a new entry with the question as its prompt. "Not now" dismisses it
  for good, with no penalty.
- Not created for entries routed to safety. Not created in comfort-only reflections unless the
  entry names a clear upcoming event. AI only.
- Check-ins are derived from the stored reflection output, so nothing new is stored on the
  server. The client keeps `dismissedCheckIns: string[]` (keyed `entryId:index`) on the device.
  **(default: not synced)**

### C3. Kept words
- A small "Keep" (heart) action on each reflection section and each AI chat reply saves that
  text to **Kept words**, with a source link to the entry.
- Resolved-topic "What helped?" lines also land here.
- The "Kept" view in the Journal tab lists them (newest first, tap to open the source, swipe or
  menu to remove).
- "Something that helped before": when the user saves an entry with a heavy feeling tag
  (Overwhelmed, Worried, Tired, Lonely) **(default)**, the reflection screen shows one kept line
  at the bottom, chosen at random, with "See all".
- Works locally. Synced for cloud accounts.

### Data (Phase C)
New migration `2026111613xxxx_topics_kept_words.sql`:
- `topics (id uuid pk, user_id, name text ≤40, status text check in ('open','resolved'), created_at, resolved_at, what_helped text ≤200, check_in_shown_at timestamptz)`.
- `topic_entries (topic_id, entry_id, user_id, created_at)`, primary key `(topic_id, entry_id)`,
  cascading on topic and entry delete.
- `kept_words (id uuid pk, user_id, text ≤1200, source_kind text check in ('reflection','follow_up','topic'), source_entry_id uuid null, source_topic_id uuid null, created_at)`.
- `profiles.trail_unlocks int[] not null default '{}'` (Phase B, same migration file or its own).
- RLS everywhere: the owner can select, insert, update and delete their own rows. pgTAP tests
  are in `supabase/tests/database/`. Account deletion cascades.
- Sync: add `topics`, `topicLinks` and `kept` kinds to `CloudSnapshot`, `TABLES`, `toCloud`,
  `applyCloud` and `mergeSnapshots` (`src/services/cloud/records.ts`), following the
  `tomorrow_actions` pattern.

### AI changes (Phase C) and consent
- **Reflection** (`reflection.ts`, prompt `reflection-p9`): the prompt also receives the entry
  date and weekday, plus the names of the user's **open topics** (at most 12, ids hidden behind
  short labels; the server maps them back). The reply schema gains:
  - `topic_matches: string[]`: labels of saved topics this entry is clearly about (at most 2).
  - `topic_suggestion: string | null`: a new topic label (at most 40 characters), only when this
    entry and an earlier entry are plainly about the same ongoing subject and no saved topic
    covers it.
  - `check_ins: {question, on}[]`, as in C2.

  Sending topic names and the entry date is **new data**, so **`entry_reflection` consent →
  v4**, with updated disclosure wording.
- **Topic talk:** a new edge function `generate-topic-talk` **(default; an alternative is a
  `topic_id` mode on follow-up)**, gated by **`cross_entry_analysis`**. That consent's wording
  is extended to "conversations about a topic you saved", so **`cross_entry_analysis` → v3**.
  - It sends the topic name, up to 8 linked entries (date, feeling tags, text cut to 600
    characters; never entries kept out of analysis; never safety-route entries), recent turns of
    this topic conversation, and the message.
  - Rate limits: its own `topic_talk` request kind (10 s cooldown, 40 a day **(default)**).
  - Storage: new table `ai_topic_talks`, server-written only, mirroring `ai_follow_ups`, with a
    ledger kind `topic_talk`. This needs the `ai_requests.kind` check extended in the migration.
- Every consent bump asks users to agree again on their next AI use. Both consent files must
  match (a Jest test enforces this).

### Ship (Phase C)
- Migrations are pushed to hosted with the owner's OK (`npx supabase db push`).
- Deploy `generate-reflection` and the new `generate-topic-talk`. The app needs a new build:
  runtime 1.3.0 already needs one for 7B.

## Testing
- Unit: parsing and limits for every new AI field, the `asked` check, `daysWritten`, unlock
  persistence, check-in date windows, topic check-in cadence, sync mapping for the new tables.
- UI (RNTL): question chips → talk prefill; lighting moment (normal, milestone, reduced motion,
  skip); Topics (save from chip, link suggestion, resolve and reopen, What helped → Kept); Today
  cards (Ongoing, topic check-in, Checking in); Kept view and "Something that helped before".
- DB: pgTAP for the new tables' RLS and constraints.
- Live eval: question quality, topic matching, check-in extraction (with date resolution).
- Before calling done: tsc, lint, jest, `npm run build:web`, then a web check in a browser.

## Out of scope (roadmap)
Happy for you (good-news mode), Share from anywhere (OS share sheet), next-day check-in after a
heavy entry, and merging "revisit" into Topics.
