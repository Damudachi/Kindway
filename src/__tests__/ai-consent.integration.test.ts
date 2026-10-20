/**
 * @jest-environment node
 *
 * AI consent against a real Supabase database (the local stack from `npx supabase start`),
 * with two throwaway users. Skipped unless pointed at one, like cloud-repo.integration.test.ts:
 *   KINDWAY_TEST_SUPABASE_URL, KINDWAY_TEST_PUBLISHABLE_KEY, KINDWAY_TEST_SECRET_KEY
 * Never point this at a project with real users: it creates and deletes test accounts.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { consentStatus, supabaseConsentRepo } from '@/services/ai/consent';

import { hasActiveConsent } from '../../supabase/functions/_shared/ai-consent';

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
  const email = `kindway-consent-${label}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`could not create ${label}: ${error?.message}`);
  const client = createClient(url!, publishable!, options);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`could not sign in ${label}`);
  return { id: data.user.id, client, repo: supabaseConsentRepo(client) };
}

run('AI consent with two real users', () => {
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

  it('starts with no consent; the server gate refuses both scopes', async () => {
    expect(await a.repo.list()).toEqual([]);
    expect(await hasActiveConsent(a.client, 'entry_reflection')).toBe(false);
    expect(await hasActiveConsent(a.client, 'cross_entry_analysis')).toBe(false);
  });

  it('a grant opens only its own scope, for its own user', async () => {
    const granted = await a.repo.grant('entry_reflection');
    expect(granted.revokedAt).toBeNull();
    expect(await hasActiveConsent(a.client, 'entry_reflection')).toBe(true);
    expect(await hasActiveConsent(a.client, 'cross_entry_analysis')).toBe(false);
    expect(await hasActiveConsent(b.client, 'entry_reflection')).toBe(false);
    expect(await b.repo.list()).toEqual([]);
  });

  it('another user cannot withdraw it', async () => {
    await b.repo.revoke('entry_reflection');
    expect(await hasActiveConsent(a.client, 'entry_reflection')).toBe(true);
  });

  it('withdrawal closes the gate on the server immediately and is kept in the history', async () => {
    await a.repo.revoke('entry_reflection');
    expect(await hasActiveConsent(a.client, 'entry_reflection')).toBe(false);
    const records = await a.repo.list();
    expect(records).toHaveLength(1);
    expect(consentStatus(records, 'entry_reflection')).toBe('withdrawn');
  });

  it('a signed-out client is refused', async () => {
    const anon = createClient(url!, publishable!, options);
    expect(await hasActiveConsent(anon, 'entry_reflection')).toBe(false);
  });

  it('deleting the account removes its consent records', async () => {
    await a.repo.grant('cross_entry_analysis');
    await admin.auth.admin.deleteUser(a.id);
    const { count } = await admin.from('ai_consents').select('id', { count: 'exact', head: true }).eq('user_id', a.id);
    expect(count).toBe(0);
  });
});
