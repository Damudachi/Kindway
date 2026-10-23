import { Text } from 'react-native';
import { fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';

import FirstEntry from '@/app/(onboarding)/first-entry';
import SupportStyle from '@/app/(onboarding)/support-style';
import Welcome from '@/app/(onboarding)/welcome';
import Journal from '@/app/(tabs)/journal';
import Patterns from '@/app/(tabs)/patterns';
import Today from '@/app/(tabs)/today';
import EntryDetail from '@/app/entry/[id]/index';
import SampleInsights from '@/app/sample/index';
import Settings from '@/app/settings/index';
import TomorrowBridge from '@/app/tomorrow';
import Composer from '@/app/write';
import { SnackbarProvider } from '@/components/feedback';
import type { Entry } from '@/data/types';
import { DemoStoreProvider, initialState, toSnapshot, useStore, type DemoState } from '@/state/demo-store';
import { newStep } from '@/state/tomorrow';
import { memoryStorage } from '@/storage/persistence';
import { entry } from '@/test-utils/entries';

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

  it('journal search shows an empty state that can be cleared', async () => {
    const state = { ...initialState, entries: [entry('a', 1, { title: 'When I started comparing', body: 'Comparing again.' })] };
    const screen = await renderRouter({ journal: withProviders(Journal, state) }, { initialUrl: '/journal' });
    await fireEvent.changeText(screen.getByLabelText('Search your journal'), 'zebra');
    expect(await screen.findByText('No entries match', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('When I started comparing', {}, wait)).toBeOnTheScreen();
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
