import { shortDate } from '@/data/dates';
import type { EntryContext } from '@/services/ai/types';

import type { Insight, InsightsRequest, InsightsResult, SourceRef, SuggestedAction } from './types';

/**
 * Product assumption, not a validated threshold: below this many entries in a period,
 * there isn't enough material for a useful review. Tune with real user feedback.
 */
export const MIN_ENTRIES = 3;
/** A count only becomes a theme or pattern when it repeats at least this often. */
const MIN_REPEAT = 2;

const POSITIVE = ['Calm', 'Hopeful', 'Grateful', 'Proud'];

const ref = (e: EntryContext): SourceRef => ({ kind: 'entry', id: e.id, date: e.date });
const entriesWord = (n: number) => (n === 1 ? 'entry' : 'entries');

/**
 * Factual summary of the user's own explicit data: feeling tags, compass links, gratitude notes
 * and "come back to this" marks. It never reads or interprets the free text of an entry.
 */
export function localInsightsReview(req: InsightsRequest): InsightsResult {
  const entries = [...req.entries].sort((a, b) => a.date.localeCompare(b.date));
  if (entries.length === 0) return { status: 'empty' };
  if (entries.length < MIN_ENTRIES) return { status: 'insufficient', entryCount: entries.length, needed: MIN_ENTRIES };

  const total = entries.length;
  const skip = new Set(req.excludeIds);
  const keep = <T extends { id: string }>(x: T) => !skip.has(x.id);
  const withTag = (f: string) => entries.filter((e) => e.feelings.includes(f));
  const tags = [...new Set(entries.flatMap((e) => e.feelings))]
    .map((f) => ({ f, hits: withTag(f) }))
    .sort((a, b) => b.hits.length - a.hits.length || a.f.localeCompare(b.f));

  const tagThemes: Insight[] = tags
    .filter((t) => !POSITIVE.includes(t.f) && t.hits.length >= MIN_REPEAT)
    .map(({ f, hits }) => ({
      id: `tag:${f}`,
      kind: 'theme',
      title: `You tagged “${f}” in ${hits.length} of ${total} entries`,
      body: 'Counted from the feelings you chose to tag, not from your writing. Does this match how this stretch felt?',
      sources: hits.map(ref),
    }));

  const compassThemes: Insight[] = req.compass.flatMap((c) => {
    const hits = entries.filter((e) => e.compassIds?.includes(c.id));
    if (hits.length < MIN_REPEAT) return [];
    return [
      {
        id: `compass:${c.id}`,
        kind: 'theme' as const,
        title: `You connected ${hits.length} entries to “${c.area}”`,
        body: 'From the compass links you added while writing.',
        sources: hits.map(ref),
        compassValue: c.area,
      },
    ];
  });

  const patterns: Insight[] = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const [a, b] = [tags[i].f, tags[j].f].sort();
      const both = entries.filter((e) => e.feelings.includes(a) && e.feelings.includes(b));
      if (both.length >= MIN_REPEAT) {
        patterns.push({
          id: `pair:${a}+${b}`,
          kind: 'pattern',
          title: `One possible pattern: “${a}” and “${b}” often came together`,
          body: `You tagged both in ${both.length} entries. A possible link, not a rule. Does this fit your experience?`,
          sources: both.map(ref),
        });
      }
    }
  }

  const grateful = entries.filter((e) => e.gratitude);
  const strengths: Insight[] = [
    ...tags
      .filter((t) => POSITIVE.includes(t.f))
      .map(({ f, hits }) => ({
        id: `positive:${f}`,
        kind: 'strength' as const,
        title: hits.length === 1 ? `You tagged “${f}” once` : `You tagged “${f}” in ${hits.length} entries`,
        body: 'Worth recognising, alongside everything else.',
        sources: hits.map(ref),
      })),
    ...(grateful.length > 0
      ? [
          {
            id: 'gratitude',
            kind: 'strength' as const,
            title: `You noted a good thing in ${grateful.length} ${entriesWord(grateful.length)}`,
            body: 'Small things count.',
            sources: grateful.map(ref),
          },
        ]
      : []),
  ];

  const concerns: Insight[] = entries
    .filter((e) => e.revisit)
    .reverse()
    .map((e) => ({
      id: `revisit:${e.id}`,
      kind: 'concern',
      title: `An entry you marked to come back to, from ${shortDate(e.date)}`,
      body: 'You chose to revisit this. Leaving it for now is fine too.',
      sources: [ref(e)],
    }));

  const themes = [...tagThemes, ...compassThemes].filter(keep);
  const openConcerns = concerns.filter(keep);

  // General, optional suggestions tied to a count above. Never more than two.
  const actions: SuggestedAction[] = [
    ...openConcerns.slice(0, 1).map((c) => ({
      id: 'action:revisit',
      text: 'If you have a quiet moment, reread the entry you marked and notice whether it still feels the same.',
      why: 'You marked it to come back to.',
      sources: c.sources,
    })),
    ...tagThemes.filter(keep).slice(0, 1).map((t) => {
      const f = t.id.slice('tag:'.length);
      return {
        id: `action:${t.id}`,
        text: `Next time you tag “${f}”, you could add one line about what came just before. Only if that feels useful.`,
        why: `“${f}” came up in ${t.sources.length} entries.`,
        sources: t.sources,
      };
    }),
    ...compassThemes.filter(keep).slice(0, 1).map((t) => ({
      id: `action:${t.id}`,
      text: `If it still matters to you, choose one small thing this week for “${t.compassValue}”.`,
      why: `You connected ${t.sources.length} entries to it.`,
      sources: t.sources,
    })),
  ]
    .filter(keep)
    .slice(0, 2);

  return {
    status: 'ready',
    review: {
      period: req.period,
      entryCount: total,
      themes,
      patterns: patterns.filter(keep).slice(0, 3),
      strengths: strengths.filter(keep),
      concerns: openConcerns,
      actions,
      basis: 'tags',
    },
  };
}
