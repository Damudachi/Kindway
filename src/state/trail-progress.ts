import type { Entry } from '@/data/types';

/** Days written at which the trail gains scenery. */
export const MILESTONES = [7, 30, 50, 100, 200, 365] as const;
export type Milestone = (typeof MILESTONES)[number];

export const MILESTONE_COPY: Record<Milestone, { line: string; scenery: 'wildflowers' | 'fireflies' | 'bench' | 'autumn' | 'stars' | 'sunrise' }> = {
  7: { line: 'A week of days on your way. Wildflowers are coming up along the trail.', scenery: 'wildflowers' },
  30: { line: 'Thirty days on your way. The fireflies found your trail.', scenery: 'fireflies' },
  50: { line: "Fifty days. There's a bench here now, for resting.", scenery: 'bench' },
  100: { line: 'A hundred days on your way. The trees have turned gold.', scenery: 'autumn' },
  200: { line: 'Two hundred days. The sky over your trail is full of stars.', scenery: 'stars' },
  365: { line: 'A year of days on your way. Sunrise.', scenery: 'sunrise' },
};

export const countLine = (n: number) => (n === 1 ? '1 day on your way.' : `${n} days on your way.`);

/** Distinct local calendar days with at least one real entry. */
export function daysWritten(entries: Entry[]): number {
  const days = new Set<string>();
  for (const e of entries) {
    if (e.sample || !e.body.trim()) continue;
    days.add(new Date(e.date).toDateString());
  }
  return days.size;
}

/** Milestones reached by `count` that aren't unlocked yet, ascending. Unlocks are permanent. */
export function newUnlocks(count: number, unlocked: number[]): Milestone[] {
  return MILESTONES.filter((m) => m <= count && !unlocked.includes(m));
}
