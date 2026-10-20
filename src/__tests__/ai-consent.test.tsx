import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import AiConsentScreen from '@/app/settings/ai-consent';
import { SnackbarProvider } from '@/components/feedback';
import { consentStatus, CURRENT_TERMS, supabaseConsentRepo, type AiScope, type ConsentRecord, type ConsentRepo } from '@/services/ai/consent';
import { CloudError } from '@/services/cloud/repo';
import { AiConsentProvider } from '@/state/ai-consent';
import { DemoStoreProvider, initialState } from '@/state/demo-store';
import { SessionProvider, type AuthUser } from '@/state/session';
import { memoryStorage } from '@/storage/persistence';

import { AI_CONSENT_TERMS, hasActiveConsent, type RpcClient } from '../../supabase/functions/_shared/ai-consent';

jest.setTimeout(30000);

const record = (scope: AiScope, patch: Partial<ConsentRecord> = {}): ConsentRecord => ({
  id: `${scope}-${Math.random()}`,
  scope,
  consentVersion: CURRENT_TERMS.consentVersion[scope],
  disclosureVersion: CURRENT_TERMS.disclosureVersion,
  provider: CURRENT_TERMS.provider,
  modelRef: CURRENT_TERMS.modelRef,
  acceptedAt: '2026-10-20T10:00:00.000Z',
  revokedAt: null,
  ...patch,
});

describe('consent terms', () => {
  it('the app records exactly the terms the server requires', () => {
    expect(CURRENT_TERMS).toEqual(AI_CONSENT_TERMS);
  });
});

describe('consentStatus', () => {
  it('is none without any record', () => {
    expect(consentStatus([], 'entry_reflection')).toBe('none');
  });

  it('keeps the two scopes independent', () => {
    const records = [record('entry_reflection')];
    expect(consentStatus(records, 'entry_reflection')).toBe('active');
    expect(consentStatus(records, 'cross_entry_analysis')).toBe('none');
  });

  it('treats a grant under earlier wording, disclosure or provider as outdated', () => {
    expect(consentStatus([record('entry_reflection', { consentVersion: '0' })], 'entry_reflection')).toBe('outdated');
    expect(consentStatus([record('entry_reflection', { disclosureVersion: 'old' })], 'entry_reflection')).toBe('outdated');
    expect(consentStatus([record('entry_reflection', { provider: 'other' })], 'entry_reflection')).toBe('outdated');
  });

  it('follows the newest record: withdrawn, then granted again', () => {
    const withdrawn = record('cross_entry_analysis', { acceptedAt: '2026-10-01T00:00:00.000Z', revokedAt: '2026-10-02T00:00:00.000Z' });
    expect(consentStatus([withdrawn], 'cross_entry_analysis')).toBe('withdrawn');
    expect(consentStatus([withdrawn, record('cross_entry_analysis')], 'cross_entry_analysis')).toBe('active');
  });
});

describe('server-side consent gate', () => {
  const client = (result: { data: unknown; error: unknown } | Error): RpcClient & { rpc: jest.Mock } => ({
    rpc: jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  });

  it('asks the database for the current terms of that scope, without any user id', async () => {
    const c = client({ data: true, error: null });
    expect(await hasActiveConsent(c, 'cross_entry_analysis')).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith('ai_consent_active', {
      p_scope: 'cross_entry_analysis',
      p_consent_version: AI_CONSENT_TERMS.consentVersion.cross_entry_analysis,
      p_disclosure_version: AI_CONSENT_TERMS.disclosureVersion,
      p_provider: AI_CONSENT_TERMS.provider,
    });
  });

  it('fails closed on no consent, errors, odd data and network failures', async () => {
    expect(await hasActiveConsent(client({ data: false, error: null }), 'entry_reflection')).toBe(false);
    expect(await hasActiveConsent(client({ data: true, error: { code: '42501' } }), 'entry_reflection')).toBe(false);
    expect(await hasActiveConsent(client({ data: 'true', error: null }), 'entry_reflection')).toBe(false);
    expect(await hasActiveConsent(client({ data: null, error: null }), 'entry_reflection')).toBe(false);
    expect(await hasActiveConsent(client(new Error('fetch failed')), 'entry_reflection')).toBe(false);
  });
});

describe('supabaseConsentRepo', () => {
  it('grants the current terms through the database function', async () => {
    const row = { id: 'x', scope: 'entry_reflection', consent_version: '1', disclosure_version: 'd', provider: 'groq', model_ref: 'm', accepted_at: 'now', revoked_at: null };
    const rpc = jest.fn(async () => ({ data: row, error: null }));
    const repo = supabaseConsentRepo({ rpc } as never);
    expect(await repo.grant('entry_reflection')).toMatchObject({ id: 'x', consentVersion: '1', revokedAt: null });
    expect(rpc).toHaveBeenCalledWith('grant_ai_consent', {
      p_scope: 'entry_reflection',
      p_consent_version: CURRENT_TERMS.consentVersion.entry_reflection,
      p_disclosure_version: CURRENT_TERMS.disclosureVersion,
      p_provider: CURRENT_TERMS.provider,
      p_model_ref: CURRENT_TERMS.modelRef,
    });
  });

  it('reports only an error category, never the server message', async () => {
    const repo = supabaseConsentRepo({ rpc: async () => ({ data: null, error: { code: '42501', message: 'row details' } }) } as never);
    await expect(repo.revoke('entry_reflection')).rejects.toEqual(expect.objectContaining({ kind: 'auth', message: 'Not authorized' }));
    const offline = supabaseConsentRepo({
      rpc: async () => {
        throw new TypeError('Network request failed');
      },
    } as never);
    await expect(offline.grant('entry_reflection')).rejects.toBeInstanceOf(CloudError);
  });
});

/** An account's consent history held in memory, following the database's rules. */
function fakeConsentRepo() {
  const records: ConsentRecord[] = [];
  let failNext = false;
  let clock = Date.parse('2026-10-20T10:00:00.000Z');
  const check = () => {
    if (failNext) {
      failNext = false;
      throw new CloudError('Network unavailable', 'offline');
    }
  };
  const revokeActive = (scope: AiScope) => {
    for (const r of records) if (r.scope === scope && !r.revokedAt) r.revokedAt = new Date(clock++).toISOString();
  };
  const repo: ConsentRepo = {
    list: jest.fn(async () => {
      check();
      return records.map((r) => ({ ...r }));
    }),
    grant: jest.fn(async (scope: AiScope) => {
      check();
      revokeActive(scope);
      const r = record(scope, { acceptedAt: new Date(clock++).toISOString() });
      records.push(r);
      return r;
    }),
    revoke: jest.fn(async (scope: AiScope) => {
      check();
      revokeActive(scope);
    }),
  };
  return { repo, records, failNextCall: () => (failNext = true) };
}

const A: AuthUser = { id: 'user-a', email: 'a@example.test' };

function renderConsent(user: AuthUser | null, repo: ConsentRepo | null) {
  const watchUser = (on: (u: AuthUser | null) => void) => {
    on(user);
    return () => {};
  };
  function Wrapped() {
    return (
      <SessionProvider auth={null} repo={null} watchUser={watchUser} settings={memoryStorage()}>
        <AiConsentProvider repo={repo}>
          <DemoStoreProvider initial={initialState}>
            <SnackbarProvider>
              <AiConsentScreen />
            </SnackbarProvider>
          </DemoStoreProvider>
        </AiConsentProvider>
      </SessionProvider>
    );
  }
  return renderRouter({ 'settings/ai-consent': Wrapped }, { initialUrl: '/settings/ai-consent' });
}

describe('AI processing consent screen', () => {
  it('without an account, nothing can be allowed', async () => {
    await renderConsent(null, null);
    expect(await screen.findByText('An account is needed')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Allow/ })).toBeNull();
    expect(screen.getByText('Real AI isn’t switched on in this version')).toBeOnTheScreen();
  });

  it('records each scope separately, only after the user confirms they read the disclosure', async () => {
    const fake = fakeConsentRepo();
    await renderConsent(A, fake.repo);
    const allowEntry = await screen.findByRole('button', { name: 'Allow: reflections on an entry' });
    expect(allowEntry).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Allow: reviews across entries' })).toBeDisabled();

    // The first checkbox belongs to the entry-reflection section.
    await fireEvent.press(screen.getAllByRole('checkbox')[0]);
    expect(allowEntry).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Allow: reviews across entries' })).toBeDisabled();
    await fireEvent.press(allowEntry);

    expect(await screen.findByRole('button', { name: 'Withdraw: reflections on an entry' })).toBeOnTheScreen();
    expect(fake.repo.grant).toHaveBeenCalledTimes(1);
    expect(fake.repo.grant).toHaveBeenCalledWith('entry_reflection');
    expect(screen.getByRole('button', { name: 'Allow: reviews across entries' })).toBeOnTheScreen();
  });

  it('withdrawing asks first, then records the withdrawal on the server', async () => {
    const fake = fakeConsentRepo();
    fake.records.push(record('entry_reflection'), record('cross_entry_analysis'));
    await renderConsent(A, fake.repo);
    await fireEvent.press(await screen.findByRole('button', { name: 'Withdraw: reviews across entries' }));
    expect(screen.getByText('Withdraw this choice?')).toBeOnTheScreen();
    expect(fake.repo.revoke).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Withdraw' }));

    expect(await screen.findByText('Not allowed. You withdrew it.')).toBeOnTheScreen();
    expect(fake.repo.revoke).toHaveBeenCalledWith('cross_entry_analysis');
    // The other scope is untouched.
    expect(screen.getByRole('button', { name: 'Withdraw: reflections on an entry' })).toBeOnTheScreen();
  });

  it('a failed grant changes nothing and says so', async () => {
    const fake = fakeConsentRepo();
    await renderConsent(A, fake.repo);
    await fireEvent.press((await screen.findAllByRole('checkbox'))[0]);
    fake.failNextCall();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow: reflections on an entry' }));
    expect(await screen.findByText(/Couldn’t record that\. Nothing changed/)).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Allow: reflections on an entry' })).toBeOnTheScreen());
    expect(fake.records).toHaveLength(0);
  });

  it('if the account can’t be checked, it says nothing will be sent and offers a retry', async () => {
    const fake = fakeConsentRepo();
    fake.failNextCall();
    await renderConsent(A, fake.repo);
    expect(await screen.findByText('Couldn’t check your choices')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Allow: reflections on an entry' })).toBeOnTheScreen();
  });

  it('an outdated grant must be agreed to again', async () => {
    const fake = fakeConsentRepo();
    fake.records.push(record('entry_reflection', { disclosureVersion: 'older' }));
    await renderConsent(A, fake.repo);
    expect(await screen.findByText(/changed since you agreed/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Allow: reflections on an entry' })).toBeDisabled();
  });
});
