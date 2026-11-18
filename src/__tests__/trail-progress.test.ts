import { SAMPLE_ENTRIES } from '@/data/sample';
import { countLine, daysWritten, MILESTONE_COPY, MILESTONES, newUnlocks } from '@/state/trail-progress';
import { fromSnapshot, initialState, reducer, toSnapshot } from '@/state/demo-store';
import { entry } from '@/test-utils/entries';

describe('daysWritten', () => {
  it('counts distinct days: two on one day plus one on another is 2', () => {
    expect(daysWritten([entry('a', 0), entry('b', 0, { date: new Date(new Date().setHours(8, 0, 0, 0)).toISOString() }), entry('c', 1)])).toBe(2);
  });
  it('skips sample entries and blank bodies', () => {
    expect(daysWritten([entry('a', 0), SAMPLE_ENTRIES[0], entry('b', 3, { body: '  ' })])).toBe(1);
  });
  it('counts a back-dated entry on its own date', () => {
    expect(daysWritten([entry('a', 0), entry('b', 40)])).toBe(2);
  });
});

describe('newUnlocks', () => {
  it('lists reached milestones not yet unlocked, ascending', () => {
    expect(newUnlocks(31, [7])).toEqual([30]);
    expect(newUnlocks(60, [])).toEqual([7, 30, 50]);
    expect(newUnlocks(6, [])).toEqual([]);
  });
  it('is permanent when the count drops', () => {
    expect(newUnlocks(8, [7, 30])).toEqual([]);
  });
});

describe('copy', () => {
  it('has a line for every milestone', () => {
    for (const m of MILESTONES) expect(MILESTONE_COPY[m].line).toBeTruthy();
    expect(MILESTONE_COPY[7]).toEqual({ line: 'A week of days on your way. Wildflowers are coming up along the trail.', scenery: 'wildflowers' });
  });
  it('countLine', () => {
    expect(countLine(1)).toBe('1 day on your way.');
    expect(countLine(23)).toBe('23 days on your way.');
  });
});

describe('trail state', () => {
  it('unlockTrail merges without duplicates', () => {
    const s = reducer({ ...initialState, trailUnlocks: [7] }, { type: 'unlockTrail', milestones: [7, 30] });
    expect(s.trailUnlocks).toEqual([7, 30]);
  });
  it('trailUnlocks survives the snapshot round-trip; trailMoment does not', () => {
    const s = { ...initialState, trailUnlocks: [7, 30], trailMoment: { entryId: 'a', count: 31, at: 0 } };
    const restored = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(restored.trailUnlocks).toEqual([7, 30]);
    expect(restored.trailMoment).toBeUndefined();
  });
  it('saving a first entry sets a moment with no milestone', () => {
    const s = reducer(initialState, { type: 'saveEntry', entry: entry('a', 0) });
    expect(s.trailMoment).toEqual({ entryId: 'a', count: 1, milestone: undefined, at: expect.any(Number) });
    expect(s.trailUnlocks).toEqual([]);
  });
  it('crossing a milestone records the highest and unlocks all crossed', () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry(`e${i}`, i + 1));
    const s = reducer({ ...initialState, entries }, { type: 'saveEntry', entry: entry('n', 0) });
    expect(s.trailMoment).toEqual({ entryId: 'n', count: 7, milestone: 7, at: expect.any(Number) });
    expect(s.trailUnlocks).toEqual([7]);
    const many = Array.from({ length: 49 }, (_, i) => entry(`m${i}`, i + 1));
    const t = reducer({ ...initialState, entries: many }, { type: 'saveEntry', entry: entry('n', 0) });
    expect(t.trailMoment?.milestone).toBe(50);
    expect(t.trailUnlocks).toEqual([7, 30, 50]);
  });
  it('does not set a moment for a blank or sample save, or an update', () => {
    expect(reducer(initialState, { type: 'saveEntry', entry: SAMPLE_ENTRIES[0] }).trailMoment).toBeUndefined();
    const saved = reducer(initialState, { type: 'saveEntry', entry: entry('a', 0) });
    const cleared = reducer(saved, { type: 'clearTrailMoment' });
    expect(cleared.trailMoment).toBeUndefined();
    expect(reducer(cleared, { type: 'updateEntry', id: 'a', patch: { title: 'x' } }).trailMoment).toBeUndefined();
  });
});
