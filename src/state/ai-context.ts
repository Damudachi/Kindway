import { daysAgo, now } from '@/data/dates';
import type { Entry, SupportStyle } from '@/data/types';
import type { EntryContext, ReflectionRequest } from '@/services/ai';
import type { InsightPeriod, InsightsRequest } from '@/services/insights';
import type { DemoState } from '@/state/demo-store';

/** How far back a daily reflection may look, and how many earlier entries it may receive. */
const PAST_DAYS = 14;
const PAST_LIMIT = 10;

const PERIOD_DAYS: Record<InsightPeriod, number> = { week: 7, month: 30, all: Infinity };

export const toContext = ({ id, date, body, feelings, gratitude, compassIds, revisit }: Entry): EntryContext => ({
  id,
  date,
  body,
  feelings,
  gratitude,
  compassIds,
  revisit,
});

/**
 * The user's privacy choices are applied here, before anything reaches a service,
 * so a future backend receives exactly what the settings promise and nothing more.
 */
export function reflectionRequest(state: DemoState, entry: Entry, style: SupportStyle, entries: Entry[], variant = 0): ReflectionRequest {
  const currentOnly = state.contextScope === 'current';
  return {
    entry: toContext(entry),
    style,
    challengeGently: state.challengeGently,
    challengeLevel: state.challengeLevel,
    compass: currentOnly ? [] : state.compass.filter((c) => c.aiMayReference),
    pastEntries: currentOnly
      ? []
      : entries
          .filter((e) => e.id !== entry.id && !e.excludeFromAnalysis && daysAgo(e.date) <= PAST_DAYS)
          .slice(0, PAST_LIMIT)
          .map(toContext),
    variant,
  };
}

/** All entries written within the period, including ones kept out of analysis. */
export function entriesInPeriod(entries: Entry[], period: InsightPeriod, at = now()) {
  return entries.filter((e) => {
    const n = daysAgo(e.date, at);
    return n >= 0 && n < PERIOD_DAYS[period];
  });
}

/** Entries an insight review may read: the period's entries, minus any the user kept out. */
export function analysableEntries(entries: Entry[], period: InsightPeriod, at = now()) {
  return entriesInPeriod(entries, period, at).filter((e) => !e.excludeFromAnalysis);
}

export function insightsRequest(state: DemoState, entries: Entry[], period: InsightPeriod, at = now()): InsightsRequest {
  return {
    period,
    entries: analysableEntries(entries, period, at).map(toContext),
    compass: state.insightsUseCompass ? state.compass.filter((c) => c.aiMayReference) : [],
    excludeIds: Object.entries(state.insightFeedback)
      .filter(([, fb]) => fb === 'not' || fb === 'hidden')
      .map(([id]) => id),
  };
}
