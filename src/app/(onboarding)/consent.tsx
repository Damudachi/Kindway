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
          <Button label="Continue with reflection previews" disabled={!understood} onPress={() => choose('ai')} />
          <Button variant="secondary" label="Use my journal without them" onPress={() => choose('journal-only')} />
        </>
      }>
      {!toToday && <OnboardingProgress step={4} />}
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        Your thoughts deserve care.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Two different things could happen to your words. Here is each one, and what this prototype actually does.
      </Text>

      <View style={styles.block}>
        <MaterialCommunityIcons name="notebook-outline" size={24} color={color.trail} />
        <View style={styles.flex}>
          <Text variant="title">Storing your journal</Text>
          <Text variant="body">In this prototype, entries are saved only on this device.</Text>
          <Text variant="small">A private account with server-side access rules is planned, not built.</Text>
        </View>
      </View>
      <View style={[styles.block, styles.rule]}>
        <MaterialCommunityIcons name="creation-outline" size={24} color={color.trail} />
        <View style={styles.flex}>
          <Text variant="title">Reflecting with AI</Text>
          <Text variant="body">
            In this prototype, nothing is sent anywhere. Reflections are simulated previews, pre-written and chosen on this device.
          </Text>
          <Text variant="small">
            Planned: only when you ask, that entry and a little context you control would go to an AI service through a secure server. The provider and how long it keeps data will be named before that happens.
          </Text>
        </View>
      </View>

      <CheckRow label="I understand reflections are simulated for now, and how they’re planned to work later." checked={understood} onChange={setUnderstood} />
      <Button variant="text" label="Read full privacy details" onPress={() => router.push('/settings/privacy')} />
      <View style={styles.gap}>
        <Notice tone="demo">This is a prototype acknowledgement, not a production consent record. You can change this choice later in AI & memory.</Notice>
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
