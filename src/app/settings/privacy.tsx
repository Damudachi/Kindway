import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Section } from '@/components/controls';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { space } from '@/theme/tokens';

/**
 * Privacy & data. Describes only what the prototype actually does.
 * TODO(backend): export, account deletion and retention once Supabase storage and policies exist.
 */
export default function Privacy() {
  const { state } = useStore();

  return (
    <Screen top={{ back: true, title: 'Privacy & data' }}>
      <Text variant="headline" accessibilityRole="header">
        Your words belong to you.
      </Text>

      <Section first title="Where your entries are stored">
        <Text variant="body">
          In this prototype, entries are saved only in this app’s storage on this device. They aren’t synced, backed up, or encrypted by Kindway beyond what Android itself provides, and uninstalling the app removes them.
        </Text>
        <Notice tone="demo">A private account with server-side access rules is planned, not built. Nothing here is a production privacy or security guarantee.</Notice>
      </Section>

      <Section title="When AI sees your writing">
        <Text variant="body">
          Right now, never. No AI is connected. Reflection previews and follow-up replies are pre-written text chosen on this device, and Patterns only counts the tags and marks you added.
        </Text>
        <Text variant="small" style={styles.gapSm}>
          The plan: when you ask for a reflection, that entry and the limited context you allow in AI & memory would be sent to an AI service through a secure server. Before that exists, this section will name the provider, what it keeps and for how long.
        </Text>
        <Text variant="small" style={styles.gapSm}>
          Reflection previews are currently {state.aiConsent === 'ai' ? 'on' : 'off'}.
        </Text>
        <Button variant="text" label="Change AI & memory settings" onPress={() => router.push('/settings/ai-memory')} />
      </Section>

      <Section title="Export">
        <Text variant="body">Not available in this prototype. A later version will let you download a copy of your entries and reflections.</Text>
      </Section>

      <Section title="Delete">
        <Text variant="body">Delete a single entry from its page, or saved memory in AI & memory.</Text>
        <View style={styles.row}>
          <Button variant="text" label="Go to my journal" onPress={() => router.navigate('/journal')} />
          <Button variant="text" label="Review saved memory" onPress={() => router.push('/settings/ai-memory')} />
        </View>
        <Text variant="body" style={styles.gap}>
          To erase everything this prototype saved on this device, use Reset in Settings. Account deletion will exist once real accounts do.
        </Text>
        <Button variant="text" label="Go to Settings" onPress={() => router.push('/settings')} />
      </Section>

    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: space.md },
  gapSm: { marginTop: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
