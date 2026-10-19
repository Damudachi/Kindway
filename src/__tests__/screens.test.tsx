import { fireEvent, renderRouter } from 'expo-router/testing-library';

import Composer from '@/app/write';
import Journal from '@/app/(tabs)/journal';
import Patterns from '@/app/(tabs)/patterns';
import EntryDetail from '@/app/entry/[id]/index';
import Welcome from '@/app/(onboarding)/welcome';
import SupportStyle from '@/app/(onboarding)/support-style';
import { SnackbarProvider } from '@/components/feedback';
import { DemoStoreProvider, initialState } from '@/state/demo-store';

function withProviders(Screen: () => React.ReactElement, state = initialState) {
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

describe('screens', () => {
  it('welcome leads into the support style step', async () => {
    const screen = await renderRouter({ welcome: withProviders(Welcome), 'support-style': withProviders(SupportStyle) }, { initialUrl: '/welcome' });
    await fireEvent.press(screen.getByRole('button', { name: "Let's begin" }));
    expect(await screen.findByText('What kind of support helps you?')).toBeOnTheScreen();
  });

  it('composer needs no minimum: save is only disabled while the page is empty', async () => {
    const screen = await renderRouter({ write: withProviders(Composer, { ...initialState, aiConsent: 'ai' }) }, { initialUrl: '/write' });
    const reflect = screen.getByRole('button', { name: 'Save & reflect' });
    expect(reflect).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Journal entry'), 'ok');
    expect(reflect).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save without AI' })).toBeEnabled();
  });

  it('journal search shows an empty state that can be cleared', async () => {
    const screen = await renderRouter({ journal: withProviders(Journal) }, { initialUrl: '/journal' });
    await fireEvent.changeText(screen.getByLabelText('Search your journal'), 'zebra');
    expect(await screen.findByText('No entries match', {}, { timeout: 5000 })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('When I started comparing', {}, { timeout: 5000 })).toBeOnTheScreen();
  });

  it('weekly review runs only on request, then shows cited, simulated insights', async () => {
    const screen = await renderRouter({ patterns: withProviders(Patterns) }, { initialUrl: '/patterns' });
    expect(screen.queryByText('Recurring themes')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Look back on this week' }));
    expect(screen.getByText('Looking back on your week…')).toBeOnTheScreen();
    expect(await screen.findByText('Simulated insights', {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(screen.getByText('Comparing your progress with others')).toBeOnTheScreen();
    expect(screen.getByText('For next week, if you want')).toBeOnTheScreen();
  }, 30000);

  it('weekly review says when there is too little to go on', async () => {
    const state = { ...initialState, entries: initialState.entries.slice(0, 2) };
    const screen = await renderRouter({ patterns: withProviders(Patterns, state) }, { initialUrl: '/patterns' });
    await fireEvent.press(screen.getByRole('button', { name: 'Look back on this week' }));
    expect(await screen.findByText('Not enough to go on yet', {}, { timeout: 5000 })).toBeOnTheScreen();
  }, 30000);

  it('weekly review shows an empty state when every entry is kept out of analysis', async () => {
    const state = { ...initialState, entries: initialState.entries.map((e) => ({ ...e, excludeFromAnalysis: true })) };
    const screen = await renderRouter({ patterns: withProviders(Patterns, state) }, { initialUrl: '/patterns' });
    expect(screen.getByText('Nothing to look back on yet')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Look back on this week' })).toBeNull();
  });

  it('weekly review failure offers a retry', async () => {
    const state = { ...initialState, demo: { ...initialState.demo, ai: 'fail' as const } };
    const screen = await renderRouter({ patterns: withProviders(Patterns, state) }, { initialUrl: '/patterns' });
    await fireEvent.press(screen.getByRole('button', { name: 'Look back on this week' }));
    expect(await screen.findByText('The weekly review didn’t come through', {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  }, 30000);

  it('a "Just listen" reflection shows no advice or challenge', async () => {
    const state = {
      ...initialState,
      aiConsent: 'ai' as const,
      entries: initialState.entries.map((e) =>
        e.id === 'e4' ? { ...e, reflection: { style: 'listen' as const, acknowledge: 'Thank you for writing this down.', basedOn: e.body } } : e,
      ),
    };
    const screen = await renderRouter({ 'entry/[id]': withProviders(EntryDetail, state) }, { initialUrl: '/entry/e4' });
    expect(screen.getByText('Simulated reflection')).toBeOnTheScreen();
    expect(screen.queryByText('Another way to see it')).toBeNull();
    expect(screen.queryByText('If you want a next step')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Plan one small step for tomorrow' })).toBeNull();
  });
});
