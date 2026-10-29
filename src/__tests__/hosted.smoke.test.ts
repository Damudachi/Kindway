/**
 * @jest-environment node
 *
 * Smoke test of the deployed system: the hosted Supabase project, its Edge Functions and the real
 * AI provider, with two existing throwaway accounts and fictional entries only. The integration
 * suites check the same rules in depth on the local stack; this checks what is actually deployed.
 * Skipped unless KINDWAY_HOSTED_SMOKE=1 and these are set:
 *   KINDWAY_HOSTED_URL, KINDWAY_HOSTED_PUBLISHABLE_KEY,
 *   KINDWAY_HOSTED_A_EMAIL, KINDWAY_HOSTED_A_PASSWORD, KINDWAY_HOSTED_B_EMAIL, KINDWAY_HOSTED_B_PASSWORD
 * It needs no secret key, and it only touches those two accounts: it clears their journals first.
 * Each AI request spends provider tokens, and requests are spaced out for Groq's per-minute limit.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AI_SCOPES, CURRENT_TERMS, type AiScope } from '@/services/ai/consent';

import { FOLLOW_UP_PROMPT_VERSION } from '../../supabase/functions/_shared/follow-up';
import { INSIGHTS_PROMPT_VERSION } from '../../supabase/functions/_shared/insights';
import { REFLECTION_PROMPT_VERSION } from '../../supabase/functions/_shared/reflection';

const env = process.env;
const url = env.KINDWAY_HOSTED_URL;
const publishable = env.KINDWAY_HOSTED_PUBLISHABLE_KEY;
const run = env.KINDWAY_HOSTED_SMOKE === '1' && url && publishable && env.KINDWAY_HOSTED_A_EMAIL && env.KINDWAY_HOSTED_B_EMAIL ? describe : describe.skip;

jest.setTimeout(300000);

// jest-expo swaps the global fetch for Expo's native one, which has no network here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFetch = require('node-fetch') as typeof fetch;
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: nodeFetch } };
const uuid = () => crypto.randomUUID();
const day = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
// One AI request is about 3,000–3,600 tokens against a limit of 8,000 a minute.
const spaceOut = () => new Promise((r) => setTimeout(r, 35000));

/** A signed-in client for an account: a "device". Two devices for one account don't share anything. */
async function device(who: 'A' | 'B') {
  const client = createClient(url!, publishable!, options);
  const { data, error } = await client.auth.signInWithPassword({ email: env[`KINDWAY_HOSTED_${who}_EMAIL`]!, password: env[`KINDWAY_HOSTED_${who}_PASSWORD`]! });
  if (error || !data.session) throw new Error(`could not sign in ${who}`);
  return { id: data.user.id, client, token: data.session.access_token };
}

async function call(fn: 'generate-reflection' | 'generate-insights' | 'generate-follow-up', token: string, body: unknown) {
  const res = await nodeFetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: publishable!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const grant = (client: SupabaseClient, scope: AiScope, version: string = CURRENT_TERMS.consentVersion[scope]) =>
  client.rpc('grant_ai_consent', {
    p_scope: scope,
    p_consent_version: version,
    p_disclosure_version: CURRENT_TERMS.disclosureVersion,
    p_provider: CURRENT_TERMS.provider,
    p_model_ref: CURRENT_TERMS.modelRef,
  });

/** Back to an empty journal with no consent, so each run starts the same way. */
async function clear(client: SupabaseClient) {
  await client.rpc('delete_ai_outputs');
  await client.from('entries').delete().neq('id', '');
  for (const scope of AI_SCOPES) await client.rpc('revoke_ai_consent', { p_scope: scope });
}

const count = async (client: SupabaseClient, table: string) => (await client.from(table).select('id', { count: 'exact', head: true })).count;

run('the deployed system, with two throwaway accounts', () => {
  let a: Awaited<ReturnType<typeof device>>;
  let a2: Awaited<ReturnType<typeof device>>;
  let b: Awaited<ReturnType<typeof device>>;

  beforeAll(async () => {
    [a, a2, b] = await Promise.all([device('A'), device('A'), device('B')]);
    await Promise.all([clear(a.client), clear(b.client)]);
    const entries = [
      { id: 's1', written_at: day(0), body: 'Fictional test entry: my manager moved the deadline again and I stayed late. I keep thinking I am bad at my job.', feelings: ['Frustrated', 'Tired'] },
      { id: 's2', written_at: day(4), body: 'Fictional test entry: argued with my brother about who visits Mum. I felt unheard.', feelings: ['Frustrated'] },
      { id: 's3', written_at: day(2), body: 'Fictional test entry: long shift, skipped lunch, too tired to cook.', feelings: ['Tired'] },
      { id: 's4', written_at: day(1), body: 'Fictional test entry: walked by the river after work and felt calmer.', feelings: ['Calm'], gratitude: 'The river walk' },
    ];
    // A bulk insert sends every column for every row, so give each row all of them.
    const { error } = await a.client.from('entries').insert(entries.map((e) => ({ gratitude: null, exclude_from_analysis: false, ...e, user_id: a.id })));
    if (error) throw new Error(`could not insert fictional entries: ${error.message}`);
  });

  it('a second device for the same account reads the journal; another account reads none of it', async () => {
    expect(await count(a2.client, 'entries')).toBe(4);
    const { data } = await b.client.from('entries').select('id').eq('user_id', a.id);
    expect(data).toEqual([]);
  });

  it('a signed-in user can’t write AI rows or open AI requests themselves; only the server can', async () => {
    const forged = await a.client.from('ai_reflections').insert({
      user_id: a.id,
      entry_id: 's1',
      request_id: crypto.randomUUID(),
      style: 'listen',
      output: { acknowledgment: 'Forged' },
      schema_version: 'reflection-1',
      prompt_version: 'forged',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      entry_updated_at: new Date().toISOString(),
    });
    expect(forged.error).not.toBeNull();
    const ledger = await a.client.rpc('ai_server_begin_request', { p_user: a.id, p_kind: 'reflection', p_key: crypto.randomUUID(), p_cooldown_seconds: 0, p_daily_limit: 50 });
    expect(ledger.error).not.toBeNull();
    const old = await a.client.rpc('ai_begin_request', { p_kind: 'reflection', p_key: crypto.randomUUID(), p_cooldown_seconds: 0, p_daily_limit: 50 });
    expect(old.error).not.toBeNull();
  });

  it('every function refuses a forged token', async () => {
    for (const fn of ['generate-reflection', 'generate-insights', 'generate-follow-up'] as const) {
      expect((await call(fn, 'not-a-real-token', {})).status).toBe(401);
    }
  });

  it('refuses without consent, and an outdated reflection consent counts as none', async () => {
    const ask = () => call('generate-reflection', a.token, { entry_id: 's1', style: 'listen', idempotency_key: uuid() });
    expect(await ask()).toEqual({ status: 403, body: { error: 'consent_required' } });
    if (CURRENT_TERMS.consentVersion.entry_reflection !== '1') {
      await grant(a.client, 'entry_reflection', '1');
      expect((await ask()).status).toBe(403);
    }
  });

  it('LIVE: a reflection is written by the real model and reaches the other device, not the other account', async () => {
    expect((await grant(a.client, 'entry_reflection')).error).toBeNull();
    const res = await call('generate-reflection', a.token, { entry_id: 's1', style: 'honest', idempotency_key: uuid() });
    expect(res.status).toBe(200);
    const reflection = (res.body as { reflection: { id: string; provider: string; model: string; output: Record<string, unknown> } }).reflection;
    expect(reflection).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b', output: { schema_version: 'reflection-1' } });
    console.log('LIVE reflection (fictional entry, style honest):', JSON.stringify(reflection.output, null, 2));
    const { data } = await a2.client.from('ai_reflections').select('id, prompt_version').eq('entry_id', 's1');
    expect(data?.map((r) => r.id)).toContain(reflection.id);
    // The deployed function is the code in this repository.
    expect(data?.find((r) => r.id === reflection.id)?.prompt_version).toBe(REFLECTION_PROMPT_VERSION);
    expect((await b.client.from('ai_reflections').select('id').eq('id', reflection.id)).data).toEqual([]);
  });

  it('LIVE: Talk it through needs its own consent, then the real model replies', async () => {
    await spaceOut();
    const ask = () => call('generate-follow-up', a.token, { entry_id: 's1', message: 'Fictional follow-up: why do I keep blaming myself?', style: 'understand', idempotency_key: uuid() });
    expect(await ask()).toEqual({ status: 403, body: { error: 'consent_required' } });
    expect((await grant(a.client, 'follow_up')).error).toBeNull();
    const res = await ask();
    expect(res.status).toBe(200);
    console.log('LIVE follow-up (fictional entry):', JSON.stringify(res.body, null, 2));
    const { data } = await a2.client.from('ai_follow_ups').select('prompt_version');
    expect(data?.map((r) => r.prompt_version)).toEqual([FOLLOW_UP_PROMPT_VERSION]);
  });

  it('LIVE: a review cites only the entries sent, reaches the other device, and goes when a source entry is deleted', async () => {
    await spaceOut();
    expect((await grant(a.client, 'cross_entry_analysis')).error).toBeNull();
    const res = await call('generate-insights', a.token, { period: 'week', entry_ids: ['s2', 's3', 's4'], idempotency_key: uuid() });
    expect(res.status).toBe(200);
    const insight = (res.body as { insight: { id: string; output: { observations: { entry_ids: string[] }[] }; sources: { entry_id: string }[] } }).insight;
    console.log('LIVE review (fictional entries):', JSON.stringify(insight.output, null, 2));
    expect(insight.sources.map((s) => s.entry_id).sort()).toEqual(['s2', 's3', 's4']);
    for (const o of insight.output.observations) for (const id of o.entry_ids) expect(['s2', 's3', 's4']).toContain(id);
    expect((await a2.client.from('ai_insights').select('prompt_version').eq('id', insight.id)).data).toEqual([{ prompt_version: INSIGHTS_PROMPT_VERSION }]);
    await a2.client.from('entries').delete().eq('id', 's3');
    expect((await a.client.from('ai_insights').select('id').eq('id', insight.id)).data).toEqual([]);
  });

  it('“Delete AI outputs” on one device removes them for the other, and keeps the entries', async () => {
    expect((await a.client.rpc('delete_ai_outputs')).error).toBeNull();
    expect([await count(a2.client, 'ai_reflections'), await count(a2.client, 'ai_insights'), await count(a2.client, 'ai_follow_ups')]).toEqual([0, 0, 0]);
    expect(await count(a2.client, 'entries')).toBe(3);
  });

  it('withdrawing consent closes the server gate at once', async () => {
    await a.client.rpc('revoke_ai_consent', { p_scope: 'entry_reflection' });
    expect(await call('generate-reflection', a.token, { entry_id: 's1', style: 'listen', idempotency_key: uuid() })).toEqual({ status: 403, body: { error: 'consent_required' } });
  });
});
