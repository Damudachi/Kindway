import { SAMPLE_ENTRIES } from '@/data/sample';

import type { InsightReview, SourceRef } from './types';

const src = (...ids: string[]): SourceRef[] =>
  ids.map((id) => {
    const e = SAMPLE_ENTRIES.find((x) => x.id === id);
    if (!e) throw new Error(`Unknown sample entry ${id}`);
    return { kind: 'sample', id, date: e.date };
  });

/**
 * Hand-written fixture for the "Preview sample insights" demo. It describes the fictional sample
 * entries only, shows how a future AI review could read, and is never applied to real entries.
 * Ids are prefixed `sample:` so feedback on them stays separate from the user's own insights.
 */
export const SAMPLE_REVIEW: InsightReview = {
  period: 'week',
  entryCount: SAMPLE_ENTRIES.length,
  basis: 'sample-fixture',
  themes: [
    {
      id: 'sample:theme:comparison',
      kind: 'theme',
      title: 'Comparing progress with others',
      body: 'In three of these entries, seeing other people’s progress seemed to make the writer’s own feel smaller.',
      sources: src('e1', 'e3', 'e4'),
    },
  ],
  patterns: [
    {
      id: 'sample:pattern:comparison-worry',
      kind: 'pattern',
      title: 'One possible pattern: comparing came with worry',
      body: 'When comparison came up, “Worried” was often tagged too. A possible link, not a rule.',
      sources: src('e1', 'e3'),
    },
  ],
  strengths: [
    {
      id: 'sample:strength:learning',
      kind: 'strength',
      title: 'Coming back to learning',
      body: 'Even on discouraging days, the writer wrote about wanting to understand what happened and improve.',
      sources: src('e2', 'e3'),
      compassValue: 'Growth & learning',
    },
  ],
  concerns: [
    {
      id: 'sample:concern:slowing-down',
      kind: 'concern',
      title: '“If I slow down, I’ll fall behind.”',
      body: 'This may still be open. It doesn’t have to be solved.',
      sources: src('e4'),
    },
  ],
  actions: [
    {
      id: 'sample:action:compare-self',
      text: 'Once this week, compare something you made with your own work from a month ago.',
      why: 'Comparison came up in three entries, and learning matters to this writer.',
      sources: src('e1', 'e3', 'e4'),
    },
  ],
};
