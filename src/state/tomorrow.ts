import { dayIso, daysAgo, now } from '@/data/dates';
import type { TomorrowStep } from '@/data/types';

/**
 * Tomorrow Bridge transitions. Plain functions over local dates; no notifications are scheduled.
 * None of them record misses or count anything.
 */
export function newStep(text: string, source?: TomorrowStep['source'], at = now()): TomorrowStep {
  return { text: text.trim(), savedOn: at.toISOString(), dueOn: dayIso(1, at), status: 'open', source };
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
