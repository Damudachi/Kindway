import { daysAgo, now } from '@/data/dates';
import { looksHighRisk } from '@/data/safety';
import type { Entry } from '@/data/types';

/**
 * Gentle reasons to come back, worked out on the device from entries the user already wrote.
 * No counting, no days missed, nothing sent anywhere. Entries that look high-risk, and the
 * sample demo's, are never brought back.
 */

const usable = (e: Entry) => !e.sample && !looksHighRisk(e.body);

/** How long ago, in plain words. */
const ago = (n: number) => (n === 1 ? 'yesterday' : `${n} days ago`);

/** Beyond this many days an entry is a look-back, not a thread to pick up. */
const THREAD_DAYS = 7;

export type Thread = {
  entryId: string;
  /** What the page starts with when the user taps it. */
  prompt: string;
  /** Where it came from, for the line under it. */
  from: string;
};

/**
 * One thread from the last week to pick up, or null. Nothing is offered once today has an entry.
 * Order: the question an AI reflection ended with (a simulated one is pre-written and says
 * nothing about the entry), a part of the entry the reflection set aside, then the title.
 */
export function threadFor(entries: Entry[], at = now()): Thread | null {
  if (entries.some((e) => daysAgo(e.date, at) === 0 && !e.sample)) return null;
  const latest = entries
    .filter((e) => {
      const n = daysAgo(e.date, at);
      return n >= 1 && n <= THREAD_DAYS && usable(e);
    })
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return null;
  const n = daysAgo(latest.date, at);
  const r = latest.reflection;
  const question = r?.source === 'ai' ? r.question?.trim() : undefined;
  const topic = r?.source === 'ai' ? r.otherTopics?.[0]?.trim() : undefined;
  const prompt = question || (topic ? `Last time you mentioned ${topic}. How is that sitting with you now?` : `You wrote “${latest.title}” ${ago(n)}. How is it sitting with you now?`);
  return { entryId: latest.id, prompt, from: `From “${latest.title}”, ${ago(n)}` };
}

/** How far back to look, longest first, and how many days either side still counts. */
const LOOK_BACKS = [
  { days: 365, slack: 3, label: 'A year ago' },
  { days: 91, slack: 3, label: 'Three months ago' },
  { days: 30, slack: 3, label: 'A month ago' },
  { days: 7, slack: 1, label: 'A week ago' },
] as const;

export type LookBack = { entry: Entry; label: string };

/**
 * An entry from about a week, a month, three months or a year ago, or null. The longest
 * look-back that has one wins, and the entry nearest the day (the newer on a tie), so the
 * answer is the same on every visit that day.
 */
export function lookBackFor(entries: Entry[], at = now()): LookBack | null {
  for (const { days, slack, label } of LOOK_BACKS) {
    const near = entries
      .filter((e) => usable(e) && Math.abs(daysAgo(e.date, at) - days) <= slack)
      .sort((a, b) => Math.abs(daysAgo(a.date, at) - days) - Math.abs(daysAgo(b.date, at) - days) || b.date.localeCompare(a.date))[0];
    if (near) return { entry: near, label };
  }
  return null;
}
