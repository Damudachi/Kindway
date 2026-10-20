/**
 * @jest-environment node
 *
 * Two real users against a real Supabase database (the local stack from `npx supabase start`).
 * Skipped unless pointed at one; see docs/supabase-setup.md, "Run the two-user tests":
 *   KINDWAY_TEST_SUPABASE_URL, KINDWAY_TEST_PUBLISHABLE_KEY, KINDWAY_TEST_SECRET_KEY
 * Never point this at a project with real users: it creates and deletes test accounts.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { planMigration, runMigration } from '@/services/cloud/migrate';
import { diff, emptySnapshot, toCloud } from '@/services/cloud/records';
import { supabaseRepo } from '@/services/cloud/repo';
import { initialState, type DemoState } from '@/state/demo-store';
import { newStep } from '@/state/tomorrow';
import { entry } from '@/test-utils/entries';

const url = process.env.KINDWAY_TEST_SUPABASE_URL;
const publishable = process.env.KINDWAY_TEST_PUBLISHABLE_KEY;
const secret = process.env.KINDWAY_TEST_SECRET_KEY;
const run = url && publishable && secret ? describe : describe.skip;

jest.setTimeout(60000);

// jest-expo swaps the global fetch for Expo's native one, which has no network here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFetch = require('node-fetch') as typeof fetch;
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: nodeFetch } };
const password = 'correct-horse-battery-1';

async function testUser(admin: SupabaseClient, label: string) {
  const email = `kindway-test-${label}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`could not create ${label}: ${error?.message}`);
  const client = createClient(url!, publishable!, options);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`could not sign in ${label}`);
  return { id: data.user.id, client, repo: supabaseRepo(client) };
}

async function fetchFunction(name: string, token: string) {
  const res = await nodeFetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: publishable! } });
  return res.status;
}

function journal(): DemoState {
  return {
    ...initialState,
    onboarded: true,
    compass: [{ id: 'c-Work', area: 'Work', note: 'steady', aiMayReference: true }],
    entries: [entry('n1', 1, { feelings: ['tired'], compassIds: ['c-Work'] }), entry('n2', 0, { revisit: true })],
    insightFeedback: { 'tag:tired': 'fits' },
    tomorrow: newStep('Walk', { kind: 'reflection', entryId: 'n1' }),
  };
}

run('Supabase repository with two real users', () => {
  let admin: SupabaseClient;
  let a: Awaited<ReturnType<typeof testUser>>;
  let b: Awaited<ReturnType<typeof testUser>>;

  beforeAll(async () => {
    admin = createClient(url!, secret!, options);
    a = await testUser(admin, 'a');
    b = await testUser(admin, 'b');
  });

  afterAll(async () => {
    for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it('A uploads a journal and reads it back intact', async () => {
    const plan = planMigration(journal(), emptySnapshot());
    const after = await runMigration(a.repo, a.id, plan, emptySnapshot());
    expect(Object.keys(after.entries).sort()).toEqual(['n1', 'n2']);
    expect(Object.keys(after.links)).toEqual(['n1|c-Work']);
    expect(Object.values(after.tomorrow)[0].source_entry_id).toBe('n1');
    // Uploading the same plan again changes nothing and duplicates nothing.
    const again = await runMigration(a.repo, a.id, plan, after);
    expect(again).toEqual(after);
  });

  it('B sees none of A’s rows, even when asking for them by A’s id', async () => {
    const asB = await b.repo.pull(a.id);
    expect(asB).toEqual(emptySnapshot());
    const direct = await b.client.from('entries').select('*').eq('user_id', a.id);
    expect(direct.data).toEqual([]);
  });

  it('B cannot write rows owned by A, or change or delete A’s rows', async () => {
    const spoof = await b.client.from('entries').insert({ user_id: a.id, id: 'spoof', written_at: new Date().toISOString(), body: 'x' });
    expect(spoof.error).not.toBeNull();

    const update = await b.client.from('entries').update({ body: 'changed by B' }).eq('user_id', a.id).eq('id', 'n1').select();
    expect(update.data).toEqual([]);
    const remove = await b.client.from('entries').delete().eq('user_id', a.id).select();
    expect(remove.data).toEqual([]);

    const stillA = await a.repo.pull(a.id);
    expect(stillA.entries.n1.body).toBe('Some words for n1.');
    expect(Object.keys(stillA.entries)).toHaveLength(2);
  });

  it('B cannot link its own entry to A’s compass value', async () => {
    await b.repo.push(b.id, diff(emptySnapshot(), toCloud({ ...initialState, entries: [entry('n1', 0)] })));
    const link = await b.client.from('entry_compass_links').insert({ user_id: b.id, entry_id: 'n1', compass_id: 'c-Work' });
    expect(link.error).not.toBeNull();
  });

  it('deleting an entry removes its links and keeps the Tomorrow step without its source', async () => {
    const before = await a.repo.pull(a.id);
    const next = structuredClone(before);
    delete next.entries.n1;
    delete next.links['n1|c-Work'];
    await a.repo.push(a.id, diff(before, next));
    const after = await a.repo.pull(a.id);
    expect(after.entries.n1).toBeUndefined();
    expect(after.links).toEqual({});
    expect(Object.values(after.tomorrow)[0]).toMatchObject({ text: 'Walk', source_entry_id: null });
  });

  it('signed-out clients get nothing', async () => {
    const anon = createClient(url!, publishable!, options);
    const { data, error } = await anon.from('entries').select('*');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('the delete-account function refuses callers without a valid session', async () => {
    const anon = createClient(url!, publishable!, options);
    const { error } = await anon.functions.invoke('delete-account', { method: 'POST' });
    expect(error).not.toBeNull();
    const forged = await fetchFunction('delete-account', 'not-a-real-token');
    expect(forged).toBe(401);
    expect((await admin.auth.admin.getUserById(a.id)).data.user).not.toBeNull();
  });

  it('the delete-account function deletes only the caller’s account and data', async () => {
    const { data: session } = await a.client.auth.getSession();
    // Even when asked to delete B, the function only uses the caller's token.
    const res = await nodeFetch(`${url}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.session?.access_token}`, apikey: publishable!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: b.id }),
    });
    expect(res.status).toBe(200);
    expect((await admin.auth.admin.getUserById(a.id)).data.user).toBeNull();
    expect((await admin.auth.admin.getUserById(b.id)).data.user).not.toBeNull();
    const left = await admin.from('entries').select('user_id');
    expect((left.data ?? []).some((r) => r.user_id === a.id)).toBe(false);
    expect((left.data ?? []).some((r) => r.user_id === b.id)).toBe(true);
  });
});
