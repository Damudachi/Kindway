import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field, Section } from '@/components/controls';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { space } from '@/theme/tokens';

/**
 * Privacy & data. Each control here must map to real data behavior before launch.
 * TODO(backend): export, deletion and retention once Supabase storage and policies exist.
 */
export default function Privacy() {
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const [dialog, setDialog] = useState<'export' | 'account' | null>(null);
  const [confirmText, setConfirmText] = useState('');

  return (
    <Screen top={{ back: true, title: 'Privacy & data' }}>
      <Text variant="headline" accessibilityRole="header">
        Your words belong to you.
      </Text>

      <Section first title="Where your entries are stored">
        <Text variant="body">In the full app: your private account database, where per-user access rules mean only you can read your entries.</Text>
        <Notice tone="demo">In this demo, entries exist only in this app session on this device and disappear when the app closes.</Notice>
      </Section>

      <Section title="When AI sees your writing">
        <Text variant="body">
          Only when you ask for a reflection or follow-up. Then that entry, and the limited context you allow in AI & memory, is sent to an AI service.
        </Text>
        <Text variant="small" style={styles.gapSm}>
          No AI provider is connected yet. Before launch, this section will name the provider, what it keeps and for how long.
        </Text>
        <Text variant="small" style={styles.gapSm}>
          AI reflections are currently {state.aiConsent === 'ai' ? 'on' : 'off'}.
        </Text>
        <Button variant="text" label="Change AI & memory settings" onPress={() => router.push('/settings/ai-memory')} />
      </Section>

      <Section title="Export">
        <Text variant="body">Download a copy of your entries and reflections.</Text>
        <Button variant="secondary" icon="download-outline" label="Prepare export" onPress={() => setDialog('export')} style={styles.gap} />
      </Section>

      <Section title="Delete">
        <Text variant="body">Delete a single entry from its page, or saved memory in AI & memory.</Text>
        <View style={styles.row}>
          <Button variant="text" label="Go to my journal" onPress={() => router.navigate('/journal')} />
          <Button variant="text" label="Review saved memory" onPress={() => router.push('/settings/ai-memory')} />
        </View>
        <Text variant="body" style={styles.gap}>
          Deleting your account removes your entries, reflections and memory. Backups are cleared according to the published retention policy.
        </Text>
        <Button variant="danger" label="Delete account" onPress={() => setDialog('account')} style={styles.gap} />
      </Section>

      <Dialog
        visible={dialog === 'export'}
        title="Export isn't connected yet"
        body="The full app will create a file of your entries and reflections that you can save anywhere. Nothing was exported in this demo."
        confirmLabel="Okay"
        cancelLabel="Close"
        onCancel={() => setDialog(null)}
        onConfirm={() => setDialog(null)}
      />
      <Dialog
        visible={dialog === 'account'}
        title="Delete your account?"
        body="Type DELETE to confirm. In this demo, this resets the app; no real account exists."
        confirmLabel="Delete account"
        destructive
        onCancel={() => {
          setDialog(null);
          setConfirmText('');
        }}
        onConfirm={() => {
          if (confirmText.trim().toUpperCase() !== 'DELETE') {
            snack({ message: 'Type DELETE to confirm.' });
            return;
          }
          setDialog(null);
          dispatch({ type: 'reset' });
          router.replace('/welcome');
        }}>
        <Field label="Confirmation" value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" placeholder="DELETE" />
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: space.md },
  gapSm: { marginTop: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
