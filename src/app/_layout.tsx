import { Literata_400Regular, Literata_400Regular_Italic, Literata_500Medium, useFonts } from '@expo-google-fonts/literata';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { SnackbarProvider } from '@/components/feedback';
import { AiConsentProvider } from '@/state/ai-consent';
import { CloudSync } from '@/state/cloud-sync';
import { DemoStoreProvider } from '@/state/demo-store';
import { RealAiProvider } from '@/state/real-ai';
import { SessionProvider, useSession } from '@/state/session';
import { scopedStorage } from '@/storage/persistence';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Literata_400Regular, Literata_500Medium, Literata_400Regular_Italic });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // If the font fails to load, render anyway with the system fallback rather than blocking the journal.
  if (!loaded && !error) return null;

  return (
    <SessionProvider>
      <AiConsentProvider>
        <RealAiProvider>
          <Journal>
            <SnackbarProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.paper },
                  animation: 'fade_from_bottom',
                }}>
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
              </Stack>
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
  const synced = scope !== 'guest' && user && repo;
  return (
    <DemoStoreProvider key={scope} storage={scopedStorage(scope)}>
      {synced ? (
        <CloudSync userId={user.id} repo={repo}>
          {children}
        </CloudSync>
      ) : (
        children
      )}
    </DemoStoreProvider>
  );
}
