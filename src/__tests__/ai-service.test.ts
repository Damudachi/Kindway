import { SAMPLE_COMPASS, SAMPLE_ENTRIES } from '@/data/sample';
import type { Entry } from '@/data/types';
import { createMockAiService, type EntryContext, type ReflectionRequest, type WeeklyRequest } from '@/services/ai';
import { mockReflection } from '@/services/ai/mock-reflection';
import { MIN_ENTRIES, mockWeeklyReview } from '@/services/ai/mock-weekly';
import { reflectionRequest, weeklyRequest } from '@/state/ai-context';
import { initialState } from '@/state/demo-store';

const hard: EntryContext = {
  id: 'x1',
  date: '2026-10-17T21:00:00',
  body: 'I compared myself with everyone else in class and felt behind.',
  feelings: ['Worried'],
};

const base: ReflectionRequest = { entry: hard, style: 'understand', challengeGently: true, challengeLevel: 'gentle', compass: SAMPLE_COMPASS, pastEntries: SAMPLE_ENTRIES };

const week = (entries: EntryContext[]): WeeklyRequest => ({ entries, compass: SAMPLE_COMPASS, from: '2026-10-11', to: '2026-10-17', excludeIds: [] });

describe('mock daily reflection', () => {
  it('"Just listen" only acknowledges: no challenge, advice, compass or past entries', () => {
    const r = mockReflection({ ...base, style: 'listen' });
    expect(r.acknowledge).toBeTruthy();
    expect(r).not.toHaveProperty('clarify');
    expect(r).not.toHaveProperty('perspective');
    expect(r).not.toHaveProperty('nextStep');
    expect(r.longGame).toBeUndefined();
    expect(r.related).toBeUndefined();
  });

  it('only "Help me move forward" offers a next step', () => {
    expect(mockReflection({ ...base, style: 'forward' }).nextStep).toBeTruthy();
    expect(mockReflection({ ...base, style: 'honest' }).nextStep).toBeUndefined();
  });

  it('"Help me understand" skips the facts-vs-conclusions challenge when gentle challenge is off', () => {
    expect(mockReflection(base).clarify).toBeTruthy();
    expect(mockReflection({ ...base, challengeGently: false }).clarify).toBeUndefined();
  });

  it('links a compass value only when the entry relates to it, and never frames the feeling as failing it', () => {
    const r = mockReflection(base);
    expect(r.longGame?.value).toBe('Growth & learning');
    expect(r.longGame?.text).toMatch(/if it feels relevant/i);
    const unrelated = mockReflection({ ...base, entry: { ...hard, body: 'The bus was late and it rained.', feelings: ['Tired'] } });
    expect(unrelated.longGame).toBeUndefined();
  });

  it('respects compass values the user did not allow AI to reference', () => {
    expect(mockReflection({ ...base, compass: SAMPLE_COMPASS.map((c) => ({ ...c, aiMayReference: false })) }).longGame).toBeUndefined();
  });

  it('names earlier entries on the same theme, and none when given none', () => {
    expect(mockReflection(base).related).toEqual(expect.arrayContaining(['e3']));
    expect(mockReflection({ ...base, pastEntries: [] }).related).toBeUndefined();
  });

  it('remembers which text it was written for', () => {
    expect(mockReflection({ ...base, style: 'listen' }).basedOn).toBe(hard.body);
  });
});

describe('mock weekly review', () => {
  it('reports empty and insufficient data instead of inventing insights', () => {
    expect(mockWeeklyReview(week([]))).toEqual({ status: 'empty' });
    expect(mockWeeklyReview(week(SAMPLE_ENTRIES.slice(0, MIN_ENTRIES - 1)))).toEqual({ status: 'insufficient', entryCount: MIN_ENTRIES - 1, needed: MIN_ENTRIES });
  });

  it('builds every section from cited entries in the request', () => {
    const result = mockWeeklyReview(week(SAMPLE_ENTRIES));
    if (result.status !== 'ready') throw new Error(result.status);
    const { review } = result;
    const ids = SAMPLE_ENTRIES.map((e) => e.id);
    const all = [...review.themes, ...review.patterns, ...review.strengths, ...review.concerns, ...review.actions];
    expect(all.length).toBeGreaterThan(0);
    for (const item of all) {
      expect(item.evidence.length).toBeGreaterThan(0);
      expect(item.evidence.every((id) => ids.includes(id))).toBe(true);
    }
    expect(review.themes.map((t) => t.id)).toContain('theme:comparison');
    expect(review.themes.find((t) => t.id === 'theme:comparison')?.evidence.length).toBeGreaterThanOrEqual(2);
    expect(review.actions.length).toBeLessThanOrEqual(2);
    expect(review.simulated).toBe(true);
  });

  it('does not repeat insights the user rejected or hid', () => {
    const result = mockWeeklyReview({ ...week(SAMPLE_ENTRIES), excludeIds: ['theme:comparison', 'action:comparison'] });
    if (result.status !== 'ready') throw new Error(result.status);
    expect(result.review.themes.some((t) => t.id === 'theme:comparison')).toBe(false);
    expect(result.review.actions.some((a) => a.id === 'action:comparison')).toBe(false);
  });

  it('suggests nothing when nothing recurred', () => {
    const calm: EntryContext[] = ['a', 'b', 'c'].map((id, i) => ({ id, date: `2026-10-1${i + 3}T20:00:00`, body: 'A quiet walk after dinner.', feelings: [] }));
    const result = mockWeeklyReview(week(calm));
    if (result.status !== 'ready') throw new Error(result.status);
    expect(result.review.actions).toEqual([]);
    expect(result.review.themes).toEqual([]);
  });
});

describe('mock service', () => {
  it('returns the simulated failure chosen in Preview states', async () => {
    const svc = createMockAiService({ simulate: 'offline', latencyMs: 0 });
    await expect(svc.reflect(base)).resolves.toEqual({ ok: false, error: 'offline' });
    await expect(createMockAiService({ simulate: 'fail', latencyMs: 0 }).weeklyReview(week(SAMPLE_ENTRIES))).resolves.toEqual({ status: 'error', error: 'failed' });
  });
});

describe('what is sent for analysis', () => {
  const entries: Entry[] = SAMPLE_ENTRIES.map((e) => (e.id === 'e3' ? { ...e, excludeFromAnalysis: true } : e));

  it('keeps excluded entries out of reflection context and weekly reviews', () => {
    const req = reflectionRequest(initialState, entries[0], 'understand', entries);
    expect(req.pastEntries.map((e) => e.id)).not.toContain('e3');
    expect(weeklyRequest(initialState, entries).entries.map((e) => e.id)).not.toContain('e3');
  });

  it('"This entry only" sends no past entries or compass values', () => {
    const req = reflectionRequest({ ...initialState, contextScope: 'current' }, entries[0], 'understand', entries);
    expect(req.pastEntries).toEqual([]);
    expect(req.compass).toEqual([]);
  });

  it('weekly reviews leave the compass out when the user turns that off', () => {
    expect(weeklyRequest({ ...initialState, insightsUseCompass: false }, entries).compass).toEqual([]);
  });

  it('sends only the fields analysis needs', () => {
    expect(Object.keys(reflectionRequest(initialState, entries[0], 'listen', entries).entry).sort()).toEqual(['body', 'date', 'feelings', 'gratitude', 'id']);
  });
});
