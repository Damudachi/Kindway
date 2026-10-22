import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Section } from '@/components/controls';
import { Notice, StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { accountStateAfter, planMigration, runMigration, type MigrationPlan } from '@/services/cloud/migrate';
import type { CloudSnapshot } from '@/services/cloud/records';
import { CloudError } from '@/services/cloud/repo';
import { toSnapshot, useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { eraseScope, scopedStorage, syncBaseStorage } from '@/storage/persistence';
import { space } from '@/theme/tokens';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Step =
  | { kind: 'loading' }
  | { kind: 'load-failed' }
  | { kind: 'ready'; plan: MigrationPlan; cloud: CloudSnapshot }
  | { kind: 'uploading'; plan: MigrationPlan; cloud: CloudSnapshot }
  | { kind: 'upload-failed'; plan: MigrationPlan; cloud: CloudSnapshot }
  | { kind: 'verified'; after: CloudSnapshot; plan: MigrationPlan }
  | { kind: 'finishing' };

/**
 * Turning on cloud sync for the signed-in account. Nothing is uploaded until the person taps
 * the upload button on this screen; the local-only journal is kept until the cloud copy has
 * been read back and checked, and then only removed if they choose to.
 */
export default function Sync() {
  const { state } = useStore();
  const { user, repo, mode, enableSync } = useSession();
  const [step, setStep] = useState<Step>({ kind: 'loading' });

  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<CloudError | null>(null);
  // Plans against the journal as it is when the screen opens.
  const journal = useRef(state);

  useEffect(() => {
    if (mode !== 'signed-in-local' || !user || !repo) return;
    let cancelled = false;
    repo.pull(user.id).then(
      (cloud) => !cancelled && setStep({ kind: 'ready', cloud, plan: planMigration(journal.current, cloud) }),
      (e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof CloudError ? e : null);
        setStep({ kind: 'load-failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mode, user, repo, attempt]);

  const leave = () => {
    if (state.onboarded) router.replace('/today');
    else router.replace('/consent?next=today');
  };

  const upload = async (plan: MigrationPlan, cloud: CloudSnapshot) => {
    if (!user || !repo) return;
    setStep({ kind: 'uploading', plan, cloud });
    try {
      const after = await runMigration(repo, user.id, plan, cloud);
      setStep({ kind: 'verified', after, plan });
    } catch {
      setStep({ kind: 'upload-failed', plan, cloud });
    }
  };

  const finish = async (after: CloudSnapshot, plan: MigrationPlan, keepLocal: boolean) => {
    if (!user) return;
    setStep({ kind: 'finishing' });
    await scopedStorage(`user:${user.id}`).save(toSnapshot(accountStateAfter(state, plan, after)));
    await syncBaseStorage(user.id).save(after);
    if (!keepLocal) await eraseScope('guest');
    // Switches the app to this account's journal; the root route then opens it.
    await enableSync();
  };

  if (mode === 'local-only')
    return (
      <Screen top={{ back: true, title: 'Cloud backup' }}>
        <StateView title="Sign in first" body="Cloud backup belongs to an account. Your journal keeps working on this device without one." action={<Button label="Sign in" onPress={() => router.replace('/account?mode=signin')} />} />
      </Screen>
    );
  if (mode === 'cloud-sync')
    return (
      <Screen top={{ back: true, title: 'Cloud backup' }}>
        <StateView
          title="Cloud sync is on"
          body={`This device shows the journal saved to ${user?.email}.`}
          // Reached from sign-in during onboarding, going back would re-enter the steps just left.
          action={<Button label="Done" onPress={() => (state.onboarded ? router.back() : router.replace('/consent?next=today'))} />}
        />
      </Screen>
    );

  if (step.kind === 'loading' || step.kind === 'finishing')
    return (
      <Screen top={{ back: true, title: 'Cloud backup' }}>
        <StateView title={step.kind === 'loading' ? 'Checking your account…' : 'Opening your synced journal…'} body="This only takes a moment." />
      </Screen>
    );
  if (step.kind === 'load-failed')
    return (
      <Screen top={{ back: true, title: 'Cloud backup' }}>
        <StateView
          title={loadError?.kind === 'offline' ? 'Couldn’t reach your account' : 'Couldn’t read your account'}
          body={`Nothing was uploaded and your journal on this device is unchanged. ${
            loadError?.kind === 'offline' ? 'Check your connection and try again.' : 'Your account’s data couldn’t be read; try again.'
          }${loadError?.code ? ` (Reference: ${loadError.code})` : ''}`}
          action={
            <Button
              label="Try again"
              onPress={() => {
                setStep({ kind: 'loading' });
                setAttempt((a) => a + 1);
              }}
            />
          }
        />
        <Button variant="text" style={styles.center} label="Keep using locally" onPress={leave} />
      </Screen>
    );

  if (step.kind === 'verified') {
    const { after, plan } = step;
    const hasLocal = plan.local.entries + plan.local.compass + plan.local.actions > 0;
    return (
      <Screen
        top={{ title: 'Cloud backup' }}
        footer={
          hasLocal ? (
            <>
              <Button label="Keep the local-only copy too" onPress={() => void finish(after, plan, true)} />
              <Button variant="secondary" label="Remove the local-only copy" onPress={() => void finish(after, plan, false)} />
            </>
          ) : (
            <Button label="Open my synced journal" onPress={() => void finish(after, plan, true)} />
          )
        }>
        <Text variant="headline" accessibilityRole="header">
          Your journal is in your account.
        </Text>
        <Text variant="bodyMuted" style={styles.lede}>
          We read it back from the cloud and checked it: {plural(Object.keys(after.entries).length, 'entry', 'entries')}, {plural(Object.keys(after.compass).length, 'compass area')} and{' '}
          {plural(Object.keys(after.tomorrow).length, 'small step')} are saved to {user?.email}.
        </Text>
        {hasLocal && (
          <Text variant="body">
            The local-only copy you started with is still on this device. Keeping it means you’ll see it again if you sign out. Removing it deletes it from this device only; your account keeps everything.
          </Text>
        )}
      </Screen>
    );
  }

  const { plan, cloud } = step;
  const blocked = plan.compassOverflow.length > 0;
  const uploading = step.kind === 'uploading';
  const adding = plan.adding.entries + plan.adding.compass + plan.adding.actions;
  return (
    <Screen
      top={{ back: true, title: 'Cloud backup' }}
      footer={
        <>
          <Button
            label={adding > 0 ? `Upload ${plural(plan.adding.entries, 'entry', 'entries')} and sync` : 'Turn on cloud sync'}
            loading={uploading}
            disabled={blocked}
            onPress={() => void upload(plan, cloud)}
          />
          <Button variant="text" style={styles.center} label="Keep using locally" onPress={leave} />
        </>
      }>
      <Text variant="headline" accessibilityRole="header">
        Back up your journal?
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Signed in as {user?.email}. Right now your journal is only on this device and isn’t backed up.
      </Text>

      {step.kind === 'upload-failed' && (
        <Notice tone="warn" title="Upload didn’t finish">
          Some records may not have arrived. Your journal on this device is unchanged, and trying again won’t create duplicates.
        </Notice>
      )}

      <Section first title="What happens">
        <Text variant="body">
          Turning this on sends the journal below to Kindway’s cloud database (hosted by Supabase), where only your account can read it. After that, new entries and changes sync automatically.
        </Text>
        <View style={styles.counts}>
          <Text variant="body">On this device: {plural(plan.local.entries, 'entry', 'entries')}, {plural(plan.local.compass, 'compass area')}, {plural(plan.local.actions, 'small step')}.</Text>
          <Text variant="body">Already in your account: {plural(plan.cloud.entries, 'entry', 'entries')}, {plural(plan.cloud.compass, 'compass area')}, {plural(plan.cloud.actions, 'small step')}.</Text>
          {adding > 0 && (
            <Text variant="body">
              Will be added: {plural(plan.adding.entries, 'entry', 'entries')}, {plural(plan.adding.compass, 'compass area')}, {plural(plan.adding.actions, 'small step')}.
            </Text>
          )}
        </View>
        {Object.keys(plan.copies).length > 0 && (
          <Text variant="small" style={styles.gap}>
            {plural(Object.keys(plan.copies).length, 'entry', 'entries')} already exist in your account with different text. Both versions are kept: this device’s is added as a copy.
          </Text>
        )}
        {plan.keepsAccountPreferences && plan.local.entries > 0 && <Text variant="small" style={styles.gap}>Your account’s support style and preferences are kept.</Text>}
        {plan.keepsAccountStep && plan.local.actions > 0 && <Text variant="small" style={styles.gap}>Your account already has a small step for tomorrow; it’s kept, and this device’s step stays in the local-only copy.</Text>}
      </Section>

      {blocked && (
        <Notice tone="warn" title="Your compass would have more than three areas">
          Your account already has its own compass, and adding {plan.compassOverflow.join(', ')} from this device would go over three. Remove an area on this device’s Compass first, then come back. Nothing has been uploaded.
        </Notice>
      )}

      <Section title="What stays on this device">
        <Text variant="body">
          Simulated reflections, simulated follow-up replies, saved memory, reminders and sample-insight feedback are not uploaded. Your local-only copy also stays on this device until you choose otherwise.
        </Text>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { marginTop: space.xs, marginBottom: space.md },
  counts: { marginTop: space.sm, gap: space.xxs },
  gap: { marginTop: space.xs },
  center: { alignSelf: 'center' },
});
