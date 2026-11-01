const DAY = 24 * 60 * 60 * 1000;

/** The device clock. Every date helper takes `now` so tests can pin it. */
export function now() {
  return new Date();
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysAgo(iso: string, at = now()) {
  return Math.round((startOfDay(at).getTime() - startOfDay(new Date(iso)).getTime()) / DAY);
}

/** Local midnight `n` days after `at`, as ISO. Used for Tomorrow Bridge due dates. */
export function dayIso(n: number, at = now()) {
  return new Date(startOfDay(at).getTime() + n * DAY).toISOString();
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function relativeDay(iso: string, at = now()) {
  const n = daysAgo(iso, at);
  if (n === 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n === -1) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function longDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function partOfDay(d = now()) {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/** The seven days ending today, oldest first. */
export function weekDays(at = now()) {
  const end = startOfDay(at);
  return Array.from({ length: 7 }, (_, i) => new Date(end.getTime() - (6 - i) * DAY));
}

export function sameDay(a: Date, iso: string) {
  return startOfDay(a).getTime() === startOfDay(new Date(iso)).getTime();
}

/** `iso`'s local time of day moved onto `day`; a time that would fall after `at` becomes `at`. */
export function onDay(iso: string, day: Date, at = now()) {
  const t = new Date(iso);
  const moved = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds());
  return (moved > at ? at : moved).toISOString();
}

export function nowIso() {
  return now().toISOString();
}
