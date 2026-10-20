import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { SwitchRow } from '@/components/controls';
import { Dialog, useSnackbar } from '@/components/feedback';
import { StateView } from '@/components/notice';
import { ReflectionView } from '@/components/reflection-view';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { longDate } from '@/data/dates';
import { useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { color, space } from '@/theme/tokens';

export default function EntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const { mode } = useSession();
  const snack = useSnackbar();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const entry = state.entries.find((e) => e.id === id);

  if (!entry) {
    return (
      <Screen top={{ back: true }}>
        <StateView title="This entry isn't here" body="It may have been deleted." action={<Button variant="secondary" label="Back to journal" onPress={() => router.navigate('/journal')} />} />
      </Screen>
    );
  }

  const edit = () => {
    dispatch({
      type: 'draft',
      patch: { text: entry.body, feelings: entry.feelings, gratitude: entry.gratitude ?? '', compassIds: entry.compassIds ?? [], editingId: entry.id, style: undefined },
    });
    router.push(`/write?edit=${entry.id}`);
  };

  const minutes = Math.max(1, Math.round(entry.body.split(/\s+/).length / 200));

  return (
    <Screen
      top={{
        back: true,
        actions: (
          <>
            <IconButton icon="pencil-outline" label="Edit entry" onPress={edit} />
            <IconButton icon="trash-can-outline" label="Delete entry" onPress={() => setConfirmDelete(true)} />
          </>
        ),
      }}>
      <Text variant="small">{longDate(entry.date)}</Text>
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        {entry.title}
      </Text>
      <Text variant="labelSmall">
        {[...entry.feelings, ...(entry.compassIds ?? []).map((c) => state.compass.find((v) => v.id === c)?.area).filter(Boolean), `${minutes} min read`].join(' · ')}
      </Text>

      <View style={styles.words}>
        <Text variant="entry" selectable accessibilityLabel={`Your words: ${entry.body}`}>
          {entry.body}
        </Text>
        {entry.gratitude && (
          <Text variant="body" style={styles.gratitude}>
            One good thing: {entry.gratitude}
          </Text>
        )}
      </View>

      <View style={styles.reflection}>
        <Text variant="title" accessibilityRole="header">
          Reflection
        </Text>
        <ReflectionView entry={entry} onRest={() => router.back()} />
      </View>

      <SwitchRow
        title="Use in insights and as context"
        detail={entry.excludeFromAnalysis ? 'Kept out. Patterns and other entries’ reflections won’t use this entry.' : 'Patterns and other entries’ reflections may use its tags and links.'}
        value={!entry.excludeFromAnalysis}
        onChange={(v) => dispatch({ type: 'updateEntry', id: entry.id, patch: { excludeFromAnalysis: !v } })}
      />

      <SwitchRow
        title="Come back to this"
        detail="Listed under “Still open” in Patterns until you turn it off."
        value={!!entry.revisit}
        onChange={(revisit) => dispatch({ type: 'updateEntry', id: entry.id, patch: { revisit } })}
      />

      <Dialog
        visible={confirmDelete}
        title="Delete this entry?"
        body="The entry, its reflection and any follow-up conversation will be removed. This can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          dispatch({ type: 'deleteEntry', id: entry.id });
          router.back();
          snack({ message: mode === 'cloud-sync' ? 'Entry deleted. It’s removed from your account at the next sync.' : 'Entry deleted from this device.' });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: space.xxs, marginBottom: space.xxs },
  words: { marginTop: space.lg, paddingBottom: space.lg, gap: space.xs },
  gratitude: { marginTop: space.xs, color: color.inkMuted },
  reflection: { borderTopWidth: 1, borderTopColor: color.sand, paddingTop: space.lg },
});
