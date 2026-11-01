import { render, screen } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';

import FirstEntry from '@/app/(onboarding)/first-entry';
import SupportStyle from '@/app/(onboarding)/support-style';
import Welcome from '@/app/(onboarding)/welcome';
import Journal from '@/app/(tabs)/journal';
import Patterns from '@/app/(tabs)/patterns';
import Today from '@/app/(tabs)/today';
import EntryDetail from '@/app/entry/[id]/index';
import SampleInsights from '@/app/sample/index';
import Privacy from '@/app/settings/privacy';
import Settings from '@/app/settings/index';
import TomorrowBridge from '@/app/tomorrow';
import Composer from '@/app/write';
import { DateDialog } from '@/components/date-dialog';
import { Field } from '@/components/controls';
import { SnackbarProvider, useSnackbar } from '@/components/feedback';
import { daysAgo, longDate } from '@/data/dates';
import type { Entry } from '@/data/types';
import { SyncContext, type SyncInfo } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, toSnapshot, useStore, type DemoState } from '@/state/demo-store';
import { newStep } from '@/state/tomorrow';
import { memoryStorage } from '@/storage/persistence';
import { shareJournal } from '@/services/export';
import { entry } from '@/test-utils/entries';

jest.mock('@/services/export', () => ({ ...jest.requireActual('@/services/export'), shareJournal: jest.fn() }));

function withProviders(Screen: () => React.ReactElement, state: DemoState = initialState) {
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

const SLOW = 30000;
const wait = { timeout: 8000 };
const tagged = (n: number, feelings: string[]): Entry[] => Array.from({ length: n }, (_, i) => entry(`t${i}`, i, { feelings, title: `Tagged ${i}` }));

describe('onboarding', () => {
  it('welcome leads into the support style step', async () => {
    const screen = await renderRouter({ welcome: withProviders(Welcome), 'support-style': withProviders(SupportStyle) }, { initialUrl: '/welcome' });
    await fireEvent.press(screen.getByRole('button', { name: "Let's begin" }));
    expect(await screen.findByText('What kind of support helps you?')).toBeOnTheScreen();
  });

  it('the first entry can be skipped; onboarding still finishes', async () => {
    const screen = await renderRouter({ 'first-entry': withProviders(FirstEntry), today: Stub('Today screen') }, { initialUrl: '/first-entry' });
    await fireEvent.press(screen.getByRole('button', { name: "Skip for now, I'll write later" }));
    expect(await screen.findByText('Today screen')).toBeOnTheScreen();
  });
});

describe('writing and the journal', () => {
  it('composer needs no minimum: save is only disabled while the page is empty', async () => {
    const screen = await renderRouter({ write: withProviders(Composer, { ...initialState, aiConsent: 'ai' }) }, { initialUrl: '/write' });
    const reflect = screen.getByRole('button', { name: 'Save & reflect' });
    expect(reflect).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Journal entry'), '   ');
    expect(reflect).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Journal entry'), 'ok');
    expect(reflect).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save without AI' })).toBeEnabled();
  });

  it('a fresh journal is genuinely empty: no sample entries', async () => {
    const screen = await renderRouter({ journal: withProviders(Journal) }, { initialUrl: '/journal' });
    expect(await screen.findByText('Nothing here yet', {}, wait)).toBeOnTheScreen();
  });

  it('journal shows entries straight away, with no loading placeholder', async () => {
    const state = { ...initialState, entries: [entry('a', 1, { title: 'Right away' })] };
    const screen = await renderRouter({ journal: withProviders(Journal, state) }, { initialUrl: '/journal' });
    expect(screen.getByText('Right away')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading entries')).toBeNull();
  });

  it('journal search shows an empty state that can be cleared', async () => {
    const state = { ...initialState, entries: [entry('a', 1, { title: 'When I started comparing', body: 'Comparing again.' })] };
    const screen = await renderRouter({ journal: withProviders(Journal, state) }, { initialUrl: '/journal' });
    await fireEvent.changeText(screen.getByLabelText('Search your journal'), 'zebra');
    expect(await screen.findByText('No entries match', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('When I started comparing', {}, wait)).toBeOnTheScreen();
  });
});

describe('pull down to refresh', () => {
  const synced = (refresh: () => Promise<void>): SyncInfo => ({ status: 'synced', pending: 0, retry: () => {}, ensureSynced: async () => true, refresh });
  const withSync = (Screen: () => React.ReactElement, sync: SyncInfo | null) => {
    const Inner = withProviders(Screen);
    return function Synced() {
      return (
        <SyncContext value={sync}>
          <Inner />
        </SyncContext>
      );
    };
  };
  /** The refresh control handed to the scroll view that holds this text, if any. */
  const refreshControlAround = (text: ReturnType<typeof screen.getByText>) => {
    for (let n: typeof text | null = text; n; n = n.parent) if (n.props.refreshControl !== undefined) return n.props.refreshControl;
    return undefined;
  };

  it('a cloud-synced journal can be pulled down to sync now', async () => {
    const refresh = jest.fn(async () => {});
    const screen = await renderRouter({ journal: withSync(Journal, synced(refresh)) }, { initialUrl: '/journal' });
    const control = refreshControlAround(screen.getByText('Look back with kindness.'));
    expect(control).toBeTruthy();
    expect(control.props.refreshing).toBe(false);
    await act(async () => control.props.onRefresh());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Today can be pulled down too', async () => {
    const refresh = jest.fn(async () => {});
    const screen = await renderRouter({ today: withSync(Today, synced(refresh)) }, { initialUrl: '/today' });
    const control = refreshControlAround(screen.getByText('Start anywhere. It doesn’t need to make sense yet.'));
    await act(async () => control.props.onRefresh());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('the spinner stops after 10 seconds even if the sync hasn’t settled', async () => {
    const screen = await renderRouter({ journal: withSync(Journal, synced(() => new Promise(() => {}))) }, { initialUrl: '/journal' });
    const control = () => refreshControlAround(screen.getByText('Look back with kindness.'));
    jest.useFakeTimers();
    try {
      await act(async () => control().props.onRefresh());
      expect(control().props.refreshing).toBe(true);
      await act(async () => jest.advanceTimersByTime(9_900));
      expect(control().props.refreshing).toBe(true);
      await act(async () => jest.advanceTimersByTime(100));
      expect(control().props.refreshing).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['offline', 'Offline. Changes are saved on this device and will back up when you’re online.'],
    ['error', 'Some changes haven’t backed up yet. They’re safe on this device.'],
  ] as const)('a pull that ends %s says so', async (outcome, message) => {
    // Like the real sync: the status changes, then the refresh settles.
    function Stateful({ children }: { children: React.ReactNode }) {
      const [status, setStatus] = useState<SyncInfo['status']>('synced');
      return <SyncContext value={{ ...synced(async () => setStatus(outcome)), status }}>{children}</SyncContext>;
    }
    const Inner = withProviders(Journal);
    const screen = await renderRouter({ journal: () => <Stateful><Inner /></Stateful> }, { initialUrl: '/journal' });
    expect(screen.queryByText(message)).toBeNull();
    await act(async () => refreshControlAround(screen.getByText('Look back with kindness.')).props.onRefresh());
    expect(await screen.findByText(message, {}, wait)).toBeOnTheScreen();
  });

  it('a pull that reaches the account shows no message', async () => {
    const screen = await renderRouter({ today: withSync(Today, synced(async () => {})) }, { initialUrl: '/today' });
    await act(async () => refreshControlAround(screen.getByText('Start anywhere. It doesn’t need to make sense yet.')).props.onRefresh());
    expect(screen.queryByText(/Offline\.|haven’t backed up/)).toBeNull();
  });

  it('a local-only journal has nothing to refresh', async () => {
    const screen = await renderRouter({ journal: withSync(Journal, null) }, { initialUrl: '/journal' });
    expect(refreshControlAround(screen.getByText('Look back with kindness.'))).toBeUndefined();
  });
});

describe('daily reflection preview', () => {
  const withReflection = (style: 'listen' | 'understand', feelings: string[] = ['Worried']): DemoState => ({
    ...initialState,
    aiConsent: 'ai',
    entries: [
      entry('e1', 0, {
        feelings,
        body: 'A hard one.',
        reflectionStatus: 'ready',
        reflection:
          style === 'listen'
            ? { style, acknowledge: 'Thank you for writing this down.', basedOn: 'A hard one.', variant: 0 }
            : { style, acknowledge: 'That sounds heavy.', perspective: 'First perspective.', basedOn: 'A hard one.', variant: 0 },
      }),
    ],
  });

  it('"Just listen" shows no perspective, advice or step planning, and is labelled simulated', async () => {
    const screen = await renderRouter({ 'entry/[id]': withProviders(EntryDetail, withReflection('listen')) }, { initialUrl: '/entry/e1' });
    expect(screen.getByText(/Preview response · simulated/)).toBeOnTheScreen();
    expect(screen.queryByText('One possible way to see it')).toBeNull();
    expect(screen.queryByText('If you want a next step')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Plan one small step for tomorrow' })).toBeNull();
  });

  it('"Doesn’t quite fit" is stored on the reflection and shown back', async () => {
    const screen = await renderRouter({ 'entry/[id]': withProviders(EntryDetail, withReflection('understand')) }, { initialUrl: '/entry/e1' });
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Doesn’t quite fit' }));
    expect(screen.getByText(/Noted on this entry. You know your situation better/)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Doesn’t quite fit' })).toBeChecked();
  });

  it('keeps the reflection’s small print folded, with support always visible', async () => {
    const screen = await renderRouter({ 'entry/[id]': withProviders(EntryDetail, withReflection('understand')) }, { initialUrl: '/entry/e1' });
    expect(screen.getByRole('link', { name: 'Need more support?' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remove this reflection' })).toBeNull();
    const about = screen.getByRole('button', { name: 'About this reflection' });
    expect(about).toBeCollapsed();
    await fireEvent.press(about);
    expect(screen.getByRole('button', { name: 'About this reflection' })).toBeExpanded();
    expect(screen.getByRole('button', { name: 'Remove this reflection' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Adjust how Kindway reflects' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Entry options' })).toBeOnTheScreen();
  });

  it('without a suggested next step, “Plan one small step for tomorrow” is the way to Tomorrow Bridge', async () => {
    const screen = await renderRouter({ 'entry/[id]': withProviders(EntryDetail, withReflection('understand')) }, { initialUrl: '/entry/e1' });
    expect(screen.getByRole('button', { name: 'Plan one small step for tomorrow' })).toBeOnTheScreen();
  });

  it('with a suggested next step, only “Save to Tomorrow Bridge” is offered', async () => {
    const state = withReflection('understand');
    state.entries[0] = { ...state.entries[0], reflection: { ...state.entries[0].reflection!, nextStep: 'Fictional: a short walk.' } };
    const screen = await renderRouter({ 'entry/[id]': withProviders(EntryDetail, state) }, { initialUrl: '/entry/e1' });
    expect(screen.getByRole('button', { name: 'Save to Tomorrow Bridge' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Plan one small step for tomorrow' })).toBeNull();
  });

  it('"Try another perspective" replaces the perspective with a different one', async () => {
    const screen = await renderRouter({ 'entry/[id]': withProviders(EntryDetail, withReflection('understand')) }, { initialUrl: '/entry/e1' });
    await fireEvent.press(screen.getByRole('button', { name: 'Try another perspective' }));
    expect(await screen.findByText(/fair response to a hard situation/, {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('First perspective.')).toBeNull();
  }, SLOW);
});

describe('Patterns & Insights', () => {
  it('with no entries, shows an empty state and the separate sample demo', async () => {
    const screen = await renderRouter({ patterns: withProviders(Patterns) }, { initialUrl: '/patterns' });
    expect(await screen.findByText('Nothing to look across yet', {}, wait)).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Preview sample insights' }).length).toBeGreaterThan(0);
  }, SLOW);

  it('with two entries, says there is not enough to go on', async () => {
    const screen = await renderRouter({ patterns: withProviders(Patterns, { ...initialState, entries: tagged(2, ['Worried']) }) }, { initialUrl: '/patterns' });
    expect(await screen.findByText('Not enough to go on yet', {}, wait)).toBeOnTheScreen();
  }, SLOW);

  it('with enough entries, shows factual tag counts linked to the real entries', async () => {
    const screen = await renderRouter({ patterns: withProviders(Patterns, { ...initialState, entries: tagged(3, ['Worried']) }) }, { initialUrl: '/patterns' });
    expect(await screen.findByText('You tagged “Worried” in 3 of 3 entries', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('How this was made')).toBeOnTheScreen();
    expect(screen.queryByText(/Sample ·/)).toBeNull();
  }, SLOW);

  it('a failed review offers a retry', async () => {
    const state = { ...initialState, entries: tagged(3, ['Worried']), demo: { ...initialState.demo, ai: 'fail' as const } };
    const screen = await renderRouter({ patterns: withProviders(Patterns, state) }, { initialUrl: '/patterns' });
    expect(await screen.findByText('This review didn’t come through', {}, wait)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  }, SLOW);

  it('the sample demo is labelled fictional, links only to sample entries and can’t save steps', async () => {
    const screen = await renderRouter({ sample: withProviders(SampleInsights, { ...initialState, entries: tagged(3, ['Worried']) }) }, { initialUrl: '/sample' });
    expect(screen.getByText('Fictional examples')).toBeOnTheScreen();
    expect(await screen.findByText('Comparing progress with others', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Tagged 0')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save as tomorrow’s step' })).toBeNull();
    await fireEvent.press(screen.getAllByRole('checkbox', { name: 'Partly fits' })[0]);
    expect(screen.getAllByRole('checkbox', { name: 'Partly fits' })[0]).toBeChecked();
  }, SLOW);
});

describe('Tomorrow Bridge on Today', () => {
  it('a due step can be marked done, then asks optionally whether it helped', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const state = { ...initialState, onboarded: true, tomorrow: newStep('Ten minutes on the hard task', undefined, yesterday) };
    const screen = await renderRouter({ today: withProviders(Today, state) }, { initialUrl: '/today' });
    await fireEvent.press(screen.getByRole('button', { name: 'Update this step' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Done today')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'It helped' })).toBeOnTheScreen();
  });

  it('a due step can be moved to tomorrow without penalty', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const state = { ...initialState, onboarded: true, tomorrow: newStep('Call home', undefined, yesterday) };
    const screen = await renderRouter({ today: withProviders(Today, state) }, { initialUrl: '/today' });
    await fireEvent.press(screen.getByRole('button', { name: 'Update this step' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Move to tomorrow' }));
    expect(await screen.findByText('Tomorrow · optional')).toBeOnTheScreen();
  });
});

describe('Tomorrow Bridge edits and undo', () => {
  it('letting a step go can be undone from the snackbar', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const state = { ...initialState, onboarded: true, tomorrow: newStep('Call home', undefined, yesterday) };
    const screen = await renderRouter({ today: withProviders(Today, state) }, { initialUrl: '/today' });
    await fireEvent.press(screen.getByRole('button', { name: 'Update this step' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Let it go' }));
    expect(screen.queryByText('Call home')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Call home')).toBeOnTheScreen();
  });

  it('editing an open step keeps it and updates its text', async () => {
    const state = { ...initialState, onboarded: true, tomorrow: newStep('Call home') };
    function StepProbe() {
      const { state: s } = useStore();
      return <Text>saved:{s.tomorrow?.text}:{s.tomorrow?.dueOn === state.tomorrow?.dueOn ? 'same day' : 'moved'}</Text>;
    }
    const screen = await renderRouter(
      {
        tomorrow: withProviders(() => (
          <>
            <TomorrowBridge />
            <StepProbe />
          </>
        ), state),
      },
      { initialUrl: '/tomorrow' },
    );
    await fireEvent.changeText(screen.getByDisplayValue('Call home'), 'Text home instead');
    await fireEvent.press(screen.getByRole('button', { name: 'Update my step' }));
    expect(screen.getByText('saved:Text home instead:same day')).toBeOnTheScreen();
  });
});

describe('local persistence and reset', () => {
  function Probe() {
    const { state, dispatch } = useStore();
    return (
      <Text onPress={() => dispatch({ type: 'patch', patch: { supportStyle: 'forward' } })}>
        {state.onboarded ? 'onboarded' : 'new'}:{state.supportStyle}:{state.entries.length}
      </Text>
    );
  }

  it('loads saved state on launch and saves changes back to device storage', async () => {
    const storage = memoryStorage(toSnapshot({ ...initialState, onboarded: true, supportStyle: 'listen', entries: [entry('a', 0)] }));
    const screen = await renderRouter(
      {
        index: function Root() {
          return (
            <DemoStoreProvider storage={storage}>
              <Probe />
            </DemoStoreProvider>
          );
        },
      },
      { initialUrl: '/' },
    );
    const text = await screen.findByText('onboarded:listen:1', {}, wait);
    await fireEvent.press(text);
    // renderRouter runs on fake timers; waitFor advances them past the save debounce.
    await waitFor(() => expect((storage.current as { state: DemoState }).state.supportStyle).toBe('forward'), wait);
  }, SLOW);

  it('reset asks for confirmation, then returns to a clean first launch', async () => {
    const state = { ...initialState, onboarded: true, entries: [entry('a', 0)] };
    const screen = await renderRouter({ settings: withProviders(Settings, state), welcome: Stub('Welcome screen') }, { initialUrl: '/settings' });
    await fireEvent.press(screen.getByRole('button', { name: 'Reset everything on this device' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Erase and start over' }));
    expect(await screen.findByText('Welcome screen')).toBeOnTheScreen();
  });
});

describe('settings about section', () => {
  it('shows the version, policies and contact rows', async () => {
    await renderRouter({ settings: withProviders(Settings, { ...initialState, onboarded: true }) }, { initialUrl: '/settings' });
    expect(screen.getByText(/^Version /)).toBeOnTheScreen();
    expect(screen.getByText('Privacy policy')).toBeOnTheScreen();
    expect(screen.getByText('Terms of use')).toBeOnTheScreen();
    expect(screen.getByText('Contact us')).toBeOnTheScreen();
  });
});

describe('privacy export', () => {
  it('Export my journal is disabled with an empty journal', async () => {
    await renderRouter({ 'settings/privacy': withProviders(Privacy) }, { initialUrl: '/settings/privacy' });
    expect(screen.getByRole('button', { name: 'Export my journal' })).toBeDisabled();
  });

  it('Export my journal is enabled once there is an entry', async () => {
    const state = { ...initialState, onboarded: true, entries: [entry('a', 0)] };
    await renderRouter({ 'settings/privacy': withProviders(Privacy, state) }, { initialUrl: '/settings/privacy' });
    expect(screen.getByRole('button', { name: 'Export my journal' })).toBeEnabled();
  });
});

describe('privacy beta notice', () => {
  it('privacy says beta and links to the policy', async () => {
    await renderRouter({ 'settings/privacy': withProviders(Privacy) }, { initialUrl: '/settings/privacy' });
    expect(screen.getByText('Kindway is in beta.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Read the privacy policy' })).toBeOnTheScreen();
    expect(screen.queryByText(/pre-release app/)).toBeNull();
  });
});

describe('privacy export failure', () => {
  it('says so and leaves the journal alone when sharing fails', async () => {
    jest.mocked(shareJournal).mockRejectedValueOnce(new Error('no share sheet'));
    const state = { ...initialState, onboarded: true, entries: [entry('a', 0)] };
    await renderRouter({ 'settings/privacy': withProviders(Privacy, state) }, { initialUrl: '/settings/privacy' });
    await fireEvent.press(screen.getByRole('button', { name: 'Export my journal' }));
    expect(await screen.findByText('Couldn’t export. Your journal is unchanged.')).toBeOnTheScreen();
  });
});

describe('password fields', () => {
  it('a password field starts hidden and toggles visible', async () => {
    await render(<Field label="Password" secureTextEntry />);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeOnTheScreen();
  });

  it('a plain field has no toggle', async () => {
    await render(<Field label="Email address" />);
    expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
  });
});

describe('deleting an entry', () => {
  beforeEach(() => jest.useFakeTimers());

  const journal = { ...initialState, onboarded: true, entries: [entry('keep', 1, { title: 'Keep this one' }), entry('gone', 0, { title: 'Delete this one' })] };

  /** Shows which entries the store really holds; pressing it shows an unrelated snackbar. */
  function Probe() {
    const { state } = useStore();
    const snack = useSnackbar();
    return <Text onPress={() => snack({ message: 'Something else happened' })}>stored:{state.entries.map((e) => e.id).join(',')}</Text>;
  }

  /** One journal shared by every screen, remounted by "Switch journal" as an account switch does in the app. */
  async function open() {
    const storage = memoryStorage(toSnapshot(journal));
    function Layout() {
      const [scope, setScope] = useState(0);
      return (
        <>
          <DemoStoreProvider key={scope} storage={storage}>
            <SnackbarProvider>
              <Stack />
              <Probe />
            </SnackbarProvider>
          </DemoStoreProvider>
          <Text onPress={() => setScope((n) => n + 1)}>Switch journal</Text>
        </>
      );
    }
    await renderRouter({ _layout: Layout, journal: Journal, 'entry/[id]/index': EntryDetail }, { initialUrl: '/journal' });
    expect(await screen.findByText('Delete this one', {}, wait)).toBeOnTheScreen();
    return storage;
  }

  async function remove(title: string) {
    await act(async () => router.push(`/entry/${journal.entries.find((e) => e.title === title)?.id}`));
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete entry' }, wait));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  }

  const advance = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });

  it('deleted entry disappears at once and is gone for good after 6 seconds', async () => {
    await open();
    await remove('Delete this one');
    expect(await screen.findByText('Keep this one', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Delete this one')).toBeNull();
    // Only hidden so far.
    expect(screen.getByText('stored:keep,gone')).toBeOnTheScreen();
    await advance(6000);
    expect(screen.getByText('stored:keep')).toBeOnTheScreen();
    expect(screen.queryByText('Delete this one')).toBeNull();
  }, SLOW);

  it('undo brings it back and nothing is deleted', async () => {
    await open();
    await remove('Delete this one');
    expect(await screen.findByText('Keep this one', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    await advance(10_000);
    expect(screen.getByText('Delete this one')).toBeOnTheScreen();
    expect(screen.getByText('stored:keep,gone')).toBeOnTheScreen();
  }, SLOW);

  it('a newer snackbar does not cancel the deletion', async () => {
    await open();
    await remove('Delete this one');
    await fireEvent.press(await screen.findByText('stored:keep,gone', {}, wait));
    expect(await screen.findByText('Something else happened', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    await advance(6000);
    expect(screen.getByText('stored:keep')).toBeOnTheScreen();
  }, SLOW);

  it('two deletes in a row each keep their own timer', async () => {
    await open();
    await remove('Delete this one');
    await remove('Keep this one');
    expect(await screen.findByText('Nothing here yet', {}, wait)).toBeOnTheScreen();
    // The snackbar now offers Undo for the second delete only; the first still goes ahead.
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    await advance(10_000);
    expect(screen.getByText('stored:keep')).toBeOnTheScreen();
    expect(screen.getByText('Keep this one')).toBeOnTheScreen();
  }, SLOW);

  it('the journal remounting during the window keeps the entry', async () => {
    const storage = await open();
    await remove('Delete this one');
    await fireEvent.press(await screen.findByText('Switch journal', {}, wait));
    await advance(10_000);
    expect(await screen.findByText('stored:keep,gone', {}, wait)).toBeOnTheScreen();
    expect((storage.current as { state: DemoState }).state.entries.map((e) => e.id)).toEqual(['keep', 'gone']);
  }, SLOW);
});

describe('changing an entry’s date', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  /** Shows how many days ago each stored entry is dated. */
  function Dates() {
    const { state } = useStore();
    return <Text>dates:{state.entries.map((e) => daysAgo(e.date)).join(',')}</Text>;
  }

  it('the stepper stops at today and the chips jump to Today and Yesterday', async () => {
    await render(<DateDialog visible value={new Date().toISOString()} onCancel={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByText(longDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yesterday' }));
    expect(screen.getByText(longDate(yesterday))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Today' }));
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });

  it('on the entry page, choosing Yesterday moves the entry', async () => {
    const state = { ...initialState, entries: [entry('e1', 0, { body: 'Words.' })] };
    const wrapped = withProviders(() => (
      <>
        <EntryDetail />
        <Dates />
      </>
    ), state);
    const screen = await renderRouter({ 'entry/[id]': wrapped }, { initialUrl: '/entry/e1' });
    await fireEvent.press(screen.getByRole('button', { name: `${longDate(entry('x', 0).date)}. Change date` }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yesterday' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: `${longDate(yesterday)}. Change date` })).toBeOnTheScreen();
    expect(screen.getByText('dates:1')).toBeOnTheScreen();
  });

  it('in the composer, a new draft says Today and a chosen day is saved with the entry', async () => {
    const wrapped = withProviders(() => (
      <>
        <Composer />
        <Dates />
      </>
    ));
    const screen = await renderRouter({ write: wrapped }, { initialUrl: '/write' });
    expect(screen.getByText('Today · Change')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Date: Today. Change date' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yesterday' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Yesterday · Change')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Journal entry'), 'Something from yesterday.');
    await fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('dates:1', {}, wait)).toBeOnTheScreen();
  }, SLOW);

  function DraftDate() {
    const { state } = useStore();
    return <Text>draft date:{state.draft.date === undefined ? 'none' : daysAgo(state.draft.date)}</Text>;
  }

  async function chooseDay(screen: Awaited<ReturnType<typeof renderRouter>>, label: string, chip: 'Today' | 'Yesterday') {
    await fireEvent.press(await screen.findByRole('button', { name: `Date: ${label}. Change date` }, wait));
    await fireEvent.press(screen.getByRole('checkbox', { name: chip }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  }

  it('in the composer, choosing Today again leaves the draft undated', async () => {
    const wrapped = withProviders(() => (
      <>
        <Composer />
        <DraftDate />
      </>
    ));
    const screen = await renderRouter({ write: wrapped }, { initialUrl: '/write' });
    await chooseDay(screen, 'Today', 'Yesterday');
    expect(screen.getByText('draft date:1')).toBeOnTheScreen();
    await chooseDay(screen, 'Yesterday', 'Today');
    expect(screen.getByText('Today · Change')).toBeOnTheScreen();
    // Not an instant from now: an entry saved later is dated when it's saved.
    expect(screen.getByText('draft date:none')).toBeOnTheScreen();
  }, SLOW);

  it('a day chosen on an empty composer is forgotten when it’s left; a draft with words keeps it', async () => {
    function Layout() {
      return (
        <DemoStoreProvider initial={initialState}>
          <SnackbarProvider>
            <Stack />
            <DraftDate />
          </SnackbarProvider>
        </DemoStoreProvider>
      );
    }
    const screen = await renderRouter({ _layout: Layout, index: Stub('Home'), write: Composer }, { initialUrl: '/' });
    await act(async () => router.push('/write'));
    await chooseDay(screen, 'Today', 'Yesterday');
    expect(screen.getByText('draft date:1')).toBeOnTheScreen();
    await act(async () => router.back());
    expect(await screen.findByText('Home', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('draft date:none')).toBeOnTheScreen();

    await act(async () => router.push('/write'));
    expect(await screen.findByText('Today · Change', {}, wait)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Journal entry'), 'Still thinking about yesterday.');
    await chooseDay(screen, 'Today', 'Yesterday');
    await act(async () => router.back());
    expect(await screen.findByText('Home', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('draft date:1')).toBeOnTheScreen();
  }, SLOW);
});
