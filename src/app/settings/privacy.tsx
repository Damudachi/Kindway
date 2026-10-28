import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Section } from '@/components/controls';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { onWeb } from '@/services/platform';
import { useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/** Privacy & data. Describes only what the app actually does. */
export default function Privacy() {
  const styles = useStyles();
  const { state } = useStore();
  const { mode, user } = useSession();

  return (
    <Screen top={{ back: true, title: 'Privacy & data' }}>
      <Text variant="headline" accessibilityRole="header">
        Your words belong to you.
      </Text>

      <Section first title="Where your entries are stored">
        <Text variant="body">
          {mode === 'cloud-sync'
            ? `On this device, and in a cloud copy for ${user?.email}. Cloud sync is on, so entries, compass areas, your small step, preferences and insight feedback are sent to Kindway’s database, hosted by Supabase.`
            : 'Only on this device. Nothing is backed up or synced unless you sign in and choose to turn cloud sync on.'}
        </Text>
        <Text variant="small" style={styles.gapSm}>
          {onWeb()
            ? 'On the device, entries are kept in this browser’s storage. Kindway doesn’t encrypt them beyond what your browser provides, and anyone who can unlock and inspect this device could read them. Clearing this site’s data, or removing Kindway from your Home Screen, removes them from the device.'
            : 'On the device, entries are kept in the app’s storage. Kindway doesn’t encrypt them beyond what Android itself provides, and anyone who can unlock and inspect this device could read them. Uninstalling the app removes them from the device.'}
        </Text>
        <Text variant="small" style={styles.gapSm}>
          In the cloud, each account can read and change only its own rows; the server enforces this, not the app. Data is encrypted in transit and at rest by the hosting provider, but it isn’t end-to-end encrypted: Kindway’s server administrators could technically access it.
        </Text>
        <Text variant="small" style={styles.gapSm}>
          Never uploaded: simulated reflections and simulated follow-up replies, saved memory, reminders, drafts and feedback on sample insights. Signing out hides a synced journal on this device until you sign in again; it doesn’t erase your local-only journal.
        </Text>
        <Notice tone="demo">This is a pre-release app. Nothing here is a production privacy or security guarantee.</Notice>
      </Section>

      <Section title="When AI sees your writing">
        <Text variant="body">
          Only when you ask, and only if you allowed it. With an account, cloud backup on and the matching choice allowed, Kindway’s server sends one entry (for a reflection), one entry with your message and a few earlier replies of that conversation (for a follow-up), or the entries you see listed (for an AI review) to GroqCloud. Each request is checked against your choices on the server, and you can withdraw any of them at any time.
        </Text>
        <Text variant="small" style={styles.gapSm}>
          Without that, nothing goes to AI: reflection previews and follow-up replies are pre-written text chosen on this device, and Patterns counts only the tags and marks you added. Follow-up conversations need their own choice; allowing reflections doesn’t allow them. AI processing shows exactly what is sent, what Groq may keep, and lets you delete AI outputs.
        </Text>
        <Button variant="tonal" label="AI processing consent" trailingIcon="arrow-right" onPress={() => router.push('/settings/ai-consent')} />
        <Text variant="small" style={styles.gapSm}>
          Reflection previews are currently {state.aiConsent === 'ai' ? 'on' : 'off'}.
        </Text>
        <Button variant="tonal" label="Change AI & memory settings" trailingIcon="arrow-right" onPress={() => router.push('/settings/ai-memory')} />
      </Section>

      <Section title="Export">
        <Text variant="body">Not available yet. A later version will let you download a copy of your entries.</Text>
      </Section>

      <Section title="Delete">
        <Text variant="body">Delete a single entry from its page, or saved memory in AI & memory.</Text>
        <View style={styles.row}>
          <Button variant="tonal" label="Go to my journal" trailingIcon="arrow-right" onPress={() => router.navigate('/journal')} />
          <Button variant="tonal" label="Review saved memory" trailingIcon="arrow-right" onPress={() => router.push('/settings/ai-memory')} />
        </View>
        <Text variant="body" style={styles.gap}>
          To erase this journal, use Reset in Settings. If you have an account, you can delete it and all its cloud data from Settings too; that leaves your local-only journal on this device alone.
        </Text>
        <Button variant="tonal" label="Go to Settings" trailingIcon="arrow-right" onPress={() => router.push('/settings')} />
      </Section>

    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  gap: { marginTop: space.md },
  gapSm: { marginTop: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
}));
