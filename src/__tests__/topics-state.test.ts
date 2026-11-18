import type { KeptWord, Topic } from '@/data/types';
import { initialState, reducer, toSnapshot, fromSnapshot, type DemoState } from '@/state/demo-store';
import { openTopics } from '@/state/topics';
import { entry } from '@/test-utils/entries';

const topic = (id: string, patch: Partial<Topic> = {}): Topic => ({ id, name: `Topic ${id}`, status: 'open', createdAt: '2026-11-01T09:00:00.000Z', entryIds: [], ...patch });
const base = (patch: Partial<DemoState> = {}): DemoState => ({ ...initialState, entries: [entry('a', 3), entry('b', 2), entry('c', 1)], ...patch });

describe('topics in app state', () => {
  it('starts with none, and keeps them in the saved snapshot', () => {
    expect(initialState.topics).toEqual([]);
    expect(initialState.kept).toEqual([]);
    expect(initialState.dismissedCheckIns).toEqual([]);
    const s = base({ topics: [topic('p1')], kept: [], dismissedCheckIns: ['p1:x'] });
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(back.topics).toEqual(s.topics);
    expect(back.dismissedCheckIns).toEqual(['p1:x']);
  });

  it('addTopic, updateTopic and deleteTopic', () => {
    let s = reducer(base(), { type: 'addTopic', topic: topic('p1') });
    expect(s.topics.map((t) => t.id)).toEqual(['p1']);
    s = reducer(s, { type: 'updateTopic', id: 'p1', patch: { name: 'Work' } });
    expect(s.topics[0].name).toBe('Work');
    s = reducer(s, { type: 'deleteTopic', id: 'p1' });
    expect(s.topics).toEqual([]);
  });

  it('linkTopic adds an entry once and unlinkTopic removes it', () => {
    let s = base({ topics: [topic('p1')] });
    s = reducer(s, { type: 'linkTopic', topicId: 'p1', entryId: 'a' });
    s = reducer(s, { type: 'linkTopic', topicId: 'p1', entryId: 'a' });
    expect(s.topics[0].entryIds).toEqual(['a']);
    s = reducer(s, { type: 'unlinkTopic', topicId: 'p1', entryId: 'a' });
    expect(s.topics[0].entryIds).toEqual([]);
  });

  it('linkTopic ignores an entry that does not exist', () => {
    const s = reducer(base({ topics: [topic('p1')] }), { type: 'linkTopic', topicId: 'p1', entryId: 'nope' });
    expect(s.topics[0].entryIds).toEqual([]);
  });

  it('resolveTopic with what helped keeps those words', () => {
    const s = reducer(base({ topics: [topic('p1')] }), { type: 'resolveTopic', id: 'p1', whatHelped: 'Walking every morning' });
    expect(s.topics[0]).toMatchObject({ status: 'resolved', whatHelped: 'Walking every morning' });
    expect(s.topics[0].resolvedAt).toBeTruthy();
    expect(s.kept).toHaveLength(1);
    expect(s.kept[0]).toMatchObject({ text: 'Walking every morning', source: { kind: 'topic', topicId: 'p1' } });
    expect(s.kept[0].id).toMatch(/^k/);
  });

  it('resolveTopic without words, or blank ones, keeps nothing', () => {
    for (const whatHelped of [undefined, '   ']) {
      const s = reducer(base({ topics: [topic('p1')] }), { type: 'resolveTopic', id: 'p1', whatHelped });
      expect(s.topics[0].status).toBe('resolved');
      expect(s.topics[0].whatHelped).toBeUndefined();
      expect(s.kept).toEqual([]);
    }
  });

  it('reopenTopic makes it open again and clears when it resolved', () => {
    const s = reducer(base({ topics: [topic('p1', { status: 'resolved', resolvedAt: '2026-11-02T00:00:00.000Z', whatHelped: 'x' })] }), { type: 'reopenTopic', id: 'p1' });
    expect(s.topics[0].status).toBe('open');
    expect(s.topics[0].resolvedAt).toBeUndefined();
  });

  it('keep and unkeep', () => {
    const word: KeptWord = { id: 'k1', text: 'Be kind to yourself', source: { kind: 'reflection', entryId: 'a' }, createdAt: '2026-11-02T00:00:00.000Z' };
    let s = reducer(base(), { type: 'keep', word });
    s = reducer(s, { type: 'keep', word });
    expect(s.kept).toEqual([word]);
    s = reducer(s, { type: 'unkeep', id: 'k1' });
    expect(s.kept).toEqual([]);
  });

  it('dismissCheckIn remembers a key once', () => {
    let s = reducer(base(), { type: 'dismissCheckIn', key: 'p1' });
    s = reducer(s, { type: 'dismissCheckIn', key: 'p1' });
    expect(s.dismissedCheckIns).toEqual(['p1']);
  });

  it('deleting an entry removes it from every topic, and keeps kept words from it', () => {
    const word: KeptWord = { id: 'k1', text: 'Words', source: { kind: 'reflection', entryId: 'a' }, createdAt: '2026-11-02T00:00:00.000Z' };
    const s = reducer(base({ topics: [topic('p1', { entryIds: ['a', 'b'] }), topic('p2', { entryIds: ['a'] }), topic('p3', { entryIds: ['c'] })], kept: [word] }), { type: 'deleteEntry', id: 'a' });
    expect(s.topics.map((t) => t.entryIds)).toEqual([['b'], [], ['c']]);
    expect(s.kept).toEqual([word]);
  });
});

describe('openTopics', () => {
  it('lists only open topics, newest linked entry first; topics with no entries go last by creation', () => {
    const s = base({
      topics: [
        topic('old', { entryIds: ['a'] }),
        topic('new', { entryIds: ['a', 'c'] }),
        topic('done', { status: 'resolved', entryIds: ['c'] }),
        topic('empty', { createdAt: '2026-11-10T00:00:00.000Z' }),
        topic('empty-older', { createdAt: '2026-11-05T00:00:00.000Z' }),
      ],
    });
    expect(openTopics(s).map((t) => t.id)).toEqual(['new', 'old', 'empty', 'empty-older']);
  });
});

describe('blank topic names', () => {
  it('are ignored, so a topic is never blanked into a remote delete', () => {
    const s = base({ topics: [topic('p1')] });
    expect(reducer(s, { type: 'updateTopic', id: 'p1', patch: { name: '  ' } })).toBe(s);
    expect(reducer(base(), { type: 'addTopic', topic: topic('p2', { name: ' ' }) }).topics).toEqual([]);
  });

  it('resolveTopic can take its time and id', () => {
    const s = reducer(base({ topics: [topic('p1')] }), { type: 'resolveTopic', id: 'p1', whatHelped: 'Rest', at: '2026-11-03T00:00:00.000Z', keptId: 'kx' });
    expect(s.topics[0].resolvedAt).toBe('2026-11-03T00:00:00.000Z');
    expect(s.kept[0]).toMatchObject({ id: 'kx', createdAt: '2026-11-03T00:00:00.000Z' });
  });
});
