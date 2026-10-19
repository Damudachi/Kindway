export type SupportStyle = 'listen' | 'understand' | 'honest' | 'forward' | 'ask';
export type ChallengeLevel = 'gentle' | 'balanced' | 'direct';
export type ContextScope = 'relevant' | 'current';
export type AiConsent = 'unset' | 'ai' | 'journal-only';
export type InsightFeedback = 'fits' | 'partly' | 'not' | 'hidden';
/** How the user said a daily reflection landed. Stored on the reflection and shown back to them. */
export type ReflectionFeedback = 'fits' | 'not-quite';

/** Demo switches that let reviewers see states the real backend would produce. */
export type DemoAi = 'ok' | 'fail' | 'rate' | 'offline';

/** A daily reflection. Only `acknowledge` is always present; every other part depends on the support style. */
export type Reflection = {
  style: SupportStyle;
  acknowledge: string;
  /** Facts vs. conclusions. A gentle challenge, so only when the style or settings invite one. */
  clarify?: string;
  /** A possible alternative perspective. */
  perspective?: string;
  /** A compass value the user linked to this entry; they can mark it not relevant. */
  longGame?: { value: string; text: string };
  /** Earlier entries with a feeling tag in common, by id, so the user can check them. */
  related?: string[];
  /** An optional practical next step. */
  nextStep?: string;
  /** An optional reflection question. */
  question?: string;
  /** Entry text the reflection was written for, to flag edits made afterwards. */
  basedOn: string;
  /** Which pre-written perspective was used; "Try another perspective" moves to the next. */
  variant?: number;
  feedback?: ReflectionFeedback;
};

export type Entry = {
  id: string;
  /** ISO date-time. */
  date: string;
  title: string;
  body: string;
  feelings: string[];
  gratitude?: string;
  reflection?: Reflection;
  reflectionStatus: 'none' | 'loading' | 'ready' | 'failed' | 'rate' | 'offline';
  /** True only for fictional entries in the sample-insights demo. Never stored with real entries. */
  sample: boolean;
  /** Kept out of insight reviews and out of the context for other entries' reflections. */
  excludeFromAnalysis?: boolean;
  /** Compass values the user chose to connect this entry to. */
  compassIds?: string[];
  /** The user marked this to come back to; listed under "Still open" in Patterns. */
  revisit?: boolean;
};

export type CompassValue = {
  id: string;
  area: string;
  note: string;
  aiMayReference: boolean;
};

export type Memory = { id: string; text: string; source: string };

/** Tomorrow Bridge: one optional small step. Dismissing or postponing it carries no penalty. */
export type TomorrowStep = {
  text: string;
  savedOn: string;
  /** Local midnight of the day the step is meant for. */
  dueOn: string;
  status: 'open' | 'done' | 'dismissed';
  doneOn?: string;
  /** Optional answer to "Did it help?" after marking it done. */
  outcome?: 'helped' | 'not-really';
  /** Where the step came from, for display only. */
  source?: { kind: 'reflection'; entryId: string } | { kind: 'insights' };
};

export type Draft = {
  text: string;
  feelings: string[];
  gratitude: string;
  /** Support style for this entry only; falls back to the default. */
  style?: SupportStyle;
  /** Optional compass values this entry connects to. */
  compassIds: string[];
  /** When set, the composer edits this entry instead of creating one. */
  editingId?: string;
};

export type ChatMessage = { id: string; from: 'me' | 'kindway'; text: string };

export type Reminders = {
  enabled: boolean;
  permission: 'unasked' | 'granted' | 'denied';
  time: string;
  days: boolean[];
  pausedUntil?: string;
  /** Optional weekly nudge to look back on the week. */
  weekly: boolean;
  /** 0 = Monday … 6 = Sunday. */
  weeklyDay: number;
};
