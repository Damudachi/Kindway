import type { Reflection } from '@/data/types';
import { accountStateAfter, planMigration, runMigration } from '@/services/cloud/migrate';
import { applyCloud, changeCount, diff, emptySnapshot, mergeSnapshots, toCloud } from '@/services/cloud/records';
import { readConfig } from '@/services/supabase/client';
import { initialState, reducer, type DemoState } from '@/state/demo-store';
import { newStep } from '@/state/tomorrow';
import { fakeCloud } from '@/test-utils/cloud';
import { entry } from '@/test-utils/entries';

const reflection: Reflection = { style: 'understand', acknowledge: 'Simulated text', basedOn: 'x' };

function journal(patch: Partial<DemoState> = {}): DemoState {
  return {
    ...initialState,
    onboarded: true,
    compass: [{ id: 'c-Work', area: 'Work', note: '', aiMayReference: true }],
    entries: [
      entry('n1', 1, { feelings: ['tired'], compassIds: ['c-Work'], reflection, reflectionStatus: 'ready' }),
      entry('n2', 0, { revisit: true, gratitude: 'tea' }),
    ],
    chats: { n1: [{ id: 'u1', from: 'me', text: 'hi' }, { id: 'k1', from: 'kindway', text: 'Simulated reply' }] },
    insightFeedback: { 'tag:tired': 'fits', 'sample:theme:comparison': 'not' },
    tomorrow: newStep('Walk', { kind: 'reflection', entryId: 'n1' }),
    ...patch,
  };
}

describe('what has a cloud copy', () => {
  it('maps entries, compass links, the step and feedback; never simulated AI output or sample feedback', () => {
    const snap = toCloud(journal());
    expect(Object.keys(snap.entries).sort()).toEqual(['n1', 'n2']);
    expect(Object.values(snap.links)).toEqual([{ entry_id: 'n1', compass_id: 'c-Work' }]);
    expect(Object.values(snap.tomorrow)[0]).toMatchObject({ text: 'Walk', source_kind: 'reflection', source_entry_id: 'n1' });
    expect(Object.keys(snap.feedback)).toEqual(['tag:tired']);
    const text = JSON.stringify(snap);
    expect(text).not.toContain('Simulated');
  });

  it('round-trips through the cloud shape while keeping device-only parts', () => {
    const state = journal();
    const back = applyCloud(state, toCloud(state));
    expect(toCloud(back)).toEqual(toCloud(state));
    expect(back.entries.find((e) => e.id === 'n1')?.reflection).toEqual(reflection);
    expect(back.chats.n1).toHaveLength(2);
    expect(back.insightFeedback['sample:theme:comparison']).toBe('not');
  });

  it('an entry removed in the cloud also loses its conversation and the step’s link, like a delete here', () => {
    const state = journal();
    const remote = toCloud(state);
    delete remote.entries.n1;
    delete remote.links['n1|c-Work'];
    const next = applyCloud(state, remote);
    expect(next.entries.map((e) => e.id)).toEqual(['n2']);
    expect(next.chats.n1).toBeUndefined();
    expect(next.tomorrow?.source).toBeUndefined();
    expect(next.tomorrow?.text).toBe('Walk');
  });
});

describe('sync merging', () => {
  it('diff sends only what changed, and deletes what was removed', () => {
    const before = journal();
    const after = reducer(reducer(before, { type: 'updateEntry', id: 'n2', patch: { body: 'Edited' } }), { type: 'deleteEntry', id: 'n1' });
    const c = diff(toCloud(before), toCloud(after));
    expect(c.upserts.entries.map((e) => e.id)).toEqual(['n2']);
    expect(c.deletes.entries).toEqual(['n1']);
    expect(c.deletes.links).toEqual(['n1|c-Work']);
    expect(c.upserts.tomorrow[0].source_entry_id).toBeNull();
    expect(changeCount(diff(toCloud(after), toCloud(after)))).toBe(0);
  });

  it('keeps changes made here, takes other devices’ changes, and applies their deletions', () => {
    const base = toCloud(journal());
    const local = toCloud(reducer(journal(), { type: 'updateEntry', id: 'n2', patch: { title: 'Mine' } }));
    const remote = structuredClone(base);
    remote.entries.n2.title = 'Theirs';
    remote.entries.n3 = { ...remote.entries.n2, id: 'n3', title: 'From the other phone' };
    delete remote.entries.n1;
    const merged = mergeSnapshots(base, local, remote);
    expect(merged.entries.n2.title).toBe('Mine');
    expect(merged.entries.n3.title).toBe('From the other phone');
    expect(merged.entries.n1).toBeUndefined();
    expect(merged.links['n1|c-Work']).toBeUndefined();
  });

  it('a day offline on two phones of one account: edits to different entries both survive', () => {
    const base = toCloud(journal());
    const local = toCloud(reducer(journal(), { type: 'updateEntry', id: 'n2', patch: { title: 'Edited on this phone' } }));
    const remote = structuredClone(base);
    remote.entries.n1.title = 'Edited on the other phone';
    const merged = mergeSnapshots(base, local, remote);
    expect(merged.entries.n2.title).toBe('Edited on this phone');
    expect(merged.entries.n1.title).toBe('Edited on the other phone');
  });

  it('a pull through the reducer leaves pending local edits in place', () => {
    const state = reducer(journal(), { type: 'updateEntry', id: 'n2', patch: { title: 'Unsent edit' } });
    const base = toCloud(journal());
    const next = reducer(state, { type: 'applyCloud', base, remote: base });
    expect(next.entries.find((e) => e.id === 'n2')?.title).toBe('Unsent edit');
  });
});

describe('moving a local-only journal into an account', () => {
  it('uploads into an empty account and verifies it by reading it back', async () => {
    const cloud = fakeCloud();
    const state = journal();
    const plan = planMigration(state, emptySnapshot());
    expect(plan.adding).toEqual({ entries: 2, compass: 1, actions: 1 });
    const after = await runMigration(cloud.repo, 'A', plan, emptySnapshot());
    expect(Object.keys(after.entries).sort()).toEqual(['n1', 'n2']);
    expect(cloud.consented.has('A')).toBe(true);
    const account = accountStateAfter(state, plan, after);
    expect(account.entries).toHaveLength(2);
    expect(account.entries.find((e) => e.id === 'n1')?.reflection).toEqual(reflection);
  });

  it('a retry after a partial upload finishes without duplicates', async () => {
    const cloud = fakeCloud();
    const plan = planMigration(journal(), emptySnapshot());
    cloud.failNext('offline', 2);
    await expect(runMigration(cloud.repo, 'A', plan, emptySnapshot())).rejects.toThrow();
    expect(Object.keys(cloud.data('A').entries).length).toBeLessThan(2);
    const after = await runMigration(cloud.repo, 'A', plan, await cloud.repo.pull('A'));
    expect(Object.keys(after.entries).sort()).toEqual(['n1', 'n2']);
    expect(Object.keys(after.links)).toEqual(['n1|c-Work']);
  });

  it('never overwrites or deletes what the account already has', async () => {
    const cloud = fakeCloud();
    const other = journal({ entries: [entry('n1', 3, { body: 'Written on the other phone' }), entry('n9', 2)] });
    await runMigration(cloud.repo, 'A', planMigration(other, emptySnapshot()), emptySnapshot());

    const existing = await cloud.repo.pull('A');
    const plan = planMigration(journal(), existing);
    expect(plan.copies).toEqual({ n1: 'n1-d1' });
    const after = await runMigration(cloud.repo, 'A', plan, existing);
    expect(after.entries.n1.body).toBe('Written on the other phone');
    expect(after.entries['n1-d1'].body).toBe('Some words for n1.');
    expect(after.entries.n9).toBeDefined();
    expect(after.links['n1-d1|c-Work']).toBeDefined();
    expect(plan.keepsAccountStep).toBe(true);
    expect(cloud.log.every((l) => Object.values(l.changes.deletes).every((d) => d.length === 0))).toBe(true);
  });

  it('blocks instead of dropping compass areas when the merged compass would exceed three', async () => {
    const cloud = fakeCloud();
    const three = ['A', 'B', 'C'].map((a) => ({ id: `c-${a}`, area: a, note: '', aiMayReference: true }));
    await runMigration(cloud.repo, 'A', planMigration(journal({ compass: three, entries: [] }), emptySnapshot()), emptySnapshot());
    const existing = await cloud.repo.pull('A');
    const plan = planMigration(journal(), existing);
    expect(plan.compassOverflow).toEqual(['Work']);
    await expect(runMigration(cloud.repo, 'A', plan, existing)).rejects.toThrow();
  });

  it('planning doesn’t touch the local journal', () => {
    const state = journal();
    const copy = structuredClone(state);
    planMigration(state, emptySnapshot());
    expect(state).toEqual(copy);
  });

  it('one user’s upload is invisible to another', async () => {
    const cloud = fakeCloud();
    await runMigration(cloud.repo, 'A', planMigration(journal(), emptySnapshot()), emptySnapshot());
    expect(Object.keys((await cloud.repo.pull('B')).entries)).toEqual([]);
  });
});

describe('client configuration', () => {
  it('needs both a project URL and a publishable key', () => {
    expect(readConfig({})).toBeNull();
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toEqual({
      url: 'https://x.supabase.co',
      key: 'sb_publishable_abc',
    });
  });

  it('refuses to run with a secret key in the app', () => {
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toBeNull();
    const serviceRoleJwt = `x.${btoa(JSON.stringify({ role: 'service_role' }))}.y`;
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: serviceRoleJwt })).toBeNull();
  });
});
