import type { ChallengeLevel, CompassValue, Entry, Reflection, SupportStyle } from '@/data/types';

/**
 * The boundary between the UI and AI. Today only a local mock implements it;
 * TODO(ai): an authenticated Supabase Edge Function client will implement the same interface.
 */
export interface AiService {
  reflect(req: ReflectionRequest): Promise<ReflectionResult>;
  weeklyReview(req: WeeklyRequest): Promise<WeeklyResult>;
}

export type AiError = 'failed' | 'rate' | 'offline';

/** The minimum an analysis needs from an entry. Titles, chats and reflections are never sent. */
export type EntryContext = Pick<Entry, 'id' | 'date' | 'body' | 'feelings' | 'gratitude'>;

export type ReflectionRequest = {
  entry: EntryContext;
  style: SupportStyle;
  challengeGently: boolean;
  challengeLevel: ChallengeLevel;
  /** Only values the user allowed reflections to reference; empty in "this entry only" mode. */
  compass: CompassValue[];
  /** Bounded set of earlier entries the user allows as context; empty in "this entry only" mode. */
  pastEntries: EntryContext[];
};

export type ReflectionResult = { ok: true; reflection: Reflection } | { ok: false; error: AiError };

export type WeeklyRequest = {
  /** Entries inside the review window that the user has not excluded from analysis. */
  entries: EntryContext[];
  compass: CompassValue[];
  from: string;
  to: string;
  /** Insights the user rejected or hid; never suggested again. */
  excludeIds: string[];
};

export type InsightKind = 'theme' | 'pattern' | 'strength' | 'concern';

export type Insight = {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  /** Entry ids the insight is drawn from. Every insight has at least one. */
  evidence: string[];
  /** A compass value this connects to, only when the user's own value relates to it. */
  compassValue?: string;
};

export type SuggestedAction = {
  id: string;
  text: string;
  why: string;
  evidence: string[];
  compassValue?: string;
};

export type WeeklyReview = {
  from: string;
  to: string;
  entryCount: number;
  themes: Insight[];
  patterns: Insight[];
  strengths: Insight[];
  concerns: Insight[];
  /** At most two, always optional. */
  actions: SuggestedAction[];
  simulated: true;
};

export type WeeklyResult =
  | { status: 'ready'; review: WeeklyReview }
  | { status: 'empty' }
  | { status: 'insufficient'; entryCount: number; needed: number }
  | { status: 'error'; error: AiError };
