import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AiIntro from '@/app/(onboarding)/ai-intro';
import { SnackbarProvider } from '@/components/feedback';
import type { AiScope } from '@/services/ai/consent';
import { AiConsentProvider, type AiConsentInfo } from '@/state/ai-consent';
import { DemoStoreProvider, initialState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const off: RealAi = { reflections: false, insights: false, followUps: false, needs: 'account', account: null, invoke: null, outputs: null };

async function open(real: Partial<RealAi>, consent?: AiConsentInfo) {
  function Screen() {
    return (
      <AiConsentProvider value={consent}>
        <RealAiProvider value={{ ...off, ...real }}>
          <DemoStoreProvider initial={initialState}>
            <SnackbarProvider>
              <AiIntro />
            </SnackbarProvider>
          </DemoStoreProvider>
        </RealAiProvider>
      </AiConsentProvider>
    );
  }
  await renderRouter({ 'ai-intro': Screen, 'first-entry': () => <Text>First entry</Text> }, { initialUrl: '/ai-intro' });
}

describe('onboarding: what Kindway’s AI can do', () => {
  it('introduces reflections, talking it through and the AI review, then moves on to the first entry', async () => {
    await open({});
    expect(await screen.findByText('A reflection on an entry', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Talk it through')).toBeOnTheScreen();
    expect(screen.getByText('An AI review of your week')).toBeOnTheScreen();
    // Without an account nothing real can be allowed yet; it says so instead of offering it.
    expect(screen.getByText('For now: simulated previews')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Allow/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('First entry', {}, wait)).toBeOnTheScreen();
  });

  it('with an account and cloud backup, each one can be allowed right there', async () => {
    const granted = new Set<AiScope>(['follow_up']);
    const grant = jest.fn(async (scope: AiScope) => {
      granted.add(scope);
      return true;
    });
    const consent: AiConsentInfo = { load: 'ready', records: [], status: (s) => (granted.has(s) ? 'active' : 'none'), grant, revoke: jest.fn(async () => true), reload: jest.fn() };
    await open({ needs: null, account: 'user-a' }, consent);
    expect(await screen.findByText('Allowed', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow AI reflections' }));
    expect(await screen.findByText('Allow AI reflections?', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(/I’ve read what would be sent/));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Allow AI reflections' }).at(-1)!);
    await waitFor(() => expect(grant).toHaveBeenCalledWith('entry_reflection'));
  });
});
