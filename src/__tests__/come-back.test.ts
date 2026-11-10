import type { Entry, Reflection } from '@/data/types';
import { looksHighRisk } from '@/data/safety';
import { lookBackFor, threadFor } from '@/state/come-back';

// Evening of 10 Nov 2026, local time. Entries are at midday so the day count is stable in any zone.
const AT = new Date(2026, 10, 10, 20, 0);
const ago = (n: number) => new Date(2026, 10, 10 - n, 12, 0).toISOString();

const reflection = (patch: Partial<Reflection> = {}): Reflection => ({ style: 'understand', source: 'ai', acknowledge: 'Fictional.', basedOn: '', ...patch });
const entry = (id: string, daysBack: number, patch: Partial<Entry> = {}): Entry => ({
  id,
  date: ago(daysBack),
  title: `Title ${id}`,
  body: `Fictional body ${id}.`,
  feelings: [],
  reflectionStatus: 'none',
  sample: false,
  ...patch,
});

describe('pick up the thread', () => {
  it('has nothing to offer with no entries, when you have already written today, or when the last entry is old', () => {
    expect(threadFor([], AT)).toBeNull();
    expect(threadFor([entry('t', 0), entry('y', 1)], AT)).toBeNull();
    expect(threadFor([entry('old', 8)], AT)).toBeNull();
  });

  it('continues from the question an AI reflection ended with', () => {
    const e = entry('a', 1, { title: 'Leaving work', reflection: reflection({ question: 'What part of it felt most like home?' }) });
    expect(threadFor([e], AT)).toEqual({ entryId: 'a', prompt: 'What part of it felt most like home?', from: 'From “Leaving work”, yesterday' });
  });

  it('ignores the question of a simulated reflection, which is pre-written and says nothing about this entry', () => {
    const e = entry('a', 2, { title: 'A slow day', reflection: reflection({ source: 'simulated', question: 'Generic question?' }) });
    expect(threadFor([e], AT)?.prompt).toBe('You wrote “A slow day” 2 days ago. How is it sitting with you now?');
  });

  it('falls back to a part of the entry the reflection left aside, then to the title', () => {
    const topic = entry('a', 1, { reflection: reflection({ otherTopics: ['your sister’s visit', 'sleep'] }) });
    expect(threadFor([topic], AT)?.prompt).toBe('Last time you mentioned your sister’s visit. How is that sitting with you now?');
    expect(threadFor([entry('b', 3, { title: 'The meeting' })], AT)?.prompt).toBe('You wrote “The meeting” 3 days ago. How is it sitting with you now?');
  });

  it('uses the most recent entry within the last week, not the oldest', () => {
    expect(threadFor([entry('new', 2), entry('older', 6)], AT)?.entryId).toBe('new');
  });

  it('never brings back an entry that looks high-risk, or a sample one; it tries the next entry instead', () => {
    const risky = entry('risk', 1, { body: 'Fictional: some nights I want to die.' });
    expect(looksHighRisk(risky.body)).toBe(true);
    expect(threadFor([risky], AT)).toBeNull();
    expect(threadFor([risky, entry('ok', 3)], AT)?.entryId).toBe('ok');
    expect(threadFor([entry('demo', 1, { sample: true })], AT)).toBeNull();
  });
});

describe('look-backs', () => {
  it('has nothing when no entry sits near a week, a month, three months or a year ago', () => {
    expect(lookBackFor([], AT)).toBeNull();
    expect(lookBackFor([entry('a', 3), entry('b', 15), entry('c', 50)], AT)).toBeNull();
  });

  it('finds an entry from about a month ago, within a couple of days', () => {
    expect(lookBackFor([entry('a', 31)], AT)).toMatchObject({ entry: { id: 'a' }, label: 'A month ago' });
    expect(lookBackFor([entry('a', 33)], AT)?.label).toBe('A month ago');
    expect(lookBackFor([entry('a', 34)], AT)).toBeNull();
  });

  it('names a week, three months and a year', () => {
    expect(lookBackFor([entry('w', 7)], AT)?.label).toBe('A week ago');
    expect(lookBackFor([entry('q', 91)], AT)?.label).toBe('Three months ago');
    expect(lookBackFor([entry('y', 365)], AT)?.label).toBe('A year ago');
  });

  it('prefers the longer look-back, and the entry nearest the day', () => {
    expect(lookBackFor([entry('w', 7), entry('m', 30), entry('y', 366)], AT)?.entry.id).toBe('y');
    expect(lookBackFor([entry('far', 32), entry('near', 30)], AT)?.entry.id).toBe('near');
  });

  it('is the same on every visit that day', () => {
    const list = [entry('a', 30), entry('b', 31)];
    expect(lookBackFor(list, AT)?.entry.id).toBe(lookBackFor([...list].reverse(), AT)?.entry.id);
  });

  it('never brings back a high-risk or sample entry', () => {
    expect(lookBackFor([entry('risk', 30, { body: 'Fictional: some nights I want to die.' })], AT)).toBeNull();
    expect(lookBackFor([entry('demo', 30, { sample: true })], AT)).toBeNull();
    expect(lookBackFor([entry('risk', 30, { body: 'Fictional: some nights I want to die.' }), entry('ok', 31)], AT)?.entry.id).toBe('ok');
  });
});
