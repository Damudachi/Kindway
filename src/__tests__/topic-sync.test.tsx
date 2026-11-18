import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Topic } from '@/data/types';
import { CloudSync, useSync } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { memoryStorage } from '@/storage/persistence';
import { fakeCloud } from '@/test-utils/cloud';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);

const topic = (patch: Partial<Topic> = {}): Topic => ({ id: 'p1', name: 'Work stress', status: 'open', createdAt: '2026-11-01T09:00:00.000Z', entryIds: ['e1'], ...patch });
const journal = (topics: Topic[] = [topic()]): DemoState => ({ ...initialState, onboarded: true, entries: [entry('e1', 0)], topics });

/** Topic AI reads topic links and analysis flags from the account, so it waits for them. */
describe('topic AI waits until the account has this device’s topic choices', () => {
  beforeEach(() => AsyncStorage.clear());

  function Probe({ onReady, change }: { onReady: (ok: boolean) => void; change: (d: ReturnType<typeof useStore>['dispatch']) => void }) {
    const { dispatch } = useStore();
    const sync = useSync();
    return (
      <>
        <Text>sync:{sync?.status}</Text>
        <Pressable accessibilityRole="button" onPress={() => change(dispatch)}>
          <Text>change</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void sync!.ensureSynced([{ id: 'e1', body: 'Some words for e1.' }]).then(onReady)}>
          <Text>ask</Text>
        </Pressable>
      </>
    );
  }

  async function run(initial: DemoState, change: (d: ReturnType<typeof useStore>['dispatch']) => void) {
    const cloud = fakeCloud();
    const seen: { links: string[]; excluded: boolean | undefined; topics: string[] }[] = [];
    const ready = jest.fn((ok: boolean) => {
      const d = cloud.data('user-a');
      seen.push({ links: Object.values(d.topicLinks).map((l) => l.entry_id), excluded: d.entries.e1?.exclude_from_analysis, topics: Object.keys(d.topics) });
      return ok;
    });
    await render(
      <DemoStoreProvider initial={initial} storage={memoryStorage()}>
        <CloudSync userId="user-a" repo={cloud.repo} baseStorage={memoryStorage()}>
          <Probe onReady={ready} change={change} />
        </CloudSync>
      </DemoStoreProvider>,
    );
    expect(await screen.findByText('sync:synced', {}, { timeout: 5000 })).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText('change')));
    await act(async () => fireEvent.press(screen.getByText('ask')));
    await waitFor(() => expect(ready).toHaveBeenCalled(), { timeout: 8000 });
    return { cloud, seen, ready };
  }

  it('an unlink not yet pushed reaches the account before the AI is asked', async () => {
    const { cloud, seen, ready } = await run(journal(), (d) => d({ type: 'unlinkTopic', topicId: 'p1', entryId: 'e1' }));
    expect(cloud.data('user-a').topicLinks).toEqual({});
    expect(ready).toHaveBeenCalledWith(true);
    expect(seen[0].links).toEqual([]);
  });

  it('“keep out of analysis” not yet pushed reaches the account before the AI is asked', async () => {
    const { seen, ready } = await run(journal(), (d) => d({ type: 'updateEntry', id: 'e1', patch: { excludeFromAnalysis: true } }));
    expect(ready).toHaveBeenCalledWith(true);
    expect(seen[0].excluded).toBe(true);
  });

  it('a topic created a moment ago exists on the account before the AI is asked', async () => {
    const { seen, ready } = await run(journal([]), (d) => d({ type: 'addTopic', topic: topic({ id: 'p2', entryIds: ['e1'] }) }));
    expect(ready).toHaveBeenCalledWith(true);
    expect(seen[0].topics).toEqual(['p2']);
    expect(seen[0].links).toEqual(['e1']);
  });
});
