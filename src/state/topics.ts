import type { Topic } from '@/data/types';
import type { DemoState } from '@/state/demo-store';

/** Open topics, the one with the newest linked entry first. Topics with no entries come last, newest created first. */
export function openTopics(state: Pick<DemoState, 'topics' | 'entries'>): Topic[] {
  const dates = new Map(state.entries.map((e) => [e.id, e.date]));
  const latest = (t: Topic) => t.entryIds.reduce((max, id) => ((dates.get(id) ?? '') > max ? dates.get(id)! : max), '');
  return state.topics
    .filter((t) => t.status === 'open')
    .map((t) => ({ t, latest: latest(t) }))
    .sort((a, b) => (a.latest && b.latest ? b.latest.localeCompare(a.latest) : a.latest ? -1 : b.latest ? 1 : b.t.createdAt.localeCompare(a.t.createdAt)))
    .map((x) => x.t);
}
