import { Stack } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, Text } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import Settings from '@/app/settings/index';
import { Dialog, SnackbarProvider } from '@/components/feedback';
import { LOCK_AFTER_MS, type LockService, type LockSupport } from '@/services/app-lock';
import { onWeb } from '@/services/platform';
import { AppLock, AppLockNotice, useAppLock, type AppStateLike } from '@/state/app-lock';
import { DemoStoreProvider } from '@/state/demo-store';
import { memoryStorage, type StateStorage } from '@/storage/persistence';

jest.mock('@/services/platform', () => ({ ...jest.requireActual('@/services/platform'), onWeb: jest.fn(() => false) }));
const web = jest.mocked(onWeb);

const wait = { timeout: 8000 };

function fakeLock(over: Partial<{ support: LockSupport; unlocks: boolean[] }> = {}) {
  const unlocks = [...(over.unlocks ?? [])];
  return {
    lockSupport: jest.fn(async () => over.support ?? 'ready'),
    authenticate: jest.fn(async () => unlocks.shift() ?? true),
    hideFromRecents: jest.fn(async () => {}),
  } satisfies LockService;
}

function fakeAppState() {
  const listeners = new Set<(s: string) => void>();
  const appState = {
    currentState: 'active',
    addEventListener: (_type: 'change', fn: (s: string) => void) => {
      listeners.add(fn);
      return { remove: () => void listeners.delete(fn) };
    },
  };
  const emit = async (next: string) => {
    appState.currentState = next;
    await act(async () => listeners.forEach((fn) => fn(next)));
  };
  return { appState: appState as unknown as AppStateLike, emit };
}

/** Turns the lock on and off from inside, as the Settings switch does, and shows the answer. */
function Probe() {
  const lock = useAppLock();
  const [result, setResult] = useState('');
  return (
    <>
      <Text>{lock.enabled ? 'Lock is on' : 'Lock is off'}</Text>
      <Text>{result}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Turn lock on" onPress={() => void lock.setEnabled(true).then(setResult)} />
      <Pressable accessibilityRole="button" accessibilityLabel="Turn lock off" onPress={() => void lock.setEnabled(false).then(setResult)} />
    </>
  );
}

function Journal() {
  return (
    <>
      <Text>Journal content</Text>
      <Probe />
    </>
  );
}

type Open = { storage: StateStorage; service?: LockService; appState?: AppStateLike; index?: () => React.ReactElement };

async function openApp({ storage, service = fakeLock(), appState = fakeAppState().appState, index = Journal }: Open) {
  function Layout() {
    return (
      <AppLock storage={storage} lockService={service} appState={appState}>
        <SnackbarProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <AppLockNotice />
        </SnackbarProvider>
      </AppLock>
    );
  }
  await renderRouter({ _layout: Layout, index }, { initialUrl: '/' });
  return service;
}

/** renderRouter runs on Jest's fake clock; this moves it on. */
const later = (ms: number) => jest.setSystemTime(Date.now() + ms);

const neverLoads = (): StateStorage => ({ ...memoryStorage(), load: () => new Promise(() => {}) });

/** A setting that can't be read (jsonStorage rejects on read and parse errors). */
const unreadable = () => ({ load: jest.fn(() => Promise.reject(new Error('unreadable'))), save: jest.fn(async () => {}), clear: jest.fn(async () => {}) });

/** The journal is hidden from TalkBack under the cover; a Modal is its own window, so it's queried even when hidden. */
const all = { includeHiddenElements: true };

/** A prompt the test finishes by hand, as if the person is still typing their PIN. */
function heldPrompt(service: ReturnType<typeof fakeLock>) {
  let finish: (ok: boolean) => void = () => {};
  service.authenticate.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  return (ok: boolean) => act(async () => finish(ok));
}

beforeEach(() => web.mockReturnValue(false));

describe('app lock', () => {
  it('cold start covers the journal while the setting loads, without saying it’s locked', async () => {
    const service = await openApp({ storage: neverLoads() });
    expect(screen.getByTestId('lock-cover')).toBeOnTheScreen();
    expect(screen.queryByText('Journal content')).not.toBeOnTheScreen();
    // The lock may well be off: the plain cover doesn't claim otherwise.
    expect(screen.queryByText('Kindway is locked')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Unlock Kindway' })).not.toBeOnTheScreen();
    // Nothing to unlock yet: the setting decides.
    expect(service.authenticate).not.toHaveBeenCalled();
  });

  it('with the lock off, the journal shows once the setting loads', async () => {
    const service = await openApp({ storage: memoryStorage(null) });
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Kindway is locked')).not.toBeOnTheScreen();
    expect(service.authenticate).not.toHaveBeenCalled();
    expect(service.hideFromRecents).not.toHaveBeenCalledWith(true);
  });

  it('with the lock on, unlocking shows the journal', async () => {
    const service = await openApp({ storage: memoryStorage({ enabled: true }) });
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    // It asked by itself as soon as the lock showed, and kept Kindway out of recent apps.
    expect(service.authenticate).toHaveBeenCalledTimes(1);
    expect(service.authenticate).toHaveBeenCalledWith('Unlock Kindway');
    expect(service.hideFromRecents).toHaveBeenCalledWith(true);
    expect(screen.queryByText('Kindway is locked')).not.toBeOnTheScreen();
  });

  it('a failed unlock keeps it locked and offers Unlock again', async () => {
    const service = await openApp({ storage: memoryStorage({ enabled: true }), service: fakeLock({ unlocks: [false, true] }) });
    await waitFor(() => expect(service.authenticate).toHaveBeenCalledTimes(1), wait);
    expect(screen.getByText('Kindway is locked')).toBeOnTheScreen();
    expect(screen.queryByText('Journal content')).not.toBeOnTheScreen();
    // No second prompt on its own: the person chooses when to try again.
    expect(service.authenticate).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock Kindway' }));
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    expect(service.authenticate).toHaveBeenCalledTimes(2);
  });

  it('back after 1 minute away locks again; after 30 seconds it does not', async () => {
    const { appState, emit } = fakeAppState();
    const service = await openApp({ storage: memoryStorage({ enabled: true }), service: fakeLock({ unlocks: [true, false] }), appState });
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');

    await emit('background');
    later(30_000);
    await emit('active');
    expect(screen.getByText('Journal content')).toBeOnTheScreen();
    expect(service.authenticate).toHaveBeenCalledTimes(1);

    await emit('background');
    later(LOCK_AFTER_MS);
    await emit('active');
    expect(await screen.findByText('Kindway is locked', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Journal content')).not.toBeOnTheScreen();
    await waitFor(() => expect(service.authenticate).toHaveBeenCalledTimes(2), wait);
    // Typing can't go on into a hidden composer.
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('leaving puts up a plain cover at once; a quick return lifts it, a long one turns it into the lock', async () => {
    const { appState, emit } = fakeAppState();
    const service = await openApp({ storage: memoryStorage({ enabled: true }), service: fakeLock({ unlocks: [true, false] }), appState });
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();

    // In the background the journal is covered already, so its last frame never shows on the way back.
    await emit('background');
    expect(screen.queryByText('Journal content')).not.toBeOnTheScreen();
    expect(screen.queryByText('Kindway is locked')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Unlock Kindway' })).not.toBeOnTheScreen();
    later(10_000);
    await emit('active');
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    expect(service.authenticate).toHaveBeenCalledTimes(1);

    await emit('background');
    expect(screen.queryByText('Journal content')).not.toBeOnTheScreen();
    later(LOCK_AFTER_MS + 1);
    await emit('active');
    expect(await screen.findByRole('button', { name: 'Unlock Kindway' }, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Journal content')).not.toBeOnTheScreen();
    await waitFor(() => expect(service.authenticate).toHaveBeenCalledTimes(2), wait);
  });

  it('leaving while a Settings prompt is up still counts as time away', async () => {
    const { appState, emit } = fakeAppState();
    const service = fakeLock({ unlocks: [true, false] });
    await openApp({ storage: memoryStorage({ enabled: true }), service, appState });
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    const finish = heldPrompt(service);
    await fireEvent.press(screen.getByRole('button', { name: 'Turn lock off' }));
    await waitFor(() => expect(service.authenticate).toHaveBeenCalledTimes(2), wait);
    // Going Home cancels the prompt.
    await emit('background');
    await finish(false);
    later(2 * LOCK_AFTER_MS);
    await emit('active');
    expect(await screen.findByText('Kindway is locked', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Lock is on', all)).toBeOnTheScreen();
  });

  it('an open dialog hides under the lock and comes back, still open, after unlock', async () => {
    function WithDialog() {
      return <Dialog visible title="Delete this entry?" body="This can’t be undone." confirmLabel="Delete" destructive onConfirm={() => {}} onCancel={() => {}} />;
    }
    const { appState, emit } = fakeAppState();
    const service = fakeLock({ unlocks: [false, true, false, true] });
    await openApp({ storage: memoryStorage({ enabled: true }), service, appState, index: WithDialog });
    // Locked at launch: the dialog waits.
    await waitFor(() => expect(service.authenticate).toHaveBeenCalledTimes(1), wait);
    expect(screen.queryByText('Delete this entry?', all)).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock Kindway' }));
    expect(await screen.findByRole('button', { name: 'Delete' }, wait)).toBeOnTheScreen();

    // Relocked: its buttons are gone, then back after unlock.
    await emit('background');
    expect(screen.queryByText('Delete this entry?', all)).not.toBeOnTheScreen();
    later(LOCK_AFTER_MS);
    await emit('active');
    await waitFor(() => expect(service.authenticate).toHaveBeenCalledTimes(3), wait);
    expect(screen.getByText('Kindway is locked')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Delete', ...all })).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock Kindway' }));
    expect(await screen.findByRole('button', { name: 'Delete' }, wait)).toBeOnTheScreen();
  });

  it('a setting that can’t be read locks for this session without saving anything', async () => {
    const storage = unreadable();
    const service = await openApp({ storage, service: fakeLock({ unlocks: [false, true] }) });
    await waitFor(() => expect(service.authenticate).toHaveBeenCalledWith('Unlock Kindway'), wait);
    expect(screen.getByText('Kindway is locked')).toBeOnTheScreen();
    expect(screen.queryByText('Journal content')).not.toBeOnTheScreen();
    expect(service.hideFromRecents).toHaveBeenCalledWith(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock Kindway' }));
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('a setting that can’t be read, on a phone with no screen lock, opens without turning anything off', async () => {
    const storage = unreadable();
    const service = await openApp({ storage, service: fakeLock({ support: 'no-screen-lock' }) });
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    expect(service.authenticate).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(screen.queryByText('App lock is off because this phone no longer has a screen lock.')).not.toBeOnTheScreen();
  });

  it('finishing the phone’s own unlock screen doesn’t lock again straight away', async () => {
    const { appState, emit } = fakeAppState();
    let finish: (ok: boolean) => void = () => {};
    const service = fakeLock();
    // The PIN screen covers Kindway (it goes to the background) and takes a while to type.
    service.authenticate.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    await openApp({ storage: memoryStorage({ enabled: true }), service, appState });
    await waitFor(() => expect(service.authenticate).toHaveBeenCalledTimes(1), wait);
    await emit('background');
    later(2 * LOCK_AFTER_MS);
    await act(async () => finish(true));
    await emit('active');
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Kindway is locked')).not.toBeOnTheScreen();
    expect(service.authenticate).toHaveBeenCalledTimes(1);
  });

  it('turning it on requires a successful unlock first; no screen lock explains why', async () => {
    const storage = memoryStorage(null);
    const service = await openApp({ storage, service: fakeLock({ support: 'no-screen-lock' }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn lock on' }, wait));
    expect(await screen.findByText('no-screen-lock', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Lock is off')).toBeOnTheScreen();
    expect(service.authenticate).not.toHaveBeenCalled();
    expect(storage.current).toBeNull();
  });

  it('a cancelled unlock doesn’t turn it on', async () => {
    const storage = memoryStorage(null);
    const service = await openApp({ storage, service: fakeLock({ unlocks: [false] }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn lock on' }, wait));
    expect(await screen.findByText('failed', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Lock is off')).toBeOnTheScreen();
    expect(service.authenticate).toHaveBeenCalledTimes(1);
    expect(storage.current).toBeNull();
  });

  it('turning it on hides Kindway from recent apps; off shows it again', async () => {
    const storage = memoryStorage(null);
    const service = await openApp({ storage });
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn lock on' }, wait));
    expect(await screen.findByText('Lock is on', {}, wait)).toBeOnTheScreen();
    expect(service.authenticate).toHaveBeenCalledTimes(1);
    expect(service.hideFromRecents).toHaveBeenLastCalledWith(true);
    expect(storage.current).toEqual({ enabled: true });
    // Turning it on unlocks there and then; the journal stays open.
    expect(screen.getByText('Journal content')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Turn lock off' }));
    expect(await screen.findByText('Lock is off', {}, wait)).toBeOnTheScreen();
    // Turning it off asks too.
    expect(service.authenticate).toHaveBeenCalledTimes(2);
    expect(service.hideFromRecents).toHaveBeenLastCalledWith(false);
    expect(storage.current).toEqual({ enabled: false });
  });

  it('if the phone loses its screen lock, Kindway turns its lock off and says so', async () => {
    const storage = memoryStorage({ enabled: true });
    const service = await openApp({ storage, service: fakeLock({ support: 'no-screen-lock' }) });
    expect(await screen.findByText('Journal content', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('App lock is off because this phone no longer has a screen lock.')).toBeOnTheScreen();
    expect(screen.getByText('Lock is off')).toBeOnTheScreen();
    expect(service.authenticate).not.toHaveBeenCalled();
    expect(service.hideFromRecents).toHaveBeenLastCalledWith(false);
    expect(storage.current).toEqual({ enabled: false });
  });
});

describe('the App lock setting', () => {
  async function openSettings(service: LockService) {
    function Layout() {
      return (
        <AppLock storage={memoryStorage(null)} lockService={service} appState={fakeAppState().appState}>
          <DemoStoreProvider>
            <SnackbarProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </SnackbarProvider>
          </DemoStoreProvider>
        </AppLock>
      );
    }
    await renderRouter({ _layout: Layout, 'settings/index': Settings }, { initialUrl: '/settings' });
  }

  it('in the app, a phone without a screen lock is told to set one up', async () => {
    const service = fakeLock({ support: 'no-screen-lock' });
    await openSettings(service);
    const row = await screen.findByRole('switch', { name: /^App lock\. Use your fingerprint, face or phone PIN to open Kindway\. Kindway also stays hidden in recent apps and screenshots\.$/ }, wait);
    expect(row).not.toBeChecked();
    await fireEvent.press(row);
    expect(await screen.findByText('Set up a screen lock in your phone’s settings first.', {}, wait)).toBeOnTheScreen();
    expect(row).not.toBeChecked();
  });

  it('in the app, a successful unlock turns it on', async () => {
    const service = fakeLock();
    await openSettings(service);
    const row = await screen.findByRole('switch', { name: /^App lock\./ }, wait);
    await fireEvent.press(row);
    await waitFor(() => expect(screen.getByRole('switch', { name: /^App lock\./ })).toBeChecked(), wait);
    expect(service.hideFromRecents).toHaveBeenLastCalledWith(true);
  });

  it('the web app has no App lock row', async () => {
    web.mockReturnValue(true);
    await openSettings(fakeLock());
    expect(await screen.findByText('Your journal', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByRole('switch', { name: /^App lock/ })).not.toBeOnTheScreen();
  });
});
