import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { EMERGENCY_NUMBER, SUPPORT_CONTACTS } from '@/data/support-contacts';
import { useStore } from '@/state/demo-store';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/**
 * Extra support: where to turn when things feel unsafe. The contacts are verified Philippine
 * services (src/data/support-contacts.ts, each with its source and the date it was checked); add
 * nothing that hasn't been checked. The copy hasn't been clinically reviewed.
 */
export default function Support() {
  const styles = useStyles();
  const { dispatch } = useStore();
  const [showOptions, setShowOptions] = useState(false);
  const leave = () => {
    // Any entry that led here is already saved, so it is safe to finish onboarding.
    dispatch({ type: 'patch', patch: { onboarded: true } });
    router.dismissTo('/today');
  };
  return (
    <Screen
      top={{ back: true }}
      footer={<Button variant="secondary" label="Return to my journal" onPress={leave} />}>
      <Text variant="headline" accessibilityRole="header">
        You don’t have to handle this alone.
      </Text>
      <Text variant="body" style={styles.lede}>
        If things feel unsafe or overwhelming right now, reaching a real person matters more than continuing this reflection.
      </Text>

      <View style={styles.block}>
        <Text variant="title">If you’re in danger right now</Text>
        <Text variant="body">If you might act on thoughts of harming yourself or someone else, call {EMERGENCY_NUMBER} or go to the nearest emergency department.</Text>
        <Button label={`Call ${EMERGENCY_NUMBER}`} icon="phone-outline" onPress={() => void Linking.openURL(`tel:${EMERGENCY_NUMBER}`)} style={styles.btn} />
      </View>
      <View style={styles.block}>
        <Text variant="title">Reach someone you trust</Text>
        <Text variant="body">A friend, family member, or someone who can be with you. You can simply say you’re having a hard time.</Text>
      </View>
      <View style={styles.block}>
        <Text variant="title">Support services near you</Text>
        {showOptions ? (
          SUPPORT_CONTACTS.map((c) => (
            <View key={c.name} style={styles.contact}>
              <Text variant="label">{c.name}</Text>
              <Text variant="body">{c.purpose}</Text>
              <Text variant="small">{c.hours}</Text>
              {c.calls.map((line) => (
                <Button key={line.number} variant="secondary" label={line.label} icon="phone-outline" onPress={() => void Linking.openURL(dial(line.number))} style={styles.btn} />
              ))}
              {c.texts?.map((line) => (
                <Button key={line.number} variant="secondary" label={line.label} icon="message-text-outline" onPress={() => void Linking.openURL(`sms:${digits(line.number)}`)} style={styles.btn} />
              ))}
            </View>
          ))
        ) : (
          <Button variant="secondary" label="See support options" onPress={() => setShowOptions(true)} style={styles.btn} />
        )}
      </View>

      <Text variant="small" style={styles.foot}>
        Kindway is a journal and reflection aid. It isn’t a therapy service, can’t monitor how you’re doing, and can’t send help.
      </Text>
    </Screen>
  );
}

const digits = (number: string) => number.replace(/[^0-9+]/g, '');
const dial = (number: string) => `tel:${digits(number)}`;

const useStyles = makeStyles((color) => ({
  lede: { marginTop: space.sm, marginBottom: space.md },
  block: { paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.sand, gap: space.xxs },
  btn: { marginTop: space.xs, alignSelf: 'flex-start' },
  contact: { marginTop: space.sm, gap: space.xxs },
  foot: { marginTop: space.md },
}));
