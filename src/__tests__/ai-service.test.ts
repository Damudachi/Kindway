import { SAMPLE_COMPASS, SAMPLE_ENTRIES } from '@/data/sample';
import type { CompassValue } from '@/data/types';
import { createMockAiService, type EntryContext, type ReflectionRequest } from '@/services/ai';
import { mockFollowUp } from '@/services/ai/mock-follow-up';
import { mockReflection } from '@/services/ai/mock-reflection';
import { createLocalInsightsService, createSampleInsightsService, MIN_ENTRIES, type InsightsRequest } from '@/services/insights';
import { localInsightsReview } from '@/services/insights/local-insights';
import { analysableEntries, insightsRequest, reflectionRequest, toContext } from '@/state/ai-context';
import { initialState } from '@/state/demo-store';
import { editText, markDone, newStep, postpone, stepView } from '@/state/tomorrow';
import { entry } from '@/test-utils/entries';

const compass: CompassValue[] = [{ id: 'c1', area: 'Growth & learning', note: '', aiMayReference: true }];
const hard: EntryContext = { id: 'x1', date: '2026-10-17T21:00:00', body: 'I compared myself with everyone and felt behind.', feelings: ['Worried'], compassIds: ['c1'] };
const base: ReflectionRequest = { entry: hard, style: 'understand', challengeGently: true, challengeLevel: 'gentle', compass, pastEntries: [] };

describe('mock daily reflection', () => {
  it('"Just listen" only acknowledges: no challenge, perspective, advice, compass or past entries', () => {
    const r = mockReflection({ ...base, style: 'listen', pastEntries: [{ ...hard, id: 'p' }] });
    expect(r.acknowledge).toBeTruthy();
    for (const key of ['clarify', 'perspective', 'nextStep', 'longGame', 'related']) expect(r).not.toHaveProperty(key);
  });

  it('only "Help me move forward" offers a next step', () => {
    expect(mockReflection({ ...base, style: 'forward' }).nextStep).toBeTruthy();
    expect(mockReflection({ ...base, style: 'honest' }).nextStep).toBeUndefined();
    expect(mockReflection(base).nextStep).toBeUndefined();
  });

  it('"Help me understand" skips the facts-vs-conclusions challenge when gentle challenge is off', () => {
    expect(mockReflection(base).clarify).toBeTruthy();
    expect(mockReflection({ ...base, challengeGently: false }).clarify).toBeUndefined();
  });

  it('mentions a compass value only when the user linked it to the entry and allowed it', () => {
    expect(mockReflection(base).longGame?.value).toBe('Growth & learning');
    expect(mockReflection(base).longGame?.text).toMatch(/If it doesn’t, leave it/);
    expect(mockReflection({ ...base, entry: { ...hard, compassIds: [] } }).longGame).toBeUndefined();
    expect(mockReflection({ ...base, compass: [{ ...compass[0], aiMayReference: false }] }).longGame).toBeUndefined();
  });

  it('does not frame an untagged entry as a hard day', () => {
    const r = mockReflection({ ...base, entry: { ...hard, feelings: [] } });
    expect(`${r.acknowledge} ${r.perspective}`).not.toMatch(/heavy|hard day/i);
  });

  it('links earlier entries only by a shared feeling tag', () => {
    const past = [{ ...hard, id: 'p1', date: '2026-10-15T21:00:00' }, { ...hard, id: 'p2', feelings: ['Calm'] }];
    expect(mockReflection({ ...base, pastEntries: past }).related).toEqual(['p1']);
  });

  it('"Try another perspective" gives a different perspective', () => {
    expect(mockReflection({ ...base, variant: 1 }).perspective).not.toBe(mockReflection(base).perspective);
  });

  it('remembers which text and variant it was written for', () => {
    expect(mockReflection({ ...base, variant: 2 })).toMatchObject({ basedOn: hard.body, variant: 2 });
  });
});

describe('mock follow-up', () => {
  it('replies by style and rotates without reading the message', () => {
    const msg = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, from: 'me' as const, text: 'anything' }));
    const req = { entry: hard, style: 'listen' as const, messages: msg(1) };
    expect(mockFollowUp(req).from).toBe('kindway');
    expect(mockFollowUp(req).text).not.toBe(mockFollowUp({ ...req, messages: msg(2) }).text);
    expect(mockFollowUp({ ...req, style: 'forward' }).text).not.toBe(mockFollowUp(req).text);
  });
});

describe('mock service', () => {
  it('returns the simulated failure chosen in Preview states', async () => {
    await expect(createMockAiService({ simulate: 'offline', latencyMs: 0 }).reflect(base)).resolves.toEqual({ ok: false, error: 'offline' });
    await expect(createMockAiService({ simulate: 'ok', latencyMs: 0 }).followUp({ entry: hard, style: 'honest', messages: [{ id: 'u', from: 'me', text: 'x' }] })).resolves.toMatchObject({ ok: true });
  });
});

const req = (entries: EntryContext[], patch: Partial<InsightsRequest> = {}): InsightsRequest => ({ period: 'all', entries, compass, excludeIds: [], ...patch });
const tagged = (id: string, feelings: string[], extra: Partial<EntryContext> = {}): EntryContext => ({ id, date: `2026-10-1${id.length}T20:00:00`, body: 'text', feelings, ...extra });

describe('local insights (real entries)', () => {
  it('reports empty and insufficient data instead of inventing insights', () => {
    expect(localInsightsReview(req([]))).toEqual({ status: 'empty' });
    expect(localInsightsReview(req([tagged('a', ['Worried']), tagged('b', ['Worried'])]))).toEqual({ status: 'insufficient', entryCount: 2, needed: MIN_ENTRIES });
  });

  it('never infers anything from free text: identical writing without tags gives no themes or patterns', () => {
    const words = 'I keep comparing myself and feel behind and worried and overwhelmed.';
    const result = localInsightsReview(req(['a', 'b', 'c'].map((id) => tagged(id, [], { body: words }))));
    if (result.status !== 'ready') throw new Error(result.status);
    const { themes, patterns, strengths, concerns, actions } = result.review;
    expect([...themes, ...patterns, ...strengths, ...concerns, ...actions]).toEqual([]);
  });

  it('counts tags, tag pairs, compass links, good things and "come back" marks, citing the real entries', () => {
    const entries = [
      tagged('a', ['Worried', 'Tired'], { compassIds: ['c1'] }),
      tagged('bb', ['Worried', 'Tired'], { compassIds: ['c1'], gratitude: 'tea' }),
      tagged('ccc', ['Proud'], { revisit: true }),
    ];
    const result = localInsightsReview(req(entries));
    if (result.status !== 'ready') throw new Error(result.status);
    const r = result.review;
    expect(r.basis).toBe('tags');
    expect(r.themes.map((t) => t.id)).toEqual(['tag:Tired', 'tag:Worried', 'compass:c1']);
    expect(r.themes[1].title).toBe('You tagged “Worried” in 2 of 3 entries');
    expect(r.patterns.map((p) => p.id)).toEqual(['pair:Tired+Worried']);
    expect(r.strengths.map((s) => s.id)).toEqual(['positive:Proud', 'gratitude']);
    expect(r.concerns.map((c) => c.id)).toEqual(['revisit:ccc']);
    expect(r.actions.length).toBeLessThanOrEqual(2);
    const all = [...r.themes, ...r.patterns, ...r.strengths, ...r.concerns, ...r.actions];
    for (const item of all) {
      expect(item.sources.length).toBeGreaterThan(0);
      expect(item.sources.every((s) => s.kind === 'entry' && entries.some((e) => e.id === s.id))).toBe(true);
    }
  });

  it('leaves compass counts out when the request carries no compass, and skips rejected insights', () => {
    const entries = ['a', 'bb', 'ccc'].map((id) => tagged(id, ['Worried'], { compassIds: ['c1'] }));
    const result = localInsightsReview(req(entries, { compass: [], excludeIds: ['tag:Worried'] }));
    if (result.status !== 'ready') throw new Error(result.status);
    expect(result.review.themes).toEqual([]);
  });

  it('the service simulates only the failure preview state', async () => {
    const entries = ['a', 'bb', 'ccc'].map((id) => tagged(id, []));
    await expect(createLocalInsightsService({ simulate: 'fail', latencyMs: 0 }).review(req(entries))).resolves.toEqual({ status: 'error', error: 'failed' });
    await expect(createLocalInsightsService({ simulate: 'offline', latencyMs: 0 }).review(req(entries))).resolves.toMatchObject({ status: 'ready' });
  });
});

describe('sample insights demo', () => {
  it('is a labelled fixture whose sources are only the fictional sample entries', async () => {
    const result = await createSampleInsightsService({ latencyMs: 0 }).review(req([tagged('real', ['Worried'])]));
    if (result.status !== 'ready') throw new Error(result.status);
    const r = result.review;
    expect(r.basis).toBe('sample-fixture');
    const all = [...r.themes, ...r.patterns, ...r.strengths, ...r.concerns, ...r.actions];
    expect(all.every((i) => i.id.startsWith('sample:'))).toBe(true);
    expect(all.flatMap((i) => i.sources).every((s) => s.kind === 'sample' && SAMPLE_ENTRIES.some((e) => e.id === s.id))).toBe(true);
  });

  it('drops sample insights the user rejected or hid', async () => {
    const result = await createSampleInsightsService({ latencyMs: 0 }).review(req([], { excludeIds: ['sample:theme:comparison'] }));
    if (result.status !== 'ready') throw new Error(result.status);
    expect(result.review.themes).toEqual([]);
  });
});

describe('what is sent for analysis', () => {
  const entries = [entry('a', 0), entry('b', 1, { excludeFromAnalysis: true }), entry('c', 20), entry('d', 40)];

  it('keeps excluded entries out of reflection context and insight reviews', () => {
    expect(reflectionRequest(initialState, entries[0], 'understand', entries).pastEntries.map((e) => e.id)).not.toContain('b');
    expect(insightsRequest(initialState, entries, 'all').entries.map((e) => e.id)).toEqual(['a', 'c', 'd']);
  });

  it('periods select entries by date', () => {
    expect(analysableEntries(entries, 'week').map((e) => e.id)).toEqual(['a']);
    expect(analysableEntries(entries, 'month').map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('"This entry only" sends no past entries or compass values', () => {
    const req = reflectionRequest({ ...initialState, contextScope: 'current', compass: SAMPLE_COMPASS }, entries[0], 'understand', entries);
    expect(req.pastEntries).toEqual([]);
    expect(req.compass).toEqual([]);
  });

  it('insight reviews leave the compass out when the user turns that off', () => {
    expect(insightsRequest({ ...initialState, compass: SAMPLE_COMPASS, insightsUseCompass: false }, entries, 'all').compass).toEqual([]);
  });

  it('sends only the fields analysis needs', () => {
    expect(Object.keys(toContext(entries[0])).sort()).toEqual(['body', 'compassIds', 'date', 'feelings', 'gratitude', 'id', 'revisit']);
  });
});

describe('Tomorrow Bridge', () => {
  const evening = new Date(2026, 9, 17, 21, 0);
  const nextDay = new Date(2026, 9, 18, 9, 0);

  it('a new step is due tomorrow and shows as upcoming tonight', () => {
    const s = newStep('  Rest first ', { kind: 'insights' }, evening);
    expect(s).toMatchObject({ text: 'Rest first', status: 'open' });
    expect(stepView(s, evening)).toBe('upcoming');
    expect(stepView(s, nextDay)).toBe('due');
  });

  it('done shows for the day it was done, then quietly goes', () => {
    const done = markDone(newStep('Walk', undefined, evening), nextDay);
    expect(stepView(done, nextDay)).toBe('done');
    expect(stepView(done, new Date(2026, 9, 19, 9, 0))).toBe('hidden');
  });

  it('postponing moves it to the following day; editing keeps its day; dismissing hides it', () => {
    const s = newStep('Walk', undefined, evening);
    expect(stepView(postpone(s, nextDay), nextDay)).toBe('upcoming');
    expect(editText(s, 'Short walk')).toMatchObject({ text: 'Short walk', dueOn: s.dueOn });
    expect(stepView({ ...s, status: 'dismissed' }, nextDay)).toBe('hidden');
    expect(stepView(null)).toBe('hidden');
  });
});
