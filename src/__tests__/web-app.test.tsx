/**
 * The web app (the iPhone Home Screen version): what it hides, where it routes and what it says.
 * Every web check goes through `onWeb()`, mocked here; it's on unless a test switches it off.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import Account from '@/app/(onboarding)/account';
import FirstEntry from '@/app/(onboarding)/first-entry';
import Welcome from '@/app/(onboarding)/welcome';
import WebTabsLayout from '@/app/(tabs)/_layout.web';
import Today from '@/app/(tabs)/today';
import RemindersSetup from '@/app/(onboarding)/reminders-setup';
import ConfirmEmail from '@/app/auth/confirm';
import ResetPassword from '@/app/reset-password';
import Privacy from '@/app/settings/privacy';
import Settings from '@/app/settings/index';
import RemindersScreen from '@/app/settings/reminders';
import Voice from '@/app/voice';
import WidgetScreen from '@/app/widget';
import { SnackbarProvider } from '@/components/feedback';
import { ReminderOffer } from '@/components/reminder-offer';
import type { AuthService } from '@/services/auth';
import { notifications } from '@/services/reminders';
import { inIosBrowserTab, iosBrowserTab, onWeb } from '@/services/platform';
import { DemoStoreProvider, initialState, type DemoState } from '@/state/demo-store';
import { SessionProvider } from '@/state/session';
import { memoryStorage } from '@/storage/persistence';
import { WidgetSync } from '@/state/widget-sync';
import { entry } from '@/test-utils/entries';
import { updateWidget } from '@/widget/native';

jest.mock('@/services/platform', () => ({ ...jest.requireActual('@/services/platform'), onWeb: jest.fn(() => true), inIosBrowserTab: jest.fn(() => false) }));
jest.mock('@/widget/native', () => ({ ...jest.requireActual('@/widget/native'), updateWidget: jest.fn(async () => {}) }));

const web = jest.mocked(onWeb);
beforeEach(() => {
  web.mockReturnValue(true);
  jest.mocked(updateWidget).mockClear();
});

function withProviders(Screen: () => React.ReactElement | null, state: DemoState = initialState) {
  return function Wrapped() {
    return (
      <DemoStoreProvider initial={state}>
        <SnackbarProvider>
          <Screen />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  };
}

const Stub = (label: string) =>
  function StubScreen() {
    return <Text>{label}</Text>;
  };

const wait = { timeout: 8000 };
const onboarded: DemoState = { ...initialState, onboarded: true, entries: [entry('e1', 0)] };

describe('web: reminders and the widget are hidden', () => {
  it('has no notifications module to schedule with', () => {
    expect(notifications()).toBeNull();
  });

  it('Settings drops the widget row and says reminders are not here yet', async () => {
    const screen = await renderRouter({ settings: withProviders(Settings) }, { initialUrl: '/settings' });
    expect(screen.queryByRole('button', { name: /Home-screen widget/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gentle reminders/ })).toBeNull();
    expect(screen.getByText('Gentle reminders aren’t available in the web app yet.')).toBeOnTheScreen();
  });

  it('Settings keeps both rows off the web', async () => {
    web.mockReturnValue(false);
    const screen = await renderRouter({ settings: withProviders(Settings) }, { initialUrl: '/settings' });
    expect(screen.getByRole('button', { name: /Home-screen widget/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Gentle reminders/ })).toBeOnTheScreen();
  });

  it.each([
    ['/widget', 'widget', WidgetScreen, 'Settings screen'],
    ['/settings/reminders', 'settings/reminders', RemindersScreen, 'Settings screen'],
    ['/reminders-setup', 'reminders-setup', RemindersSetup, 'Today screen'],
  ])('%s leads elsewhere', async (url, route, Screen, landing) => {
    const screen = await renderRouter(
      { [route]: withProviders(Screen), 'settings/index': Stub('Settings screen'), today: Stub('Today screen') },
      { initialUrl: url },
    );
    expect(await screen.findByText(landing, {}, wait)).toBeOnTheScreen();
  });

  it('the first entry, saved without a reflection, goes straight to Today', async () => {
    const screen = await renderRouter({ 'first-entry': withProviders(FirstEntry), today: Stub('Today screen'), 'reminders-setup': Stub('Reminders setup') }, { initialUrl: '/first-entry' });
    await fireEvent.changeText(await screen.findByLabelText('Journal entry', {}, wait), 'A first thought');
    await fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('Today screen', {}, wait)).toBeOnTheScreen();
  });

  it('Today’s reminder offer stays away', async () => {
    const screen = await renderRouter({ offer: withProviders(ReminderOffer, onboarded) }, { initialUrl: '/offer' });
    expect(screen.queryByText(/reminder/i)).toBeNull();
  });

  it('Today’s reminder offer still shows off the web', async () => {
    web.mockReturnValue(false);
    const screen = await renderRouter({ offer: withProviders(ReminderOffer, onboarded) }, { initialUrl: '/offer' });
    expect(screen.getByText(/One quiet reminder/)).toBeOnTheScreen();
  });

  it('the widget is never redrawn', async () => {
    await render(
      <DemoStoreProvider initial={onboarded}>
        <WidgetSync />
      </DemoStoreProvider>,
    );
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it('the widget is still redrawn off the web', async () => {
    web.mockReturnValue(false);
    await render(
      <DemoStoreProvider initial={onboarded}>
        <WidgetSync />
      </DemoStoreProvider>,
    );
    await waitFor(() => expect(updateWidget).toHaveBeenCalled());
  });
});

describe('web: no mention of Android', () => {
  it('Privacy describes the browser’s storage', async () => {
    const screen = await renderRouter({ 'settings/privacy': withProviders(Privacy) }, { initialUrl: '/settings/privacy' });
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/Android/);
    expect(screen.getByText(/kept in this browser’s storage/)).toBeOnTheScreen();
  });

  it('Voice talks about the browser when the microphone is refused', async () => {
    const screen = await renderRouter({ voice: withProviders(Voice) }, { initialUrl: '/voice' });
    await fireEvent.press(screen.getByRole('button', { name: 'Start recording' }));
    expect(screen.getByText('Audio is used only to create the transcript, then discarded. Your browser will ask you to allow access.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: "Don't allow (demo)" }));
    expect(screen.getByText('You can turn it on in your browser’s settings, or write instead. Nothing you’ve written is affected.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again (demo)' })).toBeOnTheScreen();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/Android/);
  });
});

describe('web: email links opened in Safari', () => {
  // A link asked for in the Home Screen app opens in Safari, which lacks that app's PKCE verifier.
  const missing = { ok: false as const, message: 'Open this link on the device where you asked for it, or request a new one here.', reference: 'pkce_verifier_missing' };

  function withAuth(Screen: () => React.ReactElement | null, auth: Partial<AuthService>, user: { id: string; email: string } | null = null) {
    return function Wrapped() {
      return (
        <SessionProvider auth={auth as AuthService} repo={null} watchUser={(on) => (on(user), () => {})} settings={memoryStorage()}>
          <DemoStoreProvider initial={initialState}>
            <SnackbarProvider>
              <Screen />
            </SnackbarProvider>
          </DemoStoreProvider>
        </SessionProvider>
      );
    };
  }

  it('a confirmation link still confirms, and says to sign in on the Home Screen', async () => {
    const auth = { exchangeCode: jest.fn(async () => missing) };
    const screen = await renderRouter(
      { 'auth/confirm': withAuth(ConfirmEmail, auth), account: Stub('Account screen') },
      { initialUrl: '/auth/confirm?code=abcdefgh-1234' },
    );
    expect(await screen.findByText('Email confirmed', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Open Kindway from your Home Screen and sign in with your email and password.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in here instead' }));
    expect(await screen.findByText('Account screen', {}, wait)).toBeOnTheScreen();
    expect(screen).toHaveSearchParams({ mode: 'signin' });
  });

  it('a link opened again in a tab that is already signed in says so, rather than pointing to the Home Screen', async () => {
    const auth = { exchangeCode: jest.fn(async () => missing) };
    const screen = await renderRouter({ 'auth/confirm': withAuth(ConfirmEmail, auth, { id: 'u1', email: 'a@example.test' }) }, { initialUrl: '/auth/confirm?code=abcdefgh-1234' });
    expect(await screen.findByText('You’re already signed in', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Email confirmed')).toBeNull();
  });

  it('asking for a reset on the web says the link opens in Safari', async () => {
    const screen = await renderRouter({ account: withAuth(Account, {}) }, { initialUrl: '/account?mode=forgot' });
    expect(
      await screen.findByText('On iPhone, the reset link opens in Safari. If Safari says so, ask for the link again there; the new password then works here too.', {}, wait),
    ).toBeOnTheScreen();
  });

  it('off the web, the reset form has no Safari note', async () => {
    web.mockReturnValue(false);
    const screen = await renderRouter({ account: withAuth(Account, {}) }, { initialUrl: '/account?mode=forgot' });
    expect(await screen.findByRole('button', { name: 'Send reset link' }, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/reset link opens in Safari/)).toBeNull();
  });

  it('off the web, the same failure keeps the existing explanation', async () => {
    web.mockReturnValue(false);
    const auth = { exchangeCode: jest.fn(async () => missing) };
    const screen = await renderRouter({ 'auth/confirm': withAuth(ConfirmEmail, auth) }, { initialUrl: '/auth/confirm?code=abcdefgh-1234' });
    expect(await screen.findByText('Couldn’t confirm here', {}, wait)).toBeOnTheScreen();
  });

  it('a reset link asks to request it again here, where it will work', async () => {
    const auth = { exchangeCode: jest.fn(async () => missing) };
    const screen = await renderRouter(
      { 'reset-password': withAuth(ResetPassword, auth), account: withAuth(Account, auth) },
      { initialUrl: '/reset-password?code=abcdefgh-1234' },
    );
    expect(await screen.findByText('Request the link again here', {}, wait)).toBeOnTheScreen();
    expect(
      screen.getByText(
        'This link was asked for in Kindway on your Home Screen, which keeps its sign-in apart from Safari. Request a new link on this page, open it from your email, and choose your new password here. It then works in the app too.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Request a new link' }));
    expect(await screen.findByRole('button', { name: 'Send reset link' }, wait)).toBeOnTheScreen();
  });

  it('a finished reset points to the Home Screen app', async () => {
    const auth = { exchangeCode: jest.fn(async () => ({ ok: true as const })), updatePassword: jest.fn(async () => ({ ok: true as const })) };
    const screen = await renderRouter({ 'reset-password': withAuth(ResetPassword, auth) }, { initialUrl: '/reset-password?code=abcdefgh-1234' });
    await fireEvent.changeText(await screen.findByLabelText('New password', {}, wait), 'a-long-new-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText(/Use it to sign in to Kindway on your Home Screen too\./, {}, wait)).toBeOnTheScreen();
  });
});

describe('web: a new version waiting', () => {
  type Listener = () => void;
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  let controllerChange: Listener[];
  let postMessage: jest.Mock;
  let getRegistration: jest.Mock;
  const reload = jest.fn();

  function fakeWorker(waiting: boolean) {
    controllerChange = [];
    postMessage = jest.fn();
    getRegistration = jest.fn(async () => ({ waiting: waiting ? { postMessage } : null, installing: null, update: jest.fn(async () => {}), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
    nav.serviceWorker = {
      controller: {},
      getRegistration,
      addEventListener: (type: string, fn: Listener) => type === 'controllerchange' && controllerChange.push(fn),
    };
  }

  beforeEach(() => {
    reload.mockClear();
    Object.defineProperty(globalThis, 'location', { value: { origin: 'https://kindway.pages.dev', reload }, configurable: true });
  });
  afterEach(() => {
    delete nav.serviceWorker;
    if (location) Object.defineProperty(globalThis, 'location', location);
    else delete (globalThis as { location?: unknown }).location;
  });

  it('Today offers to restart into it, and restarts once it has taken over', async () => {
    fakeWorker(true);
    const screen = await renderRouter({ today: withProviders(Today) }, { initialUrl: '/today' });
    expect(await screen.findByText('A new version of Kindway is ready', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('It opens the next time you start Kindway. Restarting now keeps everything you’ve written.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Restart now' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    controllerChange.forEach((fn) => fn());
    controllerChange.forEach((fn) => fn());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('pressing Restart now twice still reloads only once', async () => {
    fakeWorker(true);
    const screen = await renderRouter({ today: withProviders(Today) }, { initialUrl: '/today' });
    const restart = await screen.findByRole('button', { name: 'Restart now' }, wait);
    await fireEvent.press(restart);
    await fireEvent.press(restart);
    expect(controllerChange).toHaveLength(1);
    controllerChange.forEach((fn) => fn());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('says nothing when no version is waiting', async () => {
    fakeWorker(false);
    const screen = await renderRouter({ today: withProviders(Today) }, { initialUrl: '/today' });
    await waitFor(() => expect(getRegistration).toHaveBeenCalled());
    expect(screen.queryByText('A new version of Kindway is ready')).toBeNull();
  });

  it('doesn’t look for one off the web', async () => {
    web.mockReturnValue(false);
    fakeWorker(true);
    const screen = await renderRouter({ today: withProviders(Today) }, { initialUrl: '/today' });
    expect(screen.getByText(/How are you arriving/)).toBeOnTheScreen();
    expect(getRegistration).not.toHaveBeenCalled();
  });
});

describe('web: which browsers get the Home Screen tip', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-A375F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

  it('an iPhone tab, not the installed app', () => {
    expect(iosBrowserTab(IPHONE, 5, false)).toBe(true);
    expect(iosBrowserTab(IPHONE, 5, true)).toBe(false);
  });

  it('an iPad, which reports itself as a Mac with touch', () => {
    expect(iosBrowserTab(IPAD_DESKTOP, 5, false)).toBe(true);
    expect(iosBrowserTab(IPAD_DESKTOP, 0, false)).toBe(false);
  });

  it('not Android', () => {
    expect(iosBrowserTab(ANDROID, 5, false)).toBe(false);
  });
});

describe('web: Home Screen tip and backup nudge', () => {
  const tab = jest.mocked(inIosBrowserTab);
  const DAY = 24 * 60 * 60 * 1000;
  const prefs = async () => JSON.parse((await AsyncStorage.getItem('kindway:web:v1')) ?? 'null');
  const seed = (value: object) => AsyncStorage.setItem('kindway:web:v1', JSON.stringify(value));
  // Lets the stored preferences load before checking that a card stays away.
  const settle = async () => {
    await act(async () => {});
    await act(async () => {});
  };
  beforeEach(async () => {
    await AsyncStorage.clear();
    tab.mockReturnValue(true);
  });
  afterEach(() => tab.mockReturnValue(false));

  function signedOut(Screen: () => React.ReactElement | null, state: DemoState = onboarded) {
    return function Wrapped() {
      return (
        <SessionProvider auth={{} as AuthService} repo={null} watchUser={(on) => (on(null), () => {})} settings={memoryStorage()}>
          <DemoStoreProvider initial={state}>
            <SnackbarProvider>
              <Screen />
            </SnackbarProvider>
          </DemoStoreProvider>
        </SessionProvider>
      );
    };
  }

  const TIP = 'Add Kindway to your Home Screen';
  const TIP_BODY =
    'Tap Share, then “Add to Home Screen”. Kindway then opens full screen, like an app. Add it before you write much: the Home Screen app keeps its own journal, apart from this tab, unless you sign in and back it up.';

  it.each([
    ['Welcome', '/welcome'],
    ['Today', '/today'],
  ])('%s shows the tip in an iPhone browser tab until it’s dismissed', async (_name, url) => {
    const routes = { welcome: withProviders(Welcome), today: withProviders(Today) };
    const screen = await renderRouter(routes, { initialUrl: url });
    expect(await screen.findByText(TIP, {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(TIP_BODY)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByText(TIP)).toBeNull());
    await waitFor(async () => expect(await prefs()).toMatchObject({ installTipDone: true }));
  });

  it('once dismissed in this browser, the tip stays away', async () => {
    await seed({ installTipDone: true });
    const screen = await renderRouter({ welcome: withProviders(Welcome) }, { initialUrl: '/welcome' });
    expect(screen.getByText('A place to come back to yourself.')).toBeOnTheScreen();
    await settle();
    expect(screen.queryByText(TIP)).toBeNull();
  });

  it('shows no tip anywhere else', async () => {
    tab.mockReturnValue(false);
    const screen = await renderRouter({ today: withProviders(Today) }, { initialUrl: '/today' });
    expect(screen.getByText(/How are you arriving/)).toBeOnTheScreen();
    await settle();
    expect(screen.queryByText(TIP)).toBeNull();
  });

  const NUDGE = 'Only in this browser';

  it('nudges a local-only journal towards a backup', async () => {
    tab.mockReturnValue(false);
    const screen = await renderRouter({ today: signedOut(Today), account: Stub('Account screen') }, { initialUrl: '/today' });
    expect(await screen.findByText(NUDGE, {}, wait)).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Your journal is saved in this browser alone, and browsers can clear their storage, for example when the phone runs low on space. An account backs it up and lets you open it on other devices.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back it up' }));
    expect(await screen.findByText('Account screen', {}, wait)).toBeOnTheScreen();
    expect(screen).toHaveSearchParams({ mode: 'signin' });
  });

  it('“Not now” hides it for a week', async () => {
    tab.mockReturnValue(false);
    const screen = await renderRouter({ today: signedOut(Today) }, { initialUrl: '/today' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }, wait));
    await waitFor(() => expect(screen.queryByText(NUDGE)).toBeNull());
    await waitFor(async () => expect(typeof (await prefs())?.backupNudgeAt).toBe('string'));
  });

  it.each([
    [6, false],
    [7, true],
  ])('dismissed %i days ago: shown again is %s', async (days, shown) => {
    tab.mockReturnValue(false);
    await seed({ backupNudgeAt: new Date(Date.now() - days * DAY - 60_000 * (shown ? 1 : -1)).toISOString() });
    const screen = await renderRouter({ today: signedOut(Today) }, { initialUrl: '/today' });
    if (shown) expect(await screen.findByText(NUDGE, {}, wait)).toBeOnTheScreen();
    else {
      await waitFor(() => expect(screen.getByText(/How are you arriving/)).toBeOnTheScreen());
      await settle();
      expect(screen.queryByText(NUDGE)).toBeNull();
    }
  });

  // One router per test: rendering it again inside a test leaks its state into later tests.
  it('isn’t shown with no entries yet', async () => {
    tab.mockReturnValue(false);
    const screen = await renderRouter({ today: signedOut(Today, { ...initialState, onboarded: true }) }, { initialUrl: '/today' });
    await waitFor(() => expect(screen.getByText(/How are you arriving/)).toBeOnTheScreen());
    await settle();
    expect(screen.queryByText(NUDGE)).toBeNull();
  });

  it('isn’t shown off the web', async () => {
    tab.mockReturnValue(false);
    web.mockReturnValue(false);
    const screen = await renderRouter({ today: signedOut(Today) }, { initialUrl: '/today' });
    await waitFor(() => expect(screen.getByText(/How are you arriving/)).toBeOnTheScreen());
    await settle();
    expect(screen.queryByText(NUDGE)).toBeNull();
  });

  it('isn’t shown where accounts aren’t available', async () => {
    tab.mockReturnValue(false);
    const screen = await renderRouter({ today: withProviders(Today, onboarded) }, { initialUrl: '/today' });
    await waitFor(() => expect(screen.getByText(/How are you arriving/)).toBeOnTheScreen());
    await settle();
    expect(screen.queryByText(NUDGE)).toBeNull();
  });
});

describe('web: navigation', () => {
  // NativeTabs' web fallback is a floating strip over the top of each screen; the web app has
  // its own bottom bar instead.
  it('has a bottom tab bar with the four places, and switches between them', async () => {
    const screen = await renderRouter(
      {
        '(tabs)/_layout': WebTabsLayout,
        '(tabs)/today': Stub('Today screen'),
        '(tabs)/journal': Stub('Journal screen'),
        '(tabs)/patterns': Stub('Patterns screen'),
        '(tabs)/compass': Stub('Compass screen'),
      },
      { initialUrl: '/today' },
    );
    expect(await screen.findByText('Today screen', {}, wait)).toBeOnTheScreen();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual(['Today', 'Journal', 'Patterns', 'Compass']);
    expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Journal screen', {}, wait)).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Journal', selected: true })).toBeOnTheScreen();
  });
});

describe('a journal that can’t be saved on this device', () => {
  // Browser storage is small (about 5 MB in Safari); once it's full, saves fail. That must not be silent.
  const fullStorage = () => ({ load: jest.fn(async () => null), save: jest.fn(async (): Promise<void> => {
      throw new Error('QuotaExceededError');
    }), clear: jest.fn(async () => {}) });

  function withStorage(storage: ReturnType<typeof fullStorage>) {
    return function Wrapped() {
      return (
        <DemoStoreProvider initial={onboarded} storage={storage}>
          <SnackbarProvider>
            <Today />
          </SnackbarProvider>
        </DemoStoreProvider>
      );
    };
  }

  it('Today warns, and offers a backup, when the last save failed', async () => {
    const storage = fullStorage();
    const screen = await renderRouter({ today: withStorage(storage), account: Stub('Account screen') }, { initialUrl: '/today' });
    expect(await screen.findByText('Couldn’t save on this device', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('This device’s storage is full or unavailable, so your latest changes could be lost when Kindway closes. Backing up to an account keeps them safe.')).toBeOnTheScreen();
    expect(storage.save).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText('Account screen', {}, wait)).toBeOnTheScreen();
  });

  it('says nothing while saves work', async () => {
    const storage = { ...fullStorage(), save: jest.fn(async () => {}) };
    const screen = await renderRouter({ today: withStorage(storage) }, { initialUrl: '/today' });
    await waitFor(() => expect(storage.save).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText('Couldn’t save on this device')).toBeNull();
  });
});
