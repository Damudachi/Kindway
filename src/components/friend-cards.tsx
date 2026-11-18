import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import type { Topic } from '@/data/types';
import { makeStyles, useTheme } from '@/theme/theme';
import { alpha, space, touch } from '@/theme/tokens';

/** The most open topics Today lists. */
export const ONGOING_MAX = 3;

/** The open topics, as quiet rows that open the topic. Nothing here counts or asks for anything. */
export function OngoingCard({ topics, onOpen }: { topics: Topic[]; onOpen: (topic: Topic) => void }) {
  const styles = useStyles();
  const { color } = useTheme();
  if (topics.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Text variant="labelSmall">Ongoing</Text>
      {topics.slice(0, ONGOING_MAX).map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="button"
          accessibilityLabel={t.name}
          onPress={() => onOpen(t)}
          android_ripple={{ color: alpha(color.ink, 0.06) }}
          style={styles.row}>
          <Text variant="entryTitle" style={styles.name} numberOfLines={1}>
            {t.name}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={color.inkMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

/**
 * A question to pick up: something an entry said was coming up ("Checking in"), or a topic that
 * has gone quiet. Tapping starts the page with that question; "Not now" asks for nothing in return.
 */
export function CheckInCard({ question, onWrite, onLater }: { question: string; onWrite: () => void; onLater: () => void }) {
  const styles = useStyles();
  return (
    <Card style={styles.card}>
      <Text variant="labelSmall">Checking in</Text>
      <Text variant="entryTitle" style={styles.question}>
        {question}
      </Text>
      <View style={styles.actions}>
        <Button variant="tonal" label="Write about this" icon="feather" onPress={onWrite} />
        <Button variant="text" label="Not now" onPress={onLater} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  card: { marginTop: space.lg },
  row: { minHeight: touch, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { flex: 1 },
  question: { marginTop: space.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, marginTop: space.sm },
}));
