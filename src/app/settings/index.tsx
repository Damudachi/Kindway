import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { NavRow, RadioRow, Section, Segmented, SwitchRow } from '@/components/controls';
import { Dialog } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import type { DemoAi } from '@/data/types';
import { useSync, type SyncStatus } from '@/state/cloud-sync';
import { useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { makeStyles, useTheme, type Appearance } from '@/theme/theme';
import { space } from '@/theme/tokens';

const SYNC_TEXT: Record<SyncStatus, string> = {
  connecting: 'Connecting to your account…',
  syncing: 'Backing up changes…',
  synced: 'All changes are backed up to your account.',
  offline: 'Offline. Changes are saved on this device and will back up when you’re online.',
  error: 'Some changes haven’t backed up yet. They’re safe on this device.',
  'signed-out': 'Your session ended. Sign in again to keep backing up; changes stay on this device.',
};

const APPEARANCES: { id: Appearance; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'night', label: 'Night' },
];

const AI_STATES: { id: DemoAi; title: string; detail: string }[] = [
  { id: 'ok', title: 'Everything works', detail: 'Reflections arrive after a short wait.' },
  { id: 'fail', title: 'AI request fails', detail: 'Entry saves; reflection offers retry.' },
  { id: 'rate', title: 'Rate limited', detail: 'Entry saves; reflections pause for a while.' },
  { id: 'offline', title: 'Offline', detail: 'Writing works; AI and sync wait.' },
];

export default function Settings() {
  const styles = useStyles();
  const { state, dispatch } = useStore();
  const session = useSession();
  const sync = useSync();
  const { appearance, setAppearance } = useTheme();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const { user, mode } = session;

  const deleteAccount = async () => {
    if (!session.auth || deleting) return;
    setDeleting(true);
    setDeleteError(undefined);
    const result = await session.auth.deleteAccount();
    setDeleting(false);
    setConfirmDelete(false);
    if (!result.ok) {
      setDeleteError(result.message);
      return;
    }
    await session.forgetAccount();
    router.replace('/');
  };

  return (
    <Screen top={{ back: true, title: 'Settings' }}>
      <Section first>
        <NavRow icon="creation-outline" title="AI & memory" detail="Support style, challenge, context, saved memory" onPress={() => router.push('/settings/ai-memory')} />
        <NavRow icon="shield-lock-outline" title="Privacy & data" detail="Storage, AI processing, export, deletion" onPress={() => router.push('/settings/privacy')} />
        <NavRow icon="bell-outline" title="Gentle reminders" detail={state.reminders.enabled ? `On · ${state.reminders.time}` : 'Off'} onPress={() => router.push('/settings/reminders')} />
        <NavRow icon="widgets-outline" title="Home-screen widget" detail="Preview and privacy" onPress={() => router.push('/widget')} />
        <NavRow icon="lifebuoy" title="Extra support" detail="When you need more than a journal" onPress={() => router.push('/support')} />
      </Section>

      <Section title="Appearance">
        <Segmented label="Appearance" options={APPEARANCES} value={appearance} onChange={(a) => void setAppearance(a)} />
      </Section>

      <Section title="Account">
        {mode === 'local-only' ? (
          <>
            <Text variant="body">Not signed in. Your journal is only on this device and isn’t backed up.</Text>
            {session.configured ? (
              <Button variant="secondary" label="Sign in or create an account" onPress={() => router.push('/account?mode=signin')} style={styles.gap} />
            ) : (
              <Text variant="small" style={styles.gapSm}>Accounts aren’t available in this build of the app.</Text>
            )}
          </>
        ) : (
          <>
            <Text variant="body">Signed in as {user?.email}</Text>
            {mode === 'signed-in-local' ? (
              <>
                <Text variant="small" style={styles.gapSm}>Cloud sync is off on this device. Your journal here is local-only and isn’t backed up.</Text>
                <Button variant="secondary" label="Back up to my account" onPress={() => router.push('/sync')} style={styles.gap} />
              </>
            ) : (
              <>
                <Text variant="small" style={styles.gapSm}>
                  Cloud sync is on. {sync ? SYNC_TEXT[sync.status] : ''}
                  {sync?.errorCode && sync.status !== 'synced' ? ` (Reference: ${sync.errorCode})` : ''}
                </Text>
                {sync && (sync.status === 'error' || sync.status === 'offline') && <Button variant="text" label="Try again now" onPress={sync.retry} />}
                {sync?.status === 'signed-out' && <Button variant="text" label="Sign in again" onPress={() => router.push('/account?mode=signin')} />}
              </>
            )}
            <Button variant="secondary" label="Sign out" onPress={() => setConfirmSignOut(true)} style={styles.gap} />
            {deleteError && (
              <View style={styles.gap}>
                <Notice tone="warn" title="Account not deleted">
                  {deleteError}
                </Notice>
              </View>
            )}
            <Button variant="text" label="Delete my account and cloud data" onPress={() => setConfirmDelete(true)} />
          </>
        )}
      </Section>

      <Section title="Start over">
        <Text variant="body">
          {mode === 'cloud-sync'
            ? 'Erase this account’s journal on this device and in the cloud: entries, reflections, compass, preferences, small step and feedback. Your account itself stays. You’ll see onboarding again.'
            : 'Erase everything saved in this local-only journal on this device: your entries, reflections, compass, preferences, small step and feedback. You’ll see onboarding again.'}
        </Text>
        <Text variant="small" style={styles.gapSm}>
          Sample insights are fictional and built into the app, so they aren’t part of your data either way.
        </Text>
        <Button variant="danger" label="Reset everything on this device" onPress={() => setConfirmReset(true)} style={styles.gap} />
      </Section>

      <Section title="Preview states">
        <Notice tone="demo">For reviewers: simulate conditions the real backend would produce. These switches only exist in this demo.</Notice>
        <Text variant="label" style={styles.gap}>
          AI reflections
        </Text>
        {AI_STATES.map((s) => (
          <RadioRow key={s.id} title={s.title} detail={s.detail} selected={state.demo.ai === s.id} onPress={() => dispatch({ type: 'demo', patch: { ai: s.id } })} />
        ))}
        <SwitchRow title="Session expired" detail="Today asks you to sign in again" value={state.demo.sessionExpired} onChange={(sessionExpired) => dispatch({ type: 'demo', patch: { sessionExpired } })} />
        <Button variant="text" label="Open the extra support path" onPress={() => router.push('/support')} />
        <Button variant="text" label="Preview sample insights" onPress={() => router.push('/sample')} />
      </Section>

      <Dialog
        visible={confirmSignOut}
        title="Sign out?"
        body={
          mode === 'cloud-sync'
            ? 'Your account keeps its backed-up journal. On this device it’s hidden until you sign in again, and the local-only journal shows instead. Changes not yet backed up wait here until then.'
            : 'Your local-only journal stays on this device, unchanged.'
        }
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          void session.signOut().then(() => router.replace('/'));
        }}
      />
      <Dialog
        visible={confirmDelete}
        title="Delete your account?"
        body={`This permanently deletes ${user?.email ?? 'your account'} and everything saved to it in the cloud: entries, compass, small steps, preferences and feedback. Its copy on this device is removed too. Your local-only journal, if you kept one, stays. This can’t be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete account'}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void deleteAccount()}
      />
      <Dialog
        visible={confirmReset}
        title="Reset everything?"
        body={`All entries, reflections, conversations, compass values and settings in this journal will be erased${mode === 'cloud-sync' ? ' from this device and from your account’s cloud copy' : ' from this device'}. This can’t be undone.`}
        confirmLabel="Erase and start over"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          dispatch({ type: 'reset' });
          router.replace('/welcome');
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  gap: { marginTop: space.md },
  gapSm: { marginTop: space.xs },
}));
