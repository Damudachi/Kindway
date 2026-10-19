import { fireEvent, renderRouter } from 'expo-router/testing-library';

import Composer from '@/app/write';
import Journal from '@/app/(tabs)/journal';
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
});
