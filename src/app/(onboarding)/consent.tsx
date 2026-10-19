import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow } from '@/components/controls';
import { Notice } from '@/components/notice';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { color, space } from '@/theme/tokens';

export default function Consent() {
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
          <Button label="Continue with AI reflections" disabled={!understood} onPress={() => choose('ai')} />
          <Button variant="secondary" label="Use my journal without AI" onPress={() => choose('journal-only')} />
        </>
      }>
      {!toToday && <OnboardingProgress step={4} />}
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        Your thoughts deserve care.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Two different things happen to your words. Here is each one, separately.
      </Text>

      <View style={styles.block}>
        <MaterialCommunityIcons name="notebook-outline" size={24} color={color.trail} />
        <View style={styles.flex}>
          <Text variant="title">Storing your journal</Text>
          <Text variant="body">
            Entries are saved to your private account. Access is limited to you by per-user database rules.
          </Text>
        </View>
      </View>
      <View style={[styles.block, styles.rule]}>
        <MaterialCommunityIcons name="creation-outline" size={24} color={color.trail} />
        <View style={styles.flex}>
          <Text variant="title">Reflecting with AI</Text>
          <Text variant="body">
            Only when you ask for a reflection, that entry and a small amount of context you control are sent to an AI service to write a response.
          </Text>
          <Text variant="small">The AI provider hasn’t been chosen yet. Its name and how long it keeps data will be shown here before launch.</Text>
        </View>
      </View>

      <CheckRow label="I understand that reflections send my entry to an AI service." checked={understood} onChange={setUnderstood} />
      <Button variant="text" label="Read full privacy details" onPress={() => router.push('/settings/privacy')} />
      <View style={styles.gap}>
        <Notice tone="demo">Nothing is stored on a server or sent to AI in this demo. You can change this choice later in AI & memory.</Notice>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.md },
  block: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  rule: { borderTopWidth: 1, borderTopColor: color.sand, marginBottom: space.xs },
  flex: { flex: 1, gap: space.xxs },
  gap: { marginTop: space.md },
});
