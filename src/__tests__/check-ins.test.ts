import type { Entry, Reflection, Topic } from '@/data/types';
import { dueCheckIns, quietTopics, topicCheckInQuestion } from '@/state/check-ins';
import { entry } from '@/test-utils/entries';

// A fixed "now": the 20th, mid-afternoon, local time.
const NOW = new Date(2026, 10, 20, 15, 0, 0);
const withCheckIns = (id: string, checkIns: { question: string; on: string }[], source: Reflection['source'] = 'ai'): Entry =>
  entry(id, 1, { reflection: { style: 'understand', source, acknowledge: 'Fictional.', basedOn: '', checkIns }, reflectionStatus: 'ready' }, NOW);
const topic = (id: string, patch: Partial<Topic> = {}): Topic => ({ id, name: 'Mum’s health', status: 'open', createdAt: '2026-01-01T09:00:00.000Z', entryIds: [], ...patch });

describe('dueCheckIns', () => {
  const at = (day: number) => new Date(2026, 10, day, 8, 0, 0);
  const e = withCheckIns('e1', [{ question: 'How did the exam go?', on: '2026-11-19' }]);

  it('is never shown before its date', () => {
    expect(dueCheckIns([e], [], at(18))).toEqual([]);
  });

  it('shows on the date and for three days after, and not after that', () => {
    for (const day of [19, 20, 21, 22]) expect(dueCheckIns([e], [], at(day))).toEqual([{ key: 'e1:0', entryId: 'e1', question: 'How did the exam go?', on: '2026-11-19' }]);
    expect(dueCheckIns([e], [], at(23))).toEqual([]);
  });

  it('compares against the local date, not UTC', () => {
    // 23:30 on the 19th local is already the 20th in UTC+0 for some zones; the local date is what counts.
    expect(dueCheckIns([e], [], new Date(2026, 10, 19, 23, 30))).toHaveLength(1);
    expect(dueCheckIns([e], [], new Date(2026, 10, 18, 23, 59))).toHaveLength(0);
  });

  it('hides dismissed keys and keys each check-in by its position', () => {
    const two = withCheckIns('e2', [
      { question: 'First?', on: '2026-11-20' },
      { question: 'Second?', on: '2026-11-20' },
    ]);
    expect(dueCheckIns([two], ['e2:0'], at(20)).map((c) => c.key)).toEqual(['e2:1']);
  });

  it('ignores simulated reflections and entries without check-ins, and malformed dates', () => {
    const sim = withCheckIns('s', [{ question: 'x?', on: '2026-11-20' }], 'simulated');
    const none = entry('n', 1, {}, NOW);
    const bad = withCheckIns('b', [{ question: 'x?', on: 'Thursday' }]);
    expect(dueCheckIns([sim, none, bad], [], at(20))).toEqual([]);
  });

  it('handles a window that crosses a month end', () => {
    const m = withCheckIns('m', [{ question: 'x?', on: '2026-11-29' }]);
    expect(dueCheckIns([m], [], new Date(2026, 11, 2, 9))).toHaveLength(1);
    expect(dueCheckIns([m], [], new Date(2026, 11, 3, 9))).toHaveLength(0);
  });
});

describe('quietTopics', () => {
  it('writes the question from the topic name', () => {
    expect(topicCheckInQuestion('Mum’s health')).toBe('How are things with Mum’s health these days?');
  });

  it('is due when nothing linked has been written for 15 days', () => {
    const entries = [entry('old', 15, {}, NOW)];
    expect(quietTopics([topic('p1', { entryIds: ['old'] })], entries, NOW).map((t) => t.id)).toEqual(['p1']);
  });

  it('is not due while a linked entry is recent', () => {
    const entries = [entry('old', 15, {}, NOW), entry('new', 13, {}, NOW)];
    expect(quietTopics([topic('p1', { entryIds: ['old', 'new'] })], entries, NOW)).toEqual([]);
  });

  it('counts a topic with no entries from the day it was saved', () => {
    expect(quietTopics([topic('p1', { createdAt: new Date(2026, 10, 19).toISOString() })], [], NOW)).toEqual([]);
    expect(quietTopics([topic('p1', { createdAt: new Date(2026, 10, 1).toISOString() })], [], NOW)).toHaveLength(1);
  });

  it('is not shown again for 14 days once shown', () => {
    const old = [entry('old', 30, {}, NOW)];
    const shown = (daysBack: number) => topic('p1', { entryIds: ['old'], checkInShownAt: new Date(2026, 10, 20 - daysBack, 9).toISOString() });
    expect(quietTopics([shown(0)], old, NOW)).toEqual([]);
    expect(quietTopics([shown(13)], old, NOW)).toEqual([]);
    expect(quietTopics([shown(14)], old, NOW)).toHaveLength(1);
  });

  it('leaves out resolved topics', () => {
    expect(quietTopics([topic('p1', { status: 'resolved' })], [], NOW)).toEqual([]);
  });
});
