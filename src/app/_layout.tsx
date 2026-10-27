import { Literata_400Regular, Literata_400Regular_Italic, Literata_500Medium, useFonts } from '@expo-google-fonts/literata';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { SnackbarProvider } from '@/components/feedback';
import { ThemeFade } from '@/components/theme-fade';
import { AiConsentProvider } from '@/state/ai-consent';
import { CloudSync } from '@/state/cloud-sync';
import { DemoStoreProvider } from '@/state/demo-store';
import { RealAiProvider, useRealAi } from '@/state/real-ai';
import { ReminderScheduler } from '@/state/reminders';
import { WidgetSync } from '@/state/widget-sync';
import { SessionProvider, useSession } from '@/state/session';
import { scopedStorage } from '@/storage/persistence';
import { ThemeProvider, useTheme } from '@/theme/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Literata_400Regular,
    Literata_500Medium,
    Literata_400Regular_Italic,
    Fraunces_SoftTitle: require('../../assets/fonts/Fraunces_SoftTitle.ttf'),
    Fraunces_SoftHeading: require('../../assets/fonts/Fraunces_SoftHeading.ttf'),
  });

  // If the font fails to load, render anyway with the system fallback rather than blocking the journal.
  if (!loaded && !error) return null;

  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

function App() {
  const { scheme, color } = useTheme();

  // Mounted once the fonts and the saved appearance are ready, so the first frame is in the right scheme.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // The window behind the screens shows during transitions and keyboard changes.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(color.paper);
  }, [color.paper]);

  return (
    <SessionProvider>
      <AiConsentProvider>
        <RealAiProvider>
          <Journal>
            <SnackbarProvider>
              <StatusBar style={scheme === 'night' ? 'light' : 'dark'} />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.paper },
                  animation: 'fade_from_bottom',
                }}>
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
              </Stack>
              <ThemeFade />
            </SnackbarProvider>
          </Journal>
        </RealAiProvider>
      </AiConsentProvider>
    </SessionProvider>
  );
}

/**
 * The journal the session points at: the local-only one, or a signed-in account's own synced
 * cache. Switching remounts everything below, so nothing from one journal leaks into another.
 */
function Journal({ children }: { children: React.ReactNode }) {
  const { scope, user, repo } = useSession();
  const { outputs } = useRealAi();
  const synced = scope !== 'guest' && user && repo;
  return (
    <DemoStoreProvider key={scope} storage={scopedStorage(scope)}>
      <ReminderScheduler />
      <WidgetSync />
      {synced ? (
        <CloudSync userId={user.id} repo={repo} aiOutputs={outputs}>
          {children}
        </CloudSync>
      ) : (
        children
      )}
    </DemoStoreProvider>
  );
}
