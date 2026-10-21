import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { CompassValue, Reflection } from '@/data/types';
import { consentStatus, CURRENT_TERMS, type ConsentRecord } from '@/services/ai/consent';
import { CloudSync, useSync } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, reducer, useStore, type DemoState } from '@/state/demo-store';
import { memoryStorage } from '@/storage/persistence';
import { fakeCloud } from '@/test-utils/cloud';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);

const compass: CompassValue[] = [
  { id: 'c-Family', area: 'Family', note: 'Fictional note: stay close to my brother.', aiMayReference: true },
  { id: 'c-Health', area: 'Health', note: '', aiMayReference: false },
];
const withLink = (): DemoState => ({ ...initialState, onboarded: true, compass, entries: [entry('e1', 0, { compassIds: ['c-Family'] })] });

describe('AI output never changes the compass', () => {
  const suggestion: Reflection = {
    style: 'understand',
    source: 'ai',
    ai: { id: 'r1', provider: 'groq', model: 'm', createdAt: '2026-10-21T00:00:00.000Z' },
    acknowledge: 'Fictional.',
    longGame: { value: 'Career & purpose', text: 'Fictional suggestion about a value the user never chose.' },
    basedOn: 'x',
  };

  it('a reflection that names a value, or a value the user doesn’t have, leaves values, notes, switches and links alone', () => {
    const before = withLink();
    let s = reducer(before, { type: 'setReflection', id: 'e1', status: 'ready', reflection: suggestion });
    s = reducer(s, { type: 'applyAiReflections', reflections: { e1: { ...suggestion, ai: { ...suggestion.ai!, id: 'r2' } } }, known: ['r1'] });
    s = reducer(s, { type: 'appendChat', entryId: 'e1', messages: [{ id: 'k', from: 'kindway', text: 'Fictional: maybe add Career as a value?', source: 'ai' }] });
    expect(s.compass).toBe(before.compass);
    expect(s.entries[0].compassIds).toEqual(['c-Family']);
  });

  it('“Not relevant” only removes the connection from that reflection', () => {
    const s = reducer({ ...withLink(), entries: [entry('e1', 0, { compassIds: ['c-Family'], reflection: suggestion, reflectionStatus: 'ready' })] }, {
      type: 'updateEntry',
      id: 'e1',
      patch: { reflection: { ...suggestion, longGame: undefined } },
    });
    expect(s.compass).toEqual(compass);
    expect(s.entries[0].compassIds).toEqual(['c-Family']);
  });
});

describe('reflection consent after the compass disclosure changed', () => {
  const record = (version: string): ConsentRecord => ({
    id: 'x',
    scope: 'entry_reflection',
    consentVersion: version,
    disclosureVersion: CURRENT_TERMS.disclosureVersion,
    provider: CURRENT_TERMS.provider,
    modelRef: CURRENT_TERMS.modelRef,
    acceptedAt: '2026-10-20T00:00:00.000Z',
    revokedAt: null,
  });

  it('a grant of the earlier wording is outdated and has to be given again', () => {
    expect(CURRENT_TERMS.consentVersion.entry_reflection).toBe('2');
    expect(consentStatus([record('1')], 'entry_reflection')).toBe('outdated');
    expect(consentStatus([record('2')], 'entry_reflection')).toBe('active');
    // Follow-up or review consent never stands in for it.
    expect(consentStatus([{ ...record('1'), scope: 'follow_up' }], 'entry_reflection')).toBe('none');
  });
});

describe('AI waits until the account has this device’s context choices', () => {
  beforeEach(() => AsyncStorage.clear());

  function Probe({ onReady }: { onReady: (ok: boolean) => void }) {
    const { dispatch } = useStore();
    const sync = useSync();
    return (
      <>
        <Text>sync:{sync?.status}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            // Change what reflections may see and unlink the value...
            dispatch({ type: 'patch', patch: { contextScope: 'current' } });
            dispatch({ type: 'updateEntry', id: 'e1', patch: { compassIds: [] } });
          }}>
          <Text>change</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void sync!.ensureSynced([{ id: 'e1', body: 'Some words for e1.' }]).then(onReady)}>
          <Text>ask</Text>
        </Pressable>
      </>
    );
  }

  it('the server never sees the old “what reflections can see” or an old link', async () => {
    const cloud = fakeCloud();
    const seen: { scope?: string; links: number }[] = [];
    const ready = jest.fn((ok: boolean) => {
      const d = cloud.data('user-a');
      seen.push({ scope: d.profile?.context_scope, links: Object.keys(d.links).length });
      return ok;
    });
    await render(
      <DemoStoreProvider initial={withLink()} storage={memoryStorage()}>
        <CloudSync userId="user-a" repo={cloud.repo} baseStorage={memoryStorage()}>
          <Probe onReady={ready} />
        </CloudSync>
      </DemoStoreProvider>,
    );
    expect(await screen.findByText('sync:synced', {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(cloud.data('user-a').profile?.context_scope).toBe('relevant');
    expect(Object.keys(cloud.data('user-a').links)).toEqual(['e1|c-Family']);

    // ...then ask for AI before the debounced upload has run.
    await act(async () => fireEvent.press(screen.getByText('change')));
    expect(cloud.data('user-a').profile?.context_scope).toBe('relevant');
    await act(async () => fireEvent.press(screen.getByText('ask')));
    await waitFor(() => expect(ready).toHaveBeenCalled(), { timeout: 8000 });
    expect(ready).toHaveBeenCalledWith(true);
    expect(seen[0]).toEqual({ scope: 'current', links: 0 });
  });
});
