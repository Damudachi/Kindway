import { looksHighRisk } from '@/data/safety';
import { SAMPLE_ENTRIES } from '@/data/sample';
import { emptyDraft, fromSnapshot, initialState, reducer, toSnapshot } from '@/state/demo-store';
import { entry } from '@/test-utils/entries';

const e1 = entry('x1', 0, { body: 'A long day.' });

describe('store', () => {
  it('starts genuinely empty: no sample entries, compass, memory, step or chats', () => {
    expect(initialState).toMatchObject({ entries: [], compass: [], memories: [], tomorrow: null, chats: {}, onboarded: false });
  });

  it('saving an entry clears the draft and marks its blaze to paint', () => {
    const withDraft = reducer(initialState, { type: 'draft', patch: { text: 'A long day.' } });
    const saved = reducer(withDraft, { type: 'saveEntry', entry: e1 });
    expect(saved.entries[0]).toBe(e1);
    expect(saved.draft).toEqual(emptyDraft);
    expect(saved.justPainted).toBe('x1');
  });

  it('never saves a blank entry, or a fictional sample entry', () => {
    expect(reducer(initialState, { type: 'saveEntry', entry: { ...e1, body: '   ' } }).entries).toEqual([]);
    expect(reducer(initialState, { type: 'saveEntry', entry: SAMPLE_ENTRIES[0] }).entries).toEqual([]);
    const saved = reducer(initialState, { type: 'saveEntry', entry: e1 });
    expect(reducer(saved, { type: 'updateEntry', id: 'x1', patch: { body: '' } }).entries[0].body).toBe('A long day.');
  });

  it('a failed reflection keeps the entry', () => {
    const saved = reducer(initialState, { type: 'saveEntry', entry: e1 });
    const failed = reducer(saved, { type: 'setReflection', id: 'x1', status: 'failed' });
    expect(failed.entries.find((e) => e.id === 'x1')).toMatchObject({ body: 'A long day.', reflectionStatus: 'failed' });
  });

  it('deleting an entry leaves nothing pointing at it', () => {
    const other = entry('x2', 1, { reflection: { style: 'understand', acknowledge: 'a', basedOn: 'b', related: ['x1'] }, reflectionStatus: 'ready' });
    let s = { ...initialState, entries: [e1, other], chats: { x1: [{ id: 'm', from: 'me' as const, text: 'hi' }] }, insightFeedback: { 'revisit:x1': 'fits' as const } };
    s = { ...s, tomorrow: { text: 'Rest', savedOn: e1.date, dueOn: e1.date, status: 'open', source: { kind: 'reflection', entryId: 'x1' } } };
    const next = reducer(s, { type: 'deleteEntry', id: 'x1' });
    expect(next.entries.map((e) => e.id)).toEqual(['x2']);
    expect(next.chats.x1).toBeUndefined();
    expect(next.insightFeedback['revisit:x1']).toBeUndefined();
    expect(next.entries[0].reflection?.related).toEqual([]);
    expect(next.tomorrow).toMatchObject({ text: 'Rest', source: undefined });
  });

  it('removing a compass value removes entries’ links to it', () => {
    const s = { ...initialState, compass: [{ id: 'c1', area: 'Health & peace', note: '', aiMayReference: true }], entries: [{ ...e1, compassIds: ['c1'] }] };
    expect(reducer(s, { type: 'compass', compass: [] }).entries[0].compassIds).toEqual([]);
  });

  it('removing a reflection keeps the entry', () => {
    const s = { ...initialState, entries: [{ ...e1, reflectionStatus: 'ready' as const, reflection: { style: 'listen' as const, acknowledge: 'a', basedOn: 'A long day.' } }] };
    expect(reducer(s, { type: 'removeReflection', id: 'x1' }).entries[0]).toMatchObject({ body: 'A long day.', reflection: undefined, reflectionStatus: 'none' });
  });

  it('insight feedback can be set and cleared', () => {
    const set = reducer(initialState, { type: 'insight', id: 'tag:Worried', feedback: 'not' });
    expect(set.insightFeedback['tag:Worried']).toBe('not');
    expect(reducer(set, { type: 'insight', id: 'tag:Worried', feedback: undefined }).insightFeedback['tag:Worried']).toBeUndefined();
  });

  it('reset returns to a clean first launch', () => {
    const used = { ...initialState, onboarded: true, entries: [e1], insightFeedback: { 'sample:theme:comparison': 'fits' as const } };
    expect(reducer(used, { type: 'reset' })).toEqual(initialState);
  });

  it('starts with reminders off and no notification permission requested', () => {
    expect(initialState.reminders).toMatchObject({ enabled: false, permission: 'unasked' });
  });
});

describe('local snapshot', () => {
  it('round-trips saved data but not reviewer switches', () => {
    const s = { ...initialState, onboarded: true, supportStyle: 'listen' as const, entries: [e1], demo: { ...initialState.demo, ai: 'fail' as const }, justPainted: 'x1' };
    const restored = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(restored).toMatchObject({ onboarded: true, supportStyle: 'listen', entries: [e1] });
    expect(restored.demo.ai).toBe('ok');
    expect(restored.justPainted).toBeUndefined();
  });

  it('starts fresh from missing, corrupt or unknown-version data', () => {
    expect(fromSnapshot(null)).toEqual(initialState);
    expect(fromSnapshot('nonsense')).toEqual(initialState);
    expect(fromSnapshot({ version: 99, state: { onboarded: true } })).toEqual(initialState);
  });

  it('drops sample entries and settles reflections interrupted by closing the app', () => {
    const raw = { version: 1, state: { entries: [{ ...e1, reflectionStatus: 'loading' }, SAMPLE_ENTRIES[0]] } };
    const restored = fromSnapshot(raw);
    expect(restored.entries).toHaveLength(1);
    expect(restored.entries[0].reflectionStatus).toBe('failed');
  });
});

describe('safety placeholder', () => {
  it('routes possible high-risk text away from reflection', () => {
    expect(looksHighRisk('Some days I want to hurt myself')).toBe(true);
    expect(looksHighRisk('Work hurt my feelings today')).toBe(false);
  });
});
