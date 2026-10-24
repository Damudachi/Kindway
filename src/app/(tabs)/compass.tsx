import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field, SwitchRow } from '@/components/controls';
import { Dialog, useSnackbar } from '@/components/feedback';
import { CompassRose } from '@/components/illustrations';
import { StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { COMPASS_AREAS, COMPASS_EXAMPLES } from '@/data/sample';
import type { CompassValue } from '@/data/types';
import { useStore } from '@/state/demo-store';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function Compass() {
  const styles = useStyles();
  const { tint } = useTheme();
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CompassValue | null>(null);
  const compass = state.compass;

  const update = (id: string, patch: Partial<CompassValue>) =>
    dispatch({ type: 'compass', compass: compass.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const add = (area: string) => {
    dispatch({ type: 'compass', compass: [...compass, { id: `c-${area}`, area, note: '', aiMayReference: true }] });
    setAdding(false);
    setEditing(`c-${area}`);
    setDraftNote('');
  };

  const available = COMPASS_AREAS.filter((a) => !compass.some((c) => c.area === a));

  return (
    <Screen inTabs top={{ title: 'Long Game Compass' }}>
      <Text variant="headline" accessibilityRole="header">
        What do you want to stay true to?
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Reminders you chose, not rules to obey every day. Change them whenever your priorities change.
      </Text>
      {compass.length > 0 && (
        <View style={styles.rose}>
          <CompassRose areas={compass.map((c) => c.area)} />
        </View>
      )}

      {compass.length === 0 && !adding && (
        <StateView
          art="compass"
          title="Your compass is empty"
          body="That's completely fine. Kindway works without it. Add something if you'd like reflections to keep it in view."
          action={<Button variant="secondary" label="Add a value" icon="plus" onPress={() => setAdding(true)} />}
        />
      )}

      {compass.map((c) => (
        <View key={c.id} style={styles.value}>
          <View style={styles.valueHead}>
            <View style={[styles.bearing, { backgroundColor: tint.area(c.area).mark }]} />
            <Text variant="title" style={styles.flex}>
              {c.area}
            </Text>
          </View>
          {editing === c.id ? (
            <>
              <Field
                label="In your words (optional)"
                value={draftNote}
                onChangeText={setDraftNote}
                multiline
                autoFocus
                placeholder={COMPASS_EXAMPLES[c.area] ?? 'What does this mean for you right now?'}
              />
              <View style={styles.row}>
                <Button
                  variant="secondary"
                  label="Save"
                  onPress={() => {
                    update(c.id, { note: draftNote.trim() });
                    setEditing(null);
                    snack({ message: 'Compass updated. Earlier entries stay as they were.' });
                  }}
                />
                <Button variant="text" label="Cancel" onPress={() => setEditing(null)} />
              </View>
            </>
          ) : (
            <>
              <Text variant={c.note ? 'entry' : 'bodyMuted'}>{c.note || 'No note yet.'}</Text>
              <View style={styles.row}>
                <Button
                  variant="text"
                  label="Edit"
                  onPress={() => {
                    setEditing(c.id);
                    setDraftNote(c.note);
                  }}
                />
                <Button variant="dangerText" label="Remove" onPress={() => setRemoving(c)} />
              </View>
            </>
          )}
          <SwitchRow
            title="AI may use this"
            detail="Only with entries you link it to, when you ask for AI. Reflections get its name and your note; reviews get only its name."
            value={c.aiMayReference}
            onChange={(aiMayReference) => update(c.id, { aiMayReference })}
          />
        </View>
      ))}

      {adding ? (
        <View style={styles.value}>
          <Text variant="label">Choose an area</Text>
          <ChipRow>
            {available.map((a) => (
              <Chip key={a} kind="assist" label={a} onPress={() => add(a)} />
            ))}
          </ChipRow>
          <Button variant="text" label="Cancel" onPress={() => setAdding(false)} />
        </View>
      ) : (
        compass.length > 0 &&
        available.length > 0 && <Button variant="secondary" label="Add a value" icon="plus" onPress={() => setAdding(true)} style={styles.add} />
      )}

      <Text variant="small" style={styles.foot}>
        Not making progress on something doesn’t mean failing at it. A compass points; it doesn’t keep score.
      </Text>
      <Button variant="text" label="See what you've been noticing" trailingIcon="arrow-right" onPress={() => router.navigate('/patterns')} />

      <Dialog
        visible={!!removing}
        title={`Remove “${removing?.area}”?`}
        body="Reflections will stop mentioning it. Past entries and reflections stay as they are."
        confirmLabel="Remove"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) dispatch({ type: 'compass', compass: compass.filter((c) => c.id !== removing.id) });
          setRemoving(null);
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  lede: { marginTop: space.xs, marginBottom: space.md },
  rose: { alignItems: 'center', marginBottom: space.md },
  value: { paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.sand, gap: space.xxs },
  valueHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // A bearing tick: the compass's own small mark, drawn in the area's hue.
  bearing: { width: 16, height: 2, backgroundColor: color.trail },
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  add: { marginTop: space.md },
  foot: { marginTop: space.xl },
}));
