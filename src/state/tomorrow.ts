import { dayIso, daysAgo, now } from '@/data/dates';
import type { TomorrowStep } from '@/data/types';

/**
 * Tomorrow Bridge transitions. Plain functions over local dates; no notifications are scheduled.
 * None of them record misses or count anything.
 */
export function newStep(text: string, source?: TomorrowStep['source'], at = now()): TomorrowStep {
  return { text: text.trim(), savedOn: at.toISOString(), dueOn: dayIso(1, at), status: 'open', source };
}

/** A step is one short line; the Tomorrow Bridge field holds at most this many characters. */
export const STEP_MAX = 120;

/**
 * A suggested step as it would go into the field: whole if it fits, otherwise cut at a word
 * boundary and marked, so the user sees it was shortened before they save it.
 */
export function fitStep(text: string): { text: string; shortened: boolean } {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= STEP_MAX) return { text: t, shortened: false };
  const cut = t.slice(0, STEP_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return { text: `${(space > STEP_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`, shortened: true };
}

export const markDone = (s: TomorrowStep, at = now()): TomorrowStep => ({ ...s, status: 'done', doneOn: at.toISOString() });
export const postpone = (s: TomorrowStep, at = now()): TomorrowStep => ({ ...s, dueOn: dayIso(1, at), status: 'open' });
export const editText = (s: TomorrowStep, text: string): TomorrowStep => ({ ...s, text: text.trim() });
export const setOutcome = (s: TomorrowStep, outcome: TomorrowStep['outcome']): TomorrowStep => ({ ...s, outcome });

export type StepView = 'upcoming' | 'due' | 'done' | 'hidden';

/** How the step should appear on Today. Done steps stay visible for the day they were finished. */
export function stepView(s: TomorrowStep | null, at = now()): StepView {
  if (!s || s.status === 'dismissed') return 'hidden';
  if (s.status === 'done') return s.doneOn && daysAgo(s.doneOn, at) === 0 ? 'done' : 'hidden';
  return daysAgo(s.dueOn, at) >= 0 ? 'due' : 'upcoming';
}
