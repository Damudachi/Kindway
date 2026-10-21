import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Reflection } from '@/data/types';
import type { AuthService } from '@/services/auth';
import { latestReflections, type AiOutputsRepo } from '@/services/ai/remote';
import { toCloud, type EntryRow } from '@/services/cloud/records';
import { CloudError } from '@/services/cloud/repo';
import { CloudSync, useSync } from '@/state/cloud-sync';
import { DemoStoreProvider, fromSnapshot, initialState, reducer, toSnapshot, useStore, type DemoState } from '@/state/demo-store';
import { SessionProvider, useSession, type AuthUser } from '@/state/session';
import { clearAccountData, memoryStorage, scopedStorage, syncBaseStorage } from '@/storage/persistence';
import { fakeCloud } from '@/test-utils/cloud';
import { entry } from '@/test-utils/entries';

// Rendering and storage round-trips are slow on CI machines.
jest.setTimeout(30000);
const wait = { timeout: 5000 };

const A: AuthUser = { id: 'user-a', email: 'a@example.test' };
const B: AuthUser = { id: 'user-b', email: 'b@example.test' };
const BODY = 'Fictional: the deadline moved again.';
const UPDATED = '2026-10-20T11:59:00.000Z';

/** An ai_reflections row as the read returns it, with its entry embedded. */
const row = (id: string, entryId: string, createdAt: string, o: Record<string, unknown> = {}) => ({
  id,
  entry_id: entryId,
  style: 'understand',
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  created_at: createdAt,
  entry_updated_at: UPDATED,
  entries: { body: BODY, updated_at: UPDATED },
  output: { acknowledgment: `Fictional acknowledgment ${id}.` },
  ...o,
});

const aiReflection = (id: string, patch: Partial<Reflection> = {}): Reflection => ({
  style: 'understand',
  source: 'ai',
  ai: { id, provider: 'groq', model: 'openai/gpt-oss-120b', createdAt: '2026-10-20T12:00:00.000Z' },
  acknowledge: `Fictional acknowledgment ${id}.`,
  basedOn: BODY,
  ...patch,
});

const simulated: Reflection = { style: 'understand', source: 'simulated', acknowledge: 'Pre-written on this device.', basedOn: BODY };

const entryRow = (id: string): EntryRow => ({
  id,
  written_at: '2026-10-20T11:00:00.000Z',
  title: `Entry ${id}`,
  body: BODY,
  feelings: [],
  gratitude: null,
  revisit: false,
  exclude_from_analysis: false,
});

/** The account side of stored AI outputs: rows per user, read as the signed-in user only. */
function fakeAiAccount() {
  const rows = new Map<string, ReturnType<typeof row>[]>();
  let failNext: CloudError['kind'] | null = null;
  const outputs: AiOutputsRepo & { reflections: jest.Mock } = {
    latestReview: async () => null,
    reflections: jest.fn(async (userId: string) => {
      if (failNext) {
        const kind = failNext;
        failNext = null;
        throw new CloudError('fail', kind);
      }
      const mine = [...(rows.get(userId) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return latestReflections(mine);
    }),
    deleteReflection: async () => {},
    deleteAll: async () => {},
  };
  return { outputs, rows, failNext: (kind: CloudError['kind'] = 'offline') => (failNext = kind) };
}

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

/** The same composition as the root layout, with the AI outputs read the app passes in. */
function Journal({ outputs }: { outputs: AiOutputsRepo }) {
  const { scope, user, repo } = useSession();
  return (
    <DemoStoreProvider key={scope} storage={scopedStorage(scope)}>
      {scope !== 'guest' && user && repo ? (
        <CloudSync userId={user.id} repo={repo} aiOutputs={outputs}>
          <Probe />
        </CloudSync>
      ) : (
        <Probe />
      )}
    </DemoStoreProvider>
  );
}

/** One line per entry: its reflection's source, record id and whether it matches the text. */
function Probe() {
  const { state } = useStore();
  const { mode } = useSession();
  const sync = useSync();
  const describe = state.entries
    .map((e) => {
      const r = e.reflection;
      return `${e.id}=${r ? `${r.source ?? 'simulated'}/${r.ai?.id ?? '-'}/${r.basedOn === e.body ? 'current' : 'edited'}` : e.reflectionStatus}`;
    })
    .join(',');
  return (
    <>
      <Text>mode:{mode}</Text>
      <Text>sync:{sync?.status ?? 'local'}</Text>
      <Text>reflections:{describe || 'none'}</Text>
      <Pressable accessibilityRole="button" onPress={() => sync?.retry()}>
        <Text>retry</Text>
      </Pressable>
    </>
  );
}

async function seed(scope: Parameters<typeof scopedStorage>[0], state: Partial<DemoState>) {
  await scopedStorage(scope).save(toSnapshot({ ...initialState, onboarded: true, ...state }));
}

async function start(syncUsers: string[], user: AuthUser | null) {
  const cloud = fakeCloud();
  const ai = fakeAiAccount();
  const f = fakeAuth();
  await render(
    <SessionProvider auth={f.auth} repo={cloud.repo} watchUser={f.watchUser} settings={memoryStorage({ syncUsers })}>
      <Journal outputs={ai.outputs} />
    </SessionProvider>,
  );
  return { cloud, ai, f, signIn: () => f.signIn(user) };
}

beforeEach(() => AsyncStorage.clear());

describe('reading stored AI reflections', () => {
  it('keeps the newest per entry, skips malformed rows, and flags reflections on an earlier version', () => {
    const got = latestReflections([
      row('new', 'e1', '2026-10-20T13:00:00.000Z'),
      row('old', 'e1', '2026-10-20T12:00:00.000Z'),
      row('bad', 'e2', '2026-10-20T12:00:00.000Z', { output: {} }),
      row('was-edited', 'e3', '2026-10-20T12:00:00.000Z', { entries: { body: 'Changed later.', updated_at: '2026-10-21T08:00:00.000Z' } }),
      row('no-entry', 'e4', '2026-10-20T12:00:00.000Z', { entries: null }),
    ]);
    expect(Object.keys(got).sort()).toEqual(['e1', 'e3', 'e4']);
    expect(got.e1).toMatchObject({ source: 'ai', ai: { id: 'new', provider: 'groq' }, basedOn: BODY });
    expect(got.e3.basedOn).toBe('');
    expect(got.e4.basedOn).toBe('');
  });
});

describe('AI reflections across sessions and devices', () => {
  it('a saved real reflection survives the app restarting, with its provenance and feedback', () => {
    const r = aiReflection('ref-1', { feedback: 'fits' });
    const saved = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot({ ...initialState, entries: [entry('e1', 0, { body: BODY, reflection: r, reflectionStatus: 'ready' })] }))));
    expect(saved.entries[0].reflection).toEqual(r);

    // The next read finds the same record: this device's copy (and its feedback) stays.
    const after = reducer(saved, { type: 'applyAiReflections', reflections: { e1: aiReflection('ref-1') }, known: ['ref-1'] });
    expect(after.entries[0].reflection?.feedback).toBe('fits');
  });

  it('the same account on a fresh device gets its reflections along with its entries', async () => {
    const t = await start(['user-a'], A);
    t.cloud.data('user-a').entries.e1 = entryRow('e1');
    t.ai.rows.set('user-a', [row('ref-1', 'e1', '2026-10-20T12:00:00.000Z')]);
    await t.signIn();
    expect(await screen.findByText('reflections:e1=ai/ref-1/current', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('sync:synced')).toBeOnTheScreen();
    expect(t.ai.outputs.reflections).toHaveBeenCalledWith('user-a');
  });

  it('account B never sees account A’s cached reflections, and reads only its own', async () => {
    await seed('user:user-a', { entries: [entry('e1', 0, { body: BODY, reflection: aiReflection('ref-a'), reflectionStatus: 'ready' })] });
    const t = await start(['user-a', 'user-b'], B);
    t.ai.rows.set('user-a', [row('ref-a', 'e1', '2026-10-20T12:00:00.000Z')]);
    await t.signIn();
    expect(await screen.findByText('sync:synced', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('reflections:none')).toBeOnTheScreen();
    expect(t.ai.outputs.reflections.mock.calls).toEqual([['user-b']]);
  });

  it('local-only and signed-in-without-sync journals never read the account or relabel simulated reflections', async () => {
    const state = { entries: [entry('e1', 0, { body: BODY, reflection: simulated, reflectionStatus: 'ready' as const })] };
    await seed('guest', state);
    const t = await start([], A);
    expect(await screen.findByText('reflections:e1=simulated/-/current', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('sync:local')).toBeOnTheScreen();
    await t.signIn();
    expect(await screen.findByText('mode:signed-in-local', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('reflections:e1=simulated/-/current')).toBeOnTheScreen();
    expect(t.ai.outputs.reflections).not.toHaveBeenCalled();
  });

  it('a failed read is shown as a sync problem and retried; nothing is filled in meanwhile', async () => {
    const t = await start(['user-a'], A);
    t.cloud.data('user-a').entries.e1 = entryRow('e1');
    t.ai.rows.set('user-a', [row('ref-1', 'e1', '2026-10-20T12:00:00.000Z')]);
    t.ai.failNext('offline');
    await t.signIn();
    expect(await screen.findByText('sync:offline', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('reflections:e1=none')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('retry'));
    expect(await screen.findByText('reflections:e1=ai/ref-1/current', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('sync:synced')).toBeOnTheScreen();
  });

  it('a reflection deleted from the account, or whose entry was deleted, disappears here too', async () => {
    const local: Partial<DemoState> = {
      entries: [
        entry('e1', 0, { body: BODY, reflection: aiReflection('ref-1'), reflectionStatus: 'ready' }),
        entry('e2', 0, { body: BODY, reflection: aiReflection('ref-2'), reflectionStatus: 'ready' }),
      ],
    };
    await seed('user:user-a', local);
    // This device last synced both entries.
    const base = toCloud({ ...initialState, onboarded: true, ...local });
    await syncBaseStorage('user-a').save(base);
    const t = await start(['user-a'], A);
    // Since then another device deleted e1's reflection, and deleted entry e2, which the
    // database cascades to e2's reflection.
    Object.assign(t.cloud.data('user-a'), { ...structuredClone(base), entries: { e1: base.entries.e1 } });
    await t.signIn();
    expect(await screen.findByText('reflections:e1=none', {}, wait)).toBeOnTheScreen();
  });

  it('a reflection that arrives while the read is running is kept; one being requested is left alone', () => {
    const state: DemoState = {
      ...initialState,
      entries: [
        entry('e1', 0, { body: BODY, reflection: aiReflection('fresh'), reflectionStatus: 'ready' }),
        entry('e2', 0, { body: BODY, reflectionStatus: 'loading' }),
      ],
    };
    const after = reducer(state, { type: 'applyAiReflections', reflections: { e2: aiReflection('other') }, known: [] });
    expect(after.entries.map((e) => [e.reflection?.ai?.id, e.reflectionStatus])).toEqual([
      ['fresh', 'ready'],
      [undefined, 'loading'],
    ]);
  });

  it('a simulated reflection on this device is never replaced or relabelled by account data', () => {
    const state: DemoState = { ...initialState, entries: [entry('e1', 0, { body: BODY, reflection: simulated, reflectionStatus: 'ready' })] };
    const after = reducer(state, { type: 'applyAiReflections', reflections: { e1: aiReflection('ref-1') }, known: [] });
    expect(after.entries[0].reflection).toEqual(simulated);
  });

  it('deleting the account removes its cached journal and reflections from the device', async () => {
    await seed('user:user-a', { entries: [entry('e1', 0, { body: BODY, reflection: aiReflection('ref-1'), reflectionStatus: 'ready' })] });
    await clearAccountData('user-a');
    expect(await scopedStorage('user:user-a').load()).toBeNull();
  });
});
