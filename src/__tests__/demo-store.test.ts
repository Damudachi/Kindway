import { demoReflection, looksHighRisk } from '@/data/demo-reflection';
import { SAMPLE_COMPASS } from '@/data/sample';
import type { Entry } from '@/data/types';
import { emptyDraft, initialState, reducer } from '@/state/demo-store';

const entry: Entry = {
  id: 'x1',
  date: '2026-10-17T21:00:00',
  title: 'Test',
  body: 'A long day.',
  feelings: [],
  reflectionStatus: 'none',
  sample: false,
};

describe('demo store', () => {
  it('saving an entry clears the draft and marks its blaze to paint', () => {
    const withDraft = reducer(initialState, { type: 'draft', patch: { text: 'A long day.' } });
    const saved = reducer(withDraft, { type: 'saveEntry', entry });
    expect(saved.entries[0]).toBe(entry);
    expect(saved.draft).toEqual(emptyDraft);
    expect(saved.justPainted).toBe('x1');
  });

  it('a failed reflection keeps the entry', () => {
    const saved = reducer(initialState, { type: 'saveEntry', entry });
    const failed = reducer(saved, { type: 'setReflection', id: 'x1', status: 'failed' });
    expect(failed.entries.find((e) => e.id === 'x1')).toMatchObject({ body: 'A long day.', reflectionStatus: 'failed' });
  });

  it('deleting an entry also removes its conversation', () => {
    const next = reducer(initialState, { type: 'deleteEntry', id: 'e4' });
    expect(next.entries.some((e) => e.id === 'e4')).toBe(false);
    expect(next.chats.e4).toBeUndefined();
  });

  it('insight feedback can be set and cleared', () => {
    const set = reducer(initialState, { type: 'insight', id: 'i1', feedback: 'not' });
    expect(set.insightFeedback.i1).toBe('not');
    expect(reducer(set, { type: 'insight', id: 'i1', feedback: undefined }).insightFeedback.i1).toBeUndefined();
  });

  it('starts with reminders off and no notification permission requested', () => {
    expect(initialState.reminders).toMatchObject({ enabled: false, permission: 'unasked' });
  });
});

describe('demo reflection', () => {
  it('references a compass value only when the user allows it', () => {
    const allowed = demoReflection('text', 'honest', SAMPLE_COMPASS);
    expect(allowed.longGame?.value).toBe('Growth & learning');
    const none = demoReflection('text', 'honest', SAMPLE_COMPASS.map((c) => ({ ...c, aiMayReference: false })));
    expect(none.longGame).toBeUndefined();
  });

  it('remembers which text it was written for', () => {
    expect(demoReflection('original', 'listen', []).basedOn).toBe('original');
  });

  it('routes possible high-risk text away from AI reflection', () => {
    expect(looksHighRisk('Some days I want to hurt myself')).toBe(true);
    expect(looksHighRisk('Work hurt my feelings today')).toBe(false);
  });
});
