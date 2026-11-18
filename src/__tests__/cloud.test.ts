import type { KeptWord, Reflection, Topic } from '@/data/types';
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

describe('trail unlocks', () => {
  it('toCloud sends them sorted, and applyCloud restores them', () => {
    const snap = toCloud(journal({ trailUnlocks: [30, 7] }));
    expect(snap.profile?.trail_unlocks).toEqual([7, 30]);
    const restored = applyCloud({ ...initialState, trailUnlocks: [] }, snap);
    expect(restored.trailUnlocks).toEqual([7, 30]);
  });

  it('a merge keeps every unlock from both sides, whichever side wins the other profile fields', () => {
    const base = toCloud(journal({ trailUnlocks: [7] }));
    const local = toCloud(journal({ trailUnlocks: [7, 50], supportStyle: 'honest' }));
    const remote = toCloud(journal({ trailUnlocks: [7, 30] }));
    expect(mergeSnapshots(base, local, remote).profile?.trail_unlocks).toEqual([7, 30, 50]);
    const unchangedHere = toCloud(journal({ trailUnlocks: [7] }));
    expect(mergeSnapshots(base, unchangedHere, remote).profile?.trail_unlocks).toEqual([7, 30]);
  });

  it('unlocks reached on another device are not lost when this one pulls', () => {
    const merged = mergeSnapshots(toCloud(journal()), toCloud(journal({ trailUnlocks: [100] })), toCloud(journal({ trailUnlocks: [7, 365] })));
    expect(applyCloud(journal({ trailUnlocks: [100] }), merged).trailUnlocks).toEqual([7, 100, 365]);
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

describe('topics and kept words', () => {
  const topic = (id: string, entryIds: string[] = []): Topic => ({ id, name: `Topic ${id}`, status: 'open', createdAt: '2026-11-01T09:00:00.000Z', entryIds });
  const kept: KeptWord[] = [
    { id: 'k1', text: 'Be kind', source: { kind: 'reflection', entryId: 'n1' }, createdAt: '2026-11-02T09:00:00.000Z' },
    { id: 'k2', text: 'Ask for help', source: { kind: 'follow_up', entryId: 'n2' }, createdAt: '2026-11-03T09:00:00.000Z' },
    { id: 'k3', text: 'Walking every morning', source: { kind: 'topic', topicId: 'p1' }, createdAt: '2026-11-04T09:00:00.000Z' },
  ];
  const withTopics = (patch: Partial<DemoState> = {}) =>
    journal({
      topics: [{ ...topic('p1', ['n1', 'n2']), status: 'resolved', resolvedAt: '2026-11-04T09:00:00.000Z', whatHelped: 'Walking every morning', checkInShownAt: '2026-11-05T09:00:00.000Z' }, topic('p2')],
      kept,
      ...patch,
    });

  it('maps topics, links and kept words to rows', () => {
    const snap = toCloud(withTopics());
    expect(Object.keys(snap.topics).sort()).toEqual(['p1', 'p2']);
    expect(snap.topics.p1).toEqual({
      id: 'p1',
      name: 'Topic p1',
      status: 'resolved',
      created_at: '2026-11-01T09:00:00.000Z',
      resolved_at: '2026-11-04T09:00:00.000Z',
      what_helped: 'Walking every morning',
      check_in_shown_at: '2026-11-05T09:00:00.000Z',
    });
    expect(Object.keys(snap.topicLinks).sort()).toEqual(['p1|n1', 'p1|n2']);
    expect(snap.kept.k3).toMatchObject({ source_kind: 'topic', source_topic_id: 'p1', source_entry_id: null });
    expect(snap.kept.k1).toMatchObject({ source_kind: 'reflection', source_entry_id: 'n1', source_topic_id: null });
  });

  it('round-trips through applyCloud', () => {
    const state = withTopics();
    const back = applyCloud({ ...initialState, dismissedCheckIns: ['x'] }, toCloud(state));
    expect(back.topics.map((t) => ({ ...t, entryIds: [...t.entryIds].sort() })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(state.topics);
    expect([...back.kept].sort((a, b) => a.id.localeCompare(b.id))).toEqual(kept);
    expect(back.dismissedCheckIns).toEqual(['x']);
    expect(toCloud(back)).toEqual(toCloud(state));
  });

  it('does not emit a link to a sample, blank or missing entry', () => {
    const state = journal({
      entries: [entry('n1', 1), entry('s1', 2, { sample: true }), entry('blank', 3, { body: '  ' })],
      topics: [topic('p1', ['n1', 's1', 'blank', 'gone'])],
    });
    expect(Object.keys(toCloud(state).topicLinks)).toEqual(['p1|n1']);
  });

  it('applyCloud drops links to entries that are gone', () => {
    const state = withTopics();
    const remote = toCloud(state);
    delete remote.entries.n1;
    delete remote.links['n1|c-Work'];
    expect(applyCloud(state, remote).topics.find((t) => t.id === 'p1')?.entryIds).toEqual(['n2']);
  });

  it('pushing into an empty cloud matches, with nothing left to send', async () => {
    const cloud = fakeCloud();
    const state = withTopics();
    const snap = toCloud(state);
    await cloud.repo.push('A', diff(emptySnapshot(), snap));
    expect(cloud.data('A')).toEqual(snap);
    expect(changeCount(diff(cloud.data('A'), toCloud(applyCloud(state, snap))))).toBe(0);
  });

  it('removed topics, links and kept words are deleted', () => {
    const d = diff(toCloud(withTopics()), toCloud(withTopics({ topics: [topic('p2')], kept: [kept[0]] })));
    expect(d.deletes.topics).toEqual(['p1']);
    expect(d.deletes.topicLinks.sort()).toEqual(['p1|n1', 'p1|n2']);
    expect(d.deletes.kept.sort()).toEqual(['k2', 'k3']);
  });

  it('merges per record: a topic changed here wins, one changed elsewhere follows the cloud', () => {
    const p1 = withTopics().topics[0];
    const base = toCloud(withTopics());
    const local = toCloud(withTopics({ topics: [p1, { ...topic('p2'), name: 'Mine' }] }));
    const remote = toCloud(
      withTopics({
        topics: [{ ...p1, name: 'Theirs' }, topic('p2')],
        kept: [...kept, { id: 'k4', text: 'Added there', source: { kind: 'topic', topicId: 'p2' }, createdAt: '2026-11-06T09:00:00.000Z' }],
      }),
    );
    const merged = mergeSnapshots(base, local, remote);
    expect(merged.topics.p2.name).toBe('Mine');
    expect(merged.topics.p1.name).toBe('Theirs');
    expect(merged.kept.k4).toBeDefined();
  });

  it('a merge drops links whose topic is gone', () => {
    const base = toCloud(withTopics());
    const remote = toCloud(withTopics());
    delete remote.topics.p1;
    expect(Object.keys(mergeSnapshots(base, toCloud(withTopics()), remote).topicLinks)).toEqual([]);
  });

  it('migrating a local journal carries its topics, links and kept words', async () => {
    const cloud = fakeCloud();
    const state = withTopics();
    const plan = planMigration(state, emptySnapshot());
    const after = await runMigration(cloud.repo, 'A', plan, emptySnapshot());
    expect(Object.keys(after.topics).sort()).toEqual(['p1', 'p2']);
    expect(Object.keys(after.topicLinks).sort()).toEqual(['p1|n1', 'p1|n2']);
    expect(Object.keys(after.kept).sort()).toEqual(['k1', 'k2', 'k3']);
    expect(accountStateAfter(state, plan, after).topics.find((t) => t.id === 'p1')?.entryIds.sort()).toEqual(['n1', 'n2']);
  });

  it('migration points links and kept words at the copy of a same-id entry', () => {
    const account = toCloud(journal({ entries: [entry('n1', 1, { body: 'Different words' })] }));
    const plan = planMigration(withTopics(), account);
    expect(plan.copies.n1).toBeDefined();
    expect(plan.result.topicLinks[`p1|${plan.copies.n1}`]).toBeDefined();
    expect(plan.result.kept.k1.source_entry_id).toBe(plan.copies.n1);
  });

  it('migration into an account that already has a profile unions the trail unlocks', () => {
    const plan = planMigration(journal({ trailUnlocks: [7, 100] }), toCloud(journal({ trailUnlocks: [7, 30] })));
    expect(plan.keepsAccountPreferences).toBe(true);
    expect(plan.result.profile?.trail_unlocks).toEqual([7, 30, 100]);
  });

  it('migration keeps an account topic that has the same id', () => {
    const account = toCloud(withTopics({ topics: [{ ...topic('p2'), name: 'Account name' }], kept: [] }));
    const plan = planMigration(withTopics(), account);
    expect(plan.result.topics.p2.name).toBe('Account name');
  });
});

describe('topics: older saved bases and database limits', () => {
  const oldBase = () => {
    const { topics: _t, topicLinks: _l, kept: _k, ...old } = toCloud(journal());
    return old as unknown as ReturnType<typeof toCloud>;
  };

  it('diff and merge cope with a sync base saved before topics existed', () => {
    const next = toCloud(journal({ topics: [{ id: 'p1', name: 'Work', status: 'open', createdAt: '2026-11-01T09:00:00.000Z', entryIds: ['n1'] }] }));
    expect(diff(oldBase(), next).upserts.topics).toHaveLength(1);
    const merged = mergeSnapshots(oldBase(), next, toCloud(journal()));
    expect(Object.keys(merged.topics)).toEqual(['p1']);
    expect(Object.keys(merged.topicLinks)).toEqual(['p1|n1']);
  });

  it('rows stay inside the database limits, and stay stable across a round trip', () => {
    const state = journal({
      topics: [{ id: 'p1', name: `  ${'n'.repeat(60)}  `, status: 'resolved', createdAt: '2026-11-01T09:00:00.000Z', whatHelped: 'w'.repeat(300), entryIds: [] }],
      kept: [{ id: 'k1', text: 't'.repeat(2000), source: { kind: 'topic', topicId: 'p1' }, createdAt: '2026-11-02T09:00:00.000Z' }],
    });
    const snap = toCloud(state);
    expect(snap.topics.p1.name).toHaveLength(40);
    expect(snap.topics.p1.what_helped).toHaveLength(200);
    expect(snap.kept.k1.text).toHaveLength(1200);
    expect(toCloud(applyCloud(state, snap))).toEqual(snap);
  });

  it('applyCloud skips a kept word with no source id', () => {
    const snap = toCloud(journal());
    snap.kept.bad = { id: 'bad', text: 'x', source_kind: 'reflection', source_entry_id: null, source_topic_id: null, created_at: '2026-11-02T09:00:00.000Z' };
    expect(applyCloud(journal(), snap).kept).toEqual([]);
  });
});
