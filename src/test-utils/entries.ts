import type { Entry } from '@/data/types';

const DAY = 24 * 60 * 60 * 1000;

/** A real (non-sample) entry written `daysBack` days before `now`, at 9pm. */
export function entry(id: string, daysBack: number, patch: Partial<Entry> = {}, now = new Date()): Entry {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0);
  return {
    id,
    date: new Date(d.getTime() - daysBack * DAY).toISOString(),
    title: `Entry ${id}`,
    body: `Some words for ${id}.`,
    feelings: [],
    reflectionStatus: 'none',
    sample: false,
    ...patch,
  };
}
