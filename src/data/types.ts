export type SupportStyle = 'listen' | 'understand' | 'honest' | 'forward' | 'ask';
export type ChallengeLevel = 'gentle' | 'balanced' | 'direct';
export type ContextScope = 'relevant' | 'current';
export type AiConsent = 'unset' | 'ai' | 'journal-only';
export type InsightFeedback = 'fits' | 'partly' | 'not' | 'hidden';

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
  /** A compass value, only when it relates to this entry; the user can mark it not relevant. */
  longGame?: { value: string; text: string };
  /** Earlier entries the reflection drew on, by id, so the user can check them. */
  related?: string[];
  /** An optional practical next step. */
  nextStep?: string;
  /** An optional reflection question. */
  question?: string;
  /** Entry text the reflection was written for, to flag edits made afterwards. */
  basedOn: string;
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
  sample: boolean;
  /** Kept out of weekly insights and out of the context for other entries' reflections. */
  excludeFromAnalysis?: boolean;
};

export type CompassValue = {
  id: string;
  area: string;
  note: string;
  aiMayReference: boolean;
};

export type Memory = { id: string; text: string; source: string };

export type TomorrowStep = {
  text: string;
  savedOn: string;
  status: 'open' | 'helped' | 'not-really' | 'changed' | 'later';
};

export type Draft = {
  text: string;
  feelings: string[];
  gratitude: string;
  /** Support style for this entry only; falls back to the default. */
  style?: SupportStyle;
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
