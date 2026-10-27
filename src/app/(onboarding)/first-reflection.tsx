import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { ReflectionView } from '@/components/reflection-view';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { makeStyles } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

export default function FirstReflection() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const entry = state.entries.find((e) => e.id === id);

  const finish = () => {
    dispatch({ type: 'patch', patch: { onboarded: true } });
    router.replace('/reminders-setup');
  };

  return (
    <Screen top={{ title: 'A moment to reflect' }} footer={<Button variant="secondary" label="Continue" trailingIcon="arrow-right" onPress={finish} />}>
      <Text variant="headline" accessibilityRole="header">
        A reflection, not a verdict.
      </Text>
      {entry && (
        <>
          <View style={styles.quote}>
            <Text variant="entry" numberOfLines={6} accessibilityLabel={`Your words: ${entry.body}`}>
              {entry.body}
            </Text>
          </View>
          <ReflectionView entry={entry} onRest={finish} />
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  quote: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.sand,
    gap: space.xxs,
  },
}));
