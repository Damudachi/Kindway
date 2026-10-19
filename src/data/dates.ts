// The demo is pinned to one fictional evening so sample data reads consistently.
export const DEMO_NOW = new Date('2026-10-17T21:15:00');

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysAgo(iso: string, now = DEMO_NOW) {
  return Math.round((startOfDay(now).getTime() - startOfDay(new Date(iso)).getTime()) / DAY);
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function relativeDay(iso: string, now = DEMO_NOW) {
  const n = daysAgo(iso, now);
  if (n === 0) return 'Today';
  if (n === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function longDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function partOfDay(d = DEMO_NOW) {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/** The seven days ending today, oldest first. */
export function weekDays(now = DEMO_NOW) {
  const end = startOfDay(now);
  return Array.from({ length: 7 }, (_, i) => new Date(end.getTime() - (6 - i) * DAY));
}

export function sameDay(a: Date, iso: string) {
  return startOfDay(a).getTime() === startOfDay(new Date(iso)).getTime();
}

export function nowIso() {
  // Pinned to the demo evening so new entries land on "today" next to the sample data.
  return DEMO_NOW.toISOString();
}
