import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { AuthService } from '@/services/auth';
import { toCloud } from '@/services/cloud/records';
import { CloudSync, useSync } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, toSnapshot, useStore } from '@/state/demo-store';
import { SessionProvider, useSession, type AuthUser } from '@/state/session';
import { memoryStorage, scopedStorage } from '@/storage/persistence';
import { fakeCloud } from '@/test-utils/cloud';
import { entry } from '@/test-utils/entries';

// Rendering and storage round-trips are slow on CI machines.
jest.setTimeout(30000);

const A: AuthUser = { id: 'user-a', email: 'a@example.test' };
const B: AuthUser = { id: 'user-b', email: 'b@example.test' };

function fakeAuth() {
  let emit: (u: AuthUser | null) => void = () => {};
  const watchUser = (on: (u: AuthUser | null) => void) => {
    emit = on;
    on(null);
    return () => {};
  };
  const auth = { signOut: jest.fn(async () => emit(null)) } as unknown as AuthService;
  return { auth, watchUser, signIn: (u: AuthUser | null) => act(async () => emit(u)) };
}

/** The same composition as the root layout: the session picks which journal is mounted. */
function Journal() {
  const { scope, user, repo } = useSession();
  return (
    <DemoStoreProvider key={scope} storage={scopedStorage(scope)}>
      {scope !== 'guest' && user && repo ? (
        <CloudSync userId={user.id} repo={repo}>
          <Probe />
        </CloudSync>
      ) : (
        <Probe />
      )}
    </DemoStoreProvider>
  );
}

function Probe() {
  const { state, dispatch } = useStore();
  const { mode, enableSync, signOut } = useSession();
  const sync = useSync();
  return (
    <>
      <Text>mode:{mode}</Text>
      <Text>entries:{state.entries.map((e) => e.title).join(',') || 'none'}</Text>
      <Text>sync:{sync?.status ?? 'local'}</Text>
      <Pressable accessibilityRole="button" onPress={() => void enableSync()}>
        <Text>enable</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void signOut()}>
        <Text>sign out</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'saveEntry', entry: entry(`w${state.entries.length}`, 0, { title: 'Written while synced' }) })}>
        <Text>write</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => sync?.retry()}>
        <Text>retry</Text>
      </Pressable>
    </>
  );
}

const wait = { timeout: 5000 };

async function seed(scope: Parameters<typeof scopedStorage>[0], titles: string[]) {
  const entries = titles.map((t, i) => entry(`${scope}-${i}`, i, { title: t }));
  await scopedStorage(scope).save(toSnapshot({ ...initialState, onboarded: true, entries }));
}

beforeEach(() => AsyncStorage.clear());

describe('accounts and journals on one device', () => {
  it('local-only works without any account, and signing in alone uploads nothing', async () => {
    await seed('guest', ['Guest entry']);
    const cloud = fakeCloud();
    const f = fakeAuth();
    await render(
      <SessionProvider auth={f.auth} repo={cloud.repo} watchUser={f.watchUser} settings={memoryStorage()}>
        <Journal />
      </SessionProvider>,
    );
    expect(await screen.findByText('mode:local-only', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('entries:Guest entry')).toBeOnTheScreen();

    await f.signIn(A);
    expect(await screen.findByText('mode:signed-in-local', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('entries:Guest entry')).toBeOnTheScreen();
    expect(cloud.log).toHaveLength(0);
  });

  it('cloud sync shows only that account’s journal; signing out brings back the local-only one', async () => {
    await seed('guest', ['Guest entry']);
    await seed('user:user-a', ['A cached entry']);
    const cloud = fakeCloud();
    // The cloud already matches A's cache.
    const aCache = (await scopedStorage('user:user-a').load()) as { state: typeof initialState };
    cloud.users.set('user-a', toCloud({ ...initialState, ...aCache.state }));
    const f = fakeAuth();
    await render(
      <SessionProvider auth={f.auth} repo={cloud.repo} watchUser={f.watchUser} settings={memoryStorage({ syncUsers: ['user-a'] })}>
        <Journal />
      </SessionProvider>,
    );
    await f.signIn(A);
    expect(await screen.findByText('mode:cloud-sync', {}, wait)).toBeOnTheScreen();
    expect(await screen.findByText('entries:A cached entry', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/Guest entry/)).toBeNull();

    await fireEvent.press(screen.getByText('sign out'));
    expect(await screen.findByText('mode:local-only', {}, wait)).toBeOnTheScreen();
    expect(await screen.findByText('entries:Guest entry', {}, wait)).toBeOnTheScreen();
    // A's cache is still on the device, hidden, for when A signs in again.
    expect(await scopedStorage('user:user-a').load()).not.toBeNull();
  });

  it('another account on the same device never sees the first account’s cache', async () => {
    await seed('user:user-a', ['A private entry']);
    const cloud = fakeCloud();
    const f = fakeAuth();
    await render(
      <SessionProvider auth={f.auth} repo={cloud.repo} watchUser={f.watchUser} settings={memoryStorage({ syncUsers: ['user-a', 'user-b'] })}>
        <Journal />
      </SessionProvider>,
    );
    await f.signIn(B);
    expect(await screen.findByText('mode:cloud-sync', {}, wait)).toBeOnTheScreen();
    expect(await screen.findByText('sync:synced', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('entries:none')).toBeOnTheScreen();
    expect(screen.queryByText(/A private entry/)).toBeNull();
  });

  it('writes while synced reach the cloud; a failed write says so and retries without losing anything', async () => {
    const cloud = fakeCloud();
    const f = fakeAuth();
    await render(
      <SessionProvider auth={f.auth} repo={cloud.repo} watchUser={f.watchUser} settings={memoryStorage({ syncUsers: ['user-a'] })}>
        <Journal />
      </SessionProvider>,
    );
    await f.signIn(A);
    expect(await screen.findByText('sync:synced', {}, wait)).toBeOnTheScreen();

    cloud.failNext('offline', 0);
    await fireEvent.press(screen.getByText('write'));
    expect(await screen.findByText('sync:offline', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('entries:Written while synced')).toBeOnTheScreen();
    expect(Object.keys(cloud.data('user-a').entries)).toEqual([]);

    await fireEvent.press(screen.getByText('retry'));
    expect(await screen.findByText('sync:synced', {}, wait)).toBeOnTheScreen();
    expect(Object.values(cloud.data('user-a').entries).map((e) => e.title)).toEqual(['Written while synced']);
    expect(cloud.data('user-b').entries).toEqual({});
  });

  it('enabling sync switches to the account journal the migration prepared', async () => {
    await seed('guest', ['Guest entry']);
    await seed('user:user-a', ['Moved entry']);
    const cloud = fakeCloud();
    const f = fakeAuth();
    await render(
      <SessionProvider auth={f.auth} repo={cloud.repo} watchUser={f.watchUser} settings={memoryStorage()}>
        <Journal />
      </SessionProvider>,
    );
    await f.signIn(A);
    expect(await screen.findByText('mode:signed-in-local', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('enable'));
    await waitFor(() => expect(screen.getByText('mode:cloud-sync')).toBeOnTheScreen(), wait);
    expect(await screen.findByText('entries:Moved entry', {}, wait)).toBeOnTheScreen();
  });
});
