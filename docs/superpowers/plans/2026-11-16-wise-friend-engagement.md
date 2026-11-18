# Wise Friend Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI follow-up questions (A), the growing trail with milestones (B), and the wise-friend features (C: topics, check-ins, kept words), following the spec.

**Architecture:** AI changes live in the Supabase Edge Function shared handlers (`supabase/functions/_shared/*.ts`, Deno, also run under Jest). They are mapped into app types in `src/services/ai/remote.ts` and shown by Expo Router screens. New user data (topics, links, kept words, trail unlocks) lives in `DemoState` (`src/state/demo-store.tsx`). It syncs through the snapshot model in `src/services/cloud/records.ts` and `repo.ts`, backed by new RLS tables.

**Tech Stack:** Expo SDK 58, React Native, Expo Router, Reanimated, react-native-svg, Jest and RNTL, Supabase (Postgres, RLS, pgTAP, Deno edge functions), and Groq `openai/gpt-oss-120b`.

**Spec:** `docs/superpowers/specs/2026-11-16-wise-friend-engagement-design.md`. Read it first; it is authoritative for behaviour and copy.

## Global Constraints

- **No commits.** The owner commits. Leave every change uncommitted and skip all commit steps.
- Verify with `npx tsc --noEmit`, `npx expo lint`, and `npx jest <file>` per task. Run the full `npx jest` at each phase end, plus `npm run build:web` at the end.
- Install packages only with `npx expo install`. No new dependencies are expected.
- Routes live in `src/app/`. Non-route code goes in `src/components`, `src/state`, `src/services` and `src/data`.
- Follow the existing theme hooks (`makeStyles`, `useTheme`, `space`, `radius`, `motion` from `src/theme`). Copy is warm and plain, with no exclamation marks and no clichés (PRODUCT.md voice).
- No new haptics. Only the existing `Blaze` paint tap ("Nothing else vibrates").
- Nothing in reminders, notifications or the widget mentions counts, topics or check-ins.
- Keep the two consent files identical in terms: `src/services/ai/consent.ts` `CURRENT_TERMS` and `supabase/functions/_shared/ai-consent.ts` `AI_CONSENT_TERMS`.
- Server prompts keep "It is not a therapist, doctor, crisis service or friend". Model text is never used on the safety route.
- Every new AI field is AI-only. It never appears on simulated reflections or replies.
- Untrusted text in prompts always goes through `fence()`. Every new array field is trimmed, length-capped, de-duplicated and sliced in the parser. An over-long item is dropped, not a reason to fail the reply.
- Do not deploy functions or push migrations. The controller does that with the owner's OK.

## Review Focus

1. **Old stored reflections and replies** have no `follow_up_questions` or `check_ins`. The app must render them exactly as before: plain question line, no chips, no crash. Tested in Task A3 (`toReflection` with a p7 output) and Task A4.
2. **Tapping a question chip twice, or reopening talk with the same `ask`**, must not post the question twice. Tested in Task A4 ("does not duplicate the asked question").
3. **A milestone crossed by back-dating or by syncing entries from another device** unlocks once, and the moment only plays after a new save, never on app open or sync. Tested in Task B2 (`newUnlocks`) and Task B4 ("no moment on edit or sync").
4. **Deleting a topic or entry** removes its links locally and in the cloud, and leaves no orphan link rows that break `mergeSnapshots`. Tested in Task C2 (cascade in reducer and mapping) and the Task C1 pgTAP cascade.
5. **Check-in dates** that the model puts in the past, more than 60 days ahead, or in the wrong format are dropped. A check-in never shows before its `on` date. Tested in Task C5 (parser) and Task C6 (Today window).

---

## Phase A: AI follow-up questions

### Task A1: Reflection returns follow-up questions (server)

**Files:**
- Modify: `supabase/functions/_shared/reflection.ts`
- Test: `src/__tests__/ai-server.test.ts`

**Interfaces:**
- Produces: `ReflectionOutput.follow_up_questions: string[]`, plus constants `MAX_FOLLOW_UP_QUESTIONS = 3` and `MAX_FOLLOW_UP_QUESTION = 120`. `reflection_question` is still emitted, as `follow_up_questions[0] ?? null`.

- [ ] **Step 1: Failing tests** in `ai-server.test.ts`, in a new `describe('reflection follow-up questions')`:
  - `parseReflection` with `follow_up_questions: ['What made Tuesday lighter?', ' What made Tuesday lighter? ', 'x'.repeat(121), 'Who else knows?', 'What would help?', 'Extra?']` gives `['What made Tuesday lighter?', 'Who else knows?', 'What would help?']`, with `reflection_question === 'What made Tuesday lighter?'`.
  - A missing or non-array `follow_up_questions` gives `[]`, and `reflection_question` is null.
  - Questions are kept under the `listen` style and under `comfort_only: true`.
  - `REFLECTION_JSON_SCHEMA.required` contains `follow_up_questions` and not `reflection_question`.
  - `REFLECTION_PROMPT_VERSION === 'reflection-p8'`.
  - `reflectionSystemPrompt('listen', null)` mentions `follow_up_questions`.
- [ ] **Step 2: Run** `npx jest src/__tests__/ai-server.test.ts -t "follow-up questions"`. It should FAIL.
- [ ] **Step 3: Implement.**
  - Schema: replace `reflection_question` with `follow_up_questions: { type: 'array', items: { type: 'string' } }`.
  - Parser: build the list the same way as `ideas`, but always kept, and case-insensitively de-duplicated on the trimmed text.
  - Prompt (fields list and style rules):

    > follow_up_questions: two or three short open questions Kindway asks the user to learn more about what they wrote, one idea each, in their terms, at most 20 words. When an earlier entry is plainly about the same subject, one may ask how it has moved since. No yes/no questions, no advice phrased as a question, no "why did you" questions that blame. For loss, grief or hurt, gently invite them to say more about what or who matters ("What do you miss most about her?"); never analyse.

    Update the listen rule ("A reflection_question is optional") to say follow_up_questions are still asked, gently.
- [ ] **Step 4: Run** the same test, then the whole file. Everything should pass.

### Task A2: Follow-up replies ask questions, and accept `asked` (server)

**Files:**
- Modify: `supabase/functions/_shared/follow-up.ts`
- Test: `src/__tests__/ai-server.test.ts`

**Interfaces:**
- Consumes: the A1 output field `follow_up_questions` on stored reflections.
- Produces: `FollowUpOutput.follow_up_questions: string[]` (at most 2, 120 characters each). The request body gains optional `asked: string` (at most 200 characters). The prompt gains an `<asked>` block. The version is `FOLLOW_UP_PROMPT_VERSION = 'follow-up-p6'`.

- [ ] **Step 1: Failing tests** in a new `describe('follow-up questions and asked')`:
  - `parseFollowUp` keeps at most 2 questions and drops ones over 120 characters.
  - Under `listen`, the questions are kept but `suggested_step` is still null.
  - `handleFollowUp` with `asked` equal to one of the given reflection's `follow_up_questions` returns 200. The provider's user prompt contains `<asked>` and the fenced question before `<message>`.
  - `asked` equal to the last context turn's `output.follow_up_questions[1]` returns 200.
  - `asked` matching neither returns `400 { error: 'invalid' }`, and the provider is not called.
  - `asked` over 200 characters, or a non-string, returns 400.
  - `asked` with no `reflection_id` and no context returns 400.
  - `onlyKeys` accepts `asked`.
  - `reflectionText` includes the questions from `follow_up_questions` (falling back to `reflection_question` for old outputs).
- [ ] **Step 2: Run** `npx jest src/__tests__/ai-server.test.ts -t "asked"`. It should FAIL.
- [ ] **Step 3: Implement.**
  - Add `follow_up_questions` to the schema's `required` and `properties`.
  - Parse it as in A1, with a limit of 2.
  - Validate `asked` after loading the reflection and turns. It is allowed when it exactly equals (after trimming) an item in `reflection.output.follow_up_questions`, or in the output of the newest turn by `created_at`.
  - Add `asked?: string` to `followUpUserPrompt(entry, reflection, turns, message, asked?)`, which emits `<asked>\nKindway asked: ${fence(asked)}\n</asked>` before `<message>`.
  - Prompt field: `follow_up_questions: two short open questions Kindway could ask next to understand more, following the same rules as the reflection's questions. In Just listen, gentle ones only. Empty when the user says they want to stop.` Also add to "How to reply": "If <asked> is present, the user is answering that question."
- [ ] **Step 4: Run** the whole `ai-server.test.ts`. It should PASS.

### Task A3: App maps questions, and sends `asked`

**Files:**
- Modify: `src/data/types.ts`, `src/services/ai/remote.ts`, `src/state/actions.ts` (`useSendFollowUp`), `src/state/come-back.ts`
- Test: `src/__tests__/ai-remote.test.tsx`, `src/__tests__/come-back.test.ts`

**Interfaces:**
- Produces:
  - `Reflection.followUpQuestions?: string[]`
  - `ChatMessage.questions?: string[]`
  - `ChatMessage.asked?: true`, for a Kindway question posted from a chip. It is never sent as a user message and never counted as context.
  - `FollowUpAsk.asked?: string`
  - `useSendFollowUp()` returns `(entry, text, style, onDone, consentJustGiven?, asked?: string) => void`.

- [ ] **Step 1: Failing tests.**
  - `toReflection` maps `follow_up_questions` to `followUpQuestions` (trimmed, non-empty only). When `follow_up_questions` is present it does **not** also set `question`.
  - An old output with only `reflection_question` still maps to `question`, with no `followUpQuestions`.
  - `requestAiFollowUp` sends `asked` when given, and omits the key otherwise.
  - The reply's `output.follow_up_questions` maps to `message.questions`.
  - `come-back.test.ts`: the thread prompt uses `reflection.followUpQuestions[0]` when present, and otherwise the existing order.
- [ ] **Step 2: Run** both files. They should FAIL.
- [ ] **Step 3: Implement** the mapping.
  - In `useSendFollowUp`, pass `asked` through to `requestAiFollowUp`.
  - `contextIds` must skip `asked` messages: they have no `ai` record, so filter by `m.ai`. Keep it as is, but check this in the tests.
  - In `come-back.ts`, use `followUpQuestions?.[0]` first, still only for `source === 'ai'`.
- [ ] **Step 4: Run** both files, then `npx tsc --noEmit`. Both should PASS.

### Task A4: Question chips in the reflection and in the chat

**Files:**
- Modify: `src/components/reflection-view.tsx` (question area around lines 270–292), `src/app/entry/[id]/talk.tsx`
- Test: `src/__tests__/ai-follow-up.test.tsx` (extend), or new `src/__tests__/follow-up-questions.test.tsx`

**Interfaces:**
- Consumes: A3 types, and `useSendFollowUp(..., asked)`.
- Produces: the route param `/entry/[id]/talk?ask=<0|1|2>`. In talk, a `pendingAsk` state holds the question text until the user sends.

- [ ] **Step 1: Failing tests** (RNTL, async render per `kindway-ui-gotchas`):
  - An AI reflection with `followUpQuestions` renders a "Kindway wonders" heading and one button per question. There is no plain question line.
  - Pressing the second question navigates to `/entry/{id}/talk?ask=1`.
  - Simulated reflections show the plain `question` as before, with no chips.
  - Talk opened with `ask=1` shows that question as a Kindway bubble labelled "Kindway asked". The input is focused (`autoFocus`). Sending calls the send function with `asked` equal to the question text.
  - **Does not duplicate the asked question:** reopening with the same `ask` while the chat already ends with that asked bubble adds nothing.
  - The latest AI reply with `questions` renders chips. Pressing one appends an asked bubble. Older replies' questions are not rendered as chips.
  - The `topic` prefill still works.
- [ ] **Step 2: Run** the test file. It should FAIL.
- [ ] **Step 3: Implement.**
  - Chips use `Chip`/`ChipRow` from `src/components/chip.tsx`, with `accessibilityHint="Opens the conversation with this question"`.
  - In talk, posting an asked question dispatches `appendChat` with `{ id: 'q' + Date.now(), from: 'kindway', text, source: 'ai', asked: true }` and sets `pendingAsk = text`. `send()` passes `pendingAsk` as `asked`, then clears it.
  - A bubble with `asked` shows the label "Kindway asked" instead of "Written by AI".
  - Questions on simulated replies are never shown.
- [ ] **Step 4: Run** the test file, `npx tsc --noEmit` and `npx expo lint`. All should PASS.

### Task A5: Live eval cases for questions

**Files:**
- Modify: `src/__tests__/ai-eval.live.test.ts`, `docs/ai-evaluation.md`

- [ ] **Step 1:** Add cases following the existing R-case pattern. They are skipped unless the live env flags are set, as in the file today.
  - **Q1**, an ordinary entry: 2–3 questions, each ending in "?", none starting with "Why did you".
  - **Q2**, grief (reuse the R12 text): questions present, `possible_perspective` null.
  - **Q3**, a follow-up answering an `asked` question: the reply refers to the answer, and up to 2 new questions.
  - **Q4**, a safety-style entry: the safety route, no output.
- [ ] **Step 2:** Document Q1–Q4 in `docs/ai-evaluation.md`.
- [ ] **Step 3:** Run `npx jest src/__tests__/ai-eval.live.test.ts`. It should be skipped offline with no failures. Live runs need the owner's OK.

**Phase A gate:** full `npx jest`, `npx tsc --noEmit` and `npx expo lint` all green. Report to the controller, who deploys `generate-reflection` and `generate-follow-up` with the owner's OK.

---

## Phase B: The growing trail

### Task B1: Docs and welcome copy

**Files:**
- Modify: `PRODUCT.md`, `DESIGN.md`, `src/app/(onboarding)/welcome.tsx:42`
- Test: any test asserting the old welcome copy (find it with `grep -rn "no scores" src/__tests__`)

- [ ] **Step 1:** Update the test expectation to "No streaks to break, no pressure." and run it. It should FAIL.
- [ ] **Step 2:** Change the copy.
  - In `PRODUCT.md`, keep "No guilt mechanics", and add under it the spec's rule: *"Counts only go up with writing; nothing is ever lost, reset or shown in reminders, notifications or the widget. Missed days are just trail."*
  - In `DESIGN.md`, add a short "Trail growth" section: the lighting moment, milestone scenery, the count placement, and that it never vibrates beyond the existing paint tap.
- [ ] **Step 3:** Run the test. It should PASS.

### Task B2: Days-written count and milestone unlocks (logic and state)

**Files:**
- Create: `src/state/trail-progress.ts`
- Modify: `src/state/demo-store.tsx` (state, initial state, the saved-keys list, and the reducer)
- Test: `src/__tests__/trail-progress.test.ts`

**Interfaces:**
- Produces:
  - `export const MILESTONES = [7, 30, 50, 100, 200, 365] as const`
  - `export type Milestone = (typeof MILESTONES)[number]`
  - `export function daysWritten(entries: Entry[]): number`: distinct local `toDateString()` of `entry.date`, skipping `sample` and blank bodies.
  - `export function newUnlocks(count: number, unlocked: number[]): Milestone[]`: milestones ≤ count that are not yet unlocked, ascending.
  - `export const MILESTONE_COPY: Record<Milestone, { line: string; scenery: 'wildflowers' | 'fireflies' | 'bench' | 'autumn' | 'stars' | 'sunrise' }>`, with the exact spec lines.
  - `export const countLine = (n: number) => n === 1 ? '1 day on your way.' : \`${n} days on your way.\``
  - `DemoState.trailUnlocks: number[]` (initially `[]`, saved).
  - Reducer action `{ type: 'unlockTrail'; milestones: number[] }` (a union with no duplicates).
  - `DemoState.trailMoment?: { entryId: string; count: number; milestone?: Milestone }` (not saved).

- [ ] **Step 1: Failing tests.**
  - Two entries on the same day plus one on another day give 2.
  - A sample entry is not counted.
  - A back-dated entry counts on its own date.
  - `newUnlocks(31, [7])` is `[30]`, and `newUnlocks(6, [])` is `[]`.
  - `newUnlocks(8, [7, 30])` is `[]`: unlocks are permanent even when the count drops.
  - `countLine(1)` and `countLine(23)` give the exact strings.
  - The reducer `unlockTrail` merges without duplicates, and `trailUnlocks` survives the persistence round-trip (follow the existing persistence test pattern).
- [ ] **Step 2: Run** `npx jest src/__tests__/trail-progress.test.ts`. It should FAIL.
- [ ] **Step 3: Implement.**
  - In the `saveEntry` reducer branch only (new entries, not `updateEntry`), compute the count from the new entries list. Set `trailMoment = { entryId, count, milestone: newUnlocks(count, trailUnlocks)[last] }` and merge all new unlocks into `trailUnlocks`.
  - Sample-demo saves don't set it.
  - Add the reducer action `{ type: 'clearTrailMoment' }`.
- [ ] **Step 4: Run** it. It should PASS.

### Task B3: Sync trail unlocks

**Files:**
- Create: `supabase/migrations/20261116120000_profile_trail_unlocks.sql`, and add to `supabase/tests/database/rls.test.sql` (or a new `trail_unlocks.test.sql`)
- Modify: `src/services/cloud/records.ts` (`ProfileRow`, `toCloud`, `normalizeRows`, `applyCloud`, `mergeSnapshots`)
- Test: the existing cloud records test (`grep -rln "toCloud" src/__tests__`)

**Interfaces:**
- Produces: the profile column `trail_unlocks int[] not null default '{}'`, with a check that every value is in `(7,30,50,100,200,365)`. `ProfileRow.trail_unlocks: number[]`.

- [ ] **Step 1: Failing tests.**
  - `toCloud` emits sorted `trail_unlocks`.
  - `applyCloud` sets `trailUnlocks`.
  - `mergeSnapshots` unions local and cloud unlocks, never dropping one.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement** the migration (`alter table public.profiles add column …`, plus the constraint), the mapping, and pgTAP checks for the column default and the constraint. Bump the plan count.
- [ ] **Step 4: Run** the jest file. It should PASS. pgTAP needs Docker; if Docker isn't running, report it as not run, with the reason.

### Task B4: The lighting moment

**Files:**
- Create: `src/components/trail-moment.tsx`
- Modify: `src/app/entry/[id]/index.tsx` (overlay while the reflection is loading), `src/app/(tabs)/today.tsx` (overlay when there's no reflection)
- Test: `src/__tests__/trail-moment.test.tsx`

**Interfaces:**
- Consumes: `state.trailMoment`, `countLine`, `MILESTONE_COPY`, and `Blaze` from `src/components/trail.tsx` (with `paint`).
- Produces: `export function TrailMoment({ moment, onDone }: { moment: { entryId: string; count: number; milestone?: Milestone }; onDone: () => void })`.

- [ ] **Step 1: Failing tests.**
  - It renders "23 days on your way." for `{count: 23}`.
  - It renders the milestone line when `milestone: 30`.
  - Pressing anywhere (`accessibilityLabel="Skip"`) calls `onDone`.
  - It auto-dismisses after 1500 ms (2500 ms with a milestone) using jest fake timers.
  - Under reduced motion (mock `useReducedMotion` → true), there's no glow element (testID `trail-moment-glow` is absent), and it still dismisses.
  - On the entry screen, a `trailMoment` for this entry shows the overlay. When the reflection becomes `ready`, the overlay dismisses at once.
  - **No moment on edit or sync:** dispatching `updateEntry` or `applyCloud` doesn't set `trailMoment`.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement.**
  - Show the overlay only when `moment.entryId` matches the screen's entry (entry screen), or when the entry has no reflection request (Today).
  - `onDone` dispatches `clearTrailMoment`.
  - Animate with Reanimated `FadeIn`/`FadeOut` and a soft `color.lantern` glow (scale 0.9 → 1, opacity).
  - Use `accessibilityLiveRegion="polite"` on the line.
- [ ] **Step 4: Run** the test file, `tsc` and `lint`. All should PASS.

### Task B5: Scenery and the count on the trail card

**Files:**
- Create: `src/components/trail-scenery.tsx`
- Modify: `src/app/(tabs)/today.tsx` ("Your trail" card header)
- Test: `src/__tests__/trail-scenery.test.tsx`

**Interfaces:**
- Produces: `export function TrailScenery({ unlocks }: { unlocks: number[] })`. It renders one SVG layer per unlocked milestone, each with testID `scenery-<name>`, using theme colours, and renders nothing for `[]`.

- [ ] **Step 1: Failing tests.**
  - `[7, 30]` renders `scenery-wildflowers` and `scenery-fireflies` only.
  - `[]` renders null.
  - The Today trail card shows "23 days on your way" (no full stop on the card) when there are 23 days written. With no entries, the existing empty copy shows and no count.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement** small, quiet SVG motifs (react-native-svg), no more than about 48 px tall, in a strip above the trail stops. Work in dark mode via `useTheme().color`. Use the `frontend-design` / `expo-native-ui` skills for the look, and keep them subtle.
- [ ] **Step 4: Run** the tests, then the full `npx jest`, `tsc` and `lint`. All should PASS.

**Phase B gate:** all green. Phase B is app-only, apart from the B3 migration, which the controller pushes with the owner's OK.

---

## Phase C: Wise friend

### Task C1: Database for topics, links, kept words and topic talks

**Files:**
- Create: `supabase/migrations/20261116130000_topics_kept_words.sql`, `supabase/tests/database/topics_kept_words.test.sql`

**Interfaces (column names are used by C2 and C7):**
- `topics(user_id uuid default auth.uid() references auth.users on delete cascade, id text check len 1..100, name text check len 1..40, status text check in ('open','resolved') default 'open', created_at timestamptz default now(), resolved_at timestamptz null, what_helped text null check len ≤200, check_in_shown_at timestamptz null)`, primary key `(user_id, id)`.
- `topic_entries(user_id, topic_id text, entry_id text, created_at)`, primary key `(user_id, topic_id, entry_id)`, with foreign keys to `topics (user_id,id)` and `entries (user_id,id)`, both `on delete cascade`. Mirror how `entry_compass_links` references entries.
- `kept_words(user_id, id text, text text check len 1..1200, source_kind text check in ('reflection','follow_up','topic'), source_entry_id text null, source_topic_id text null, created_at)`, primary key `(user_id, id)`. Source ids are nullable plain text, so deleting the source keeps the words.
- `ai_topic_talks(id uuid default gen_random_uuid() pk, user_id, topic_id text, request_id uuid, created_at, style text, message text, output jsonb, schema_version, prompt_version, provider, model)`, mirroring `ai_follow_ups`. Its foreign key to `topics` is `on delete cascade`. It follows the **server-only** pattern from `20261029110000_ai_outputs_server_only.sql`: owners can select and delete, and there is no insert grant for `authenticated`.
- Extend the existing "delete all AI outputs" function (find it with `grep -n "delete from public.ai_follow_ups where user_id = auth.uid()" supabase/migrations`) so it also deletes `ai_topic_talks`. Do this with `create or replace` in this migration.
- RLS on all four tables: owner-only select, insert, update and delete as appropriate.

- [ ] **Step 1:** Write the pgTAP tests first:
  - Owner isolation for each table (another user sees 0 rows and can't insert for someone else).
  - Name length checks.
  - Status check.
  - Deleting an entry cascades its `topic_entries`.
  - Deleting a topic cascades its links and `ai_topic_talks`.
  - `authenticated` can't insert into `ai_topic_talks`.
  - The delete-all-outputs function clears `ai_topic_talks`.
- [ ] **Step 2:** Write the migration.
- [ ] **Step 3:** Run `npx supabase test db` if Docker is running. Otherwise report it as not run (as in earlier phases), and make sure `npx supabase db lint`, or at least SQL parse via `npx supabase db diff`, isn't required. Report honestly what was run.

### Task C2: Topics and kept words in app state, with sync

**Files:**
- Modify: `src/data/types.ts`, `src/state/demo-store.tsx`, `src/services/cloud/records.ts`, `src/services/cloud/repo.ts`
- Test: `src/__tests__/topics-state.test.ts` (new), and extend the cloud records test

**Interfaces:**
- Produces:
  - `type Topic = { id: string; name: string; status: 'open' | 'resolved'; createdAt: string; resolvedAt?: string; whatHelped?: string; entryIds: string[]; checkInShownAt?: string }`
  - `type KeptWord = { id: string; text: string; source: { kind: 'reflection' | 'follow_up'; entryId: string } | { kind: 'topic'; topicId: string }; createdAt: string }`
  - `DemoState.topics: Topic[]`, `DemoState.kept: KeptWord[]` (both saved), and `DemoState.dismissedCheckIns: string[]` (saved, device only, used in C6).
  - Ids: `` `p${Date.now()}` `` for topics and `` `k${Date.now()}` `` for kept words.
  - Reducer actions:
    - `{type:'addTopic'; topic: Topic}`
    - `{type:'updateTopic'; id; patch: Partial<Omit<Topic,'id'>>}`
    - `{type:'deleteTopic'; id}`
    - `{type:'linkTopic'; topicId; entryId}` and `{type:'unlinkTopic'; topicId; entryId}`
    - `{type:'resolveTopic'; id; whatHelped?: string}`: sets status, `resolvedAt`, and adds a `KeptWord` with `source {kind:'topic'}` when `whatHelped` is non-blank.
    - `{type:'reopenTopic'; id}`
    - `{type:'keep'; word: KeptWord}` and `{type:'unkeep'; id}`
    - `{type:'dismissCheckIn'; key: string}`
  - Deleting an entry (the existing delete action) removes its id from every `topic.entryIds`.
  - Helper: `export function openTopics(state): Topic[]`, in `src/state/topics.ts` (create it), sorted by the latest linked entry date, newest first.
  - Sync: `CloudSnapshot` gains `topics: Record<string, TopicRow>`, `topicLinks: Record<string, TopicLinkRow>` (keyed `topic|entry`) and `kept: Record<string, KeptRow>`. `TABLES` gains `topics: 'topics'`, `topicLinks: 'topic_entries'` and `kept: 'kept_words'`, in the existing pattern. Links are only emitted when both the topic and the entry are in the snapshot.

- [ ] **Step 1: Failing tests:**
  - Every reducer action.
  - The entry-delete cascade.
  - `resolveTopic` with "Walking every morning" adds a kept word.
  - `openTopics` ordering.
  - `toCloud`, `applyCloud` and `mergeSnapshots` round-trip for the three kinds.
  - A link to a sample or missing entry is not emitted.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement**, following the `tomorrow_actions`/`insight_feedback` handling in records.ts and repo.ts pull/push. Make sure the repo's delete path handles removed topics, links and kept words, using the same mechanism as removed entries.
- [ ] **Step 4: Run** the tests and `tsc`. Both should PASS.

### Task C3: Topics UI: list, topic page, resolve, and the Journal tab views

**Files:**
- Modify: `src/app/(tabs)/journal.tsx` (a segmented control "Entries | Topics | Kept"; the Kept view comes in C4, so render a placeholder only if needed and replace it in C4)
- Create: `src/components/topics-list.tsx`, `src/app/topic/[id].tsx`, `src/components/resolve-topic-dialog.tsx`
- Test: `src/__tests__/topics-ui.test.tsx`

**Interfaces:**
- Consumes: C2 actions and `openTopics`.
- Produces: the route `/topic/[id]`, and the "Talk about this" button, which pushes `/topic/[id]/talk` (C8). Until C8 lands, the button is hidden behind `false`; C8 enables it.

- [ ] **Step 1: Failing tests:**
  - Switching to Topics shows the open topics, and a collapsed "Resolved (n)" section.
  - "New topic" accepts a name of 1–40 characters, trimmed. Blank is disabled.
  - The topic page lists linked entries, newest first, and tapping one opens `/entry/{id}`.
  - Rename and Delete are in a menu. Delete asks for confirmation first.
  - Resolve opens a dialog showing "Chapter closed." and an optional "What helped?" field (at most 200 characters). Confirming dispatches `resolveTopic` with the text.
  - A resolved topic shows "Reopen".
  - Empty state copy: "Topics are the things you keep coming back to. Save one from an entry, or add it here." (default copy)
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement** with the existing `Segmented`, `Card`, `Dialog`, `Field` and `Button` components, and add the `topic/[id]` route.
- [ ] **Step 4: Run** the tests, `tsc` and `lint`. All should PASS.

### Task C4: Kept words: keep actions, the Kept view, and "Something that helped before"

**Files:**
- Create: `src/components/kept-list.tsx`, `src/components/keep-button.tsx`, `src/components/helped-before.tsx`
- Modify: `src/components/reflection-view.tsx` (keep button per AI section: acknowledge, clarify, perspective, nextStep, each idea), `src/app/entry/[id]/talk.tsx` (keep button on AI replies), `src/app/(tabs)/journal.tsx` (the Kept view)
- Test: `src/__tests__/kept-words.test.tsx`

**Interfaces:**
- Produces:
  - `KeepButton({ text, source })`: toggles keep or unkeep for the same text and source. `accessibilityLabel` is "Keep these words" or "Kept. Tap to remove".
  - `HELPED_BEFORE_FEELINGS = ['Overwhelmed', 'Worried', 'Tired', 'Lonely']`
  - `HelpedBefore({ entry })`: renders one random kept word when the entry has one of those feelings and `kept.length > 0`. The choice is stable per entry, so seed it by the entry id.

- [ ] **Step 1: Failing tests:**
  - Keeping an AI acknowledgement adds a `KeptWord` with `source {kind:'reflection', entryId}`. Pressing again removes it.
  - Simulated reflections show no keep button.
  - AI chat replies are keepable with `kind: 'follow_up'`.
  - The Kept view lists newest first. Tapping opens the source entry, or the topic for `kind: 'topic'`. "Remove" works.
  - `HelpedBefore` shows for an entry tagged "Tired" with kept words. It shows nothing when untagged or when there are no kept words. "See all" opens Journal's Kept view (route param `view=kept`).
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement.** Put `HelpedBefore` at the bottom of the reflection view (AI and simulated alike, since it shows the user's own saved words).
- [ ] **Step 4: Run** the tests, `tsc` and `lint`. All should PASS.

### Task C5: Reflection knows topics, suggests them, and returns check-ins (server, consent v4)

**Files:**
- Modify: `supabase/functions/_shared/reflection.ts`, `supabase/functions/_shared/ai-store.ts` (+ its supabase implementation), `supabase/functions/_shared/ai-consent.ts`, `src/services/ai/consent.ts`, `src/data/ai-disclosure.ts`, `public/privacy.html`, `src/app/settings/privacy.tsx` (if it lists the versions or what's sent)
- Test: `src/__tests__/ai-server.test.ts`, plus the consent sync test (`grep -rln "AI_CONSENT_TERMS" src/__tests__`)

**Interfaces:**
- Produces:
  - `AiStore.openTopics(): Promise<{ id: string; name: string }[]>`, read under RLS: `status='open'`, at most 12, newest first.
  - `ReflectionOutput` gains:
    - `topic_matches: string[]` (topic **ids**, mapped back from the labels `T1…T12` on the server)
    - `topic_suggestion: string | null` (at most 40 characters)
    - `check_ins: { question: string; on: string }[]` (at most 2; question at most 120 characters; `on` is `YYYY-MM-DD`, from the entry's local date to entry date + 60 days)
  - The prompt version is `reflection-p9`.
  - Consent: `entry_reflection: '4'` in both files.

- [ ] **Step 1: Failing tests:**
  - The user prompt contains `Entry date: 2026-11-16 (Monday)`, taken from `written_at` in UTC date, matching how `earlier` dates are shown.
  - The user prompt contains `<saved_topics>` with `T1: <fenced name>` lines only when `context_scope !== 'current'` and topics exist.
  - The parser maps `topic_matches: ['T2', 'T9']` (where only T1–T3 exist) to `[id of T2]`, and drops unknown labels.
  - `topic_suggestion` is trimmed, capped at 40 characters, and null when it case-insensitively equals an existing topic name.
  - `check_ins`: invalid date strings, dates before the entry date or more than 60 days after it, and over-long questions are dropped, and only 2 are kept.
  - Under `comfort_only`, check-ins are kept only if the model gave them (the prompt governs).
  - The safety route returns none of this.
  - The consent terms test passes with v4 in both files.
  - The disclosure test (if any) mentions saved topic names and the entry date.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement.** Prompt additions:

  > Saved topics are things the user chose to follow, listed in <saved_topics> as labels. topic_matches: the labels of saved topics this entry is clearly about, at most two, else empty. topic_suggestion: only when this entry and an earlier entry are plainly about the same ongoing subject that no saved topic covers, a short label of one to four words in the user's terms; else null. check_ins: things the entry says are coming up on a date you can work out from the entry date (an exam on Thursday, a talk next week), each as a short warm question Kindway can ask afterwards ("How did the exam go?") and the date it happens, at most two; else empty. Never for something sad the user didn't say is coming, never to monitor them.

  - Update `ai-disclosure.ts` and `privacy.html` so the reflection list includes "the names of your open topics" and "the entry's date".
  - Bump the disclosure copy version the way the file comments say. If the disclosure version string must change, change both consent files.
- [ ] **Step 4: Run** `ai-server.test.ts`, the consent tests and `tsc`. All should PASS.

### Task C6: The app shows topic suggestions, links and check-ins

**Files:**
- Modify: `src/data/types.ts` (`Reflection.topicMatches?: string[]`, `topicSuggestion?: string`, `checkIns?: { question: string; on: string }[]`), `src/services/ai/remote.ts`, `src/components/reflection-view.tsx`, `src/app/write.tsx` and `src/components/composer.tsx` (params `prompt` and `topic`), `src/app/(tabs)/today.tsx`
- Create: `src/state/check-ins.ts`, `src/components/friend-cards.tsx` (Ongoing, topic check-in, Checking in)
- Test: `src/__tests__/friend-cards.test.tsx`, `src/__tests__/check-ins.test.ts`

**Interfaces:**
- Produces:
  - `dueCheckIns(entries, dismissed: string[], now: Date): { key: string; entryId: string; question: string; on: string }[]`: an AI reflection's check-ins where `on` ≤ today ≤ `on` + 3 days, and the key `${entryId}:${index}` is not dismissed.
  - `quietTopics(topics, entries, now): Topic[]`: open topics with no linked entry in 14 days, and `checkInShownAt` either unset or older than 14 days.
  - `topicCheckInQuestion(name) = \`How are things with ${name} these days?\`` (default copy).
  - `/write?prompt=<text>&topic=<id>`: the composer shows the prompt above the text box. On save, the entry is linked to the topic.

- [ ] **Step 1: Failing tests:**
  - **Never before its `on` date.** `dueCheckIns` shows the card on the `on` date and 3 days after, and not before or after that.
  - Dismissed keys are hidden.
  - `quietTopics` cadence: a topic with no linked entry for 15 days is due. Once shown (`checkInShownAt` set today), it isn't shown again for 14 days.
  - Reflection-view: `topicSuggestion` shows "This keeps coming up: X. Save it as a topic?". Accepting adds the topic and links this entry. `topicMatches` for an open topic shows "This sounds like Y. Add it?", and accepting links the entry. Neither shows if already linked.
  - The "Also in this entry" chip gets a "Save topic" action.
  - Today shows up to 3 Ongoing topics, the Checking in cards and the topic check-in card. "Not now" dismisses (for a check-in, `dismissCheckIn`; for a topic, `updateTopic checkInShownAt=now`). Tapping opens `/write?prompt=…&topic=…`.
  - Saving from such a composer links the topic.
  - The entry detail screen gets a "Topics" row to link or unlink saved topics.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, `tsc` and `lint`. All should PASS.

### Task C7: Topic talk server (`generate-topic-talk`, consent cross_entry_analysis v3)

**Files:**
- Create: `supabase/functions/_shared/topic-talk.ts`, `supabase/functions/generate-topic-talk/index.ts`
- Modify: `supabase/functions/_shared/ai-store.ts` (+ implementation), `ai-config.ts` (a `topicTalk` block: `maxTokens 700`, `maxMessageChars 1500`, `maxTurns 3`, `maxEntries 8`, `maxEntryChars 600`, `days 90`, `cooldownSeconds 5`, `dailyLimit 60`, env-overridable like `followUp`), `ai-consent.ts` and `src/services/ai/consent.ts` (`cross_entry_analysis: '3'`), `src/data/ai-disclosure.ts`, `public/privacy.html`, `docs/supabase-setup.md`
- Test: `src/__tests__/ai-server.test.ts`

**Interfaces:**
- Request: `{ topic_id, message, style, idempotency_key, context_ids?: uuid[], asked?: string }`.
- Response: `{status:'ready', topic_talk: {id, topic_id, created_at, style, output:{schema_version:'topic-talk-1', reply, follow_up_questions[]}, provider, model}}`, or `{status:'safety'}`, or the existing error codes. 404 `topic_not_found`.
- **Rate limits reuse the `follow_up` request kind and the `config.topicTalk` limits.** This avoids changing the `ai_requests` kind check and the ledger functions. It deviates from the spec's own `topic_talk` kind; report this to the owner.
- Store: `topic(id): Promise<{id,name,status}|null>`, `topicEntries(topicId, since, limit): Promise<EntryRow[]>` (via `topic_entries`, RLS), `topicTalks(ids)`, `topicTalkForRequest(requestId)`, `saveTopicTalk(row)` (server key).
- Prompt `topic-talk-p1`, following follow-up.ts style rules. The user turn has `<topic>`, `<entries>` (date, tags, text capped at 600 characters, newest first, skipping `exclude_from_analysis` and `needsSafetyRoute` entries), `<conversation>`, an optional `<asked>` and `<message>`. "Talk about how this has gone across these entries; tentative about patterns; never claim to remember beyond them."

- [ ] **Step 1: Failing tests**, modelled on the `handleFollowUp` tests:
  - Consent `cross_entry_analysis` is required (403).
  - Unknown or another user's topic returns 404.
  - Entries kept out of analysis, or matching the safety route, aren't in the prompt.
  - At most 8 entries are sent, each capped at 600 characters.
  - `asked` is validated against the newest turn's questions (here there is no reflection).
  - Parse limits are as in A2.
  - Safety returns no save.
  - Duplicate idempotency returns the saved row.
  - The consent terms test passes with v3.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement**, mirroring `follow-up.ts`, `generate-follow-up/index.ts` and `serveAi`.
- [ ] **Step 4: Run** the tests and `tsc`. Both should PASS.

### Task C8: The app's "Talk about this" for topics

**Files:**
- Modify: `src/services/ai/remote.ts` (`Invoke` fn union gains `'generate-topic-talk'`; `requestAiTopicTalk(invoke, ask: { topicId; message; style; contextIds; asked? })`; the outputs repo `deleteTopicTalk(topicId)`), `src/state/demo-store.tsx` (`topicChats: Record<string, ChatMessage[]>`, saved, plus a `topicChat` append action), `src/state/actions.ts` (`useSendTopicTalk`, with the same shape as `useSendFollowUp` minus the reflection, and syncing linked entries first via `sync.ensureSynced`), `src/app/topic/[id].tsx` (enable the button)
- Create: `src/app/topic/[id]/talk.tsx`. Extract the shared chat UI from `entry/[id]/talk.tsx` into `src/components/chat-view.tsx` only if it can be done without behaviour change. Otherwise duplicate the minimal list and composer.
- Test: `src/__tests__/topic-talk.test.tsx`, `src/__tests__/ai-remote.test.tsx`

- [ ] **Step 1: Failing tests:**
  - The request body shape, and the mapping of the reply and its questions.
  - Without cross-entry consent, sending opens the existing AI review consent dialog (reuse the `ai-review-panel` consent pattern), and nothing is sent.
  - The header notice reads "Sent to GroqCloud with each message: your message, this topic's name, up to 8 linked entries from the last 90 days (date, tags, first 600 characters), and the last 3 AI replies here."
  - Question chips work as in A4.
  - "Clear" deletes locally and calls `deleteTopicTalk`.
  - Deleting the topic clears `topicChats[id]`.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then the full `npx jest`, `tsc` and `lint`. All should PASS.

### Task C9: Evals, docs and roadmap

**Files:**
- Modify: `src/__tests__/ai-eval.live.test.ts`, `docs/ai-evaluation.md`, `docs/roadmap.md` (add a "Wise friend" phase with a phone checklist: questions, moment, milestones, topics, check-ins, kept words, plus the out-of-scope roadmap items), `docs/supabase-setup.md` (new function, new env vars, migrations)

- [ ] **Step 1:** Add live cases:
  - **T1**, an entry about a saved topic: its label appears in `topic_matches`.
  - **T2**, a repeated subject across an earlier entry with no saved topic: `topic_suggestion` is non-null.
  - **C1**, "My exam is on Thursday" written on Monday 2026-11-16: a check-in on 2026-11-19.
  - **TT1**, a topic talk over 3 linked entries: the reply refers to the change over time and is tentative.
- [ ] **Step 2:** Update the docs.
- [ ] **Step 3:** Final verification. Run `npx tsc --noEmit`, `npx expo lint`, `npx jest` (all suites) and `npm run build:web`, and record pass counts. Then the controller does the browser check and asks the owner before deploying and pushing migrations.
