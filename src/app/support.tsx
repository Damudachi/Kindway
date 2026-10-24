import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/**
 * Extra support. PLACEHOLDER until the copy is clinically reviewed and resources are verified
 * for each supported region. Do not add phone numbers or services that haven't been verified.
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
        <Text variant="title">If you might act on thoughts of harming yourself or someone else</Text>
        <Text variant="body">Contact your local emergency services now, or go to the nearest emergency department.</Text>
      </View>
      <View style={styles.block}>
        <Text variant="title">Reach someone you trust</Text>
        <Text variant="body">A friend, family member, or someone who can be with you. You can simply say you’re having a hard time.</Text>
      </View>
      <View style={styles.block}>
        <Text variant="title">Support services near you</Text>
        {showOptions ? (
          <Notice tone="demo" title="Not available yet">
            Verified resources for your region will appear here before launch. Kindway doesn’t show contact details that haven’t been checked.
          </Notice>
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

const useStyles = makeStyles((color) => ({
  lede: { marginTop: space.sm, marginBottom: space.md },
  block: { paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.sand, gap: space.xxs },
  btn: { marginTop: space.xs, alignSelf: 'flex-start' },
  foot: { marginTop: space.md },
}));
