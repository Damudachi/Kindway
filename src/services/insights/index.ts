import type { DemoAi } from '@/data/types';

import { localInsightsReview } from './local-insights';
import { SAMPLE_REVIEW } from './sample-insights';
import type { InsightsService } from './types';

export type * from './types';
export { MIN_ENTRIES } from './local-insights';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * On-device summaries of the user's explicit tags and marks. Runs locally, so only the
 * "AI request fails" preview state applies; offline and rate limits don't.
 */
export function createLocalInsightsService({ simulate = 'ok', latencyMs = 500 }: { simulate?: DemoAi; latencyMs?: number } = {}): InsightsService {
  return {
    async review(req) {
      await wait(latencyMs);
      return simulate === 'fail' ? { status: 'error', error: 'failed' } : localInsightsReview(req);
    },
  };
}

/** The fictional fixture for the sample demo. Ignores the request's entries on purpose. */
export function createSampleInsightsService({ latencyMs = 500 }: { latencyMs?: number } = {}): InsightsService {
  return {
    async review(req) {
      await wait(latencyMs);
      const skip = new Set(req.excludeIds);
      const keep = <T extends { id: string }>(x: T) => !skip.has(x.id);
      const r = SAMPLE_REVIEW;
      return {
        status: 'ready',
        review: { ...r, themes: r.themes.filter(keep), patterns: r.patterns.filter(keep), strengths: r.strengths.filter(keep), concerns: r.concerns.filter(keep), actions: r.actions.filter(keep) },
      };
    },
  };
}

/** The automatic on-device review. The real AI review is separate and on request only (components/ai-review-panel.tsx). */
export function getInsightsService(simulate: DemoAi): InsightsService {
  return createLocalInsightsService({ simulate });
}
