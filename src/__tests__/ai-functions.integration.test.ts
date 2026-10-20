/**
 * @jest-environment node
 *
 * The generate-reflection and generate-insights Edge Functions against a real local Supabase
 * stack (`npx supabase start` + `npx supabase functions serve --env-file supabase/functions/.env`),
 * with two throwaway users and fictional entries only. Skipped unless pointed at one:
 *   KINDWAY_TEST_SUPABASE_URL, KINDWAY_TEST_PUBLISHABLE_KEY, KINDWAY_TEST_SECRET_KEY
 * Tests that call the real provider also need KINDWAY_TEST_LIVE_AI=1; without it, only the
 * checks that refuse before any provider call run, so no tokens are spent.
 * Never point this at a project with real users: it creates and deletes test accounts.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { CURRENT_TERMS, type AiScope } from '@/services/ai/consent';

const url = process.env.KINDWAY_TEST_SUPABASE_URL;
const publishable = process.env.KINDWAY_TEST_PUBLISHABLE_KEY;
const secret = process.env.KINDWAY_TEST_SECRET_KEY;
const run = url && publishable && secret ? describe : describe.skip;
const live = process.env.KINDWAY_TEST_LIVE_AI === '1' ? it : it.skip;

jest.setTimeout(120000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFetch = require('node-fetch') as typeof fetch;
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: nodeFetch } };
const password = 'correct-horse-battery-1';
const uuid = () => crypto.randomUUID();
const day = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

async function testUser(admin: SupabaseClient, label: string) {
  const email = `kindway-ai-${label}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`could not create ${label}: ${error?.message}`);
  const client = createClient(url!, publishable!, options);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) throw new Error(`could not sign in ${label}`);
  return { id: data.user.id, client, token: signIn.data.session.access_token };
}

async function call(fn: 'generate-reflection' | 'generate-insights', token: string, body: unknown) {
  const res = await nodeFetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: publishable!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const grant = (client: SupabaseClient, scope: AiScope) =>
  client.rpc('grant_ai_consent', {
    p_scope: scope,
    p_consent_version: CURRENT_TERMS.consentVersion[scope],
    p_disclosure_version: CURRENT_TERMS.disclosureVersion,
    p_provider: CURRENT_TERMS.provider,
    p_model_ref: CURRENT_TERMS.modelRef,
  });

run('AI Edge Functions with two real users', () => {
  let admin: SupabaseClient;
  let a: Awaited<ReturnType<typeof testUser>>;
  let b: Awaited<ReturnType<typeof testUser>>;

  beforeAll(async () => {
    admin = createClient(url!, secret!, options);
    a = await testUser(admin, 'a');
    b = await testUser(admin, 'b');
    const entries = [
      { id: 'r1', written_at: day(0), body: 'Fictional test entry: my manager moved the deadline again and I stayed late. I keep thinking I am bad at my job.', feelings: ['Frustrated', 'Tired'] },
      { id: 'w1', written_at: day(5), body: 'Fictional test entry: argued with my brother about who visits Mum. I felt unheard.', feelings: ['Frustrated'] },
      { id: 'w2', written_at: day(3), body: 'Fictional test entry: long shift, skipped lunch, too tired to cook.', feelings: ['Tired'] },
      { id: 'w3', written_at: day(1), body: 'Fictional test entry: walked by the river after work and felt calmer.', feelings: ['Calm'], gratitude: 'The river walk' },
      { id: 'x1', written_at: day(2), body: 'Fictional test entry kept out of analysis.', feelings: [], exclude_from_analysis: true },
      { id: 'risk', written_at: day(0), body: 'Fictional safety test entry: some nights I want to die.', feelings: [] },
    ];
    // A bulk insert sends every column for every row, so give each row all of them.
    const rows = entries.map((e) => ({ gratitude: null, exclude_from_analysis: false, ...e, user_id: a.id }));
    const { error } = await a.client.from('entries').insert(rows);
    if (error) throw new Error('could not insert fictional entries');
  });

  afterAll(async () => {
    for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it('refuses a forged token', async () => {
    expect((await call('generate-reflection', 'not-a-real-token', { entry_id: 'r1', style: 'listen', idempotency_key: uuid() })).status).toBe(401);
  });

  it('refuses without consent, for each scope independently', async () => {
    expect(await call('generate-reflection', a.token, { entry_id: 'r1', style: 'listen', idempotency_key: uuid() })).toEqual({ status: 403, body: { error: 'consent_required' } });
    await grant(a.client, 'entry_reflection');
    expect(await call('generate-insights', a.token, { period: 'week', entry_ids: ['w1', 'w2', 'w3'], idempotency_key: uuid() })).toEqual({
      status: 403,
      body: { error: 'consent_required' },
    });
  });

  it('another user’s entry id is “not found”, even with consent', async () => {
    await grant(b.client, 'entry_reflection');
    expect(await call('generate-reflection', b.token, { entry_id: 'r1', style: 'listen', idempotency_key: uuid() })).toEqual({ status: 404, body: { error: 'entry_not_found' } });
  });

  it('high-risk wording gets the support route and nothing is stored', async () => {
    expect(await call('generate-reflection', a.token, { entry_id: 'risk', style: 'understand', idempotency_key: uuid() })).toEqual({ status: 200, body: { status: 'safety' } });
    const { count } = await a.client.from('ai_reflections').select('id', { count: 'exact', head: true });
    expect(count).toBe(0);
  });

  it('a review refuses entries kept out of analysis and selections under the minimum', async () => {
    await grant(a.client, 'cross_entry_analysis');
    expect((await call('generate-insights', a.token, { period: 'week', entry_ids: ['w1', 'w2', 'x1'], idempotency_key: uuid() })).body).toEqual({ error: 'selection_changed' });
    expect((await call('generate-insights', a.token, { period: 'week', entry_ids: ['w1', 'w2'], idempotency_key: uuid() })).body).toEqual({ error: 'insufficient_entries', needed: 3 });
  });

  live('LIVE: a real reflection is generated, saved, and returned again for a repeated tap', async () => {
    const key = uuid();
    const first = await call('generate-reflection', a.token, { entry_id: 'r1', style: 'honest', idempotency_key: key });
    expect(first.status).toBe(200);
    const reflection = (first.body as { reflection: { output: Record<string, unknown>; provider: string; model: string } }).reflection;
    expect(reflection).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b', output: { schema_version: 'reflection-1' } });
    expect(typeof reflection.output.acknowledgment).toBe('string');
    // Printed for the manual quality review in docs/ai-evaluation.md (fictional entry only).
    console.log('LIVE reflection (fictional entry, style honest):', JSON.stringify(reflection.output, null, 2));

    const again = await call('generate-reflection', a.token, { entry_id: 'r1', style: 'honest', idempotency_key: key });
    expect(again.body).toEqual(first.body);
    const { count } = await a.client.from('ai_reflections').select('id', { count: 'exact', head: true });
    expect(count).toBe(1);

    // Kindway's own cooldown applies to a new request straight after.
    const next = await call('generate-reflection', a.token, { entry_id: 'r1', style: 'honest', idempotency_key: uuid() });
    expect(next.status).toBe(429);
    expect(next.body).toMatchObject({ error: 'rate_limited' });
  });

  live('LIVE: a real review cites only submitted entries, and deleting a source entry removes it', async () => {
    const res = await call('generate-insights', a.token, { period: 'week', entry_ids: ['w1', 'w2', 'w3'], idempotency_key: uuid() });
    expect(res.status).toBe(200);
    const insight = (res.body as { insight: { id: string; output: { observations: { entry_ids: string[] }[]; next_steps: { entry_ids: string[] }[] }; sources: { entry_id: string }[] } }).insight;
    console.log('LIVE review (fictional entries):', JSON.stringify(insight.output, null, 2));
    expect(insight.sources.map((s) => s.entry_id).sort()).toEqual(['w1', 'w2', 'w3']);
    for (const o of [...insight.output.observations, ...insight.output.next_steps]) {
      for (const id of o.entry_ids) expect(['w1', 'w2', 'w3']).toContain(id);
    }
    await a.client.from('entries').delete().eq('id', 'w2');
    const { count } = await a.client.from('ai_insights').select('id', { count: 'exact', head: true }).eq('id', insight.id);
    expect(count).toBe(0);
  });

  it('after withdrawal the server refuses again', async () => {
    await a.client.rpc('revoke_ai_consent', { p_scope: 'entry_reflection' });
    expect(await call('generate-reflection', a.token, { entry_id: 'r1', style: 'listen', idempotency_key: uuid() })).toEqual({ status: 403, body: { error: 'consent_required' } });
  });

  it('“Delete AI outputs” removes every AI reflection and review but no entries', async () => {
    const { error } = await a.client.rpc('delete_ai_outputs');
    expect(error).toBeNull();
    const [{ count: reflections }, { count: insights }, { count: entries }] = await Promise.all([
      a.client.from('ai_reflections').select('id', { count: 'exact', head: true }),
      a.client.from('ai_insights').select('id', { count: 'exact', head: true }),
      a.client.from('entries').select('id', { count: 'exact', head: true }),
    ]);
    expect([reflections, insights]).toEqual([0, 0]);
    expect(entries).toBeGreaterThan(0);
  });
});
