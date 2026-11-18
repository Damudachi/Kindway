import { daysAgo } from '@/data/dates';
import type { Entry, Topic } from '@/data/types';

/** Days after its date that a "Checking in" card stays on offer. */
const WINDOW_DAYS = 3;
/** Quiet time before a topic check-in, and the gap before it can be shown again. */
const QUIET_DAYS = 14;

export type DueCheckIn = { key: string; entryId: string; question: string; on: string };

/** A local calendar date as YYYY-MM-DD. The server's `on` dates are local dates too. */
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** `day` (YYYY-MM-DD) moved forward by `n` calendar days. */
function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

/** Check-ins from AI reflections that are on offer today: from their date through three days after, until dismissed. */
export function dueCheckIns(entries: Entry[], dismissed: string[], now: Date): DueCheckIn[] {
  const today = localDay(now);
  return entries.flatMap((e) =>
    e.reflection?.source !== 'ai'
      ? []
      : (e.reflection.checkIns ?? []).flatMap((c, i) => {
          const key = `${e.id}:${i}`;
          const valid = /^\d{4}-\d{2}-\d{2}$/.test(c.on);
          return valid && c.on <= today && today <= addDays(c.on, WINDOW_DAYS) && !dismissed.includes(key) ? [{ key, entryId: e.id, question: c.question, on: c.on }] : [];
        }),
  );
}

export const topicCheckInQuestion = (name: string) => `How are things with ${name} these days?`;

/** Open topics with nothing written in 14 days, not asked about in the last 14. A topic with no entries counts from when it was saved. */
export function quietTopics(topics: Topic[], entries: Entry[], now: Date): Topic[] {
  const dates = new Map(entries.map((e) => [e.id, e.date]));
  return topics.filter((t) => {
    if (t.status !== 'open') return false;
    const latest = t.entryIds.reduce((max, id) => ((dates.get(id) ?? '') > max ? dates.get(id)! : max), '');
    if (daysAgo(latest || t.createdAt, now) < QUIET_DAYS) return false;
    return !t.checkInShownAt || daysAgo(t.checkInShownAt, now) >= QUIET_DAYS;
  });
}
