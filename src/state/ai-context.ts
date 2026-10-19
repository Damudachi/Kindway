import { DEMO_NOW, daysAgo, weekDays } from '@/data/dates';
import type { Entry, SupportStyle } from '@/data/types';
import type { EntryContext, ReflectionRequest, WeeklyRequest } from '@/services/ai';
import type { DemoState } from '@/state/demo-store';

/** How far back a daily reflection may look, and how many earlier entries it may receive. */
const PAST_DAYS = 14;
const PAST_LIMIT = 10;

const toContext = ({ id, date, body, feelings, gratitude }: Entry): EntryContext => ({ id, date, body, feelings, gratitude });

/**
 * The user's privacy choices are applied here, before anything reaches an AI service,
 * so a real backend receives exactly what the settings promise and nothing more.
 */
export function reflectionRequest(state: DemoState, entry: Entry, style: SupportStyle, entries: Entry[]): ReflectionRequest {
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
  };
}

/** Entries a weekly review may read: this week's, minus any the user kept out of analysis. */
export function weeklyEntries(entries: Entry[], now = DEMO_NOW) {
  return entries.filter((e) => !e.excludeFromAnalysis && daysAgo(e.date, now) >= 0 && daysAgo(e.date, now) < 7);
}

export function weeklyRequest(state: DemoState, entries: Entry[]): WeeklyRequest {
  const days = weekDays();
  return {
    entries: weeklyEntries(entries).map(toContext),
    compass: state.insightsUseCompass ? state.compass.filter((c) => c.aiMayReference) : [],
    from: days[0].toISOString(),
    to: days[6].toISOString(),
    excludeIds: Object.entries(state.insightFeedback)
      .filter(([, fb]) => fb === 'not' || fb === 'hidden')
      .map(([id]) => id),
  };
}
