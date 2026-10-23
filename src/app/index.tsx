import { Redirect, router } from 'expo-router';

import { Button } from '@/components/button';
import { StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { useSync } from '@/state/cloud-sync';
import { useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';

/**
 * Opens Today or onboarding, from the journal this device shows. For a synced account whose
 * copy here doesn't say onboarding is done (new device, or finished on another one), the
 * account's own record decides, so it waits for the first read of the cloud copy. If that
 * read fails it says so, rather than sending someone who already finished back to the start.
 * Someone who turned on sync partway through onboarding carries on at consent.
 */
export default function Index() {
  const { state } = useStore();
  const sync = useSync();
  const { user, resumeOnboardingFor } = useSession();
  if (state.onboarded) return <Redirect href="/today" />;
  if (!sync || sync.loaded !== false) return <Redirect href={user && resumeOnboardingFor === user.id ? '/consent?next=today' : '/welcome'} />;
  const failed = sync.status === 'offline' || sync.status === 'error' || sync.status === 'signed-out';
  return (
    <Screen top={false}>
      {failed ? (
        <StateView
          title="Couldn’t open your account’s journal"
          body={`${
            sync.status === 'offline' ? 'You seem to be offline.' : sync.status === 'signed-out' ? 'Your session ended.' : 'Your account couldn’t be read.'
          } Nothing was changed. Try again, or set up on this device for now; your account’s journal comes in once it can be read.${sync.errorCode ? ` (Reference: ${sync.errorCode})` : ''}`}
          action={
            sync.status === 'signed-out' ? (
              <Button label="Sign in" onPress={() => router.push('/account?mode=signin')} />
            ) : (
              <Button label="Try again" onPress={sync.retry} />
            )
          }
        />
      ) : (
        <StateView title="Opening your journal…" body="Checking your account. This only takes a moment." />
      )}
      {failed && <Button variant="text" label="Set up on this device for now" onPress={() => router.replace('/welcome')} />}
    </Screen>
  );
}
