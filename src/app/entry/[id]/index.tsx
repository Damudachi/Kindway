import { router, useLocalSearchParams } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Field, Section, SwitchRow } from '@/components/controls';
import { Dialog, useSnackbar } from '@/components/feedback';
import { StateView } from '@/components/notice';
import { ReflectionView } from '@/components/reflection-view';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { DateDialog } from '@/components/date-dialog';
import { longDate } from '@/data/dates';
import { TITLE_MAX, titleFrom } from '@/data/titles';
import { useDeleteWithUndo, useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function EntryDetail() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const { mode } = useSession();
  const snack = useSnackbar();
  const deleteWithUndo = useDeleteWithUndo();
  const { color } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The title being edited, or null when the rename dialog is closed.
  const [rename, setRename] = useState<string | null>(null);
  const [changeDate, setChangeDate] = useState(false);
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
      patch: { text: entry.body, feelings: entry.feelings, gratitude: entry.gratitude ?? '', compassIds: entry.compassIds ?? [], date: entry.date, editingId: entry.id, style: undefined },
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
      <Pressable
        onPress={() => setChangeDate(true)}
        accessibilityRole="button"
        accessibilityLabel={`${longDate(entry.date)}. Change date`}
        style={({ pressed }) => [styles.dateRow, pressed && styles.pressed]}>
        <Text variant="small">{longDate(entry.date)} · Change</Text>
      </Pressable>
      <Pressable
        onPress={() => setRename(entry.title)}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}. Rename entry`}
        style={({ pressed }) => [styles.titleRow, pressed && styles.pressed]}>
        <Text variant="headline" accessibilityRole="header" style={styles.title}>
          {entry.title}
        </Text>
        <MaterialCommunityIcons name="pencil-outline" size={18} color={color.inkMuted} style={styles.titleIcon} />
      </Pressable>
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

      <Section title="Entry options">
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
      </Section>

      <DateDialog
        visible={changeDate}
        value={entry.date}
        onCancel={() => setChangeDate(false)}
        onSave={(date) => {
          dispatch({ type: 'updateEntry', id: entry.id, patch: { date } });
          setChangeDate(false);
        }}
      />

      <Dialog
        visible={rename !== null}
        title="Rename entry"
        body="Leave it empty to use the start of your entry."
        confirmLabel="Save"
        onCancel={() => setRename(null)}
        onConfirm={() => {
          dispatch({ type: 'updateEntry', id: entry.id, patch: { title: rename?.trim() || titleFrom(entry.body) } });
          setRename(null);
        }}>
        <Field label="Title" value={rename ?? ''} onChangeText={setRename} maxLength={TITLE_MAX} autoFocus selectTextOnFocus returnKeyType="done" />
      </Dialog>

      <Dialog
        visible={confirmDelete}
        title="Delete this entry?"
        body="The entry, its reflection and any follow-up conversation will be removed."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          const undo = deleteWithUndo(entry.id);
          router.back();
          snack({
            message: mode === 'cloud-sync' ? 'Entry deleted. It’s removed from your account at the next sync.' : 'Entry deleted from this device.',
            action: { label: 'Undo', onPress: undo },
          });
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  dateRow: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, marginTop: space.xxs, marginBottom: space.xxs },
  title: { flexShrink: 1 },
  titleIcon: { marginTop: 8 },
  pressed: { opacity: 0.6 },
  words: { marginTop: space.lg, paddingBottom: space.lg, gap: space.xs },
  gratitude: { marginTop: space.xs, color: color.inkMuted },
  reflection: { borderTopWidth: 1, borderTopColor: color.sand, paddingTop: space.lg },
}));
