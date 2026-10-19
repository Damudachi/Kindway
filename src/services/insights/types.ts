import type { CompassValue } from '@/data/types';
import type { AiError, EntryContext } from '@/services/ai/types';

/**
 * Looking across entries. Today two local implementations exist: factual summaries of what the
 * user explicitly tagged, and a fixture for the sample demo.
 * TODO(ai): a server-side implementation may add real analysis behind this same interface.
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
  /** `tags`: counts of what the user explicitly tagged or marked. `sample-fixture`: fictional demo. */
  basis: 'tags' | 'sample-fixture';
};

export type InsightsResult =
  | { status: 'ready'; review: InsightReview }
  | { status: 'empty' }
  | { status: 'insufficient'; entryCount: number; needed: number }
  | { status: 'error'; error: AiError };
