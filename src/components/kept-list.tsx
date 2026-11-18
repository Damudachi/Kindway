import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { shortDate } from '@/data/dates';
import type { KeptWord } from '@/data/types';
import { useStore } from '@/state/demo-store';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/** The Journal's Kept view: words the user chose to keep, newest first. */
export function KeptList() {
  const styles = useStyles();
  const { state, dispatch } = useStore();
  // Newest first; words kept in the same instant keep the later one on top.
  const words = [...state.kept].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const from = (w: KeptWord): { label: string; href: Href | null } => {
    if (w.source.kind === 'topic') {
      const { topicId } = w.source;
      const topic = state.topics.find((t) => t.id === topicId);
      return topic ? { label: `From the topic “${topic.name}”`, href: `/topic/${topicId}` as Href } : { label: 'From a topic you deleted', href: null };
    }
    const { entryId } = w.source;
    const entry = state.entries.find((e) => e.id === entryId);
    return entry ? { label: `From ${shortDate(entry.date)}`, href: `/entry/${entryId}` as Href } : { label: 'From an entry you deleted', href: null };
  };

  if (words.length === 0) {
    return (
      <View style={styles.root}>
        <Text variant="bodyMuted">Words you keep will appear here.</Text>
        <Text variant="small">Tap the heart beside a reflection or a reply to keep it.</Text>
      </View>
    );
  }
  return (
    <View style={styles.root}>
      {words.map((w) => {
        const src = from(w);
        const open = src.href;
        return (
          <Card key={w.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={open ? `${w.text}. ${src.label}. Open.` : `${w.text}. ${src.label}.`}
              disabled={!open}
              onPress={() => open && router.push(open)}
              style={styles.row}>
              <Text variant="entry">{w.text}</Text>
              <Text variant="small">{src.label}</Text>
            </Pressable>
            <View style={styles.actions}>
              <Button variant="text" label="Remove" onPress={() => dispatch({ type: 'unkeep', id: w.id })} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { marginTop: space.md, gap: space.sm },
  row: { gap: space.xxs, paddingVertical: space.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
}));
