import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Notice, StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { longDate } from '@/data/dates';
import { SAMPLE_ENTRIES } from '@/data/sample';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/** Read-only view of one fictional sample entry. It can't be edited, reflected on or saved to the journal. */
export default function SampleEntry() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = SAMPLE_ENTRIES.find((e) => e.id === id);

  if (!entry) {
    return (
      <Screen top={{ back: true }}>
        <StateView title="This sample isn’t here" body="It may have been removed from the demo." />
      </Screen>
    );
  }
  const r = entry.reflection;

  return (
    <Screen top={{ back: true, title: 'Sample entry' }}>
      <Notice tone="demo" title="Fictional sample">
        Written for the demo. Not part of your journal.
      </Notice>
      <Text variant="small" style={styles.date}>
        {longDate(entry.date)}
      </Text>
      <Text variant="headline" accessibilityRole="header">
        {entry.title}
      </Text>
      {entry.feelings.length > 0 && <Text variant="labelSmall">{entry.feelings.join(' · ')}</Text>}
      <View style={styles.words}>
        <Text variant="entry" selectable>
          {entry.body}
        </Text>
        {entry.gratitude && <Text variant="body">One good thing: {entry.gratitude}</Text>}
      </View>
      {r && (
        <View style={styles.reflection}>
          <Text variant="title" accessibilityRole="header">
            Sample reflection
          </Text>
          <Text variant="entry">{r.acknowledge}</Text>
          {[r.clarify, r.perspective, r.longGame?.text, r.question].filter(Boolean).map((t) => (
            <Text key={t} variant="pencil">
              {t}
            </Text>
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  date: { marginTop: space.md },
  words: { marginTop: space.lg, paddingBottom: space.lg, gap: space.xs },
  reflection: { borderTopWidth: 1, borderTopColor: color.sand, paddingTop: space.lg, gap: space.sm },
}));
