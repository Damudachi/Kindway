import { Stack } from 'expo-router';
import { render, renderHook } from '@testing-library/react-native';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Keyboard, Platform, Text } from 'react-native';

import CompassSetup from '@/app/(onboarding)/compass-setup';
import ConfirmEmail from '@/app/auth/confirm';
import EntryDetail from '@/app/entry/[id]/index';
import Composer from '@/app/write';
import { AiUnavailableNote } from '@/components/ai-unavailable';
import { SnackbarProvider } from '@/components/feedback';
import { keyboardBehavior, useBottomInset } from '@/components/screen';
import { COMPASS_AREAS, COMPASS_EXAMPLES } from '@/data/sample';
import { CURRENT_TERMS, type AiScope, type ConsentRecord, type ConsentRepo } from '@/services/ai/consent';
import { parseAuthCallback, type AuthService } from '@/services/auth';
import { AiConsentProvider } from '@/state/ai-consent';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { SessionProvider, type AuthUser } from '@/state/session';
import { memoryStorage } from '@/storage/persistence';
import { entry } from '@/test-utils/entries';

// The mocked module the routes read at call time; a wildcard import would only be a copy of it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const linking = require('expo-linking') as typeof import('expo-linking');

jest.setTimeout(30000);
const wait = { timeout: 8000 };
const A: AuthUser = { id: 'user-a', email: 'a@example.test' };
const CODE = '6f1c2d4e-0b7a-4c55-9a1e-2f3b4c5d6e7f';

describe('email link parsing', () => {
  it('reads the code from a build link and from an Expo Go link', () => {
    expect(parseAuthCallback(`kindway:///auth/confirm?code=${CODE}`)).toEqual({ kind: 'code', code: CODE });
    expect(parseAuthCallback(`exp://192.168.1.20:8081/--/auth/confirm?code=${CODE}`)).toEqual({ kind: 'code', code: CODE });
    expect(parseAuthCallback(null, { code: CODE })).toEqual({ kind: 'code', code: CODE });
  });

  it('reports an expired or used link from the fragment or the query, without needing a code', () => {
    const expired = parseAuthCallback('kindway:///auth/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(expired).toEqual({ kind: 'error', message: expect.stringMatching(/expired or was already used/) });
    expect(parseAuthCallback('exp://h:8081/--/auth/confirm?error_code=otp_expired')).toEqual(expired);
    expect(parseAuthCallback(null, { error_code: 'otp_expired' })).toEqual(expired);
    // An error wins over a code in the same link.
    expect(parseAuthCallback(`kindway:///auth/confirm?code=${CODE}#error_code=flow_state_expired`).kind).toBe('error');
  });

  it('treats malformed and empty links as incomplete', () => {
    expect(parseAuthCallback('kindway:///auth/confirm')).toEqual({ kind: 'missing' });
    expect(parseAuthCallback('kindway:///auth/confirm?code=%%%')).toEqual({ kind: 'missing' });
    expect(parseAuthCallback('kindway:///auth/confirm?code=<script>')).toEqual({ kind: 'missing' });
    expect(parseAuthCallback('not a url at all')).toEqual({ kind: 'missing' });
    expect(parseAuthCallback(undefined, { code: ['', ''] })).toEqual({ kind: 'missing' });
  });
});

describe('confirm email screen', () => {
  const fakeAuth = (ok: boolean, message = 'This link has expired or was already used. Request a new one.') =>
    ({ exchangeCode: jest.fn(async () => (ok ? { ok: true } : { ok: false, message })) }) as unknown as AuthService & { exchangeCode: jest.Mock };

  async function openLink(url: string, auth: AuthService | null, user: AuthUser | null = null) {
    function Wrapped() {
      return (
        <SessionProvider auth={auth} repo={null} watchUser={(on) => (on(user), () => {})} settings={memoryStorage()}>
          <ConfirmEmail />
        </SessionProvider>
      );
    }
    const Stub = (label: string) =>
      function StubScreen() {
        return <Text>{label}</Text>;
      };
    await renderRouter({ _layout: () => <Stack />, 'auth/confirm': Wrapped, sync: Stub('Sync screen'), account: Stub('Account screen') }, { initialUrl: url });
  }

  afterEach(() => jest.restoreAllMocks());

  it('exchanges a valid code once and shows success', async () => {
    const auth = fakeAuth(true);
    await openLink(`/auth/confirm?code=${CODE}`, auth);
    expect(await screen.findByText('Email confirmed', {}, wait)).toBeOnTheScreen();
    expect(auth.exchangeCode).toHaveBeenCalledTimes(1);
    expect(auth.exchangeCode).toHaveBeenCalledWith(CODE);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Sync screen', {}, wait)).toBeOnTheScreen();
  });

  it('an expired link says so and offers sign-in, without calling the server', async () => {
    const auth = fakeAuth(true);
    await openLink('/auth/confirm?error=access_denied&error_code=otp_expired', auth);
    expect(await screen.findByText('Couldn’t confirm here', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/expired or was already used/)).toBeOnTheScreen();
    expect(auth.exchangeCode).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Account screen', {}, wait)).toBeOnTheScreen();
  });

  it('reads an error Supabase put in the URL fragment', async () => {
    // The full URL the link opened, fragment included; Expo Router's params only carry the query.
    jest.spyOn(linking, 'useLinkingURL').mockReturnValue('exp://192.168.1.20:8081/--/auth/confirm#error_code=otp_expired&error_description=expired');
    const auth = fakeAuth(true);
    await openLink('/auth/confirm', auth);
    expect(await screen.findByText(/expired or was already used/, {}, wait)).toBeOnTheScreen();
    expect(auth.exchangeCode).not.toHaveBeenCalled();
  });

  it('ignores an older link for another screen that launched the app', async () => {
    jest.spyOn(linking, 'useLinkingURL').mockReturnValue('exp://192.168.1.20:8081/--/reset-password#error_code=otp_expired');
    const auth = fakeAuth(true);
    await openLink(`/auth/confirm?code=${CODE}`, auth);
    expect(await screen.findByText('Email confirmed', {}, wait)).toBeOnTheScreen();
    expect(auth.exchangeCode).toHaveBeenCalledWith(CODE);
  });

  it('a malformed link is called incomplete', async () => {
    const auth = fakeAuth(true);
    await openLink('/auth/confirm?code=%3Cbad%3E', auth);
    expect(await screen.findByText(/This link is incomplete/, {}, wait)).toBeOnTheScreen();
    expect(auth.exchangeCode).not.toHaveBeenCalled();
  });

  it('a link opened again after it worked says the device is already signed in', async () => {
    const auth = fakeAuth(false, 'Open this link on the device where you asked for it, or request a new one here.');
    await openLink(`/auth/confirm?code=${CODE}`, auth, A);
    expect(await screen.findByText('You’re already signed in', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/a@example.test/)).toBeOnTheScreen();
    expect(screen.queryByText('Couldn’t confirm here')).toBeNull();
  });

  it('without accounts configured it explains instead of showing a blank screen', async () => {
    await openLink(`/auth/confirm?code=${CODE}`, null);
    expect(await screen.findByText(/Accounts aren’t available/, {}, wait)).toBeOnTheScreen();
  });
});

describe('why real AI is not used', () => {
  const record = (scope: AiScope, o: Partial<ConsentRecord> = {}): ConsentRecord => ({
    id: `r-${scope}`,
    scope,
    consentVersion: CURRENT_TERMS.consentVersion[scope],
    disclosureVersion: CURRENT_TERMS.disclosureVersion,
    provider: CURRENT_TERMS.provider,
    modelRef: CURRENT_TERMS.modelRef,
    acceptedAt: '2026-10-21T10:00:00.000Z',
    revokedAt: null,
    ...o,
  });
  const repo = (list: () => Promise<ConsentRecord[]>): ConsentRepo => ({ list, grant: jest.fn(), revoke: jest.fn() });
  const invoke = jest.fn();

  async function renderNote(scope: AiScope, { user = A, syncing = true, consent }: { user?: AuthUser | null; syncing?: boolean; consent: ConsentRepo }) {
    await render(
      <SessionProvider auth={null} repo={null} watchUser={(on) => (on(user), () => {})} settings={memoryStorage({ syncUsers: syncing && user ? [user.id] : [] })}>
        <AiConsentProvider repo={consent}>
          <RealAiProvider invoke={invoke} outputs={null}>
            <AiUnavailableNote scope={scope} />
            <Text>rendered</Text>
          </RealAiProvider>
        </AiConsentProvider>
      </SessionProvider>,
    );
  }

  it.each([
    ['signed out', { user: null }, [], /needs a signed-in account/],
    ['no cloud backup', { syncing: false }, [], /cloud backup needs to be on/],
    ['never agreed', {}, [], /haven’t allowed AI reflections on an entry/],
    ['agreed to older terms', {}, [record('entry_reflection', { consentVersion: '1' })], /terms for AI reflections on an entry changed/],
    ['withdrew', {}, [record('entry_reflection', { revokedAt: '2026-10-21T11:00:00.000Z' })], /withdrew consent/],
  ] as const)('%s', async (_name, opts, records, text) => {
    await renderNote('entry_reflection', { ...opts, consent: repo(async () => [...records]) });
    expect(await screen.findByText(text, {}, wait)).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('consent that could not be read counts as no consent, with a retry', async () => {
    await renderNote('follow_up', { consent: repo(async () => Promise.reject(new Error('offline'))) });
    expect(await screen.findByText(/Couldn’t check your AI consent/, {}, wait)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('says nothing once the scope has active consent; scopes stay independent', async () => {
    await renderNote('entry_reflection', { consent: repo(async () => [record('entry_reflection')]) });
    expect(await screen.findByText('rendered', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/Real AI/)).toBeNull();

    await renderNote('follow_up', { consent: repo(async () => [record('entry_reflection')]) });
    expect(await screen.findByText(/haven’t allowed AI follow-up replies/, {}, wait)).toBeOnTheScreen();
  });
});

describe('labels say what actually wrote a response', () => {
  const real = (o: Partial<RealAi>): RealAi => ({ reflections: false, insights: false, followUps: false, needs: null, account: 'user-a', invoke: null, outputs: null, ...o });

  function withProviders(Screen: () => React.ReactElement, state: DemoState, value: RealAi) {
    return function Wrapped() {
      return (
        <RealAiProvider value={value}>
          <DemoStoreProvider initial={state}>
            <SnackbarProvider>
              <Screen />
            </SnackbarProvider>
          </DemoStoreProvider>
        </RealAiProvider>
      );
    };
  }

  it('the composer in AI mode no longer claims the reflection is simulated', async () => {
    const state = { ...initialState, aiConsent: 'ai' as const };
    await renderRouter({ write: withProviders(Composer, state, real({ reflections: true, invoke: jest.fn() })) }, { initialUrl: '/write' });
    expect(screen.getByRole('button', { name: 'Save & reflect with AI' })).toBeOnTheScreen();
    expect(screen.queryByText(/simulated preview made on this device/)).toBeNull();
  });

  it('the simulated composer says it is simulated and why', async () => {
    const state = { ...initialState, aiConsent: 'ai' as const };
    await renderRouter({ write: withProviders(Composer, state, real({ needs: 'cloud-sync' })) }, { initialUrl: '/write' });
    expect(screen.getByText(/simulated preview made on this device/)).toBeOnTheScreen();
    expect(screen.getByText(/cloud backup needs to be on/)).toBeOnTheScreen();
  });

  it('a simulated reflection names the missing requirement next to its label', async () => {
    const e = entry('e1', 0, {
      reflectionStatus: 'ready',
      reflection: { style: 'understand', source: 'simulated', acknowledge: 'Fictional preview.', basedOn: 'Fictional body' },
      body: 'Fictional body',
    });
    const state = { ...initialState, onboarded: true, aiConsent: 'ai' as const, entries: [e] };
    await renderRouter({ 'entry/[id]/index': withProviders(EntryDetail, state, real({ needs: 'account', account: null })) }, { initialUrl: '/entry/e1' });
    expect(await screen.findByText(/Preview response · simulated/, {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/needs a signed-in account/)).toBeOnTheScreen();
    expect(screen.queryByText(/Written by AI/)).toBeNull();
  });
});

describe('compass placeholders', () => {
  it('every area has its own example', () => {
    const examples = COMPASS_AREAS.map((a) => COMPASS_EXAMPLES[a]);
    expect(examples.every((e) => typeof e === 'string' && e.length > 0)).toBe(true);
    expect(new Set(examples).size).toBe(COMPASS_AREAS.length);
  });

  it('shows distinct examples that are never saved as notes', async () => {
    let saved: DemoState['compass'] = [];
    function Probe() {
      saved = useStore().state.compass;
      return null;
    }
    function Wrapped() {
      return (
        <DemoStoreProvider initial={initialState}>
          <CompassSetup />
          <Probe />
        </DemoStoreProvider>
      );
    }
    await renderRouter({ _layout: () => <Stack />, 'compass-setup': Wrapped, account: () => <Text>Account screen</Text> }, { initialUrl: '/compass-setup' });
    for (const area of ['Growth & learning', 'Career & purpose', 'Faith & meaning']) await fireEvent.press(screen.getByRole('checkbox', { name: area }));
    const growth = screen.getByPlaceholderText(COMPASS_EXAMPLES['Growth & learning']);
    expect(screen.getByPlaceholderText(COMPASS_EXAMPLES['Career & purpose'])).toBeOnTheScreen();
    expect(screen.getByPlaceholderText(COMPASS_EXAMPLES['Faith & meaning'])).toBeOnTheScreen();
    expect(growth.props.value).toBe('');
    await act(async () => fireEvent.changeText(growth, 'Fictional: learn Spanish'));
    expect(screen.getByDisplayValue('Fictional: learn Spanish')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Account screen', {}, wait)).toBeOnTheScreen();
    expect(Object.fromEntries(saved.map((c) => [c.area, c.note]))).toEqual({
      'Growth & learning': 'Fictional: learn Spanish',
      'Career & purpose': '',
      'Faith & meaning': '',
    });
  });
});

describe('entry screen layout', () => {
  it('offers writing help before the other optional controls, and the mic inside the writing template', async () => {
    function Wrapped() {
      return (
        <DemoStoreProvider initial={initialState}>
          <Composer />
        </DemoStoreProvider>
      );
    }
    await renderRouter({ _layout: () => <Stack />, write: Wrapped, voice: () => <Text>Voice screen</Text> }, { initialUrl: '/write' });
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('A little help getting started')).toBeGreaterThan(-1);
    expect(tree.indexOf('A little help getting started')).toBeLessThan(tree.indexOf('Check in with yourself'));
    const page = screen.getByLabelText('Journal entry').parent!;
    expect(within(page).getByRole('button', { name: 'Speak instead' })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Speak instead' })).toHaveLength(1);
    // Prompts keep inserting into the entry.
    await fireEvent.press(screen.getByRole('button', { name: 'What felt heavy?' }));
    expect(screen.getByLabelText('Journal entry').props.value).toBe('What felt heavy today was…');
    await fireEvent.press(screen.getByRole('button', { name: 'Speak instead' }));
    expect(await screen.findByText('Voice screen', {}, wait)).toBeOnTheScreen();
  });
});

describe('keyboard handling', () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
    jest.restoreAllMocks();
  });

  it('pads for the keyboard on Android too: the app is edge to edge, so the window is not resized', () => {
    expect(Platform.OS).toBe('ios');
    expect(keyboardBehavior).toBe('padding');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const RN = require('react-native');
      RN.Platform.OS = 'android';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expect(require('@/components/screen').keyboardBehavior).toBe('padding');
    });
  });

  it('drops the navigation-bar inset on Android while the keyboard is open', async () => {
    Platform.OS = 'android';
    const handlers: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      handlers[event] = handler;
      return { remove: () => {} };
    }) as never);
    const { result } = await renderHook(() => useBottomInset(24));
    expect(result.current).toBe(24);
    await act(async () => handlers.keyboardDidShow());
    expect(result.current).toBe(0);
    await act(async () => handlers.keyboardDidHide());
    expect(result.current).toBe(24);
  });
});
