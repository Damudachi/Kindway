import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow } from '@/components/controls';
import { Notice } from '@/components/notice';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function Consent() {
  const styles = useStyles();
  const { color } = useTheme();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { dispatch } = useStore();
  const [understood, setUnderstood] = useState(false);
  const toToday = next === 'today';

  const choose = (aiConsent: 'ai' | 'journal-only') => {
    dispatch({ type: 'patch', patch: toToday ? { aiConsent, onboarded: true } : { aiConsent } });
    if (toToday) router.replace('/today');
    else router.push('/first-entry');
  };

  return (
    <Screen
      top={{ back: true }}
      footer={
        <>
          <Button label="Continue with reflection previews" disabled={!understood} onPress={() => choose('ai')} />
          <Button variant="secondary" label="Use my journal without them" onPress={() => choose('journal-only')} />
        </>
      }>
      {!toToday && <OnboardingProgress step={4} />}
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        Your thoughts deserve care.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Two different things could happen to your words. Here is each one, and what the app actually does today.
      </Text>

      <View style={styles.block}>
        <MaterialCommunityIcons name="notebook-outline" size={24} color={color.trail} />
        <View style={styles.flex}>
          <Text variant="title">Storing your journal</Text>
          <Text variant="body">Entries are saved on this device. Nothing is uploaded unless you sign in and choose cloud backup.</Text>
          <Text variant="small">If you do, a copy goes to Kindway’s database (hosted by Supabase), where only your account can read it. That’s a separate choice from AI, and you’re asked before anything is sent.</Text>
        </View>
      </View>
      <View style={[styles.block, styles.rule]}>
        <MaterialCommunityIcons name="creation-outline" size={24} color={color.trail} />
        <View style={styles.flex}>
          <Text variant="title">Reflecting with AI</Text>
          <Text variant="body">
            Choosing this sends nothing anywhere. Reflections are simulated previews, pre-written and chosen on this device.
          </Text>
          <Text variant="small">
            Real AI is optional and asked separately: with an account and cloud backup, you can allow it in AI processing settings, which names the provider and how long it may keep data. It only runs when you ask.
          </Text>
        </View>
      </View>

      <CheckRow label="I understand these reflections are simulated, and real AI is a separate choice." checked={understood} onChange={setUnderstood} />
      <Button variant="text" label="Read full privacy details" onPress={() => router.push('/settings/privacy')} />
      <View style={styles.gap}>
        <Notice tone="demo">This only turns the simulated previews on or off. It isn’t consent to send your writing to any AI service; real AI needs an account with cloud backup and is a separate choice in AI & memory → AI processing consent. You can change this later in AI & memory.</Notice>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.md },
  block: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  rule: { borderTopWidth: 1, borderTopColor: color.sand, marginBottom: space.xs },
  flex: { flex: 1, gap: space.xxs },
  gap: { marginTop: space.md },
}));
