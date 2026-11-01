import { Stack } from 'expo-router';
import { render } from '@testing-library/react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Account from '@/app/(onboarding)/account';
import CompassSetup from '@/app/(onboarding)/compass-setup';
import Consent from '@/app/(onboarding)/consent';
import Talk from '@/app/entry/[id]/talk';
import Index from '@/app/index';
import Sync from '@/app/sync';
import { Button } from '@/components/button';
import { SnackbarProvider } from '@/components/feedback';
import { authReference, supabaseAuth, type AuthService } from '@/services/auth';
import { emptySnapshot, toCloud } from '@/services/cloud/records';
import { CloudError, fail, supabaseRepo, unexpected } from '@/services/cloud/repo';
import { SyncContext, type SyncInfo } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { SessionProvider, useSession, type AuthUser } from '@/state/session';
import { memoryStorage, scopedStorage } from '@/storage/persistence';
import { entry } from '@/test-utils/entries';
import { space } from '@/theme/tokens';

jest.setTimeout(30000);
const wait = { timeout: 8000 };
const A: AuthUser = { id: 'user-a', email: 'a@example.test' };

// Sign-in errors ----------------------------------------------------------------------------------

describe('sign-in errors keep a safe reference', () => {
  it('passes on the error code, else the status, never the message', () => {
    expect(authReference({ code: 'invalid_credentials', status: 400, name: 'AuthApiError' })).toBe('invalid_credentials');
    expect(authReference({ status: 500, name: 'AuthApiError' })).toBe('http_500');
    expect(authReference({ name: 'AuthRetryableFetchError' })).toBe('AuthRetryableFetchError');
    expect(authReference({ code: 'has spaces and a@b.c' })).toBeUndefined();
  });

  it('a sign-in that throws (for example from a sign-in listener) is reported, not lost', async () => {
    const signInWithPassword = jest.fn(async () => {
      throw new TypeError('listener blew up');
    });
    const result = await supabaseAuth({ auth: { signInWithPassword } } as never).signIn('a@example.test', 'pw');
    expect(result).toEqual({ ok: false, message: expect.any(String), reference: 'TypeError' });
  });

  const fakeAuth = (signIn: AuthService['signIn']) => ({ signIn, signUp: jest.fn(), requestPasswordReset: jest.fn() }) as unknown as AuthService;

  async function openAccount(auth: AuthService, sync: SyncInfo | null = null, user: AuthUser | null = null) {
    function Wrapped() {
      return (
        <SessionProvider auth={auth} repo={null} watchUser={(on) => (on(user), () => {})} settings={memoryStorage()}>
          <DemoStoreProvider initial={{ ...initialState, onboarded: true }}>
            <SyncContext value={sync}>
              <Account />
            </SyncContext>
          </DemoStoreProvider>
        </SessionProvider>
      );
    }
    await renderRouter({ _layout: () => <Stack />, account: Wrapped, sync: () => <Text>Sync screen</Text> }, { initialUrl: '/account?mode=signin' });
  }

  async function signIn(email = 'a@example.test') {
    await fireEvent.changeText(await screen.findByLabelText('Email address', {}, wait), email);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'fictional-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('shows the reference with the message', async () => {
    await openAccount(fakeAuth(async () => ({ ok: false, message: 'That email and password don’t match.', reference: 'invalid_credentials' })));
    await signIn();
    expect(await screen.findByText(/don’t match\. \(Reference: invalid_credentials\)/, {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/fictional-password/)).toBeNull();
  });

  it('an unexpected throw still ends in a visible error', async () => {
    await openAccount(fakeAuth(async () => Promise.reject(new Error('boom'))));
    await signIn();
    expect(await screen.findByText(/\(Reference: unexpected\)/, {}, wait)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('signing in again restarts a sync that had stopped with “session ended”', async () => {
    const sync: SyncInfo = { status: 'signed-out', pending: 0, retry: jest.fn(), refresh: async () => {}, ensureSynced: jest.fn() };
    await openAccount(fakeAuth(async () => ({ ok: true })), sync, A);
    await signIn('A@example.test');
    expect(await screen.findByText('Sync screen', {}, wait)).toBeOnTheScreen();
    expect(sync.retry).toHaveBeenCalledTimes(1);
  });

  it('signing in as another account leaves the old account’s sync alone', async () => {
    const sync: SyncInfo = { status: 'signed-out', pending: 0, retry: jest.fn(), refresh: async () => {}, ensureSynced: jest.fn() };
    await openAccount(fakeAuth(async () => ({ ok: true })), sync, A);
    await signIn('b@example.test');
    expect(await screen.findByText('Sync screen', {}, wait)).toBeOnTheScreen();
    expect(sync.retry).not.toHaveBeenCalled();
  });
});

describe('the confirmation screen can resend the email', () => {
  const sentScreen = async (resendConfirmation: jest.Mock) => {
    const auth = { signUp: jest.fn(async () => ({ ok: true, needsConfirmation: true })), resendConfirmation } as unknown as AuthService;
    await renderRouter(
      {
        _layout: () => <Stack />,
        account: () => (
          <SessionProvider auth={auth} repo={null} watchUser={(on) => (on(null), () => {})} settings={memoryStorage()}>
            <DemoStoreProvider initial={{ ...initialState, onboarded: true }}>
              <SnackbarProvider>
                <Account />
              </SnackbarProvider>
            </DemoStoreProvider>
          </SessionProvider>
        ),
      },
      { initialUrl: '/account' },
    );
    await fireEvent.changeText(await screen.findByLabelText('Email address', {}, wait), 'new@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'fictional-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    return screen.findByRole('button', { name: 'Send again in 60s' }, wait);
  };

  /** Lets the 60-second wait run out (renderRouter has put Jest's fake clock in place). */
  const waitOut = async () => {
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    return screen.findByRole('button', { name: 'Send the email again' }, wait);
  };

  afterEach(() => jest.useRealTimers());

  it('the sign-up email itself starts the 60-second wait', async () => {
    const resendConfirmation = jest.fn(async () => ({ ok: true }));
    const waiting = await sentScreen(resendConfirmation);
    expect(waiting).toBeDisabled();
    await fireEvent.press(waiting);
    expect(resendConfirmation).not.toHaveBeenCalled();
    expect(await waitOut()).toBeEnabled();
  });

  it('confirmation screen can resend, then waits 60 seconds', async () => {
    const resendConfirmation = jest.fn(async () => ({ ok: true }));
    await sentScreen(resendConfirmation);
    const button = await waitOut();
    await fireEvent.press(button);
    expect(resendConfirmation).toHaveBeenCalledWith('new@example.test');
    const waiting = await screen.findByRole('button', { name: 'Send again in 60s' }, wait);
    expect(waiting).toBeDisabled();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(await screen.findByRole('button', { name: 'Send the email again' }, wait)).toBeEnabled();
  });

  it('resend that hits the email limit says so', async () => {
    const message = 'Too many attempts for now. Wait a few minutes and try again.';
    await sentScreen(jest.fn(async () => ({ ok: false, message })));
    await fireEvent.press(await waitOut());
    expect(await screen.findByText(message, {}, wait)).toBeOnTheScreen();
  });
});

describe('cloud reads report what actually failed', () => {
  it('only a failed fetch counts as offline', () => {
    expect(unexpected(new TypeError('Network request failed'))).toMatchObject({ kind: 'offline' });
    expect(unexpected(new RangeError('Invalid time value'))).toMatchObject({ kind: 'unknown', code: 'RangeError' });
    expect(() => fail({ code: '42501', message: 'permission denied for table entries' })).toThrow(expect.objectContaining({ kind: 'auth', code: '42501' }));
    expect(() => fail({ code: 'PGRST116', message: 'row content' })).toThrow(expect.objectContaining({ kind: 'unknown', code: 'PGRST116' }));
  });

  it('a pull that breaks on the data is not shown as “offline”', async () => {
    const rows = (data: unknown[]) => ({ select: () => ({ eq: async () => ({ data, error: null }) }) });
    const client = {
      from: (table: string) => (table === 'entries' ? rows([{ id: 'e1', written_at: 'not a date', body: 'Fictional' }]) : rows([])),
    };
    await expect(supabaseRepo(client as never).pull('user-a')).rejects.toEqual(expect.objectContaining({ kind: 'unknown', code: 'RangeError' }));
  });

  it('the backup screen names a non-network failure and its reference', async () => {
    const repo = { pull: jest.fn(async () => Promise.reject(new CloudError('Cloud request failed', 'unknown', 'PGRST116'))) };
    function Wrapped() {
      return (
        <SessionProvider auth={null} repo={repo as never} watchUser={(on) => (on(A), () => {})} settings={memoryStorage()}>
          <DemoStoreProvider initial={initialState}>
            <Sync />
          </DemoStoreProvider>
        </SessionProvider>
      );
    }
    await renderRouter({ _layout: () => <Stack />, sync: Wrapped }, { initialUrl: '/sync' });
    expect(await screen.findByText('Couldn’t read your account', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/\(Reference: PGRST116\)/)).toBeOnTheScreen();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
  });
});

// Onboarding and accounts --------------------------------------------------------------------

const syncInfo = (o: Partial<SyncInfo> = {}): SyncInfo => ({ status: 'synced', pending: 0, retry: jest.fn(), refresh: async () => {}, ensureSynced: jest.fn(), loaded: true, ...o });

/** Receives the journal's state on every render, so tests can check what was saved. */
const onState = jest.fn<void, [DemoState]>();
const latestState = () => onState.mock.lastCall?.[0] ?? initialState;
function Probe() {
  onState(useStore().state);
  return null;
}

/** The app's onboarding routes around one journal, for one session. */
async function openApp(url: string, { user = null, syncing = false, state = initialState, sync = null }: { user?: AuthUser | null; syncing?: boolean; state?: DemoState; sync?: SyncInfo | null }) {
  const repo = { pull: jest.fn(async () => Promise.reject(new CloudError('Network unavailable', 'offline'))) };
  function Layout() {
    return (
      <SessionProvider auth={null} repo={repo as never} watchUser={(on) => (on(user), () => {})} settings={memoryStorage({ syncUsers: syncing && user ? [user.id] : [] })}>
        <DemoStoreProvider initial={state}>
          <SyncContext value={sync}>
            <SnackbarProvider>
              <Stack />
              <Probe />
            </SnackbarProvider>
          </SyncContext>
        </DemoStoreProvider>
      </SessionProvider>
    );
  }
  const Stub = (label: string) =>
    function StubScreen() {
      return <Text>{label}</Text>;
    };
  await renderRouter(
    {
      _layout: Layout,
      index: Index,
      welcome: Stub('Welcome screen'),
      'compass-setup': CompassSetup,
      account: Account,
      consent: Consent,
      sync: Sync,
      'ai-intro': Stub('AI intro screen'),
      'first-entry': Stub('First entry screen'),
      today: Stub('Today screen'),
    },
    { initialUrl: url },
  );
}

describe('screens opened with nothing behind them', () => {
  // An email link cold-starts the app on /auth/confirm, which replaces itself with /sync.
  it.each([
    ['the back arrow', 'Back'],
    ['“Cloud sync is on” → Done', 'Done'],
  ])('%s goes to the root route instead of an unhandled GO_BACK', async (_name, button) => {
    const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
    await openApp('/sync', { user: A, syncing: true, state: { ...initialState, onboarded: true }, sync: syncInfo() });
    await fireEvent.press(await screen.findByRole('button', { name: button }, wait));
    expect(await screen.findByText('Today screen', {}, wait)).toBeOnTheScreen();
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/GO_BACK/);
    warn.mockRestore();
  });
});

describe('onboarding with an account', () => {
  beforeEach(() => onState.mockClear());

  it('the reported loop: signed in, finishing onboarding goes on to consent, not back to Create Account', async () => {
    await openApp('/compass-setup', { user: A, syncing: true, sync: syncInfo() });
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }, wait));
    expect(await screen.findByText('Your thoughts deserve care.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Keep your journal yours.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Use my journal without them' }));
    expect(await screen.findByText('AI intro screen', {}, wait)).toBeOnTheScreen();
  });

  it('signed out, compass setup still offers an account', async () => {
    await openApp('/compass-setup', {});
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }, wait));
    expect(await screen.findByText('Keep your journal yours.', {}, wait)).toBeOnTheScreen();
  });

  it('after signing in mid-onboarding, “Cloud sync is on” finishes setup instead of stepping back into it', async () => {
    await openApp('/sync', { user: A, syncing: true, sync: syncInfo() });
    await fireEvent.press(await screen.findByRole('button', { name: 'Done' }, wait));
    expect(await screen.findByText('Your thoughts deserve care.', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Use my journal without them' }));
    expect(await screen.findByText('Today screen', {}, wait)).toBeOnTheScreen();
    expect(latestState().onboarded).toBe(true);
  });

  it('an existing user whose onboarding is complete opens Today, signed in or not', async () => {
    await openApp('/', { user: A, syncing: true, state: { ...initialState, onboarded: true }, sync: syncInfo({ loaded: false, status: 'connecting' }) });
    expect(await screen.findByText('Today screen', {}, wait)).toBeOnTheScreen();
  });

  it('a new user, or a guest who hasn’t finished, starts onboarding', async () => {
    await openApp('/', {});
    expect(await screen.findByText('Welcome screen', {}, wait)).toBeOnTheScreen();
  });

  it('a synced account waits for its own record before deciding, then follows it', async () => {
    const register = jest.fn<void, [() => void]>();
    // Stands in for CloudSync: the first read brings the account's profile, which says onboarding is done.
    function FakeCloudSync({ children }: { children: React.ReactNode }) {
      const { dispatch } = useStore();
      const [read, setRead] = useState(false);
      useEffect(() => {
        register(() => {
          dispatch({ type: 'patch', patch: { onboarded: true } });
          setRead(true);
        });
      }, [dispatch]);
      return <SyncContext value={read ? syncInfo() : syncInfo({ loaded: false, status: 'connecting' })}>{children}</SyncContext>;
    }
    function Layout() {
      return (
        <DemoStoreProvider initial={initialState}>
          <FakeCloudSync>
            <Stack />
          </FakeCloudSync>
        </DemoStoreProvider>
      );
    }
    await renderRouter({ _layout: Layout, index: Index, welcome: () => <Text>Welcome screen</Text>, today: () => <Text>Today screen</Text> }, { initialUrl: '/' });
    expect(await screen.findByText('Opening your journal…', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Welcome screen')).toBeNull();
    await act(async () => register.mock.lastCall?.[0]());
    expect(await screen.findByText('Today screen', {}, wait)).toBeOnTheScreen();
  });

  it('a failed read of the account says so and offers a retry, instead of restarting onboarding', async () => {
    const sync = syncInfo({ loaded: false, status: 'error', errorCode: 'PGRST301' });
    await openApp('/', { user: A, syncing: true, sync });
    expect(await screen.findByText('Couldn’t open your account’s journal', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/\(Reference: PGRST301\)/)).toBeOnTheScreen();
    expect(screen.queryByText('Welcome screen')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(sync.retry).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Set up on this device for now' }));
    expect(await screen.findByText('Welcome screen', {}, wait)).toBeOnTheScreen();
  });

  /** Signed up partway through onboarding (style chosen, not finished), then turns on sync from Cloud Backup. */
  async function turnOnSyncMidOnboarding(signedInAs: AuthUser) {
    const partway: DemoState = { ...initialState, supportStyle: 'honest' };
    let uploaded = false;
    const repo = {
      pull: jest.fn(async () => (uploaded ? toCloud(partway) : emptySnapshot())),
      push: jest.fn(async () => {}),
      markConsented: jest.fn(async () => {
        uploaded = true;
      }),
    };
    const guest = memoryStorage({ version: 1, state: partway });
    // Like the app's journal: switching to the account's journal remounts everything below and
    // loads it from storage, so the navigator starts again at the root route.
    function Journal({ children }: { children: React.ReactNode }) {
      const { scope } = useSession();
      return (
        <DemoStoreProvider key={scope} storage={scope === 'guest' ? guest : scopedStorage(scope)}>
          {children}
        </DemoStoreProvider>
      );
    }
    function Layout() {
      return (
        <SessionProvider auth={null} repo={repo as never} watchUser={(on) => (on(signedInAs), () => {})} settings={memoryStorage({ syncUsers: [] })}>
          <Journal>
            <Stack />
          </Journal>
        </SessionProvider>
      );
    }
    await renderRouter(
      { _layout: Layout, index: Index, sync: Sync, welcome: () => <Text>Welcome screen</Text>, consent: Consent, 'first-entry': () => <Text>First entry screen</Text> },
      { initialUrl: '/sync' },
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on cloud sync' }, wait));
    await fireEvent.press(await screen.findByRole('button', { name: 'Open my synced journal' }, wait));
  }

  it('turning on sync partway through onboarding carries on at consent, not back at Welcome', async () => {
    await turnOnSyncMidOnboarding({ id: 'user-resume', email: 'resume@example.test' });
    expect(await screen.findByText('Your thoughts deserve care.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Welcome screen')).toBeNull();
  });

  it('without that, an account that hasn’t finished onboarding still starts at Welcome', async () => {
    await openApp('/', { user: A, syncing: true });
    expect(await screen.findByText('Welcome screen', {}, wait)).toBeOnTheScreen();
  });

  it('“Check your email” leads with going back to sign in, and offers going on without an account last', async () => {
    const auth = { signUp: jest.fn(async () => ({ ok: true, needsConfirmation: true })) } as unknown as AuthService;
    function Wrapped() {
      return (
        <SessionProvider auth={auth} repo={null} watchUser={(on) => (on(null), () => {})} settings={memoryStorage()}>
          <DemoStoreProvider initial={initialState}>
            <Account />
          </DemoStoreProvider>
        </SessionProvider>
      );
    }
    await renderRouter({ _layout: () => <Stack />, account: Wrapped, consent: () => <Text>Consent screen</Text> }, { initialUrl: '/account' });
    await fireEvent.changeText(await screen.findByLabelText('Email address', {}, wait), 'new@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'fictional-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email.', {}, wait)).toBeOnTheScreen();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels.indexOf('Go back to sign in')).toBeGreaterThan(-1);
    expect(labels.indexOf('Use without an account instead')).toBeGreaterThan(labels.indexOf('Go back to sign in'));
    expect(screen.queryByRole('button', { name: 'Continue on this device for now' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Use without an account instead' }));
    expect(await screen.findByText('Consent screen', {}, wait)).toBeOnTheScreen();
  });

  it('onboarding finished before an app restart is restored from device storage', async () => {
    const storage = memoryStorage({ version: 1, state: { ...initialState, onboarded: true } });
    function Layout() {
      return (
        <DemoStoreProvider storage={storage}>
          <Stack />
        </DemoStoreProvider>
      );
    }
    await renderRouter({ _layout: Layout, index: Index, welcome: () => <Text>Welcome screen</Text>, today: () => <Text>Today screen</Text> }, { initialUrl: '/' });
    expect(await screen.findByText('Today screen', {}, wait)).toBeOnTheScreen();
  });
});

// Layout -------------------------------------------------------------------------------------

describe('buttons with long labels', () => {
  it('let the label wrap instead of clipping it', async () => {
    await render(<Button variant="secondary" label="Withdraw: reflections on an entry" onPress={() => {}} />);
    const label = screen.getByText('Withdraw: reflections on an entry');
    const style = StyleSheet.flatten(label.props.style);
    expect(style.flexShrink).toBe(1);
    expect(label.props.numberOfLines).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Withdraw: reflections on an entry' })).toBeOnTheScreen();
  });
});

describe('talking-through composer', () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
    jest.restoreAllMocks();
  });

  async function openTalk(bottomInset = 0) {
    const value: RealAi = { reflections: false, insights: false, followUps: false, needs: null, account: 'user-a', invoke: null, outputs: null };
    const state = { ...initialState, onboarded: true, entries: [entry('e1', 0, { body: 'Fictional body' })] };
    function Wrapped() {
      return (
        <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: bottomInset, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } }}>
          <RealAiProvider value={value}>
            <DemoStoreProvider initial={state}>
              <SnackbarProvider>
                <Talk />
              </SnackbarProvider>
            </DemoStoreProvider>
          </RealAiProvider>
        </SafeAreaProvider>
      );
    }
    await renderRouter({ _layout: () => <Stack />, 'entry/[id]/talk': Wrapped }, { initialUrl: '/entry/e1/talk' });
  }

  it('keeps the input and send button below the conversation, outside its scroll area', async () => {
    await openTalk();
    const input = await screen.findByLabelText('Follow-up message', {}, wait);
    const send = screen.getByRole('button', { name: 'Send follow-up' });
    const scrollers = (n: typeof input | null): (typeof input)[] => (n ? [...(n.type === 'RCTScrollView' ? [n] : []), ...scrollers(n.parent)] : []);
    expect(scrollers(input)).toHaveLength(0);
    expect(scrollers(send)).toHaveLength(0);
    // The conversation scrolls on its own, and taps there work while the keyboard is up.
    const [list] = scrollers(screen.getByText(/Ask anything about this entry/));
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('on Android, drops the navigation-bar inset under the composer while the keyboard is open', async () => {
    Platform.OS = 'android';
    const handlers: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      handlers[event] = handler;
      return { remove: () => {} };
    }) as never);
    // A 3-button navigation bar's inset.
    await openTalk(48);
    const composer = (await screen.findByLabelText('Follow-up message', {}, wait)).parent!;
    const padding = () => StyleSheet.flatten(composer.props.style).paddingBottom;
    expect(padding()).toBe(space.sm + 48);
    await act(async () => handlers.keyboardDidShow());
    expect(padding()).toBe(space.sm);
    await act(async () => handlers.keyboardDidHide());
    expect(padding()).toBe(space.sm + 48);
  });
});
