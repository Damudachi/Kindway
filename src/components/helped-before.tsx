import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import type { Entry } from '@/data/types';
import { useStore } from '@/state/demo-store';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

export const HELPED_BEFORE_FEELINGS = ['Overwhelmed', 'Worried', 'Tired', 'Lonely'];

/** A small stable number from the entry id, so the same entry always picks the same line. */
const seed = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** For a heavy day: one of the user's own kept lines, with a way to see them all. */
export function HelpedBefore({ entry }: { entry: Entry }) {
  const styles = useStyles();
  const { state } = useStore();
  const { kept } = state;
  if (kept.length === 0 || !entry.feelings.some((f) => HELPED_BEFORE_FEELINGS.includes(f))) return null;
  const pick = kept[seed(entry.id) % kept.length];
  return (
    <Card>
      <View style={styles.body}>
        <Text variant="label">Something that helped before</Text>
        <Text variant="entry" testID="helped-before-text">
          {pick.text}
        </Text>
        <Button variant="text" label="See all" trailingIcon="arrow-right" onPress={() => router.navigate({ pathname: '/journal', params: { view: 'kept' } })} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  body: { gap: space.xs },
}));
