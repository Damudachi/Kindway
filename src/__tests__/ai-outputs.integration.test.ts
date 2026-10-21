/**
 * @jest-environment node
 *
 * Reading stored AI reflections back, as two real users against a real Supabase database (the
 * local stack from `npx supabase start`). No provider is called: rows are saved the way the
 * Edge Function saves them, against the caller's own pending request, with fictional output.
 * Skipped unless pointed at one; see docs/supabase-setup.md, "Run the two-user tests":
 *   KINDWAY_TEST_SUPABASE_URL, KINDWAY_TEST_PUBLISHABLE_KEY, KINDWAY_TEST_SECRET_KEY
 * Never point this at a project with real users: it creates and deletes test accounts.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAiOutputs } from '@/services/ai/remote';

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
const BODY = 'Fictional test entry: the deadline moved again.';

async function testUser(admin: SupabaseClient, label: string) {
  const email = `kindway-test-${label}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`could not create ${label}: ${error?.message}`);
  const client = createClient(url!, publishable!, options);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`could not sign in ${label}`);
  return { id: data.user.id, client, outputs: supabaseAiOutputs(client) };
}

/** Saves a fictional reflection for one of the caller's entries, as the server does. */
async function saveReflection(client: SupabaseClient, entryId: string, acknowledgment: string) {
  const begin = await client.rpc('ai_begin_request', { p_kind: 'reflection', p_key: crypto.randomUUID(), p_cooldown_seconds: 0, p_daily_limit: 100 });
  const requestId = (begin.data as { request_id?: string } | null)?.request_id;
  if (!requestId) throw new Error(`could not start a request: ${JSON.stringify(begin.data)}`);
  const { data: entry } = await client.from('entries').select('updated_at').eq('id', entryId).single();
  const { data, error } = await client
    .from('ai_reflections')
    .insert({
      entry_id: entryId,
      request_id: requestId,
      style: 'understand',
      output: { schema_version: 'reflection-1', acknowledgment },
      schema_version: 'reflection-1',
      prompt_version: 'test',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      entry_updated_at: entry!.updated_at,
    })
    .select('id')
    .single();
  if (error) throw new Error(`could not save a reflection: ${error.message}`);
  await client.rpc('ai_finish_request', { p_request_id: requestId, p_status: 'succeeded' });
  return data.id as string;
}

run('stored AI reflections, read back on another device', () => {
  let admin: SupabaseClient;
  let a: Awaited<ReturnType<typeof testUser>>;
  let b: Awaited<ReturnType<typeof testUser>>;
  let newest: string;

  beforeAll(async () => {
    admin = createClient(url!, secret!, options);
    a = await testUser(admin, 'a');
    b = await testUser(admin, 'b');
    const rows = ['e1', 'e2'].map((id) => ({ id, user_id: a.id, written_at: new Date().toISOString(), body: BODY, feelings: [], gratitude: null, exclude_from_analysis: false }));
    const { error } = await a.client.from('entries').insert(rows);
    if (error) throw new Error('could not insert fictional entries');
    await saveReflection(a.client, 'e1', 'Fictional: the first one.');
    newest = await saveReflection(a.client, 'e1', 'Fictional: the newer one.');
    await saveReflection(a.client, 'e2', 'Fictional: about e2.');
  });

  afterAll(async () => {
    for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it('a fresh client for the same account gets the newest reflection per entry, written for the current text', async () => {
    const fresh = createClient(url!, publishable!, options);
    const { data } = await a.client.auth.getSession();
    await fresh.auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token });
    const got = await supabaseAiOutputs(fresh).reflections(a.id);
    expect(Object.keys(got).sort()).toEqual(['e1', 'e2']);
    expect(got.e1).toMatchObject({ source: 'ai', ai: { id: newest, provider: 'groq' }, acknowledge: 'Fictional: the newer one.', basedOn: BODY });
  });

  it('B reads none of A’s reflections, even when asking with A’s id', async () => {
    expect(await b.outputs.reflections(a.id)).toEqual({});
    expect(await b.outputs.reflections(b.id)).toEqual({});
  });

  it('editing an entry afterwards marks its reflection as written for an earlier version', async () => {
    await a.client.from('entries').update({ body: 'Fictional: edited later.' }).eq('id', 'e2');
    const got = await a.outputs.reflections(a.id);
    expect(got.e2.basedOn).toBe('');
    expect(got.e1.basedOn).toBe(BODY);
  });

  it('deleting an entry deletes its reflections', async () => {
    await a.client.from('entries').delete().eq('id', 'e2');
    expect(Object.keys(await a.outputs.reflections(a.id))).toEqual(['e1']);
  });
});

/** Saves a fictional review of some of the caller's entries, as the server does. */
async function saveReview(client: SupabaseClient, entryIds: string[], summary: string) {
  const begin = await client.rpc('ai_begin_request', { p_kind: 'insights', p_key: crypto.randomUUID(), p_cooldown_seconds: 0, p_daily_limit: 100 });
  const requestId = (begin.data as { request_id?: string } | null)?.request_id;
  if (!requestId) throw new Error(`could not start a request: ${JSON.stringify(begin.data)}`);
  const now = Date.now();
  const { data, error } = await client
    .from('ai_insights')
    .insert({
      request_id: requestId,
      period: 'week',
      range_start: new Date(now - 7 * 86_400_000).toISOString(),
      range_end: new Date(now).toISOString(),
      entry_count: entryIds.length,
      output: {
        schema_version: 'insights-1',
        enough_evidence: true,
        summary,
        observations: [{ kind: 'theme', title: 'Fictional theme', body: 'Fictional.', grounding: 'observed', entry_ids: entryIds }],
        next_steps: [],
      },
      schema_version: 'insights-1',
      prompt_version: 'test',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    })
    .select('id')
    .single();
  if (error) throw new Error(`could not save a review: ${error.message}`);
  const sources = await client.from('ai_insight_sources').insert(entryIds.map((entry_id) => ({ insight_id: data.id, entry_id })));
  if (sources.error) throw new Error(`could not save review sources: ${sources.error.message}`);
  await client.rpc('ai_finish_request', { p_request_id: requestId, p_status: 'succeeded' });
  return data.id as string;
}

run('stored AI reviews, read back on another device', () => {
  let admin: SupabaseClient;
  let a: Awaited<ReturnType<typeof testUser>>;
  let b: Awaited<ReturnType<typeof testUser>>;
  let newest: string;

  beforeAll(async () => {
    admin = createClient(url!, secret!, options);
    a = await testUser(admin, 'a');
    b = await testUser(admin, 'b');
    const rows = ['w1', 'w2', 'w3'].map((id) => ({ id, user_id: a.id, written_at: new Date().toISOString(), body: BODY, feelings: [], gratitude: null, exclude_from_analysis: false }));
    const { error } = await a.client.from('entries').insert(rows);
    if (error) throw new Error('could not insert fictional entries');
    await saveReview(a.client, ['w1', 'w2', 'w3'], 'Fictional: the older review.');
    newest = await saveReview(a.client, ['w1', 'w2', 'w3'], 'Fictional: the newer review.');
  });

  afterAll(async () => {
    for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it('a fresh client for the same account gets the newest review, citing only its recorded sources', async () => {
    const fresh = createClient(url!, publishable!, options);
    const { data } = await a.client.auth.getSession();
    await fresh.auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token });
    const review = await supabaseAiOutputs(fresh).latestReview('week');
    expect(review).toMatchObject({ summary: 'Fictional: the newer review.', ai: { id: newest } });
    expect(review!.themes[0].sources.map((s) => s.id).sort()).toEqual(['w1', 'w2', 'w3']);
  });

  it('B reads none of A’s reviews, and cannot cite A’s entries in its own', async () => {
    expect(await b.outputs.latestReview('week')).toBeNull();
    await expect(saveReview(b.client, ['w1', 'w2', 'w3'], 'Fictional: spoofed.')).rejects.toThrow(/could not save review sources/);
    expect(await a.outputs.latestReview('week')).toMatchObject({ ai: { id: newest } });
  });

  it('deleting a source entry deletes every review written from it', async () => {
    await a.client.from('entries').delete().eq('id', 'w2');
    expect(await a.outputs.latestReview('week')).toBeNull();
  });
});
