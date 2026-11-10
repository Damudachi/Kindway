import { View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { Feelings } from '@/components/trail';
import { shortDate } from '@/data/dates';
import type { LookBack, Thread } from '@/state/come-back';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/**
 * A question to pick up from the last entry. Tapping it starts the page with that question;
 * nothing is sent anywhere, and "Not now" asks for nothing in return.
 */
export function ThreadCard({ thread, onUse, onLater }: { thread: Thread; onUse: () => void; onLater: () => void }) {
  const styles = useStyles();
  return (
    <Card style={styles.card}>
      <Text variant="labelSmall">Where you left off</Text>
      <Text variant="entryTitle" style={styles.main}>
        {thread.prompt}
      </Text>
      <Text variant="small">{thread.from}</Text>
      <View style={styles.row}>
        <Button variant="tonal" label="Write about this" icon="feather" onPress={onUse} />
        <Button variant="text" label="Not now" onPress={onLater} />
      </View>
    </Card>
  );
}

/** An entry from about a week, a month, three months or a year ago. Opening it only reads it. */
export function LookBackCard({ lookBack, onOpen, onLater }: { lookBack: LookBack; onOpen: () => void; onLater: () => void }) {
  const styles = useStyles();
  const { entry, label } = lookBack;
  return (
    <Card style={styles.card}>
      <Text variant="labelSmall">{`${label}, you wrote`}</Text>
      <Text variant="entryTitle" style={styles.main}>
        {entry.title}
      </Text>
      <Feelings names={entry.feelings} />
      <Text variant="small">{shortDate(entry.date)}</Text>
      <View style={styles.row}>
        <Button variant="tonal" label="Read it again" icon="notebook-outline" onPress={onOpen} />
        <Button variant="text" label="Not now" onPress={onLater} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  card: { marginTop: space.lg },
  main: { marginTop: space.xxs, marginBottom: space.xxs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, marginTop: space.sm },
}));
