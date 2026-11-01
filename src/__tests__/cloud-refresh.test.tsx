import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { toCloud } from '@/services/cloud/records';
import { CloudSync, useSync } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { memoryStorage } from '@/storage/persistence';
import { fakeCloud } from '@/test-utils/cloud';
import { entry } from '@/test-utils/entries';

// Rendering and storage round-trips are slow on CI machines.
jest.setTimeout(30000);

const journal = (): DemoState => ({ ...initialState, onboarded: true, entries: [entry('e1', 1)] });

/** An entry as another device would have written it straight to the cloud. */
const remoteRow = (id: string) => toCloud({ ...initialState, entries: [entry(id, 0)] }).entries[id];

function Probe({ onRefreshed }: { onRefreshed: () => void }) {
  const { state, dispatch } = useStore();
  const sync = useSync();
  return (
    <>
      <Text>sync:{sync?.status}</Text>
      <Text>entries:{state.entries.map((e) => e.id).sort().join(',')}</Text>
      <Pressable accessibilityRole="button" onPress={() => void sync!.refresh().then(onRefreshed)}>
        <Text>refresh</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'saveEntry', entry: entry(`local${state.entries.length}`, 0) })}>
        <Text>write</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'deleteEntry', id: 'e1' })}>
        <Text>delete e1</Text>
      </Pressable>
    </>
  );
}

async function open(cloud: ReturnType<typeof fakeCloud>, onRefreshed = jest.fn()) {
  await render(
    <DemoStoreProvider initial={journal()} storage={memoryStorage()}>
      <CloudSync userId="user-a" repo={cloud.repo} baseStorage={memoryStorage()}>
        <Probe onRefreshed={onRefreshed} />
      </CloudSync>
    </DemoStoreProvider>,
  );
  expect(await screen.findByText('sync:synced', {}, { timeout: 5000 })).toBeOnTheScreen();
  return onRefreshed;
}

describe('pull down to refresh', () => {
  beforeEach(() => AsyncStorage.clear());

  it('refresh pulls changes made on another device', async () => {
    const cloud = fakeCloud();
    const refreshed = await open(cloud);
    expect(screen.getByText('entries:e1')).toBeOnTheScreen();

    // Another device writes an entry; nothing here would pull it until the next foreground.
    cloud.data('user-a').entries.other = remoteRow('other');
    await act(async () => fireEvent.press(screen.getByText('refresh')));
    await waitFor(() => expect(refreshed).toHaveBeenCalled(), { timeout: 5000 });
    expect(screen.getByText('entries:e1,other')).toBeOnTheScreen();
  });

  it('refresh keeps an unsent local entry', async () => {
    const cloud = fakeCloud();
    const refreshed = await open(cloud);
    cloud.data('user-a').entries.other = remoteRow('other');

    // Hold the next upload so the first local entry is in flight...
    const push = cloud.repo.push;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const started = jest.fn();
    cloud.repo.push = async (userId, changes) => {
      started();
      await held;
      return push(userId, changes);
    };
    await act(async () => fireEvent.press(screen.getByText('write')));
    await waitFor(() => expect(started).toHaveBeenCalled(), { timeout: 5000 });

    // ...save another one that hasn't been sent at all, and refresh while the upload is pending.
    await act(async () => fireEvent.press(screen.getByText('write')));
    await act(async () => fireEvent.press(screen.getByText('refresh')));
    await new Promise((resolve) => setTimeout(resolve, 200));
    // The refresh waits for a pull after the running pass, not just returns.
    expect(refreshed).not.toHaveBeenCalled();

    await act(async () => release());
    await waitFor(() => expect(refreshed).toHaveBeenCalled(), { timeout: 5000 });
    expect(screen.getByText('entries:e1,local1,local2,other')).toBeOnTheScreen();

    // Both local entries reach the cloud, and nothing is doubled anywhere.
    await waitFor(() => expect(Object.keys(cloud.data('user-a').entries).sort()).toEqual(['e1', 'local1', 'local2', 'other']), { timeout: 5000 });
    expect(await screen.findByText('sync:synced', {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(screen.getByText('entries:e1,local1,local2,other')).toBeOnTheScreen();
  });

  it('an entry deleted here but not sent yet stays deleted when a refresh pulls it again', async () => {
    const cloud = fakeCloud();
    const refreshed = await open(cloud);
    // The delete can't reach the cloud yet, so the cloud still has the entry.
    cloud.failNext('offline', 0);
    await act(async () => fireEvent.press(screen.getByText('delete e1')));
    expect(await screen.findByText('sync:offline', {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(Object.keys(cloud.data('user-a').entries)).toEqual(['e1']);

    await act(async () => fireEvent.press(screen.getByText('refresh')));
    await waitFor(() => expect(refreshed).toHaveBeenCalled(), { timeout: 5000 });
    // The pull brought e1 back from the cloud; the merge keeps this device's delete.
    expect(screen.getByText('entries:')).toBeOnTheScreen();
    await waitFor(() => expect(Object.keys(cloud.data('user-a').entries)).toEqual([]), { timeout: 5000 });
    expect(await screen.findByText('sync:synced', {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(screen.getByText('entries:')).toBeOnTheScreen();
  });

  it('refresh while offline settles with the offline status, without throwing', async () => {
    const cloud = fakeCloud();
    const refreshed = await open(cloud);
    cloud.failNext('offline');
    await act(async () => fireEvent.press(screen.getByText('refresh')));
    await waitFor(() => expect(refreshed).toHaveBeenCalled(), { timeout: 5000 });
    expect(screen.getByText('sync:offline')).toBeOnTheScreen();
    expect(screen.getByText('entries:e1')).toBeOnTheScreen();
  });
});
