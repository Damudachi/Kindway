import type { CompassValue } from '@/data/types';
import type { AiError, EntryContext } from '@/services/ai/types';

/**
 * Looking across entries. Two local implementations run automatically: factual summaries of what
 * the user explicitly tagged, and a fixture for the sample demo. Real AI reviews are separate and
 * only on request (services/ai/remote.ts), because they send entry text to a provider.
 */
export interface InsightsService {
  review(req: InsightsRequest): Promise<InsightsResult>;
}

export type InsightPeriod = 'week' | 'month' | 'all';

export type InsightsRequest = {
  period: InsightPeriod;
  /** Entries inside the period that the user has not excluded from analysis. */
  entries: EntryContext[];
  /** Compass values the user allows insights to consider; empty when they turned that off. */
  compass: CompassValue[];
  /** Insights the user rejected or hid; not offered again. */
  excludeIds: string[];
};

/**
 * Where an insight comes from. `sample` sources are fictional demo entries and never point
 * at the user's journal; `entry` sources are the user's own local entries.
 */
export type SourceRef = { kind: 'entry' | 'sample'; id: string; date: string };

export type InsightKind = 'theme' | 'pattern' | 'strength' | 'concern';

export type Insight = {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  sources: SourceRef[];
  compassValue?: string;
  /** AI reviews only: directly in what the user wrote or tagged, or a possible reading. */
  grounding?: 'observed' | 'interpretation';
};

export type SuggestedAction = {
  id: string;
  text: string;
  why: string;
  sources: SourceRef[];
};

export type InsightReview = {
  period: InsightPeriod;
  entryCount: number;
  themes: Insight[];
  patterns: Insight[];
  strengths: Insight[];
  concerns: Insight[];
  /** At most two, always optional. */
  actions: SuggestedAction[];
  /**
   * `tags`: counts of what the user explicitly tagged or marked. `sample-fixture`: fictional demo.
   * `ai`: written by the real AI service from the entries listed as sources.
   */
  basis: 'tags' | 'sample-fixture' | 'ai';
  /** AI reviews only: the overall conclusion across the entries. */
  summary?: string;
  /** AI reviews only: how things changed across the dates, with the entries that show it. */
  arc?: { text: string; sources: SourceRef[] };
  enoughEvidence?: boolean;
  ai?: { id: string; provider: string; model: string; createdAt: string };
};

export type InsightsResult =
  | { status: 'ready'; review: InsightReview }
  | { status: 'empty' }
  | { status: 'insufficient'; entryCount: number; needed: number }
  | { status: 'error'; error: AiError };
